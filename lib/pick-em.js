import { getRedis } from "@/lib/redis";
import { getNhlWeekGamesSnapshot, getScheduleGamesSnapshot } from "@/lib/nhl";

const ROOT = "champions-league:mini-games:pick-em:v1:nick";
const DATE_INDEX_KEY = `${ROOT}:dates`;

function dateKey(date) {
  return `${ROOT}:day:${date}`;
}

function normalizePicks(value = {}) {
  const picks = {};
  for (const [gameId, pick] of Object.entries(value || {})) {
    const teamAbbrev = String(pick?.teamAbbrev || pick || "").trim().toUpperCase();
    if (!teamAbbrev) continue;
    picks[String(gameId)] = {
      teamAbbrev,
      pickedAt: pick?.pickedAt || null
    };
  }
  return picks;
}

function evaluateRecord(record, games = []) {
  const picks = normalizePicks(record?.picks);
  const gameMap = new Map(games.map((game) => [String(game.gameId), game]));
  const results = { ...(record?.results || {}) };

  for (const [gameId, pick] of Object.entries(picks)) {
    const game = gameMap.get(String(gameId));
    if (!game?.final || !game.winner) continue;
    results[gameId] = pick.teamAbbrev === game.winner ? "W" : "L";
  }

  const pickedIds = Object.keys(picks);
  const settled = pickedIds.length > 0 && pickedIds.every((gameId) => results[gameId] === "W" || results[gameId] === "L");
  return {
    dateKey: record?.dateKey || null,
    picks,
    results,
    settled,
    updatedAt: new Date().toISOString()
  };
}

function recordSummary(records = []) {
  let wins = 0;
  let losses = 0;
  let pending = 0;
  let picks = 0;

  for (const record of records) {
    for (const gameId of Object.keys(record?.picks || {})) {
      picks += 1;
      if (record?.results?.[gameId] === "W") wins += 1;
      else if (record?.results?.[gameId] === "L") losses += 1;
      else pending += 1;
    }
  }

  return { wins, losses, pending, picks };
}

async function refreshStoredDay(redis, stored) {
  if (!stored?.dateKey || stored.settled || !Object.keys(stored.picks || {}).length) return stored;
  try {
    const schedule = await getScheduleGamesSnapshot(stored.dateKey);
    const evaluated = evaluateRecord(stored, schedule.games || []);
    await redis.set(dateKey(stored.dateKey), evaluated);
    return evaluated;
  } catch (error) {
    console.error(`Pick 'Em result refresh failed for ${stored.dateKey}:`, error);
    return stored;
  }
}

function decorateGame(game, record, nowMs) {
  const gameId = String(game.gameId);
  const pick = record?.picks?.[gameId] || null;
  const startMs = game.startTimeUTC ? Date.parse(game.startTimeUTC) : NaN;
  const locked = Boolean(game.started || game.final || (Number.isFinite(startMs) && nowMs >= startMs));
  return {
    ...game,
    locked,
    pick: pick?.teamAbbrev || null,
    result: record?.results?.[gameId] || null
  };
}

export async function getPickEmSnapshot() {
  const redis = getRedis();
  if (!redis) throw new Error("Upstash Redis is required for Pick 'Em.");

  const week = await getNhlWeekGamesSnapshot();
  const nowMs = Date.now();
  const weekRecords = [];
  const decoratedDays = [];

  for (const day of week.days || []) {
    let record = await redis.get(dateKey(day.dateKey));
    record = record || { dateKey: day.dateKey, picks: {}, results: {}, settled: false };
    record = evaluateRecord(record, day.games || []);
    if (Object.keys(record.picks || {}).length) {
      await redis.set(dateKey(day.dateKey), record);
      await redis.sadd(DATE_INDEX_KEY, day.dateKey);
    }
    weekRecords.push(record);
    decoratedDays.push({
      dateKey: day.dateKey,
      games: (day.games || []).map((game) => decorateGame(game, record, nowMs))
    });
  }

  let indexedDates = [];
  try {
    indexedDates = await redis.smembers(DATE_INDEX_KEY) || [];
  } catch {
    indexedDates = [];
  }

  const currentWeekDates = new Set((week.days || []).map((day) => day.dateKey));
  const historicalRecords = await Promise.all(
    indexedDates.map(async (key) => {
      if (currentWeekDates.has(key)) {
        return weekRecords.find((record) => record.dateKey === key) || null;
      }
      const stored = await redis.get(dateKey(key));
      return refreshStoredDay(redis, stored);
    })
  );

  const allTime = recordSummary(historicalRecords.filter(Boolean));
  const weekRecord = recordSummary(weekRecords);
  const games = decoratedDays.flatMap((day) => day.games);

  return {
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    todayKey: week.todayKey,
    days: decoratedDays,
    games,
    record: allTime,
    weekRecord,
    updatedAt: week.updatedAt || new Date().toISOString(),
    stale: Boolean(week.stale)
  };
}

export async function savePickEmPick({ gameId, teamAbbrev }) {
  const redis = getRedis();
  if (!redis) throw new Error("Upstash Redis is required for Pick 'Em.");

  const week = await getNhlWeekGamesSnapshot();
  const game = (week.games || []).find((entry) => String(entry.gameId) === String(gameId));
  if (!game) throw new Error("That game is not on this week's NHL schedule.");

  const startMs = game.startTimeUTC ? Date.parse(game.startTimeUTC) : NaN;
  if (game.started || game.final || (Number.isFinite(startMs) && Date.now() >= startMs)) {
    const error = new Error("That game has started. The pick is locked.");
    error.code = "LOCKED";
    throw error;
  }

  const team = String(teamAbbrev || "").trim().toUpperCase();
  const allowed = new Set([game.away.abbrev, game.home.abbrev]);
  if (!allowed.has(team)) throw new Error("Pick either the home or away team for this game.");

  const key = dateKey(game.dateKey);
  const current = await redis.get(key) || {
    dateKey: game.dateKey,
    picks: {},
    results: {},
    settled: false
  };
  const picks = normalizePicks(current.picks);
  picks[String(game.gameId)] = {
    teamAbbrev: team,
    pickedAt: new Date().toISOString()
  };

  const next = {
    ...current,
    dateKey: game.dateKey,
    picks,
    settled: false,
    updatedAt: new Date().toISOString()
  };
  await redis.set(key, next);
  await redis.sadd(DATE_INDEX_KEY, game.dateKey);
  return getPickEmSnapshot();
}
