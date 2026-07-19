import { STATS_SEASON_ID } from "@/data/league-config";
import { DEMO_PLAYERS } from "@/data/demo-players";
import { calculateFantasyPoints } from "@/lib/scoring";

const NHL_STATS_BASE = "https://api.nhle.com/stats/rest/en";
const CACHE_SECONDS = 60 * 60 * 6;

function makeReportUrl(path, sortProperty) {
  const params = new URLSearchParams({
    isAggregate: "false",
    isGame: "false",
    start: "0",
    limit: "1000",
    sort: JSON.stringify([{ property: sortProperty, direction: "DESC" }]),
    cayenneExp: `seasonId=${STATS_SEASON_ID} and gameTypeId=2`
  });

  return `${NHL_STATS_BASE}/${path}?${params.toString()}`;
}

async function fetchReport(path, sortProperty) {
  const response = await fetch(makeReportUrl(path, sortProperty), {
    next: { revalidate: CACHE_SECONDS },
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`NHL report ${path} returned ${response.status}`);
  }

  const payload = await response.json();
  return Array.isArray(payload.data) ? payload.data : [];
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
    const player = {
      playerId: Number(row.playerId),
      name: getPlayerName(row),
      team: row.teamAbbrevs || row.teamAbbrev || "—",
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
  return rows.map((row) => ({
    playerId: Number(row.playerId),
    name: getPlayerName(row),
    team: row.teamAbbrevs || row.teamAbbrev || "—",
    position: "G",
    rosterType: "G",
    gamesPlayed: Number(row.gamesPlayed || 0),
    wins: Number(row.wins || 0),
    losses: Number(row.losses || 0),
    shutouts: Number(row.shutouts || 0),
    savePct: row.savePct == null ? null : Number(row.savePct),
    goals: 0,
    assists: Number(row.assists || 0),
    hits: 0,
    shots: 0,
    fantasyPoints: null
  }));
}

export async function getAllPlayers() {
  try {
    const [skaterSummary, skaterRealtime, goalieSummary] = await Promise.all([
      fetchReport("skater/summary", "points"),
      fetchReport("skater/realtime", "hits"),
      fetchReport("goalie/summary", "wins")
    ]);

    const players = [
      ...normalizeSkaters(skaterSummary, skaterRealtime),
      ...normalizeGoalies(goalieSummary)
    ];

    return players.filter((player) => player.playerId && player.name);
  } catch (error) {
    console.error("NHL data unavailable. Serving demo players.", error);
    return DEMO_PLAYERS;
  }
}

export function searchPlayers(players, query, position = "ALL", limit = 40) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const normalizedPosition = String(position || "ALL").toUpperCase();

  return players
    .filter((player) => {
      const matchesQuery =
        normalizedQuery.length < 2 ||
        player.name.toLowerCase().includes(normalizedQuery) ||
        String(player.team || "").toLowerCase().includes(normalizedQuery);
      const matchesPosition =
        normalizedPosition === "ALL" || player.rosterType === normalizedPosition;
      return matchesQuery && matchesPosition;
    })
    .sort((a, b) => {
      if (a.rosterType === "G" && b.rosterType === "G") {
        return (b.wins || 0) - (a.wins || 0);
      }
      return (b.fantasyPoints || 0) - (a.fantasyPoints || 0);
    })
    .slice(0, limit);
}
