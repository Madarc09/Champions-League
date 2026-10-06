import { NextResponse } from "next/server";
import { managerFromRequest } from "@/lib/auth";
import { getPickEmMatchupInfo } from "@/lib/pick-em";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function requireManager(request) {
  const manager = await managerFromRequest(request);
  if (!manager) return { error: NextResponse.json({ error: "Sign in as a pool manager to use NHL Pick 'Em." }, { status: 401 }) };
  return { manager };
}

export async function GET(request) {
  const manager = await managerFromRequest(request);

  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get("gameId");
  if (!gameId) return NextResponse.json({ error: "Choose a matchup first." }, { status: 400 });

  try {
    const info = await getPickEmMatchupInfo(manager, gameId);
    return NextResponse.json({ ...info, manager: manager || null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Pick 'Em matchup info failed:", error);
    return NextResponse.json({ error: error.message || "Matchup info could not be loaded." }, { status: 500 });
  }
}
