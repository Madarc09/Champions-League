import { NextResponse } from "next/server";
import { managerFromRequest } from "@/lib/auth";
import { getPickEmSnapshot, savePickEmPick } from "@/lib/pick-em";

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

  try {
    const snapshot = await getPickEmSnapshot();
    return NextResponse.json({ ...snapshot, manager: auth.manager }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Pick 'Em load failed:", error);
    return NextResponse.json({ error: error.message || "Pick 'Em could not be loaded." }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireNick(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Choose a team first." }, { status: 400 });
  }

  try {
    const snapshot = await savePickEmPick({ gameId: body.gameId, teamAbbrev: body.teamAbbrev });
    return NextResponse.json({ ...snapshot, manager: auth.manager }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error.code === "LOCKED" ? 423 : 400;
    return NextResponse.json({ error: error.message || "That pick could not be saved." }, { status });
  }
}
