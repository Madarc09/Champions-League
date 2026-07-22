import { NextResponse } from "next/server";
import { getPlayerPool, searchPlayers } from "@/lib/nhl";
import { getSalaryRecords } from "@/lib/salaries";
import { getRankingSnapshot, pickPlayerRankings } from "@/lib/rankings";
import { getMoneyPuckSnapshot, findMoneyPuckRecord } from "@/lib/moneypuck";
import { createPlayerProjection } from "@/lib/projections";
import { applyStaticProjection, staticProjectionSummary } from "@/lib/static-projections";
import { getNhlHistorySnapshot, findNhlHistory } from "@/lib/nhl-history";
import { projectionContextFor } from "@/data/projection-context";
import { salaryCapSpaceRecordFor, salaryCapSpaceSnapshot } from "@/lib/salary-cap-space";

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
  return source === "manual" ? record : null;
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
      let rankingSnapshot = null;
      try {
        rankingSnapshot = await getRankingSnapshot();
      } catch (rankingError) {
        console.error("Prediction candidate rankings unavailable:", rankingError);
      }

      const players = attachFantasyRanks(searchPlayers(pool.players, "", "ALL", null)).map((player) => ({
        ...player,
        expectedRanks: rankingSnapshot ? pickPlayerRankings(rankingSnapshot, player.name) : null
      }));

      return NextResponse.json({
        players,
        candidateRankings: {
          source: "NHL.com and ESPN 2026-27 fantasy rankings, with 2025-26 category production",
          updatedAt: rankingSnapshot?.updatedAt || null,
          stale: Boolean(rankingSnapshot?.stale),
          warning: rankingSnapshot?.warning || null
        },
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

  const [playerResult, rankingResult, moneyPuckResult, historyResult] = await Promise.all([
    getPlayerPool()
      .then((pool) => ({ pool, error: null }))
      .catch((error) => ({ pool: null, error })),
    getRankingSnapshot()
      .then((snapshot) => ({ snapshot, error: null }))
      .catch((error) => ({ snapshot: null, error })),
    getMoneyPuckSnapshot()
      .then((snapshot) => ({ snapshot, error: null }))
      .catch((error) => ({ snapshot: null, error })),
    getNhlHistorySnapshot()
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

  const salarySnapshot = salaryCapSpaceSnapshot();

  const matches = searchPlayers(
    playerResult.pool.players,
    leaderboardMode ? "" : search,
    position,
    leaderboardMode ? null : 100
  );
  const rankedMatches = attachFantasyRanks(matches);
  const storedOverrides = await getSalaryRecords(rankedMatches.map((player) => player.playerId));

  const players = rankedMatches.map((player) => {
    const staticRecord = salaryCapSpaceRecordFor(player);
    const override = trustedSalaryOverride(storedOverrides[String(player.playerId)]);
    const selected = override || staticRecord || null;
    const selectedCapHit = Number(selected?.capHit);
    const capHit = Number.isFinite(selectedCapHit) && selectedCapHit >= 500_000
      ? selectedCapHit
      : null;

    const expectedRanks = rankingResult.snapshot
      ? pickPlayerRankings(rankingResult.snapshot, player.name)
      : null;
    const advanced = moneyPuckResult.snapshot
      ? findMoneyPuckRecord(moneyPuckResult.snapshot, player)
      : null;
    const nhlHistory = historyResult.snapshot
      ? findNhlHistory(historyResult.snapshot, player)
      : [];
    const modelProjection = createPlayerProjection(
      player,
      nhlHistory,
      advanced,
      expectedRanks,
      projectionContextFor(player)
    );
    const projection = applyStaticProjection(player, modelProjection);

    return {
      ...player,
      capHit,
      salarySource: selected?.source || null,
      salaryUpdatedAt: override?.updatedAt || salarySnapshot?.generatedAt || null,
      salaryState: capHit != null ? "signed" : "unresolved",
      expectedRanks,
      projection
    };
  });

  const unresolvedSalaryCount = players.filter((player) => player.capHit == null).length;

  // Every Champions League roster is independent. A player selected by one
  // manager remains available to every other manager.
  const draftPlayers = players;

  return NextResponse.json({
    players,
    draftPlayers,
    poolData: {
      source: playerResult.pool.source,
      updatedAt: playerResult.pool.updatedAt,
      counts: playerResult.pool.counts,
      stale: Boolean(playerResult.pool.stale),
      warning: playerResult.pool.warning || null,
      duplicateAudit: playerResult.pool.duplicateAudit || null
    },
    salaryData: {
      source: "SALARY_CAP_SPACE.json",
      sourceUrl: salarySnapshot?.sourceUrl || null,
      updatedAt: salarySnapshot?.generatedAt || null,
      recordCount: Number(salarySnapshot?.recordCount || 0),
      signedCount: Number(salarySnapshot?.signedCount || 0),
      zeroSalaryCount: Number(salarySnapshot?.zeroSalaryCount || 0),
      correctionCount: 0,
      matchedPlayerCount: players.length - unresolvedSalaryCount,
      unresolvedPlayerCount: unresolvedSalaryCount,
      frozen: true,
      fallback: false,
      auditComplete: true,
      error: salarySnapshot?.recordCount ? null : "SALARY_CAP_SPACE.json is empty. Redeploy so the prebuild salary snapshot can run.",
      warning: null
    },
    projectionData: {
      model: "Champions Static Projection Board 2.0",
      season: "2026-27",
      updatedAt: new Date().toISOString(),
      rankingUpdatedAt: rankingResult.snapshot?.updatedAt || null,
      advancedUpdatedAt: moneyPuckResult.snapshot?.updatedAt || null,
      historyUpdatedAt: historyResult.snapshot?.updatedAt || null,
      staticBoard: staticProjectionSummary(players.length),
      sources: [
        "Full-pool static projection board with editorial overrides",
        "NHL three-season production and usage",
        "MoneyPuck three-season expected, line and team data",
        "Role/linemate and team/coach environment",
        "Public rank sanity check"
      ],
      warning: historyResult.error?.message || rankingResult.error?.message || moneyPuckResult.snapshot?.warning || moneyPuckResult.error?.message || null
    }
  });
}
