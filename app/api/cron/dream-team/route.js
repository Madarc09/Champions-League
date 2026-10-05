import { NextResponse } from "next/server";
import { ensureDreamTeamRoster } from "@/lib/special-teams";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const roster = await ensureDreamTeamRoster();
    return NextResponse.json({
      ok: true,
      weekKey: roster.weekKey || null,
      players: roster.players?.length || 0,
      totalCap: roster.totalCap || 0,
      updatedAt: roster.updatedAt || null
    });
  } catch (error) {
    console.error("Dream Team cron failed:", error);
    return NextResponse.json({ error: error.message || "Dream Team refresh failed." }, { status: 500 });
  }
}
