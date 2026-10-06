import { STATS_SEASON_ID } from "@/data/league-config";
import { getRedis } from "@/lib/redis";
import { calculateFantasyPoints } from "@/lib/scoring";
import { canonicalPlayerName, preferPlayerRecord, samePlayerIdentity } from "@/lib/player-identity";

const NHL_STATS_BASE = "https://api.nhle.com/stats/rest/en";
const NHL_WEB_BASE = "https://api-web.nhle.com/v1";
const NHL_ASSETS_BASE = "https://assets.nhle.com";
const CACHE_SECONDS = 60 * 60 * 6;
const SEASON_STATS_CACHE_SECONDS = 60;
const PLAYER_POOL_CACHE_KEY = `champions-league:nhl-player-pool:${STATS_SEASON_ID}:headshots-rookies-v3-shutouts`;
const PLAYER_POOL_CACHE_SECONDS = 60 * 60 * 24 * 30;
const RECENT_DRAFT_YEARS = [2024, 2025, 2026];
const KNOWN_ROOKIE_FALLBACKS = [
  {
    playerId: 8486067,
    firstName: "Gavin",
    lastName: "McKenna",
    teamAbbrev: "TOR",
    positionCode: "LW",
    birthDate: "2007-12-20",
    overallPick: 1,
    round: 1
  }
];

// Used only if the NHL standings endpoint is temporarily unavailable.
const FALLBACK_TEAM_ABBREVS = [
  "ANA", "BOS", "BUF", "CAR", "CBJ", "CGY", "CHI", "COL",
  "DAL", "DET", "EDM", "FLA", "LAK", "MIN", "MTL", "NJD",
  "NSH", "NYI", "NYR", "OTT", "PHI", "PIT", "SEA", "SJS",
  "STL", "TBL", "TOR", "UTA", "VAN", "VGK", "WPG", "WSH"
];

// These are coverage checks, not display limits. The site still returns every
// player supplied by the NHL reports.
export const PLAYER_POOL_MINIMUMS = {
  F: 300,
  D: 100,
  G: 90
};

function localizedText(value) {
  if (typeof value === "string") return value;
  return value?.default || value?.fr || "";
}

function normalizeTeamAbbrev(value) {
  const source =
    localizedText(value) ||
    localizedText(value?.abbrev || value?.abbreviation || value?.teamAbbrev) ||
    (typeof value === "string" || typeof value === "number" ? String(value) : "");
  const teams = source
    .split(/[,&/]/)
    .map((team) => team.trim().toUpperCase())
    .filter(Boolean);

  return teams.at(-1) || "NHL";
}

function teamLogoUrl(team) {
  const abbreviation = normalizeTeamAbbrev(team);
  return abbreviation === "NHL"
    ? null
    : `${NHL_ASSETS_BASE}/logos/nhl/svg/${abbreviation}_light.svg`;
}

function historicalHeadshotUrl(playerId, team) {
  const abbreviation = normalizeTeamAbbrev(team);
  if (!playerId || abbreviation === "NHL") return null;
  return `${NHL_ASSETS_BASE}/mugs/nhl/${STATS_SEASON_ID}/${abbreviation}/${playerId}.png`;
}

async function fetchNhlJson(url) {
  const response = await fetch(url, {
    next: { revalidate: CACHE_SECONDS },
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`NHL endpoint returned ${response.status}: ${url}`);
  }

  return response.json();
}

async function fetchFreshNhlJson(url) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) throw new Error(`NHL endpoint returned ${response.status}: ${url}`);
  return response.json();
}

async function fetchCurrentTeamAbbrevs() {
  try {
    const payload = await fetchNhlJson(`${NHL_WEB_BASE}/standings/now`);
    const teams = [...new Set(
      (payload.standings || [])
        .map((row) => normalizeTeamAbbrev(localizedText(row.teamAbbrev)))
        .filter((team) => team && team !== "NHL")
    )];

    return teams.length >= 30 ? teams : FALLBACK_TEAM_ABBREVS;
  } catch (error) {
    console.error("Current NHL team list unavailable:", error);
    return FALLBACK_TEAM_ABBREVS;
  }
}

async function fetchCurrentRosterDirectory() {
  const teams = await fetchCurrentTeamAbbrevs();
  const results = await Promise.allSettled(
    teams.map(async (team) => {
      const payload = await fetchNhlJson(`${NHL_WEB_BASE}/roster/${team}/current`);
      const roster = [
        ...(payload.forwards || []),
        ...(payload.defensemen || []),
        ...(payload.goalies || [])
      ];

      return roster.map((player) => {
        const playerId = Number(player.id || player.playerId);
        const firstName = localizedText(player.firstName);
        const lastName = localizedText(player.lastName);
        return {
          playerId,
          name: localizedText(player.fullName) || [firstName, lastName].filter(Boolean).join(" "),
          team,
          headshot: player.headshot || historicalHeadshotUrl(playerId, team),
          teamLogo: teamLogoUrl(team),
          currentPosition: player.positionCode || player.position || null,
          birthDate: player.birthDate || null
        };
      });
    })
  );

  const directory = new Map();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const player of result.value) {
      if (!player.playerId) continue;
      directory.set(String(player.playerId), player);
    }
  }

  return directory;
}

