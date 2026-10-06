import { NextResponse } from "next/server";
import { managerFromRequest } from "@/lib/auth";
import { getPickEmMatchupInfo } from "@/lib/pick-em";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function requireNick(request) {
  const manager = await managerFromRequest(request);
  if (!manager) return { error: NextResponse.json({ error: "Sign in as Nick to use Mini Games." }, { status: 401 }) };
  if (manager.slug !== "nick") return { error: NextResponse.json({ error: "Mini Games are in Nick-only testing for now." }, { status: 403 }) };
  return { manager };
}

export async function GET(request) {
  const auth = await requireNick(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get("gameId");
  if (!gameId) return NextResponse.json({ error: "Choose a matchup first." }, { status: 400 });

  try {
    const info = await getPickEmMatchupInfo(gameId);
    return NextResponse.json({ ...info, manager: auth.manager }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Pick 'Em matchup info failed:", error);
    return NextResponse.json({ error: error.message || "Matchup info could not be loaded." }, { status: 500 });
  }
}
