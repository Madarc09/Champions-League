import { getRedis } from "@/lib/redis";
import { getScheduleGamesSnapshot, getTodaysNhlGamesSnapshot } from "@/lib/nhl";

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

export async function getPickEmSnapshot() {
  const redis = getRedis();
  if (!redis) throw new Error("Upstash Redis is required for Pick 'Em.");

  const schedule = await getTodaysNhlGamesSnapshot();
  const todayKey = schedule.dateKey;
  let todayRecord = await redis.get(dateKey(todayKey));
  todayRecord = todayRecord || { dateKey: todayKey, picks: {}, results: {}, settled: false };
  todayRecord = evaluateRecord(todayRecord, schedule.games || []);
  if (Object.keys(todayRecord.picks || {}).length) await redis.set(dateKey(todayKey), todayRecord);

  let dates = [];
  try {
    dates = await redis.smembers(DATE_INDEX_KEY) || [];
  } catch {
    dates = [];
  }
  if (Object.keys(todayRecord.picks || {}).length && !dates.includes(todayKey)) {
    await redis.sadd(DATE_INDEX_KEY, todayKey);
    dates.push(todayKey);
  }

  const storedRecords = await Promise.all(
    dates.map(async (key) => {
      if (key === todayKey) return todayRecord;
      const stored = await redis.get(dateKey(key));
      return refreshStoredDay(redis, stored);
    })
  );
  const history = storedRecords.filter(Boolean);
  const allTime = recordSummary(history);
  const today = recordSummary([todayRecord]);

  const now = Date.now();
  const games = (schedule.games || []).map((game) => {
    const gameId = String(game.gameId);
    const pick = todayRecord.picks?.[gameId] || null;
    const startMs = game.startTimeUTC ? Date.parse(game.startTimeUTC) : NaN;
    const locked = Boolean(game.started || game.final || (Number.isFinite(startMs) && now >= startMs));
    return {
      ...game,
      locked,
      pick: pick?.teamAbbrev || null,
      result: todayRecord.results?.[gameId] || null
    };
  });

  return {
    dateKey: todayKey,
    games,
    record: allTime,
    todayRecord: today,
    updatedAt: schedule.updatedAt || new Date().toISOString(),
    stale: Boolean(schedule.stale)
  };
}

export async function savePickEmPick({ gameId, teamAbbrev }) {
  const redis = getRedis();
  if (!redis) throw new Error("Upstash Redis is required for Pick 'Em.");

  const schedule = await getTodaysNhlGamesSnapshot();
  const game = (schedule.games || []).find((entry) => String(entry.gameId) === String(gameId));
  if (!game) throw new Error("That game is not on today's NHL schedule.");

  const startMs = game.startTimeUTC ? Date.parse(game.startTimeUTC) : NaN;
  if (game.started || game.final || (Number.isFinite(startMs) && Date.now() >= startMs)) {
    const error = new Error("That game has started. The pick is locked.");
    error.code = "LOCKED";
    throw error;
  }

  const team = String(teamAbbrev || "").trim().toUpperCase();
  const allowed = new Set([game.away.abbrev, game.home.abbrev]);
  if (!allowed.has(team)) throw new Error("Pick either the home or away team for this game.");

  const key = dateKey(schedule.dateKey);
  const current = await redis.get(key) || {
    dateKey: schedule.dateKey,
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
    dateKey: schedule.dateKey,
    picks,
    settled: false,
    updatedAt: new Date().toISOString()
  };
  await redis.set(key, next);
  await redis.sadd(DATE_INDEX_KEY, schedule.dateKey);
  return getPickEmSnapshot();
}