function stableProspectId(seed) {
  let hash = 2166136261;
  for (const character of String(seed || "prospect")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return -Math.abs(hash || 1);
}

function objectValuesDeep(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) objectValuesDeep(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;

  const looksLikeDraftPick =
    value.playerId != null ||
    value.prospectId != null ||
    value.overallPick != null ||
    value.overallPickNumber != null ||
    (value.firstName && value.lastName && (value.positionCode || value.position));

  if (looksLikeDraftPick) output.push(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") objectValuesDeep(child, output);
  }
  return output;
}

function normalizeDraftPick(row, draftYear) {
  const firstName = localizedText(row.firstName || row.playerFirstName);
  const lastName = localizedText(row.lastName || row.playerLastName);
  const name =
    localizedText(row.fullName || row.playerName || row.name) ||
    [firstName, lastName].filter(Boolean).join(" ");
  if (!name) return null;

  const team = normalizeTeamAbbrev(
    localizedText(row.teamAbbrev || row.teamAbbreviation || row.clubAbbrev) ||
    row.teamCode ||
    row.team
  );
  const rawPosition =
    localizedText(row.positionCode || row.positionAbbrev || row.position) ||
    row.positionCode ||
    row.position ||
    "F";
  const position = normalizePosition(rawPosition, "F");
  const overallPick = Number(
    row.overallPick || row.overallPickNumber || row.pickOverall || row.pickNumber || 0
  );
  const round = Number(row.round || row.roundNumber || row.draftRound || 0);
  const suppliedId = Number(row.playerId || row.id || row.prospectId);
  const playerId = Number.isFinite(suppliedId) && suppliedId !== 0
    ? suppliedId
    : stableProspectId(`${draftYear}:${overallPick}:${name}`);

  const player = {
    playerId,
    name,
    team,
    statsTeam: team,
    ...position,
    gamesPlayed: 0,
    goals: 0,
    assists: 0,
    hits: 0,
    shots: 0,
    wins: 0,
    losses: 0,
    shutouts: 0,
    saves: 0,
    goalsAgainst: 0,
    savePct: null,
    headshot:
      localizedText(row.headshot || row.playerHeadshot || row.imageUrl) ||
      (typeof row.headshot === "string" ? row.headshot : null),
    teamLogo:
      localizedText(row.teamLogo) ||
      (typeof row.teamLogo === "string" ? row.teamLogo : teamLogoUrl(team)),
    draftYear,
    draftRound: round || null,
    draftPick: overallPick || null,
    rookie: true,
    birthDate: row.birthDate || row.dateOfBirth || null,
    mediaSource: "NHL Draft"
  };

  return { ...player, fantasyPoints: calculateFantasyPoints(player) };
}

async function fetchDraftClass(draftYear) {
  const rounds = await Promise.allSettled(
    Array.from({ length: 7 }, (_, index) =>
      fetchNhlJson(`${NHL_WEB_BASE}/draft/picks/${draftYear}/${index + 1}`)
    )
  );

  const picks = [];
  for (const result of rounds) {
    if (result.status !== "fulfilled") continue;
    const candidates = objectValuesDeep(result.value);
    for (const candidate of candidates) {
      const normalized = normalizeDraftPick(candidate, draftYear);
      if (normalized) picks.push(normalized);
    }
  }

  return deduplicatePlayers(picks);
}

async function fetchRecentDraftProspects() {
  const results = await Promise.allSettled(RECENT_DRAFT_YEARS.map(fetchDraftClass));
  const livePicks = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const fallbackPicks = KNOWN_ROOKIE_FALLBACKS
    .map((row) => normalizeDraftPick(row, 2026))
    .filter(Boolean);
  return deduplicatePlayers([...livePicks, ...fallbackPicks]);
}

function zeroGameRosterPlayer(player) {
  const position = normalizePosition(player.currentPosition, "F");
  const normalized = {
    playerId: Number(player.playerId),
    name: player.name || `Player ${player.playerId}`,
    team: player.team,
    statsTeam: player.team,
    ...position,
    gamesPlayed: 0,
    goals: 0,
    assists: 0,
    hits: 0,
    shots: 0,
    wins: 0,
    losses: 0,
    shutouts: 0,
    saves: 0,
    goalsAgainst: 0,
    savePct: null,
    headshot: player.headshot,
    teamLogo: player.teamLogo,
    rookie: true,
    birthDate: player.birthDate || null,
    mediaSource: "NHL roster"
  };
  return { ...normalized, fantasyPoints: calculateFantasyPoints(normalized) };
}

function makeReportUrl(path, sortProperty, start = 0, limit = -1) {
  const params = new URLSearchParams({
    isAggregate: "false",
    isGame: "false",
    start: String(start),
    limit: String(limit),
    sort: JSON.stringify([{ property: sortProperty, direction: "DESC" }]),
    cayenneExp: `seasonId=${STATS_SEASON_ID} and gameTypeId=2`
  });

  return `${NHL_STATS_BASE}/${path}?${params.toString()}`;
}

async function fetchReportPage(path, sortProperty, start = 0, limit = -1) {
  const response = await fetch(makeReportUrl(path, sortProperty, start, limit), {
    // Season fantasy totals need to track tonight's games, not a six-hour
    // cached snapshot. Keep the expensive full-league reports shared for one
    // minute, then refresh them for the next standings poll.
    next: { revalidate: SEASON_STATS_CACHE_SECONDS },
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`NHL report ${path} returned ${response.status}`);
  }

  const payload = await response.json();
  return {
    rows: Array.isArray(payload.data) ? payload.data : [],
    total: Number.isFinite(Number(payload.total)) ? Number(payload.total) : null
  };
}

async function fetchReport(path, sortProperty) {
  // The NHL stats REST reports support limit=-1 for the complete result set.
  // The pagination fallback protects the league if that behaviour changes.
  const first = await fetchReportPage(path, sortProperty, 0, -1);
  if (!first.total || first.rows.length >= first.total) return first.rows;

  const allRows = [...first.rows];
  const pageSize = 100;
  let start = first.rows.length;

  while (start < first.total) {
    const page = await fetchReportPage(path, sortProperty, start, pageSize);
    if (page.rows.length === 0) break;
    allRows.push(...page.rows);
    start += page.rows.length;
  }

  return allRows;
}

function easternCalendarDateKey(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Toronto",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function currentEasternDateKey(now = new Date()) {
  return easternCalendarDateKey(now);
}

function easternLeagueDayKey(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Toronto",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23"
    }).formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  let utcDate = Date.UTC(year, month - 1, day);

  // Champions League "today" rolls over at 10:00 AM Eastern rather than
  // midnight. Before 10 AM, the previous calendar date is still the active
  // fantasy day. Calendar subtraction is done in UTC only to avoid DST math.
  if (hour < 10) utcDate -= 24 * 60 * 60 * 1000;
  return new Date(utcDate).toISOString().slice(0, 10);
}

