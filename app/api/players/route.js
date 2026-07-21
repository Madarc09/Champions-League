import { NextResponse } from "next/server";
import { getPlayerPool, searchPlayers } from "@/lib/nhl";
import { getSalaryRecords } from "@/lib/salaries";
import { SEED_SALARIES_BY_NAME } from "@/data/seed-salaries";
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
  const mode = searchParams.get("mode") || "";
  const leaderboardMode = mode === "leaderboard";
  const predictionsMode = mode === "predictions";

  if (!leaderboardMode && !predictionsMode && search.trim().length < 2) {
    return NextResponse.json({ players: [], message: "Enter at least two characters." });
  }

  if (predictionsMode) {
    try {
      const pool = await getPlayerPool();
      const players = attachFantasyRanks(searchPlayers(pool.players, "", "ALL", null));
      return NextResponse.json({
        players,
        poolData: {
          source: pool.source,
          updatedAt: pool.updatedAt,
          counts: pool.counts,
          stale: Boolean(pool.stale),
          warning: pool.warning || null
        }
      });
    } catch (error) {
      return NextResponse.json(
        { error: error.message || "The NHL player pool could not be loaded." },
        { status: 502 }
      );
    }
  }

  const [playerResult, salaryResult] = await Promise.all([
    getPlayerPool()
      .then((pool) => ({ pool, error: null }))
      .catch((error) => ({ pool: null, error })),
    getCapSpaceSalarySnapshot()
      .then((snapshot) => ({ snapshot, error: null }))
      .catch((error) => ({ snapshot: null, error }))
  ]);

  if (!playerResult.pool) {
    return NextResponse.json(
      {
        error: playerResult.error?.message || "The complete NHL player pool could not be loaded."
      },
      { status: 502 }
    );
  }

  const salarySnapshot = salaryResult.snapshot;
  const salaryError = salaryResult.error?.message || null;
  if (salaryResult.error) {
    console.error("Salary snapshot unavailable:", salaryResult.error);
  }

  const matches = searchPlayers(
    playerResult.pool.players,
    leaderboardMode ? "" : search,
    position,
    leaderboardMode ? null : 100
  );
  const rankedMatches = attachFantasyRanks(matches);
  const storedOverrides = await getSalaryRecords(rankedMatches.map((player) => player.playerId));

  const players = rankedMatches.map((player) => {
    const canonicalName = canonicalPlayerName(player.name);
    const publicRecord = salarySnapshot?.byName?.[canonicalName] || null;
    const rookieSeed = SEED_SALARIES_BY_NAME[canonicalName] || null;
    const override = trustedSalaryOverride(storedOverrides[String(player.playerId)]);
    const selected = override || publicRecord || rookieSeed;
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
    poolData: {
      source: playerResult.pool.source,
      updatedAt: playerResult.pool.updatedAt,
      counts: playerResult.pool.counts,
      stale: Boolean(playerResult.pool.stale),
      warning: playerResult.pool.warning || null
    },
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
