import { NextResponse } from "next/server";
import { TEAMS } from "@/data/league-config";
import { getPlayerPool } from "@/lib/nhl";
import { getRedis } from "@/lib/redis";
import { buildLeagueStandings, rosterStorageKey } from "@/lib/standings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const redis = getRedis();
  const rosters = {};

  if (redis) {
    const results = await Promise.allSettled(
      TEAMS.map(async (team) => [team.slug, await redis.get(rosterStorageKey(team.slug))])
    );

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const [teamSlug, roster] = result.value;
      rosters[teamSlug] = roster || null;
    }
  } else {
    for (const team of TEAMS) rosters[team.slug] = null;
  }

  let liveFantasyPoints = {};
  let statsUpdatedAt = null;

  try {
    const pool = await getPlayerPool();
    liveFantasyPoints = Object.fromEntries(
      (pool.players || []).map((player) => [
        String(player.playerId),
        Number(player.fantasyPoints || 0)
      ])
    );
    statsUpdatedAt = pool.updatedAt || null;
  } catch (error) {
    console.error("Standings player refresh failed:", error);
  }

  // Only aggregate totals leave the server. Individual rosters and player IDs
  // remain private inside Upstash.
  return NextResponse.json({
    standings: buildLeagueStandings(rosters, liveFantasyPoints),
    persistence: redis ? "private" : "unavailable",
    statsUpdatedAt
  }, {
    headers: { "Cache-Control": "no-store" }
  });
}