function makeDailyReportUrl(path, sortProperty, dateKey, start = 0, limit = -1) {
  const params = new URLSearchParams({
    isAggregate: "true",
    isGame: "true",
    start: String(start),
    limit: String(limit),
    sort: JSON.stringify([{ property: sortProperty, direction: "DESC" }]),
    cayenneExp: `seasonId=${STATS_SEASON_ID} and gameTypeId=2 and gameDate>=\"${dateKey}\" and gameDate<=\"${dateKey} 23:59:59\"`
  });
  return `${NHL_STATS_BASE}/${path}?${params.toString()}`;
}

async function fetchDailyReportPage(path, sortProperty, dateKey, start = 0, limit = -1) {
  const response = await fetch(makeDailyReportUrl(path, sortProperty, dateKey, start, limit), {
    next: { revalidate: 60 },
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`NHL daily report ${path} returned ${response.status}`);
  }

  const payload = await response.json();
  return {
    rows: Array.isArray(payload.data) ? payload.data : [],
    total: Number.isFinite(Number(payload.total)) ? Number(payload.total) : null
  };
}

async function fetchDailyReport(path, sortProperty, dateKey) {
  const first = await fetchDailyReportPage(path, sortProperty, dateKey, 0, -1);
  if (!first.total || first.rows.length >= first.total) return first.rows;

  const allRows = [...first.rows];
  const pageSize = 100;
  let start = first.rows.length;
  while (start < first.total) {
    const page = await fetchDailyReportPage(path, sortProperty, dateKey, start, pageSize);
    if (!page.rows.length) break;
    allRows.push(...page.rows);
    start += page.rows.length;
  }
  return allRows;
}

function getPlayerName(row) {
  return (
    row.skaterFullName ||
    row.goalieFullName ||
    row.playerName ||
    row.name ||
    [row.firstName, row.lastName].filter(Boolean).join(" ") ||
    `Player ${row.playerId}`
  );
}

function normalizePosition(positionCode, fallback = "F") {
  const code = String(positionCode || fallback).toUpperCase();
  if (code === "D") return { position: "D", rosterType: "D" };
  if (code === "G") return { position: "G", rosterType: "G" };
  return { position: code || "F", rosterType: "F" };
}

function normalizeSkaters(summaryRows, realtimeRows) {
  const realtimeById = new Map(
    realtimeRows.map((row) => [String(row.playerId), row])
  );

  return summaryRows.map((row) => {
    const realtime = realtimeById.get(String(row.playerId)) || {};
    const position = normalizePosition(row.positionCode, "F");
    const team = normalizeTeamAbbrev(row.teamAbbrevs || row.teamAbbrev);
    const player = {
      playerId: Number(row.playerId),
      name: getPlayerName(row),
      team,
      statsTeam: team,
      ...position,
      gamesPlayed: Number(row.gamesPlayed || 0),
      goals: Number(row.goals || 0),
      assists: Number(row.assists || 0),
      hits: Number(realtime.hits || row.hits || 0),
      shots: Number(row.shots || realtime.shots || 0)
    };

    return { ...player, fantasyPoints: calculateFantasyPoints(player) };
  });
}

function normalizeGoalies(rows) {
  return rows.map((row) => {
    const team = normalizeTeamAbbrev(row.teamAbbrevs || row.teamAbbrev);
    const player = {
      playerId: Number(row.playerId),
      name: getPlayerName(row),
      team,
      statsTeam: team,
      position: "G",
      rosterType: "G",
      gamesPlayed: Number(row.gamesPlayed || 0),
      wins: Number(row.wins || 0),
      losses: Number(row.losses || 0),
      shutouts: Number(row.shutouts || 0),
      savePct: row.savePct == null ? null : Number(row.savePct),
      saves: Number(row.saves || 0),
      goalsAgainst: Number(row.goalsAgainst || 0),
      goals: Number(row.goals || 0),
      assists: Number(row.assists || 0),
      hits: 0,
      shots: 0
    };

    return { ...player, fantasyPoints: calculateFantasyPoints(player) };
  });
}

function mergeDuplicatePlayer(existing, incoming) {
  const primary = preferPlayerRecord(existing, incoming);
  const secondary = primary === existing ? incoming : existing;

  return {
    ...secondary,
    ...primary,
    playerId: Number(primary.playerId || secondary.playerId),
    name: primary.name || secondary.name,
    team: primary.team || secondary.team,
    birthDate: primary.birthDate || secondary.birthDate || null,
    headshot: primary.headshot || secondary.headshot || null,
    teamLogo: primary.teamLogo || secondary.teamLogo || null,
    draftYear: primary.draftYear || secondary.draftYear || null,
    draftRound: primary.draftRound || secondary.draftRound || null,
    draftPick: primary.draftPick || secondary.draftPick || null,
    rookie: Boolean(primary.rookie || secondary.rookie)
  };
}

