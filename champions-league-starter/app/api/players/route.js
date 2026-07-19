import { NextResponse } from "next/server";
import { getAllPlayers, searchPlayers } from "@/lib/nhl";
import { getSalaryRecords } from "@/lib/salaries";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const position = searchParams.get("position") || "ALL";

  if (search.trim().length < 2) {
    return NextResponse.json({ players: [], message: "Enter at least two characters." });
  }

  const allPlayers = await getAllPlayers();
  const matches = searchPlayers(allPlayers, search, position, 40);
  const salaries = await getSalaryRecords(matches.map((player) => player.playerId));

  const players = matches.map((player) => ({
    ...player,
    capHit: salaries[String(player.playerId)]?.capHit ?? player.capHit ?? null,
    salarySource: salaries[String(player.playerId)]?.source || (player.capHit ? "demo" : null),
    salaryUpdatedAt: salaries[String(player.playerId)]?.updatedAt || null
  }));

  return NextResponse.json({ players });
}
