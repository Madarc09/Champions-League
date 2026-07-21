import { NextResponse } from "next/server";
import { STATS_SEASON_ID, TEAMS } from "@/data/league-config";
import { getPlayerPool } from "@/lib/nhl";
import { getRedis } from "@/lib/redis";
import { rosterStorageKey } from "@/lib/standings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NHL_STATS_BASE = "https://api.nhle.com/stats/rest/en";

// Used only if the NHL rookie-filtered reports are temporarily unavailable.
// The live reports remain the primary source.
const ROOKIE_NAME_FALLBACKS = new Set([
  "ivan demidov",
  "beckett sennecke",
  "matthew schaefer",
  "jimmy snuggerud",
  "ryan leonard",
  "fraser minten",
  "oliver kapanen",
  "michael misa",
  "alexander nikishin",
  "zeev buium",
  "sam dickinson",
  "cutter gauthier",
  "jakub dobes",
  "jesper wallstedt",
  "yaroslav askarov"
]);

function makeRookieReportUrl(path, sortProperty) {
  const params = new URLSearchParams({
    isAggregate: "false",
    isGame: "false",
    start: "0",
    limit: "-1",
    sort: JSON.stringify([{ property: sortProperty, direction: "DESC" }]),
    cayenneExp: `seasonId=${STATS_SEASON_ID} and gameTypeId=2 and isRookie=1`
  });

  return `${NHL_STATS_BASE}/${path}?${params.toString()}`;
}

async function fetchRookiePlayerIds() {
  const reports = await Promise.allSettled([
    fetch(makeRookieReportUrl("skater/summary", "points"), {
      next: { revalidate: 60 * 60 * 6 },
      headers: { Accept: "application/json" }
    }),
    fetch(makeRookieReportUrl("goalie/summary", "wins"), {
      next: { revalidate: 60 * 60 * 6 },
      headers: { Accept: "application/json" }
    })
  ]);

  const ids = new Set();
  for (const result of reports) {
    if (result.status !== "fulfilled" || !result.value.ok) continue;
    const payload = await result.value.json();
    for (const row of payload.data || []) {
      if (row.playerId != null) ids.add(String(row.playerId));
    }
  }

  return ids;
}

function publicPlayer(player) {
  return {
    playerId: player.playerId,
    name: player.name,
    team: player.team,
    rosterType: player.rosterType,
    position: player.position,
    fantasyPoints: Number(player.fantasyPoints || 0),
    headshot: player.headshot || null,
    teamLogo: player.teamLogo || null,
    gamesPlayed: Number(player.gamesPlayed || 0),
    goals: Number(player.goals || 0),
    assists: Number(player.assists || 0),
    hits: Number(player.hits || 0),
    shots: Number(player.shots || 0),
    saves: Number(player.saves || 0),
    goalsAgainst: Number(player.goalsAgainst || 0),
    wins: Number(player.wins || 0)
  };
}

function topPlayers(players, rosterType, limit) {
  return players
    .filter((player) => player.rosterType === rosterType && Number(player.gamesPlayed || 0) > 0)
    .sort((left, right) => Number(right.fantasyPoints || 0) - Number(left.fantasyPoints || 0))
    .slice(0, limit)
    .map(publicPlayer);
}

export async function GET() {
  const [poolResult, rookieResult] = await Promise.all([
    getPlayerPool(),
    fetchRookiePlayerIds().catch((error) => {
      console.error("NHL rookie report unavailable:", error);
      return new Set();
    })
  ]);

  const redis = getRedis();
  const rosters = {};
  if (redis) {
    const rosterResults = await Promise.allSettled(
      TEAMS.map(async (team) => [team.slug, await redis.get(rosterStorageKey(team.slug))])
    );
    for (const result of rosterResults) {
      if (result.status !== "fulfilled") continue;
      const [slug, roster] = result.value;
      rosters[slug] = roster || null;
    }
  }

  const players = poolResult.players || [];
  const rookiePlayers = players
    .filter((player) => {
      const playerName = String(player.name || "").trim().toLowerCase();
      return rookieResult.has(String(player.playerId)) || ROOKIE_NAME_FALLBACKS.has(playerName);
    })
    .filter((player) => Number(player.gamesPlayed || 0) > 0)
    .sort((left, right) => Number(right.fantasyPoints || 0) - Number(left.fantasyPoints || 0))
    .slice(0, 5)
    .map(publicPlayer);

  return NextResponse.json({
    performers: {
      forwards: topPlayers(players, "F", 10),
      defence: topPlayers(players, "D", 10),
      goalies: topPlayers(players, "G", 10),
      rookies: rookiePlayers
    },
    rosters,
    persistence: redis ? "shared" : "local",
    source: poolResult.source,
    updatedAt: poolResult.updatedAt,
    stale: Boolean(poolResult.stale)
  });
}
