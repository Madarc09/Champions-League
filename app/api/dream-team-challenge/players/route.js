import { NextResponse } from "next/server";
import { getPlayerPool } from "@/lib/nhl";
import { challengePlayerPool } from "@/lib/dream-challenge";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const pool = await getPlayerPool();
    const players = challengePlayerPool(pool)
      .map((player) => ({
        playerId: Number(player.playerId),
        name: player.name,
        team: player.team || "NHL",
        rosterType: player.rosterType,
        position: player.position || player.rosterType,
        headshot: player.headshot || null,
        teamLogo: player.teamLogo || null,
        fantasyPoints: Number(player.fantasyPoints || 0),
        capHit: Number(player.capHit || 0)
      }))
      .sort((left, right) => (
        Number(right.fantasyPoints || 0) - Number(left.fantasyPoints || 0)
        || String(left.name || "").localeCompare(String(right.name || ""))
      ));

    return NextResponse.json({
      players,
      updatedAt: pool.updatedAt || null
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Dream Challenge player pool failed:", error);
    return NextResponse.json({ error: error.message || "The challenge player pool could not be loaded." }, { status: 502 });
  }
}
