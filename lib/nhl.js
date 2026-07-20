import { STATS_SEASON_ID } from "@/data/league-config";
import { getRedis } from "@/lib/redis";
import { calculateFantasyPoints } from "@/lib/scoring";

const NHL_STATS_BASE = "https://api.nhle.com/stats/rest/en";
const NHL_WEB_BASE = "https://api-web.nhle.com/v1";
const NHL_ASSETS_BASE = "https://assets.nhle.com";
const CACHE_SECONDS = 60 * 60 * 6;
const PLAYER_POOL_CACHE_KEY = `champions-league:nhl-player-pool:${STATS_SEASON_ID}:headshots-v1`;
const PLAYER_POOL_CACHE_SECONDS = 60 * 60 * 24 * 30;

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
  const teams = String(value || "")
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

      return roster.map((player) => ({
        playerId: Number(player.id || player.playerId),
        team,
        headshot: player.headshot || historicalHeadshotUrl(player.id || player.playerId, team),
        teamLogo: teamLogoUrl(team),
        currentPosition: player.positionCode || player.position || null
      }));
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
  const byId = new Map();
  for (const player of players) {
    if (!player.playerId || !player.name) continue;
    byId.set(String(player.playerId), player);
  }
  return [...byId.values()];
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
  const [skaterSummary, skaterRealtime, goalieSummary, currentRosterDirectory] = await Promise.all([
    fetchReport("skater/summary", "points"),
    fetchReport("skater/realtime", "hits"),
    fetchReport("goalie/summary", "wins"),
    fetchCurrentRosterDirectory().catch((error) => {
      console.error("Current NHL roster photos unavailable:", error);
      return new Map();
    })
  ]);

  const players = deduplicatePlayers([
    ...normalizeSkaters(skaterSummary, skaterRealtime),
    ...normalizeGoalies(goalieSummary)
  ])
    .filter((player) => player.gamesPlayed > 0)
    .map((player) => {
      const current = currentRosterDirectory.get(String(player.playerId));
      const team = current?.team || player.team;
      return {
        ...player,
        team,
        headshot: current?.headshot || historicalHeadshotUrl(player.playerId, player.statsTeam || team),
        teamLogo: current?.teamLogo || teamLogoUrl(team),
        mediaSource: "NHL"
      };
    });

  const counts = countPlayers(players);
  verifyCoverage(counts);

  return {
    players,
    counts,
    source: "NHL Stats and NHL rosters",
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
          return {
            ...cached,
            counts: cached.counts || countPlayers(cached.players),
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
