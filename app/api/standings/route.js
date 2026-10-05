import { NextResponse } from "next/server";
import { DREAM_TEAM, STANDINGS_TEAMS } from "@/data/league-config";
import { getPlayerPool } from "@/lib/nhl";
import { getRedis } from "@/lib/redis";
import {
  buildLeagueStandings,
  rosterFantasyTotal,
  rosterProjectedTotal,
  rosterStorageKey
} from "@/lib/standings";
import { applyStaticProjection } from "@/lib/static-projections";
import { ensureSpecialRosters } from "@/lib/special-teams";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function overlapCount(roster, dreamRoster) {
  const dreamIds = new Set((dreamRoster?.players || []).map((player) => String(player.playerId)));
  return (roster?.players || []).reduce(
    (count, player) => count + (dreamIds.has(String(player.playerId)) ? 1 : 0),
    0
  );
}

export async function GET() {
  const redis = getRedis();
  const rosters = {};
  let dreamRoster = null;

  try {
    const special = await ensureSpecialRosters();
    rosters[special.bot.team] = special.bot;
    dreamRoster = special.dream;
  } catch (error) {
    console.error("Special roster refresh failed:", error);
  }

  if (redis) {
    const humanTeams = STANDINGS_TEAMS.filter((team) => team.kind !== "bot");
    const results = await Promise.allSettled(
      humanTeams.map(async (team) => [team.slug, await redis.get(rosterStorageKey(team.slug))])
    );

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const [teamSlug, roster] = result.value;
      rosters[teamSlug] = roster || null;
    }
  } else {
    for (const team of STANDINGS_TEAMS) {
      if (!(team.slug in rosters)) rosters[team.slug] = null;
    }
  }

  let liveFantasyPoints = {};
  let liveProjectedPoints = {};
  let livePlayersById = new Map();
  let statsUpdatedAt = null;

  try {
    const pool = await getPlayerPool();
    livePlayersById = new Map(
      (pool.players || []).map((player) => [String(player.playerId), player])
    );
    liveFantasyPoints = Object.fromEntries(
      (pool.players || []).map((player) => [
        String(player.playerId),
        Number(player.fantasyPoints || 0)
      ])
    );

    const rosterPlayers = [
      ...Object.values(rosters).flatMap((roster) => Array.isArray(roster?.players) ? roster.players : []),
      ...(dreamRoster?.players || [])
    ];
    liveProjectedPoints = Object.fromEntries(
      rosterPlayers.map((player) => {
        const projection = applyStaticProjection(player, player.projection || {});
        return [String(player.playerId), Number(projection?.fantasyPoints || 0)];
      })
    );
    statsUpdatedAt = pool.updatedAt || null;
  } catch (error) {
    console.error("Standings player refresh failed:", error);
  }

  const standings = buildLeagueStandings(rosters, liveFantasyPoints, liveProjectedPoints)
    .map((team) => ({
      ...team,
      dreamTeamPlayers: overlapCount(rosters[team.slug], dreamRoster)
    }));

  const positionOrder = { F: 0, D: 1, G: 2 };
  const dreamPlayers = (dreamRoster?.players || [])
    .map((storedPlayer) => {
      const livePlayer = livePlayersById.get(String(storedPlayer.playerId));
      return {
        ...storedPlayer,
        ...(livePlayer || {}),
        capHit: Number(storedPlayer.capHit || livePlayer?.capHit || 0),
        fantasyPoints: Number(liveFantasyPoints[String(storedPlayer.playerId)] || 0)
      };
    })
    .sort((left, right) => (
      (positionOrder[left.rosterType] ?? 9) - (positionOrder[right.rosterType] ?? 9)
      || Number(right.fantasyPoints || 0) - Number(left.fantasyPoints || 0)
      || String(left.name || "").localeCompare(String(right.name || ""))
    ));

  const dreamTeam = dreamRoster ? {
    ...DREAM_TEAM,
    players: dreamPlayers,
    fantasyPoints: rosterFantasyTotal(dreamRoster, liveFantasyPoints),
    projectedFantasyPoints: rosterProjectedTotal(dreamRoster, liveProjectedPoints),
    totalCap: Number(dreamRoster.totalCap || 0),
    weekKey: dreamRoster.weekKey || null,
    updatedAt: dreamRoster.updatedAt || null
  } : null;

  return NextResponse.json({
    standings,
    dreamTeam,
    persistence: redis ? "private" : "unavailable",
    statsUpdatedAt
  }, {
    headers: { "Cache-Control": "no-store" }
  });
}
