import { NextResponse } from "next/server";
import { getRankingSnapshot, pickPlayerRankings } from "@/lib/rankings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const names = searchParams.getAll("name").flatMap((value) => value.split("|")).map((value) => value.trim()).filter(Boolean).slice(0, 60);

  try {
    const snapshot = await getRankingSnapshot();
    const players = Object.fromEntries(names.map((name) => [name, pickPlayerRankings(snapshot, name)]));
    return NextResponse.json({
      updatedAt: snapshot.updatedAt,
      stale: Boolean(snapshot.stale),
      warning: snapshot.warning || null,
      sources: snapshot.sources,
      players
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Ranking sources could not be loaded." },
      { status: 502 }
    );
  }
}
