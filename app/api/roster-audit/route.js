import { NextResponse } from "next/server";
import { BOT_TEAM, TEAMS } from "@/data/league-config";
import { getPlayerPool } from "@/lib/nhl";
import { getRedis } from "@/lib/redis";
import { buildPlayerIdentityIndex, resolvePlayerFromIndex } from "@/lib/player-identity";
import { rosterStorageKey } from "@/lib/standings";
import { specialRosterFor } from "@/lib/special-teams";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function auditPlayer(saved, index) {
  const live = resolvePlayerFromIndex(saved, index);
  if (!live) {
    return {
      savedPlayerId: saved?.playerId ?? null,
      name: saved?.name || "Unknown player",
      status: "unresolved",
      statsConnected: false,
      officialPlayerId: null,
      team: saved?.team || null,
      gamesPlayed: 0,
      fantasyPoints: 0,
      headshot: saved?.headshot || null
    };
  }

  const sameId = String(saved?.playerId || "") === String(live.playerId || "");
  return {
    savedPlayerId: saved?.playerId ?? null,
    name: live.name || saved?.name || "Unknown player",
    status: sameId ? "connected" : "identity-repaired",
    statsConnected: true,
    officialPlayerId: live.playerId,
    team: live.team || saved?.team || null,
    gamesPlayed: Number(live.gamesPlayed || 0),
    fantasyPoints: Number(live.fantasyPoints || 0),
    headshot: live.headshot || saved?.headshot || null
  };
}

export async function GET() {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: "Upstash is not connected to this Vercel project." }, { status: 503 });
  }

  try {
    const [pool, botRoster, ...humanRows] = await Promise.all([
      getPlayerPool(),
      specialRosterFor(BOT_TEAM.slug),
      ...TEAMS.map(async (team) => [team, await redis.get(rosterStorageKey(team.slug))])
    ]);

    const index = buildPlayerIdentityIndex(pool.players || []);
    const teams = [];

    for (const [team, roster] of humanRows) {
      const players = (roster?.players || []).map((player) => auditPlayer(player, index));
      teams.push({ slug: team.slug, name: team.name, playerCount: players.length, players });
    }

    const botPlayers = (botRoster?.players || []).map((player) => auditPlayer(player, index));
    teams.push({ slug: BOT_TEAM.slug, name: BOT_TEAM.name, playerCount: botPlayers.length, players: botPlayers });

    const allPlayers = teams.flatMap((team) => team.players);
    const repaired = allPlayers.filter((player) => player.status === "identity-repaired");
    const unresolved = allPlayers.filter((player) => player.status === "unresolved");
    const connected = allPlayers.length - unresolved.length;

    return NextResponse.json({
      season: "2026-27",
      source: pool.source,
      statsUpdatedAt: pool.updatedAt || null,
      summary: {
        teams: teams.length,
        players: allPlayers.length,
        connected,
        identityRepaired: repaired.length,
        unresolved: unresolved.length,
        allConnected: unresolved.length === 0
      },
      repaired,
      unresolved,
      teams
    }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("Roster identity audit failed:", error);
    return NextResponse.json({ error: error?.message || "Roster identity audit failed." }, { status: 500 });
  }
}