function deduplicatePlayers(players, duplicateAudit = null) {
  const unique = [];

  for (const player of players) {
    if (!player?.playerId || !canonicalPlayerName(player.name)) continue;
    const index = unique.findIndex((existing) => samePlayerIdentity(existing, player));

    if (index < 0) {
      unique.push(player);
      continue;
    }

    const existing = unique[index];
    const merged = mergeDuplicatePlayer(existing, player);
    unique[index] = merged;

    if (duplicateAudit) {
      duplicateAudit.push({
        name: merged.name,
        keptPlayerId: merged.playerId,
        removedPlayerId: merged.playerId === existing.playerId ? player.playerId : existing.playerId
      });
    }
  }

  return unique;
}

function countPlayers(players) {
  const counts = { F: 0, D: 0, G: 0, total: players.length };
  for (const player of players) {
    if (Object.prototype.hasOwnProperty.call(counts, player.rosterType)) {
      counts[player.rosterType] += 1;
    }
  }
  return counts;
}

function verifyCoverage(counts) {
  const shortages = Object.entries(PLAYER_POOL_MINIMUMS)
    .filter(([type, minimum]) => Number(counts[type] || 0) < minimum)
    .map(([type, minimum]) => `${type}: ${counts[type] || 0}/${minimum}`);

  if (shortages.length > 0) {
    throw new Error(`The NHL player pool returned incomplete position coverage (${shortages.join(", ")}).`);
  }
}

async function fetchCompletePlayerPool() {
  const [skaterSummary, skaterRealtime, goalieSummary, currentRosterDirectory, draftProspects] = await Promise.all([
    fetchReport("skater/summary", "points"),
    fetchReport("skater/realtime", "hits"),
    fetchReport("goalie/summary", "wins"),
    fetchCurrentRosterDirectory().catch((error) => {
      console.error("Current NHL roster photos unavailable:", error);
      return new Map();
    }),
    fetchRecentDraftProspects().catch((error) => {
      console.error("Recent NHL draft classes unavailable:", error);
      return [];
    })
  ]);

  const duplicateAudit = [];
  const statisticalPlayers = deduplicatePlayers([
    ...normalizeSkaters(skaterSummary, skaterRealtime),
    ...normalizeGoalies(goalieSummary)
  ], duplicateAudit);

  const mergedCandidates = [
    ...statisticalPlayers,
    ...[...currentRosterDirectory.values()].map(zeroGameRosterPlayer),
    ...draftProspects
  ];

  // Run one final identity pass after joining stats, current rosters and draft
  // classes. This prevents the same person from surviving under a temporary
  // prospect ID and an official NHL ID (the duplicate Celebrini case).
  const canonicalPlayers = deduplicatePlayers(mergedCandidates, duplicateAudit);

  const players = canonicalPlayers.map((player) => {
    const current = currentRosterDirectory.get(String(player.playerId));
    const team = current?.team || player.team;
    const hasNoNhlGames = Number(player.gamesPlayed || 0) === 0;
    return {
      ...player,
      team,
      birthDate: current?.birthDate || player.birthDate || null,
      rookie: Boolean(player.rookie || hasNoNhlGames),
      headshot:
        current?.headshot ||
        player.headshot ||
        historicalHeadshotUrl(player.playerId, player.statsTeam || team),
      teamLogo: current?.teamLogo || player.teamLogo || teamLogoUrl(team),
      mediaSource: player.mediaSource || "NHL"
    };
  });

  const counts = countPlayers(players);
  verifyCoverage(counts);

  return {
    players,
    counts,
    source: "NHL Stats, NHL rosters and recent NHL draft classes",
    updatedAt: new Date().toISOString(),
    stale: false,
    duplicateAudit: {
      removedCount: duplicateAudit.length,
      names: [...new Set(duplicateAudit.map((item) => item.name))].sort()
    }
  };
}

export async function getPlayerPool() {
  const redis = getRedis();

  try {
    const snapshot = await fetchCompletePlayerPool();
    if (redis) {
      await redis.set(PLAYER_POOL_CACHE_KEY, snapshot, { ex: PLAYER_POOL_CACHE_SECONDS });
    }
    return snapshot;
  } catch (error) {
    console.error("Live NHL player pool unavailable:", error);

    if (redis) {
      try {
        const cached = await redis.get(PLAYER_POOL_CACHE_KEY);
        if (cached?.players?.length) {
          // Recalculate from raw categories on every stale-cache read so a
          // league scoring change (such as the new five-point shutout bonus)
          // is reflected even before the next live NHL refresh succeeds.
          const players = cached.players.map((player) => ({
            ...player,
            fantasyPoints: calculateFantasyPoints(player)
          }));
          return {
            ...cached,
            players,
            counts: cached.counts || countPlayers(players),
            stale: true,
            warning: error?.message || "The live NHL player pool could not be refreshed."
          };
        }
      } catch (cacheError) {
        console.error("Cached NHL player pool unavailable:", cacheError);
      }
    }

    throw error;
  }
}

export async function getAllPlayers() {
  const pool = await getPlayerPool();
  return pool.players;
}

