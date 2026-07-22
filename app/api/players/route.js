import { NextResponse } from "next/server";
import { getPlayerPool, searchPlayers } from "@/lib/nhl";
import { getSalaryRecords } from "@/lib/salaries";
import { SEED_SALARIES_BY_NAME } from "@/data/seed-salaries";
import { VERIFIED_SALARY_CORRECTIONS_BY_NAME } from "@/data/verified-salary-corrections";
import { getRankingSnapshot, pickPlayerRankings } from "@/lib/rankings";
import { getMoneyPuckSnapshot, findMoneyPuckRecord } from "@/lib/moneypuck";
import { createPlayerProjection } from "@/lib/projections";
import { applyStaticProjection, staticProjectionSummary } from "@/lib/static-projections";
import { getNhlHistorySnapshot, findNhlHistory } from "@/lib/nhl-history";
import { projectionContextFor } from "@/data/projection-context";
import { salaryCapSpaceRecordFor, salaryCapSpaceSnapshot } from "@/lib/salary-cap-space";
import { canonicalPlayerName, getCapSpaceSalarySnapshot } from "@/lib/capspace-snapshot";

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
  return String(record.source || "").toLowerCase() === "manual" ? record : null;
}

function fallbackSalaryRecord(snapshot, player) {
  if (!snapshot) return null;
  const nameKey = canonicalPlayerName(player.name);
  return snapshot.byPlayerId?.[String(player.playerId)]
    || snapshot.byTeamAndName?.[`${String(player.team || "").toUpperCase()}:${nameKey}`]
    || snapshot.byName?.[nameKey]
    || null;
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

  const staticSnapshot = salaryCapSpaceSnapshot();
  const hasStaticSalaryFile = Number(staticSnapshot?.recordCount || 0) > 0;

  const [playerResult, fallbackSalaryResult, rankingResult, moneyPuckResult, historyResult] = await Promise.all([
    getPlayerPool()
      .then((pool) => ({ pool, error: null }))
      .catch((error) => ({ pool: null, error })),
    hasStaticSalaryFile
      ? Promise.resolve({ snapshot: null, error: null })
      : getCapSpaceSalarySnapshot({ force: false, strict: false })
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
      { error: playerResult.error?.message || "The complete NHL player pool could not be loaded." },
      { status: 502 }
    );
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
    const nameKey = canonicalPlayerName(player.name);
    const override = trustedSalaryOverride(storedOverrides[String(player.playerId)]);
    const staticRecord = salaryCapSpaceRecordFor(player);
    const verifiedCorrection = VERIFIED_SALARY_CORRECTIONS_BY_NAME[nameKey] || null;
    const fallbackRecord = fallbackSalaryRecord(fallbackSalaryResult.snapshot, player);
    const rookieSeed = SEED_SALARIES_BY_NAME[nameKey] || null;
    const selected = override || staticRecord || verifiedCorrection || fallbackRecord || rookieSeed || null;
    const selectedCapHit = Number(selected?.capHit);
    const capHit = Number.isFinite(selectedCapHit) && selectedCapHit >= 500_000
      ? Math.round(selectedCapHit)
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
      salaryUpdatedAt: override?.updatedAt || staticSnapshot?.generatedAt || fallbackSalaryResult.snapshot?.updatedAt || selected?.verifiedAt || null,
      salaryState: capHit != null ? "signed" : "unresolved",
      expectedRanks,
      projection
    };
  });

  const unresolvedSalaryCount = players.filter((player) => player.capHit == null).length;

  return NextResponse.json({
    players,
    draftPlayers: players,
    poolData: {
      source: playerResult.pool.source,
      updatedAt: playerResult.pool.updatedAt,
      counts: playerResult.pool.counts,
      stale: Boolean(playerResult.pool.stale),
      warning: playerResult.pool.warning || null,
      duplicateAudit: playerResult.pool.duplicateAudit || null
    },
    salaryData: {
      source: hasStaticSalaryFile ? "SALARY_CAP_SPACE.json" : (fallbackSalaryResult.snapshot?.source || "salary fallback"),
      sourceUrl: hasStaticSalaryFile ? staticSnapshot?.sourceUrl || null : fallbackSalaryResult.snapshot?.sourceUrl || null,
      updatedAt: hasStaticSalaryFile ? staticSnapshot?.generatedAt || null : fallbackSalaryResult.snapshot?.updatedAt || null,
      recordCount: hasStaticSalaryFile
        ? Number(staticSnapshot?.recordCount || 0)
        : Number(fallbackSalaryResult.snapshot?.recordCount || 0),
      signedCount: hasStaticSalaryFile ? Number(staticSnapshot?.signedCount || 0) : null,
      zeroSalaryCount: hasStaticSalaryFile ? Number(staticSnapshot?.zeroSalaryCount || 0) : unresolvedSalaryCount,
      matchedPlayerCount: players.length - unresolvedSalaryCount,
      unresolvedPlayerCount: unresolvedSalaryCount,
      frozen: hasStaticSalaryFile,
      fallback: !hasStaticSalaryFile,
      auditComplete: hasStaticSalaryFile,
      error: null,
      warning: fallbackSalaryResult.error?.message || null
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
