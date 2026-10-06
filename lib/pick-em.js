import { BOT_TEAM, TEAMS } from "@/data/league-config";
import { getRedis } from "@/lib/redis";
import {
  getCurrentNhlTeamRecordsSnapshot,
  getNhlMatchupSnapshot,
  getNhlWeekGamesSnapshot,
  getScheduleGamesSnapshot
} from "@/lib/nhl";

const SKYNET_PICK_EM = {
  slug: BOT_TEAM.slug,
  name: BOT_TEAM.name,
  kind: "bot"
};
const PICK_EM_PARTICIPANTS = [...TEAMS, SKYNET_PICK_EM];
const SKYNET_BOOTSTRAP_DATE = "2026-10-06";
const PRIVATE_HISTORY_LIMIT = 10000;

function privateHistoryKey() {
  return "champions-league:mini-games:pick-em:v1:private-history";
}

async function appendPrivateHistory(redis, event) {
  if (!redis || !event) return;
  try {
    await redis.lpush(privateHistoryKey(), {
      ...event,
      recordedAt: new Date().toISOString()
    });
    await redis.ltrim(privateHistoryKey(), 0, PRIVATE_HISTORY_LIMIT - 1);
  } catch (error) {
    console.error("Pick 'Em private history write failed:", error);
  }
}

function rootFor(managerSlug) {
  return `champions-league:mini-games:pick-em:v1:${managerSlug}`;
}

function dateIndexKey(managerSlug) {
  return `${rootFor(managerSlug)}:dates`;
}

function dateKeyForManager(managerSlug, date) {
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
    await recordResultChanges(redis, managerSlug, stored, evaluated, schedule.games || []);
    await redis.set(dateKeyForManager(managerSlug, stored.dateKey), evaluated);
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
    const stored = await redis.get(dateKeyForManager(managerSlug, key));
    if (!stored) return null;
    if (currentWeekByDate.has(key)) {
      const games = currentWeekByDate.get(key);
      const evaluated = evaluateRecord(stored, games);
      await recordResultChanges(redis, managerSlug, stored, evaluated, games);
      if (Object.keys(evaluated.picks || {}).length) await redis.set(dateKeyForManager(managerSlug, key), evaluated);
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

function parseRecordParts(value) {
  const parts = String(value || "").split("-").map((part) => Number(part));
  return {
    wins: Number.isFinite(parts[0]) ? parts[0] : 0,
    losses: Number.isFinite(parts[1]) ? parts[1] : 0,
    otLosses: Number.isFinite(parts[2]) ? parts[2] : 0
  };
}

function pointsRate(wins, losses, otLosses) {
  const games = Number(wins || 0) + Number(losses || 0) + Number(otLosses || 0);
  return games > 0 ? ((Number(wins || 0) * 2) + Number(otLosses || 0)) / (games * 2) : 0.5;
}

function teamStrength(record, { home = false } = {}) {
  if (!record) return home ? 0.51 : 0.5;
  const games = Math.max(1, Number(record.gamesPlayed || 0));
  const seasonRate = pointsRate(record.wins, record.losses, record.otLosses);
  const recentRate = pointsRate(record.l10Wins, record.l10Losses, record.l10OtLosses);
  const split = parseRecordParts(home ? record.homeRecord : record.roadRecord);
  const splitRate = pointsRate(split.wins, split.losses, split.otLosses);
  const goalDiffPerGame = Number(record.goalDifferential || 0) / games;
  const normalizedGoalDiff = Math.max(0, Math.min(1, 0.5 + (goalDiffPerGame / 4)));
  const homeBonus = home ? 0.018 : 0;
  return (seasonRate * 0.44) + (recentRate * 0.24) + (normalizedGoalDiff * 0.20) + (splitRate * 0.12) + homeBonus;
}

function chooseSkynetTeam(game, teamRecords = {}) {
  const awayRecord = teamRecords?.[game?.away?.abbrev] || null;
  const homeRecord = teamRecords?.[game?.home?.abbrev] || null;
  const awayScore = teamStrength(awayRecord, { home: false });
  const homeScore = teamStrength(homeRecord, { home: true });
  const selected = homeScore >= awayScore ? game.home.abbrev : game.away.abbrev;
  return {
    teamAbbrev: selected,
    model: "skynet-pickem-v1",
    awayScore: Number(awayScore.toFixed(4)),
    homeScore: Number(homeScore.toFixed(4)),
    factors: {
      awayRecord: awayRecord?.record || null,
      homeRecord: homeRecord?.record || null,
      awayLast10: awayRecord?.l10Record || null,
      homeLast10: homeRecord?.l10Record || null,
      awayGoalDifferential: awayRecord?.goalDifferential ?? null,
      homeGoalDifferential: homeRecord?.goalDifferential ?? null,
      awayRoadRecord: awayRecord?.roadRecord || null,
      homeHomeRecord: homeRecord?.homeRecord || null
    }
  };
}

function easternDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour || 0)
  };
}