function parseGoalieSaves(row) {
  const direct = Number(row?.saves);
  if (Number.isFinite(direct)) return direct;
  const match = String(row?.saveShotsAgainst || "").match(/^(\d+)\/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function dailyPlayerRecord(playerId, rosterType = "F") {
  return {
    playerId: Number(playerId),
    rosterType,
    gamesPlayed: 0,
    goals: 0,
    assists: 0,
    hits: 0,
    shots: 0,
    saves: 0,
    goalsAgainst: 0,
    wins: 0,
    shutouts: 0
  };
}

function addDailyPlayerTotals(target, incoming) {
  if (!incoming?.playerId) return;
  const key = String(incoming.playerId);
  const existing = target.get(key) || dailyPlayerRecord(incoming.playerId, incoming.rosterType || "F");
  const fields = ["gamesPlayed", "goals", "assists", "hits", "shots", "saves", "goalsAgainst", "wins", "shutouts"];
  for (const field of fields) existing[field] = Number(existing[field] || 0) + Number(incoming[field] || 0);
  existing.rosterType = incoming.rosterType || existing.rosterType;
  target.set(key, existing);
}

function mergeDailyPlayerSources(primaryPlayers = [], secondaryPlayers = []) {
  const merged = new Map(primaryPlayers.map((player) => [String(player.playerId), { ...player }]));
  const fields = ["gamesPlayed", "goals", "assists", "hits", "shots", "saves", "goalsAgainst", "wins", "shutouts"];

  for (const player of secondaryPlayers) {
    const key = String(player?.playerId || "");
    if (!key) continue;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...player });
      continue;
    }
    for (const field of fields) {
      existing[field] = Math.max(Number(existing[field] || 0), Number(player[field] || 0));
    }
    existing.rosterType = existing.rosterType || player.rosterType;
  }

  return [...merged.values()].map((player) => ({
    ...player,
    fantasyPoints: calculateFantasyPoints(player)
  }));
}

async function fetchLeagueDayBoxscorePlayers(dateKey, now = new Date()) {
  const schedule = await getScheduleGamesSnapshot(dateKey, now);
  const activeGames = (schedule.games || []).filter((game) => game.started || game.final);
  const totals = new Map();

  const results = await Promise.allSettled(
    activeGames.map(async (game) => {
      const boxscore = await fetchFreshNhlJson(`${NHL_WEB_BASE}/gamecenter/${game.gameId}/boxscore`);
      return { game, boxscore };
    })
  );

  let loaded = 0;
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    loaded += 1;
    const { game, boxscore } = result.value;
    const final = ["FINAL", "OFF"].includes(String(boxscore?.gameState || game.gameState || "").toUpperCase());

    for (const side of ["awayTeam", "homeTeam"]) {
      const teamStats = boxscore?.playerByGameStats?.[side] || {};
      for (const skater of [...(teamStats.forwards || []), ...(teamStats.defense || [])]) {
        addDailyPlayerTotals(totals, {
          playerId: Number(skater.playerId),
          rosterType: String(skater.position || "F").toUpperCase() === "D" ? "D" : "F",
          gamesPlayed: 1,
          goals: Number(skater.goals || 0),
          assists: Number(skater.assists || 0),
          hits: Number(skater.hits || 0),
          shots: Number(skater.sog || 0)
        });
      }

      for (const goalie of teamStats.goalies || []) {
        const saves = parseGoalieSaves(goalie);
        const goalsAgainst = Number(goalie.goalsAgainst || 0);
        const decision = String(goalie.decision || "").toUpperCase();
        const played = saves > 0 || goalsAgainst > 0 || decision || String(goalie.toi || "00:00") !== "00:00";
        if (!played) continue;
        addDailyPlayerTotals(totals, {
          playerId: Number(goalie.playerId),
          rosterType: "G",
          gamesPlayed: 1,
          saves,
          goalsAgainst,
          wins: decision === "W" ? 1 : 0,
          shutouts: final && decision === "W" && goalsAgainst === 0 && Boolean(goalie.starter) ? 1 : 0
        });
      }
    }
  }

  return {
    players: [...totals.values()].map((player) => ({ ...player, fantasyPoints: calculateFantasyPoints(player) })),
    schedule,
    activeGameCount: activeGames.length,
    loadedBoxscoreCount: loaded
  };
}

async function fetchLeagueDayRestPlayers(dateKey) {
  const [skaterSummary, skaterRealtime, goalieSummary] = await Promise.all([
    fetchDailyReport("skater/summary", "points", dateKey),
    fetchDailyReport("skater/realtime", "hits", dateKey),
    fetchDailyReport("goalie/summary", "wins", dateKey)
  ]);
  return deduplicatePlayers([
    ...normalizeSkaters(skaterSummary, skaterRealtime),
    ...normalizeGoalies(goalieSummary)
  ]);
}

export async function getLeagueDayFantasySnapshot(now = new Date()) {
  const dateKey = easternLeagueDayKey(now);
  const redis = getRedis();
  const cacheKey = `champions-league:league-day-fantasy:${dateKey}:10am-live-v2`;

  try {
    const [boxscoreResult, restResult] = await Promise.allSettled([
      fetchLeagueDayBoxscorePlayers(dateKey, now),
      fetchLeagueDayRestPlayers(dateKey)
    ]);

    const boxscorePlayers = boxscoreResult.status === "fulfilled" ? boxscoreResult.value.players : [];
    const restPlayers = restResult.status === "fulfilled" ? restResult.value : [];
    if (!boxscorePlayers.length && !restPlayers.length && boxscoreResult.status === "rejected" && restResult.status === "rejected") {
      throw boxscoreResult.reason || restResult.reason || new Error("Live daily NHL stats are unavailable.");
    }

    // Live game-center boxscores update throughout the game. Official stats
    // reports are merged in as a secondary source/fallback and also cover rare
    // goalie offensive categories once the league publishes them.
    const players = mergeDailyPlayerSources(boxscorePlayers, restPlayers);
    const pointsById = Object.fromEntries(
      players.map((player) => [String(player.playerId), Number(player.fantasyPoints || 0)])
    );
    // Keep the official daily-report value separately from the merged/live
    // value. Standings can then add only the part of today's score that the
    // cumulative season report has not published yet, preventing double counts.
    const officialPointsById = Object.fromEntries(
      restPlayers.map((player) => [String(player.playerId), Number(player.fantasyPoints || 0)])
    );
    const snapshot = {
      dateKey,
      resetHourEastern: 10,
      pointsById,
      officialPointsById,
      playerCount: players.length,
      source: boxscorePlayers.length ? "NHL live game-center boxscores + NHL stats reports" : "NHL stats reports",
      activeGameCount: boxscoreResult.status === "fulfilled" ? boxscoreResult.value.activeGameCount : null,
      loadedBoxscoreCount: boxscoreResult.status === "fulfilled" ? boxscoreResult.value.loadedBoxscoreCount : 0,
      updatedAt: new Date().toISOString(),
      stale: false
    };

    if (redis) await redis.set(cacheKey, snapshot, { ex: 60 * 60 * 36 });
    return snapshot;
  } catch (error) {
    console.error("League-day fantasy refresh failed:", error);
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached?.pointsById) {
          return {
            ...cached,
            dateKey,
            resetHourEastern: 10,
            stale: true,
            warning: error?.message || "Daily NHL stats could not be refreshed."
          };
        }
      } catch (cacheError) {
        console.error("Cached league-day fantasy snapshot unavailable:", cacheError);
      }
    }
    throw error;
  }
}


