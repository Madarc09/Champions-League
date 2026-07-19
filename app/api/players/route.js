import { NextResponse } from "next/server";
import { getAllPlayers, searchPlayers } from "@/lib/nhl";
import { getSalaryRecords } from "@/lib/salaries";

export const dynamic = "force-dynamic";

function attachFantasyRanks(players) {
  let skaterRank = 0;
  return players.map((player) => {
    if (player.fantasyPoints == null) return { ...player, fantasyRank: null };
    skaterRank += 1;
    return { ...player, fantasyRank: skaterRank };
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const position = searchParams.get("position") || "ALL";
  const leaderboardMode = searchParams.get("mode") === "leaderboard";

  if (!leaderboardMode && search.trim().length < 2) {
    return NextResponse.json({ players: [], message: "Enter at least two characters." });
  }

  const allPlayers = await getAllPlayers();
  const matches = searchPlayers(
    allPlayers,
    leaderboardMode ? "" : search,
    position,
    leaderboardMode ? 1000 : 80
  );
  const rankedMatches = attachFantasyRanks(matches);
  const salaries = await getSalaryRecords(rankedMatches.map((player) => player.playerId));

  const players = rankedMatches.map((player) => ({
    ...player,
    capHit: salaries[String(player.playerId)]?.capHit ?? player.capHit ?? null,
    salarySource: salaries[String(player.playerId)]?.source || (player.capHit ? "demo" : null),
    salaryUpdatedAt: salaries[String(player.playerId)]?.updatedAt || null
  }));

  return NextResponse.json({ players });
}
