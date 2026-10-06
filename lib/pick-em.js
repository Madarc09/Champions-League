import { TEAMS } from "@/data/league-config";
import { getRedis } from "@/lib/redis";
import {
  getCurrentNhlTeamRecordsSnapshot,
  getNhlMatchupSnapshot,
  getNhlWeekGamesSnapshot,
  getScheduleGamesSnapshot
} from "@/lib/nhl";

function rootFor(managerSlug) {
  return `champions-league:mini-games:pick-em:v1:${managerSlug}`;
}

function dateIndexKey(managerSlug) {
  return `${rootFor(managerSlug)}:dates`;
}

function dateKey(managerSlug, date) {
  return `${rootFor(managerSlug)}:day:${date}`;
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

function overtimeLoss(game, pickedTeam) {
  if (!game?.final || !game?.winner || game.winner === pickedTeam) return false;
  const periodType = String(game?.periodType || "").trim().toUpperCase();
  return periodType === "OT" || periodType === "SO";
}

function pickResult(game, pickedTeam) {
  if (!game?.final || !game?.winner) return null;
  if (game.winner === pickedTeam) return "W";
  if (overtimeLoss(game, pickedTeam)) return "OTL";
  return "L";
}

function evaluateRecord(record, games = []) {
  const picks = normalizePicks(record?.picks);
  const gameMap = new Map(games.map((game) => [String(game.gameId), game]));
  const results = { ...(record?.results || {}) };

  for (const [gameId, pick] of Object.entries(picks)) {
    const game = gameMap.get(String(gameId));
    const result = pickResult(game, pick.teamAbbrev);
    if (result) results[gameId] = result;
  }

  const pickedIds = Object.keys(picks);
  const settled = pickedIds.length > 0 && pickedIds.every((gameId) => ["W", "L", "OTL"].includes(results[gameId]));
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
  let otLosses = 0;
  let pending = 0;
  let picks = 0;
  const form = [];

  const ordered = [...records].sort((a, b) => String(a?.dateKey || "").localeCompare(String(b?.dateKey || "")));
  for (const record of ordered) {
    const entries = Object.entries(record?.picks || {}).sort(([, a], [, b]) =>
      String(a?.pickedAt || "").localeCompare(String(b?.pickedAt || ""))
    );
    for (const [gameId] of entries) {
      picks += 1;
      const result = record?.results?.[gameId];
      if (result === "W") wins += 1;
      else if (result === "OTL") otLosses += 1;
      else if (result === "L") losses += 1;
      else pending += 1;
      if (["W", "L", "OTL"].includes(result)) form.push(result);
    }
  }

  const settled = wins + losses + otLosses;
  const points = (wins * 2) + otLosses;
  const accuracy = settled ? Number(((wins / settled) * 100).toFixed(1)) : null;
  return {
    wins,
    losses,
    otLosses,
    pending,
    picks,
    settled,
    points,
    accuracy,
    form: form.slice(-5)
  };
}

async function refreshStoredDay(redis, managerSlug, stored, scheduleCache = new Map()) {
  if (!stored?.dateKey || stored.settled || !Object.keys(stored.picks || {}).length) return stored;
  try {
    let schedule = scheduleCache.get(stored.dateKey);
    if (!schedule) {
      schedule = await getScheduleGamesSnapshot(stored.dateKey);
      scheduleCache.set(stored.dateKey, schedule);
    }
    const evaluated = evaluateRecord(stored, schedule.games || []);
    await redis.set(dateKey(managerSlug, stored.dateKey), evaluated);
    return evaluated;
  } catch (error) {
    console.error(`Pick 'Em result refresh failed for ${managerSlug}/${stored.dateKey}:`, error);
    return stored;
  }
}

function decorateGame(game, record, nowMs, teamRecords = {}) {
  const gameId = String(game.gameId);
  const pick = record?.picks?.[gameId] || null;
  const startMs = game.startTimeUTC ? Date.parse(game.startTimeUTC) : NaN;
  const locked = Boolean(game.started || game.final || (Number.isFinite(startMs) && nowMs >= startMs));
  return {
    ...game,
    away: { ...game.away, record: teamRecords?.[game.away?.abbrev]?.record || null },
    home: { ...game.home, record: teamRecords?.[game.home?.abbrev]?.record || null },
    locked,
    pick: pick?.teamAbbrev || null,
    result: record?.results?.[gameId] || null
  };
}

async function loadManagerRecords(redis, managerSlug, currentWeekDays = [], scheduleCache = new Map()) {
  let indexedDates = [];
  try {
    indexedDates = await redis.smembers(dateIndexKey(managerSlug)) || [];
  } catch {
    indexedDates = [];
  }

  const currentWeekByDate = new Map((currentWeekDays || []).map((day) => [day.dateKey, day.games || []]));
  const records = await Promise.all(indexedDates.map(async (key) => {
    const stored = await redis.get(dateKey(managerSlug, key));
    if (!stored) return null;
    if (currentWeekByDate.has(key)) {
      const evaluated = evaluateRecord(stored, currentWeekByDate.get(key));
      if (Object.keys(evaluated.picks || {}).length) await redis.set(dateKey(managerSlug, key), evaluated);
      return evaluated;
    }
    return refreshStoredDay(redis, managerSlug, stored, scheduleCache);
  }));
  return records.filter(Boolean);
}

async function buildPersonalTeamRecords(records = [], currentWeekDays = [], scheduleCache = new Map()) {
  const byDate = new Map((currentWeekDays || []).map((day) => [day.dateKey, day.games || []]));
  const summaries = {};

  for (const record of records) {
    if (!record?.dateKey || !Object.keys(record.picks || {}).length) continue;
    let games = byDate.get(record.dateKey);
    if (!games) {
      try {
        let schedule = scheduleCache.get(record.dateKey);
        if (!schedule) {
          schedule = await getScheduleGamesSnapshot(record.dateKey);
          scheduleCache.set(record.dateKey, schedule);
        }
        games = schedule.games || [];
      } catch {
        games = [];
      }
    }
    const gameMap = new Map((games || []).map((game) => [String(game.gameId), game]));
    for (const [gameId, pick] of Object.entries(record.picks || {})) {
      const team = String(pick?.teamAbbrev || "").toUpperCase();
      if (!team) continue;
      const summary = summaries[team] || { wins: 0, losses: 0, otLosses: 0, pending: 0, picks: 0 };
      summary.picks += 1;
      if (record.results?.[gameId] === "W") summary.wins += 1;
      else if (record.results?.[gameId] === "OTL") summary.otLosses += 1;
      else if (record.results?.[gameId] === "L") summary.losses += 1;
      else if (gameMap.has(String(gameId))) summary.pending += 1;
      else summary.pending += 1;
      summaries[team] = summary;
    }
  }

  for (const summary of Object.values(summaries)) {
    const settled = summary.wins + summary.losses + summary.otLosses;
    summary.accuracy = settled ? Number(((summary.wins / settled) * 100).toFixed(1)) : null;
    summary.points = (summary.wins * 2) + summary.otLosses;
  }
  return summaries;
}

async function buildLeaderboard(redis, weekDays, scheduleCache = new Map()) {
  const rows = [];
  for (const manager of TEAMS) {
    const records = await loadManagerRecords(redis, manager.slug, weekDays, scheduleCache);
    const summary = recordSummary(records);
    if (!summary.picks) continue; // Opt-in only: no pick, no leaderboard row.
    rows.push({
      managerSlug: manager.slug,
      managerName: manager.name,
      ...summary
    });
  }

  rows.sort((a, b) =>
    b.points - a.points ||
    b.wins - a.wins ||
    a.losses - b.losses ||
    b.otLosses - a.otLosses ||
    String(a.managerName).localeCompare(String(b.managerName))
  );
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function getPickEmSnapshot(manager) {
  const managerSlug = String(manager?.slug || "").trim().toLowerCase();
  if (!managerSlug) throw new Error("A signed-in pool manager is required for Pick 'Em.");

  const redis = getRedis();
  if (!redis) throw new Error("Upstash Redis is required for Pick 'Em.");

  const [week, recordsResult] = await Promise.all([
    getNhlWeekGamesSnapshot(),
    getCurrentNhlTeamRecordsSnapshot().catch((error) => {
      console.error("Pick 'Em team records unavailable:", error);
      return { byTeam: {} };
    })
  ]);
  const teamRecords = recordsResult?.byTeam || {};
  const nowMs = Date.now();
  const weekRecords = [];
  const decoratedDays = [];

  for (const day of week.days || []) {
    let record = await redis.get(dateKey(managerSlug, day.dateKey));
    record = record || { dateKey: day.dateKey, picks: {}, results: {}, settled: false };
    record = evaluateRecord(record, day.games || []);
    if (Object.keys(record.picks || {}).length) {
      await redis.set(dateKey(managerSlug, day.dateKey), record);
      await redis.sadd(dateIndexKey(managerSlug), day.dateKey);
    }
    weekRecords.push(record);
    decoratedDays.push({
      dateKey: day.dateKey,
      games: (day.games || []).map((game) => decorateGame(game, record, nowMs, teamRecords))
    });
  }

  const scheduleCache = new Map((week.days || []).map((day) => [day.dateKey, { dateKey: day.dateKey, games: day.games || [] }]));
  const managerRecords = await loadManagerRecords(redis, managerSlug, week.days || [], scheduleCache);
  // Include the current week's in-memory records even before their date index is written.
  const recordMap = new Map(managerRecords.map((record) => [record.dateKey, record]));
  for (const record of weekRecords) if (Object.keys(record.picks || {}).length) recordMap.set(record.dateKey, record);
  const allRecords = [...recordMap.values()];

  const [leaderboard, personalRecords] = await Promise.all([
    buildLeaderboard(redis, week.days || [], scheduleCache),
    buildPersonalTeamRecords(allRecords, week.days || [], scheduleCache)
  ]);

  const allTime = recordSummary(allRecords);
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
    leaderboard,
    personalRecords,
    scoring: { win: 2, loss: 0, overtimeLoss: 1 },
    participation: "opt-in",
    updatedAt: week.updatedAt || new Date().toISOString(),
    stale: Boolean(week.stale)
  };
}

export async function getPickEmMatchupInfo(manager, gameId) {
  const snapshot = await getPickEmSnapshot(manager);
  const game = (snapshot.games || []).find((entry) => String(entry.gameId) === String(gameId));
  if (!game) throw new Error("That matchup is not on the current Pick 'Em board.");

  const matchup = await getNhlMatchupSnapshot(game.away.abbrev, game.home.abbrev);
  return {
    game,
    ...matchup,
    personalRecords: {
      [game.away.abbrev]: snapshot.personalRecords?.[game.away.abbrev] || { wins: 0, losses: 0, otLosses: 0, pending: 0, picks: 0, accuracy: null, points: 0 },
      [game.home.abbrev]: snapshot.personalRecords?.[game.home.abbrev] || { wins: 0, losses: 0, otLosses: 0, pending: 0, picks: 0, accuracy: null, points: 0 }
    }
  };
}

export async function savePickEmPick(manager, { gameId, teamAbbrev }) {
  const managerSlug = String(manager?.slug || "").trim().toLowerCase();
  if (!managerSlug) throw new Error("A signed-in pool manager is required for Pick 'Em.");

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

  const key = dateKey(managerSlug, game.dateKey);
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
  await redis.sadd(dateIndexKey(managerSlug), game.dateKey);
  return getPickEmSnapshot(manager);
}