function normalizedScheduleGame(game, cleanDate, now = new Date()) {
  const awayAbbrev = normalizeTeamAbbrev(game?.awayTeam?.abbrev || game?.awayTeam?.teamAbbrev || game?.awayTeam);
  const homeAbbrev = normalizeTeamAbbrev(game?.homeTeam?.abbrev || game?.homeTeam?.teamAbbrev || game?.homeTeam);
  const awayScore = Number(game?.awayTeam?.score);
  const homeScore = Number(game?.homeTeam?.score);
  const gameState = String(game?.gameState || game?.gameStatus || "FUT").toUpperCase();
  const final = ["FINAL", "OFF"].includes(gameState);
  const startTimeUTC = game?.startTimeUTC || game?.startTime || null;
  const startMs = startTimeUTC ? Date.parse(startTimeUTC) : NaN;
  const started = final || ["LIVE", "CRIT"].includes(gameState) || (Number.isFinite(startMs) && now.getTime() >= startMs);
  const periodNumber = Number(game?.periodDescriptor?.number || game?.period || 0) || null;
  const periodType = String(game?.periodDescriptor?.periodType || game?.periodDescriptor?.periodTypeCode || "").toUpperCase() || null;
  const timeRemaining = game?.clock?.timeRemaining || game?.clock?.time || null;
  const inIntermission = Boolean(game?.clock?.inIntermission);
  let winner = null;
  if (final && Number.isFinite(awayScore) && Number.isFinite(homeScore) && awayScore !== homeScore) {
    winner = awayScore > homeScore ? awayAbbrev : homeAbbrev;
  }

  return {
    gameId: String(game?.id || game?.gameId || `${cleanDate}-${awayAbbrev}-${homeAbbrev}`),
    dateKey: cleanDate,
    startTimeUTC,
    gameState,
    started,
    final,
    winner,
    periodNumber,
    periodType,
    timeRemaining,
    inIntermission,
    venue: localizedText(game?.venue) || null,
    away: {
      abbrev: awayAbbrev,
      name: localizedText(game?.awayTeam?.name || game?.awayTeam?.placeName) || awayAbbrev,
      logo: game?.awayTeam?.logo || teamLogoUrl(awayAbbrev),
      score: Number.isFinite(awayScore) ? awayScore : null
    },
    home: {
      abbrev: homeAbbrev,
      name: localizedText(game?.homeTeam?.name || game?.homeTeam?.placeName) || homeAbbrev,
      logo: game?.homeTeam?.logo || teamLogoUrl(homeAbbrev),
      score: Number.isFinite(homeScore) ? homeScore : null
    }
  };
}

function addCalendarDays(dateKey, amount) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(amount || 0));
  return date.toISOString().slice(0, 10);
}

function easternWeekBounds(now = new Date()) {
  const todayKey = easternCalendarDateKey(now);
  const date = new Date(`${todayKey}T12:00:00Z`);
  const weekday = date.getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  const weekStart = addCalendarDays(todayKey, -daysSinceMonday);
  return { weekStart, weekEnd: addCalendarDays(weekStart, 6), todayKey };
}

export async function getScheduleGamesSnapshot(dateKey, now = new Date()) {
  const cleanDate = String(dateKey || "").match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
  if (!cleanDate) throw new Error("A valid NHL schedule date is required.");

  const redis = getRedis();
  const cacheKey = `champions-league:nhl-games:${cleanDate}:v3`;

  try {
    const payload = await fetchFreshNhlJson(`${NHL_WEB_BASE}/schedule/${cleanDate}`);
    const day = Array.isArray(payload?.gameWeek)
      ? payload.gameWeek.find((entry) => String(entry?.date || "").slice(0, 10) === cleanDate)
      : null;
    const rawGames = Array.isArray(day?.games)
      ? day.games
      : Array.isArray(payload?.games)
        ? payload.games.filter((game) => String(game?.gameDate || game?.date || "").slice(0, 10) === cleanDate)
        : [];

    const games = rawGames.map((game) => normalizedScheduleGame(game, cleanDate, now));
    const snapshot = {
      dateKey: cleanDate,
      games,
      teamAbbrevs: [...new Set(games.flatMap((game) => [game.away.abbrev, game.home.abbrev]).filter((team) => team && team !== "NHL"))],
      gameCount: games.length,
      updatedAt: new Date().toISOString(),
      stale: false
    };

    if (redis) await redis.set(cacheKey, snapshot, { ex: 60 * 60 * 36 });
    return snapshot;
  } catch (error) {
    console.error("NHL games schedule refresh failed:", error);
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached?.games) return { ...cached, stale: true, warning: error?.message || "NHL schedule could not be refreshed." };
      } catch (cacheError) {
        console.error("Cached NHL games schedule unavailable:", cacheError);
      }
    }
    throw error;
  }
}

