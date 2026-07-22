import { NextResponse } from "next/server";
import { getPlayerPool, searchPlayers } from "@/lib/nhl";
import { getSalaryRecords } from "@/lib/salaries";
import { SEED_SALARIES_BY_NAME } from "@/data/seed-salaries";
import { getStaticSalaryMaster, salaryTeamNameKey } from "@/lib/static-salary-master";
import { getRankingSnapshot, pickPlayerRankings } from "@/lib/rankings";
import { getMoneyPuckSnapshot, findMoneyPuckRecord } from "@/lib/moneypuck";
import { createPlayerProjection } from "@/lib/projections";
import { applyStaticProjection, staticProjectionSummary } from "@/lib/static-projections";
import { getNhlHistorySnapshot, findNhlHistory } from "@/lib/nhl-history";
import { projectionContextFor } from "@/data/projection-context";
import { canonicalPlayerName } from "@/lib/capspace-snapshot";

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

  const [playerResult, salaryResult, rankingResult, moneyPuckResult, historyResult] = await Promise.all([
    getPlayerPool()
      .then((pool) => ({ pool, error: null }))
      .catch((error) => ({ pool: null, error })),
    getStaticSalaryMaster()
      .then((snapshot) => ({ snapshot, error: null }))
      .catch((error) => ({ snapshot: null, error })),
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

  const salarySnapshot = salaryResult.snapshot;
  const salaryError = salaryResult.error?.message || null;
  if (salaryResult.error) {
    console.error("Frozen salary master unavailable:", salaryResult.error);
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
    const publicRecord = salarySnapshot?.byPlayerId?.[String(player.playerId)]
      || salarySnapshot?.byTeamAndName?.[salaryTeamNameKey(player.team, canonicalName)]
      || salarySnapshot?.byName?.[canonicalName]
      || null;
    const rookieSeed = SEED_SALARIES_BY_NAME[canonicalName] || null;
    const override = trustedSalaryOverride(storedOverrides[String(player.playerId)]);
    const selected = override || publicRecord || rookieSeed;
    const demoCapHit = player.capHit != null ? Number(player.capHit) : null;
    const capHit = selected?.capHit != null ? Number(selected.capHit) : demoCapHit;

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
      capHit: Number.isFinite(capHit) ? capHit : null,
      salarySource: selected?.source || (demoCapHit != null ? "demo" : null),
      salaryUpdatedAt: override?.updatedAt || selected?.verifiedAt || salarySnapshot?.initializedAt || null,
      salaryState: Number.isFinite(capHit) ? "signed" : "unresolved",
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
      source: salarySnapshot?.source || null,
      sourceUrl: salarySnapshot?.sourceUrl || null,
      updatedAt: salarySnapshot?.initializedAt || null,
      sourceCapturedAt: salarySnapshot?.sourceCapturedAt || null,
      recordCount: salarySnapshot?.recordCount || 0,
      correctionCount: salarySnapshot?.correctionCount || 0,
      matchedPlayerCount: players.length - unresolvedSalaryCount,
      unresolvedPlayerCount: unresolvedSalaryCount,
      frozen: Boolean(salarySnapshot),
      auditedTeamCount: salarySnapshot?.sourceTeamCount || 0,
      error: salaryError
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