async function recordResultChanges(redis, managerSlug, previous, evaluated, games = []) {
  const before = previous?.results || {};
  const gameMap = new Map((games || []).map((game) => [String(game.gameId), game]));
  for (const [gameId, result] of Object.entries(evaluated?.results || {})) {
    if (!["W", "L", "OTL"].includes(result) || before?.[gameId] === result) continue;
    const game = gameMap.get(String(gameId));
    const pickedTeam = evaluated?.picks?.[gameId]?.teamAbbrev || null;
    await appendPrivateHistory(redis, {
      type: "result",
      managerSlug,
      dateKey: evaluated?.dateKey || game?.dateKey || null,
      gameId: String(gameId),
      pickedTeam,
      result,
      winner: game?.winner || null,
      periodType: game?.periodType || null,
      away: game?.away?.abbrev || null,
      home: game?.home?.abbrev || null
    });
  }
}

export async function ensureSkynetPicksForDate(dateKey, { now = new Date(), source = "automatic" } = {}) {
  const cleanDate = String(dateKey || "").match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
  if (!cleanDate) throw new Error("A valid date is required for Skynet Pick 'Em.");

  const redis = getRedis();
  if (!redis) throw new Error("Upstash Redis is required for Skynet Pick 'Em.");

  const [schedule, recordsSnapshot] = await Promise.all([
    getScheduleGamesSnapshot(cleanDate, now),
    getCurrentNhlTeamRecordsSnapshot().catch(() => ({ byTeam: {} }))
  ]);
  const teamRecords = recordsSnapshot?.byTeam || {};
  const key = dateKeyForManager(SKYNET_PICK_EM.slug, cleanDate);
  const current = await redis.get(key) || { dateKey: cleanDate, picks: {}, results: {}, settled: false };
  const picks = normalizePicks(current.picks);
  let added = 0;

  for (const game of schedule.games || []) {
    const gameId = String(game.gameId);
    if (picks[gameId]) continue;
    const startMs = game.startTimeUTC ? Date.parse(game.startTimeUTC) : NaN;
    if (game.started || game.final || (Number.isFinite(startMs) && now.getTime() >= startMs)) continue;
    const choice = chooseSkynetTeam(game, teamRecords);
    const pickedAt = now.toISOString();
    picks[gameId] = {
      teamAbbrev: choice.teamAbbrev,
      pickedAt,
      model: choice.model,
      modelScore: choice.teamAbbrev === game.home.abbrev ? choice.homeScore : choice.awayScore
    };
    added += 1;
    await appendPrivateHistory(redis, {
      type: "pick",
      source,
      managerSlug: SKYNET_PICK_EM.slug,
      managerName: SKYNET_PICK_EM.name,
      dateKey: cleanDate,
      gameId,
      teamAbbrev: choice.teamAbbrev,
      away: game.away?.abbrev || null,
      home: game.home?.abbrev || null,
      startTimeUTC: game.startTimeUTC || null,
      model: choice.model,
      modelScores: { away: choice.awayScore, home: choice.homeScore },
      factors: choice.factors
    });
  }

  if (!added && Object.keys(picks).length === 0) {
    return { dateKey: cleanDate, added: 0, total: 0, skipped: true };
  }

  const next = evaluateRecord({ ...current, dateKey: cleanDate, picks, settled: false }, schedule.games || []);
  await recordResultChanges(redis, SKYNET_PICK_EM.slug, current, next, schedule.games || []);
  await redis.set(key, next);
  await redis.sadd(dateIndexKey(SKYNET_PICK_EM.slug), cleanDate);
  return { dateKey: cleanDate, added, total: Object.keys(next.picks || {}).length, picks: next.picks };
}

export async function ensureSkynetCurrentDayPicks({ now = new Date(), source = "page-fallback" } = {}) {
  const { dateKey } = easternDateParts(now);
  return ensureSkynetPicksForDate(dateKey, { now, source });
}