export async function getNhlWeekGamesSnapshot(now = new Date()) {
  const { weekStart, weekEnd, todayKey } = easternWeekBounds(now);
  const redis = getRedis();
  const cacheKey = `champions-league:nhl-week:${weekStart}:v1`;

  try {
    const payload = await fetchFreshNhlJson(`${NHL_WEB_BASE}/schedule/${weekStart}`);
    const byDate = new Map(
      (Array.isArray(payload?.gameWeek) ? payload.gameWeek : [])
        .map((day) => [String(day?.date || "").slice(0, 10), day])
    );

    const days = Array.from({ length: 7 }, (_, index) => {
      const dateKey = addCalendarDays(weekStart, index);
      const rawGames = Array.isArray(byDate.get(dateKey)?.games) ? byDate.get(dateKey).games : [];
      const games = rawGames.map((game) => normalizedScheduleGame(game, dateKey, now));
      return { dateKey, games, gameCount: games.length };
    });

    // The score endpoint is the NHL's live-game surface and includes current
    // scores, period and clock. Overlay today's schedule rows with it so Pick
    // 'Em never waits for the broader weekly schedule response to catch up.
    try {
      const livePayload = await fetchFreshNhlJson(`${NHL_WEB_BASE}/score/${todayKey}`);
      const liveGames = Array.isArray(livePayload?.games) ? livePayload.games : [];
      const liveById = new Map(
        liveGames.map((game) => [String(game?.id || game?.gameId || ""), normalizedScheduleGame(game, todayKey, now)])
      );
      const today = days.find((day) => day.dateKey === todayKey);
      if (today && liveById.size) {
        today.games = today.games.map((game) => {
          const live = liveById.get(String(game.gameId));
          if (!live) return game;
          return {
            ...game,
            ...live,
            away: { ...game.away, ...live.away },
            home: { ...game.home, ...live.home }
          };
        });
        // The score endpoint can occasionally surface a game before the weekly
        // schedule payload does. Include it rather than hiding a live matchup.
        for (const live of liveById.values()) {
          if (!today.games.some((game) => String(game.gameId) === String(live.gameId))) today.games.push(live);
        }
        today.gameCount = today.games.length;
      }
    } catch (scoreError) {
      console.error("NHL live score overlay unavailable:", scoreError);
    }

    const games = days.flatMap((day) => day.games);
    const snapshot = {
      weekStart,
      weekEnd,
      todayKey,
      days,
      games,
      gameCount: games.length,
      updatedAt: new Date().toISOString(),
      stale: false
    };

    if (redis) await redis.set(cacheKey, snapshot, { ex: 60 * 60 * 36 });
    return snapshot;
  } catch (error) {
    console.error("NHL weekly schedule refresh failed:", error);
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached?.days) return { ...cached, stale: true, warning: error?.message || "NHL weekly schedule could not be refreshed." };
      } catch (cacheError) {
        console.error("Cached NHL weekly schedule unavailable:", cacheError);
      }
    }
    throw error;
  }
}

export async function getLeagueDayScheduleSnapshot(now = new Date()) {
  const dateKey = easternLeagueDayKey(now);
  const snapshot = await getScheduleGamesSnapshot(dateKey, now);
  return {
    ...snapshot,
    resetHourEastern: 10
  };
}

export async function getTodaysNhlGamesSnapshot(now = new Date()) {
  const dateKey = easternCalendarDateKey(now);
  return getScheduleGamesSnapshot(dateKey, now);
}


function standingsTeamRecord(row) {
  if (!row) return null;
  const abbrev = normalizeTeamAbbrev(localizedText(row.teamAbbrev) || row.teamAbbrev);
  const wins = Number(row.wins || 0);
  const losses = Number(row.losses || 0);
  const otLosses = Number(row.otLosses || 0);
  const homeWins = Number(row.homeWins || 0);
  const homeLosses = Number(row.homeLosses || 0);
  const homeOtLosses = Number(row.homeOtLosses || 0);
  const roadWins = Number(row.roadWins || 0);
  const roadLosses = Number(row.roadLosses || 0);
  const roadOtLosses = Number(row.roadOtLosses || 0);
  const l10Wins = Number(row.l10Wins || 0);
  const l10Losses = Number(row.l10Losses || 0);
  const l10OtLosses = Number(row.l10OtLosses || 0);
  return {
    abbrev,
    name: localizedText(row.teamName) || localizedText(row.teamCommonName) || abbrev,
    logo: row.teamLogo || teamLogoUrl(abbrev),
    gamesPlayed: Number(row.gamesPlayed || 0),
    wins,
    losses,
    otLosses,
    record: `${wins}-${losses}-${otLosses}`,
    points: Number(row.points || 0),
    goalFor: Number(row.goalFor || 0),
    goalAgainst: Number(row.goalAgainst || 0),
    goalDifferential: Number(row.goalDifferential || 0),
    homeRecord: `${homeWins}-${homeLosses}-${homeOtLosses}`,
    roadRecord: `${roadWins}-${roadLosses}-${roadOtLosses}`,
    l10Record: `${l10Wins}-${l10Losses}-${l10OtLosses}`,
    l10Wins,
    l10Losses,
    l10OtLosses,
    streakCode: String(row.streakCode || "").toUpperCase() || null,
    streakCount: Number(row.streakCount || 0),
    updatedAt: row.date || null
  };
}

