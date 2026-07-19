import { NextResponse } from "next/server";
import { getAllPlayers, searchPlayers } from "@/lib/nhl";
import { getSalaryRecords } from "@/lib/salaries";
import {
  canonicalPlayerName,
  getCapSpaceSalarySnapshot
} from "@/lib/capspace-snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function attachFantasyRanks(players) {
  let rank = 0;
  return players.map((player) => {
    if (player.fantasyPoints == null) return { ...player, fantasyRank: null };
    rank += 1;
    return { ...player, fantasyRank: rank };
  });
}

function trustedSalaryOverride(record) {
  if (!record || !Number.isFinite(Number(record.capHit))) return null;
  const source = String(record.source || "").toLowerCase();
  return ["manual", "csv-import", "import", "seed"].includes(source) ? record : null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const position = searchParams.get("position") || "ALL";
  const leaderboardMode = searchParams.get("mode") === "leaderboard";

  if (!leaderboardMode && search.trim().length < 2) {
    return NextResponse.json({ players: [], message: "Enter at least two characters." });
  }

  let salarySnapshot = null;
  let salaryError = null;

  const [allPlayers, salaryResult] = await Promise.all([
    getAllPlayers(),
    getCapSpaceSalarySnapshot()
      .then((snapshot) => ({ snapshot, error: null }))
      .catch((error) => ({ snapshot: null, error }))
  ]);

  salarySnapshot = salaryResult.snapshot;
  if (salaryResult.error) {
    console.error("Salary snapshot unavailable:", salaryResult.error);
    salaryError = salaryResult.error?.message || "Salary data could not be loaded.";
  }

  const matches = searchPlayers(
    allPlayers,
    leaderboardMode ? "" : search,
    position,
    leaderboardMode ? 1000 : 80
  );
  const rankedMatches = attachFantasyRanks(matches);
  const storedOverrides = await getSalaryRecords(rankedMatches.map((player) => player.playerId));

  const players = rankedMatches.map((player) => {
    const publicRecord = salarySnapshot?.byName?.[canonicalPlayerName(player.name)] || null;
    const override = trustedSalaryOverride(storedOverrides[String(player.playerId)]);
    const selected = override || publicRecord;
    const demoCapHit = player.capHit != null ? Number(player.capHit) : null;
    const capHit = selected?.capHit != null ? Number(selected.capHit) : demoCapHit;

    return {
      ...player,
      capHit: Number.isFinite(capHit) ? capHit : null,
      salarySource: selected?.source || (demoCapHit != null ? "demo" : null),
      salaryUpdatedAt: override?.updatedAt || salarySnapshot?.updatedAt || null,
      salaryState: Number.isFinite(capHit) ? "signed" : "unsigned"
    };
  });

  return NextResponse.json({
    players,
    salaryData: {
      source: salarySnapshot?.source || null,
      sourceUrl: salarySnapshot?.sourceUrl || null,
      updatedAt: salarySnapshot?.updatedAt || null,
      recordCount: salarySnapshot?.recordCount || 0,
      teamCount: salarySnapshot?.teamCount || 0,
      failedTeamCount: salarySnapshot?.failedTeams?.length || 0,
      stale: Boolean(salarySnapshot?.stale),
      error: salaryError
    }
  });
}