export async function runSkynetMidnightPickJob(now = new Date()) {
  const eastern = easternDateParts(now);
  if (eastern.hour !== 0) return { ran: false, reason: "outside-midnight-window", eastern };
  const result = await ensureSkynetPicksForDate(eastern.dateKey, { now, source: "midnight-cron" });
  return { ran: true, eastern, ...result };
}

// One-time launch bootstrap requested for Tuesday, October 6, 2026. It is
// idempotent, and it refuses to pick any matchup that has already started.
export async function ensureSkynetLaunchBootstrap(now = new Date()) {
  return ensureSkynetPicksForDate(SKYNET_BOOTSTRAP_DATE, { now, source: "launch-bootstrap" });
}

async function buildLeaderboard(redis, weekDays, scheduleCache = new Map()) {
  const rows = [];
  for (const manager of PICK_EM_PARTICIPANTS) {
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

export async function getPickEmSnapshot(manager = null) {
  const managerSlug = String(manager?.slug || "").trim().toLowerCase();

  const redis = getRedis();
  if (!redis) throw new Error("Upstash Redis is required for Pick 'Em.");

  // Keep Skynet resilient if a cron run is missed. The special Oct. 6 launch
  // bootstrap handles the first requested slate; the current-day fallback is
  // idempotent and will never pick a game after puck drop.
  const skynetNow = new Date();
  const skynetEastern = easternDateParts(skynetNow);
  const skynetEnsures = [];
  if (skynetEastern.dateKey === SKYNET_BOOTSTRAP_DATE) {
    skynetEnsures.push(ensureSkynetLaunchBootstrap(skynetNow));
  } else {
    skynetEnsures.push(ensureSkynetCurrentDayPicks({ now: skynetNow, source: "page-fallback" }));
    if (skynetEastern.dateKey < SKYNET_BOOTSTRAP_DATE) {
      skynetEnsures.push(ensureSkynetLaunchBootstrap(skynetNow));
    }
  }
  await Promise.allSettled(skynetEnsures);

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
    let record = { dateKey: day.dateKey, picks: {}, results: {}, settled: false };
    if (managerSlug) {
      const storedRecord = await redis.get(dateKeyForManager(managerSlug, day.dateKey)) || record;
      record = evaluateRecord(storedRecord, day.games || []);
      await recordResultChanges(redis, managerSlug, storedRecord, record, day.games || []);
      if (Object.keys(record.picks || {}).length) {
        await redis.set(dateKeyForManager(managerSlug, day.dateKey), record);
        await redis.sadd(dateIndexKey(managerSlug), day.dateKey);
      }
    }
    weekRecords.push(record);
    decoratedDays.push({
      dateKey: day.dateKey,
      games: (day.games || []).map((game) => decorateGame(game, record, nowMs, teamRecords))
    });
  }

  const scheduleCache = new Map((week.days || []).map((day) => [day.dateKey, { dateKey: day.dateKey, games: day.games || [] }]));
  const managerRecords = managerSlug
    ? await loadManagerRecords(redis, managerSlug, week.days || [], scheduleCache)
    : [];
  // Include the current week's in-memory records even before their date index is written.
  const recordMap = new Map(managerRecords.map((record) => [record.dateKey, record]));
  for (const record of weekRecords) if (Object.keys(record.picks || {}).length) recordMap.set(record.dateKey, record);
  const allRecords = [...recordMap.values()];

  const [leaderboard, personalRecords] = await Promise.all([
    buildLeaderboard(redis, week.days || [], scheduleCache),
    managerSlug ? buildPersonalTeamRecords(allRecords, week.days || [], scheduleCache) : Promise.resolve({})
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

  const key = dateKeyForManager(managerSlug, game.dateKey);
  const current = await redis.get(key) || {
    dateKey: game.dateKey,
    picks: {},
    results: {},
    settled: false
  };
  const picks = normalizePicks(current.picks);
  const previousPick = picks[String(game.gameId)]?.teamAbbrev || null;
  const pickedAt = new Date().toISOString();
  picks[String(game.gameId)] = {
    teamAbbrev: team,
    pickedAt
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
  await appendPrivateHistory(redis, {
    type: "pick",
    source: "manager",
    managerSlug,
    managerName: manager?.name || managerSlug,
    dateKey: game.dateKey,
    gameId: String(game.gameId),
    teamAbbrev: team,
    previousTeamAbbrev: previousPick,
    changed: Boolean(previousPick && previousPick !== team),
    away: game.away?.abbrev || null,
    home: game.home?.abbrev || null,
    startTimeUTC: game.startTimeUTC || null,
    pickedAt
  });
  return getPickEmSnapshot(manager);
}
