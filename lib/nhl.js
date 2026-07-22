import { STATS_SEASON_ID } from "@/data/league-config";
import { getRedis } from "@/lib/redis";
import { calculateFantasyPoints } from "@/lib/scoring";

const NHL_STATS_BASE = "https://api.nhle.com/stats/rest/en";
const NHL_WEB_BASE = "https://api-web.nhle.com/v1";
const NHL_ASSETS_BASE = "https://assets.nhle.com";
const CACHE_SECONDS = 60 * 60 * 6;
const PLAYER_POOL_CACHE_KEY = `champions-league:nhl-player-pool:${STATS_SEASON_ID}:headshots-rookies-v3-shutouts`;
const PLAYER_POOL_CACHE_SECONDS = 60 * 60 * 24 * 30;
const RECENT_DRAFT_YEARS = [2024, 2025, 2026];
const KNOWN_ROOKIE_FALLBACKS = [
  {
    firstName: "Gavin",
    lastName: "McKenna",
    teamAbbrev: "TOR",
    positionCode: "LW",
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
    next: { revalidate: CACHE_SECONDS },
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

function deduplicatePlayers(players) {
  const unique = new Map();

  for (const player of players) {
    if (!player.playerId || !player.name) continue;
    const nameKey = `${String(player.name).trim().toLowerCase()}|${normalizeTeamAbbrev(player.team)}`;
    const idKey = `id:${player.playerId}`;
    const existingKey = unique.has(idKey)
      ? idKey
      : [...unique.entries()].find(([, item]) =>
          `${String(item.name).trim().toLowerCase()}|${normalizeTeamAbbrev(item.team)}` === nameKey
        )?.[0];
    const existing = existingKey ? unique.get(existingKey) : null;

    if (!existing) {
      unique.set(idKey, player);
      continue;
    }

    const existingGames = Number(existing.gamesPlayed || 0);
    const playerGames = Number(player.gamesPlayed || 0);
    const preferPlayer =
      playerGames > existingGames ||
      (playerGames === existingGames && Number(player.playerId) > 0 && Number(existing.playerId) < 0);
    const primary = preferPlayer ? player : existing;
    const secondary = preferPlayer ? existing : player;
    const merged = {
      ...secondary,
      ...primary,
      headshot: primary.headshot || secondary.headshot || null,
      teamLogo: primary.teamLogo || secondary.teamLogo || null,
      draftYear: primary.draftYear || secondary.draftYear || null,
      draftRound: primary.draftRound || secondary.draftRound || null,
      draftPick: primary.draftPick || secondary.draftPick || null,
      rookie: Boolean(primary.rookie || secondary.rookie)
    };

    if (existingKey !== idKey) unique.delete(existingKey);
    unique.set(`id:${merged.playerId}`, merged);
  }

  return [...unique.values()];
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

  const statisticalPlayers = deduplicatePlayers([
    ...normalizeSkaters(skaterSummary, skaterRealtime),
    ...normalizeGoalies(goalieSummary)
  ]);
  const byId = new Map(statisticalPlayers.map((player) => [String(player.playerId), player]));

  // Add signed/current roster players who have not appeared in an NHL game yet.
  for (const current of currentRosterDirectory.values()) {
    if (!byId.has(String(current.playerId))) {
      byId.set(String(current.playerId), zeroGameRosterPlayer(current));
    }
  }

  // Add recent draft picks even if they are not yet listed on an NHL roster.
  for (const prospect of draftProspects) {
    if (!byId.has(String(prospect.playerId))) {
      byId.set(String(prospect.playerId), prospect);
    }
  }

  const players = [...byId.values()].map((player) => {
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
    stale: false
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