export async function getCurrentNhlTeamRecordsSnapshot() {
  const payload = await fetchFreshNhlJson(`${NHL_WEB_BASE}/standings/now`);
  const rows = Array.isArray(payload?.standings) ? payload.standings : [];
  const byTeam = {};
  for (const row of rows) {
    const record = standingsTeamRecord(row);
    if (record?.abbrev && record.abbrev !== "NHL") byTeam[record.abbrev] = record;
  }
  return {
    byTeam,
    teamCount: Object.keys(byTeam).length,
    updatedAt: new Date().toISOString()
  };
}

function priorSeasonIds(currentSeasonId, count = 5) {
  const start = Math.floor(Number(currentSeasonId) / 10000);
  if (!Number.isFinite(start) || start < 1900) return [Number(currentSeasonId)];
  return Array.from({ length: count }, (_, index) => {
    const seasonStart = start - index;
    return Number(`${seasonStart}${seasonStart + 1}`);
  });
}

function historicalMatchupGame(rawGame, teamA, teamB) {
  const away = normalizeTeamAbbrev(rawGame?.awayTeam?.abbrev || rawGame?.awayTeam);
  const home = normalizeTeamAbbrev(rawGame?.homeTeam?.abbrev || rawGame?.homeTeam);
  if (!new Set([away, home]).has(teamA) || !new Set([away, home]).has(teamB)) return null;
  if (![2, 3].includes(Number(rawGame?.gameType || rawGame?.gameTypeId || 0))) return null;
  const state = String(rawGame?.gameState || rawGame?.gameStatus || "").toUpperCase();
  if (!["FINAL", "OFF"].includes(state)) return null;
  const awayScore = Number(rawGame?.awayTeam?.score);
  const homeScore = Number(rawGame?.homeTeam?.score);
  if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore)) return null;
  const winner = awayScore === homeScore ? null : awayScore > homeScore ? away : home;
  return {
    gameId: String(rawGame?.id || rawGame?.gameId || ""),
    date: String(rawGame?.gameDate || rawGame?.date || "").slice(0, 10),
    away,
    home,
    awayScore,
    homeScore,
    winner,
    periodType: String(rawGame?.gameOutcome?.lastPeriodType || rawGame?.periodDescriptor?.periodType || "").toUpperCase() || null
  };
}

function summarizeHeadToHead(games, teamA, teamB) {
  const summary = {
    [teamA]: { wins: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 },
    [teamB]: { wins: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 }
  };
  for (const game of games) {
    const aIsAway = game.away === teamA;
    const aGoals = aIsAway ? game.awayScore : game.homeScore;
    const bGoals = aIsAway ? game.homeScore : game.awayScore;
    summary[teamA].goalsFor += aGoals;
    summary[teamA].goalsAgainst += bGoals;
    summary[teamB].goalsFor += bGoals;
    summary[teamB].goalsAgainst += aGoals;
    if (game.winner === teamA) {
      summary[teamA].wins += 1;
      summary[teamB].losses += 1;
    } else if (game.winner === teamB) {
      summary[teamB].wins += 1;
      summary[teamA].losses += 1;
    }
  }
  for (const team of [teamA, teamB]) {
    const count = games.length || 1;
    summary[team].avgGoalsFor = Number((summary[team].goalsFor / count).toFixed(2));
    summary[team].avgGoalsAgainst = Number((summary[team].goalsAgainst / count).toFixed(2));
  }
  return summary;
}

export async function getNhlMatchupSnapshot(teamAInput, teamBInput) {
  const teamA = String(teamAInput || "").trim().toUpperCase();
  const teamB = String(teamBInput || "").trim().toUpperCase();
  if (!/^[A-Z]{2,4}$/.test(teamA) || !/^[A-Z]{2,4}$/.test(teamB) || teamA === teamB) {
    throw new Error("Two valid NHL teams are required for matchup history.");
  }

  const [recordsResult, ...scheduleResults] = await Promise.allSettled([
    getCurrentNhlTeamRecordsSnapshot(),
    ...priorSeasonIds(STATS_SEASON_ID, 5).map((season) =>
      fetchFreshNhlJson(`${NHL_WEB_BASE}/club-schedule-season/${teamA}/${season}`)
    )
  ]);

  const records = recordsResult.status === "fulfilled" ? recordsResult.value.byTeam : {};
  const gamesById = new Map();
  for (const result of scheduleResults) {
    if (result.status !== "fulfilled") continue;
    for (const rawGame of Array.isArray(result.value?.games) ? result.value.games : []) {
      const game = historicalMatchupGame(rawGame, teamA, teamB);
      if (!game) continue;
      const key = game.gameId || `${game.date}-${game.away}-${game.home}`;
      gamesById.set(key, game);
    }
  }

  const last10 = [...gamesById.values()]
    .sort((left, right) => String(right.date).localeCompare(String(left.date)))
    .slice(0, 10);

  return {
    teams: {
      [teamA]: records[teamA] || null,
      [teamB]: records[teamB] || null
    },
    headToHead: {
      games: last10,
      count: last10.length,
      summary: summarizeHeadToHead(last10, teamA, teamB)
    },
    updatedAt: new Date().toISOString()
  };
}

export function searchPlayers(players, query, position = "ALL", limit = null) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const normalizedPosition = String(position || "ALL").toUpperCase();

  const matches = players
    .filter((player) => {
      const matchesQuery =
        normalizedQuery.length < 2 ||
        player.name.toLowerCase().includes(normalizedQuery) ||
        String(player.team || "").toLowerCase().includes(normalizedQuery);
      const matchesPosition =
        normalizedPosition === "ALL" || player.rosterType === normalizedPosition;
      return matchesQuery && matchesPosition;
    })
    .sort((a, b) => (b.fantasyPoints || 0) - (a.fantasyPoints || 0));

  return Number.isInteger(limit) && limit > 0 ? matches.slice(0, limit) : matches;
}
