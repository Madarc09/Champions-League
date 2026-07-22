import { GOALIE_SCORING, SCORING } from "@/data/league-config";

const POSITION_PRIORS = {
  F: { goals: 0.22, assists: 0.34, hits: 1.05, shots: 2.15 },
  D: { goals: 0.09, assists: 0.27, hits: 1.15, shots: 1.65 }
};

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function rate(total, games) {
  return Number(games) > 0 ? Number(total || 0) / Number(games) : 0;
}

function shrink(observedRate, games, priorRate, sampleGames = 30) {
  const weight = Number(games || 0) / (Number(games || 0) + sampleGames);
  return observedRate * weight + priorRate * (1 - weight);
}

function averageRank(ranks) {
  const values = Object.entries(ranks || {})
    .filter(([source, value]) => source !== "champions" && Number.isFinite(Number(value)))
    .map(([, value]) => Number(value));
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rankMultiplier(ranks) {
  const rank = averageRank(ranks);
  if (rank == null) return 1;
  if (rank <= 10) return 1.08;
  if (rank <= 25) return 1.055;
  if (rank <= 50) return 1.035;
  if (rank <= 100) return 1.015;
  if (rank <= 175) return 1;
  if (rank <= 250) return 0.985;
  return 0.97;
}

function expectedSkaterGames(player, ranks) {
  const gp = Number(player.gamesPlayed || 0);
  const consensus = averageRank(ranks);
  if (gp === 0) {
    if (consensus != null && consensus <= 100) return 68;
    if (player.draftYear && Number(player.draftYear) >= 2025) return 52;
    return 42;
  }
  const baseline = gp * 0.72 + 76 * 0.28;
  const rankBoost = consensus != null && consensus <= 75 ? 3 : 0;
  return clamp(Math.round(baseline + rankBoost), 45, 82);
}

function expectedGoalieGames(player, ranks) {
  const gp = Number(player.gamesPlayed || 0);
  const consensus = averageRank(ranks);
  if (consensus != null) {
    if (consensus <= 40) return clamp(Math.round(gp * 0.45 + 55 * 0.55), 45, 62);
    if (consensus <= 100) return clamp(Math.round(gp * 0.55 + 44 * 0.45), 32, 56);
    if (consensus <= 200) return clamp(Math.round(gp * 0.65 + 34 * 0.35), 22, 48);
  }
  if (gp === 0) return 18;
  return clamp(Math.round(gp * 0.7 + 32 * 0.3), 12, 58);
}

function projectionConfidence(player, advanced) {
  const gp = Number(player.gamesPlayed || 0);
  if (advanced && gp >= 60) return "High";
  if (gp >= 35) return "Medium";
  return "Low";
}

function projectSkater(player, advanced, ranks) {
  const type = player.rosterType === "D" ? "D" : "F";
  const prior = POSITION_PRIORS[type];
  const gp = Number(player.gamesPlayed || 0);
  const projectedGames = expectedSkaterGames(player, ranks);
  const consensusFactor = rankMultiplier(ranks);

  const xGoalsTotal = Number(
    advanced?.shootingTalentAdjustedXGoals ?? advanced?.xGoals ?? player.goals ?? 0
  );
  const blendedGoalRate = rate(player.goals, gp) * 0.45 + rate(xGoalsTotal, advanced?.gamesPlayed || gp) * 0.55;
  const goalRate = shrink(blendedGoalRate, gp, prior.goals, 34) * consensusFactor;

  const advancedAssists = Number(advanced?.primaryAssists || 0) + Number(advanced?.secondaryAssists || 0);
  const assistObserved = advancedAssists > 0
    ? rate(player.assists, gp) * 0.7 + rate(advancedAssists, advanced?.gamesPlayed || gp) * 0.3
    : rate(player.assists, gp);
  const assistRate = shrink(assistObserved, gp, prior.assists, 28) * consensusFactor;

  const expectedShots = Number(advanced?.expectedShotsOnGoal ?? advanced?.shotsOnGoal ?? player.shots ?? 0);
  const shotObserved = advanced
    ? rate(player.shots, gp) * 0.55 + rate(expectedShots, advanced.gamesPlayed || gp) * 0.45
    : rate(player.shots, gp);
  const shotRate = shrink(shotObserved, gp, prior.shots, 24) * clamp(consensusFactor, 0.98, 1.04);

  const advancedHits = Number(advanced?.hits ?? player.hits ?? 0);
  const hitObserved = advanced ? rate(player.hits, gp) * 0.65 + rate(advancedHits, advanced.gamesPlayed || gp) * 0.35 : rate(player.hits, gp);
  const hitRate = shrink(hitObserved, gp, prior.hits, 20);

  const goals = Math.max(0, Math.round(goalRate * projectedGames));
  const assists = Math.max(0, Math.round(assistRate * projectedGames));
  const hits = Math.max(0, Math.round(hitRate * projectedGames));
  const shots = Math.max(0, Math.round(shotRate * projectedGames));
  const fantasyPoints = round(
    goals * SCORING.goals +
    assists * SCORING.assists +
    hits * SCORING.hits +
    shots * SCORING.shots,
    1
  );

  return {
    modelVersion: "Champions Projection Model 1.0",
    season: "2026-27",
    gamesPlayed: projectedGames,
    goals,
    assists,
    hits,
    shots,
    fantasyPoints,
    confidence: projectionConfidence(player, advanced),
    consensusRank: averageRank(ranks) == null ? null : round(averageRank(ranks), 1),
    advanced: {
      xGoals: advanced?.xGoals == null ? null : round(advanced.xGoals, 1),
      shootingTalentAdjustedXGoals: advanced?.shootingTalentAdjustedXGoals == null ? null : round(advanced.shootingTalentAdjustedXGoals, 1),
      onIceXGoalsPercentage: advanced?.onIceXGoalsPercentage == null ? null : round(advanced.onIceXGoalsPercentage, 1)
    },
    sources: advanced
      ? ["NHL 2025-26 totals", "MoneyPuck expected-goal inputs", "2026-27 expert consensus ranks"]
      : ["NHL 2025-26 totals", "2026-27 expert consensus ranks"]
  };
}

function projectGoalie(player, advanced, ranks) {
  const gp = Number(player.gamesPlayed || 0);
  const projectedGames = expectedGoalieGames(player, ranks);
  const consensusFactor = rankMultiplier(ranks);

  const actualSavesPerGame = rate(player.saves, gp);
  const advancedSavesPerGame = rate(advanced?.saves, advanced?.gamesPlayed || gp);
  const savesPerGame = shrink(
    advanced ? actualSavesPerGame * 0.65 + advancedSavesPerGame * 0.35 : actualSavesPerGame,
    gp,
    25.5,
    18
  );

  const actualGaPerGame = rate(player.goalsAgainst, gp);
  const expectedGaPerGame = rate(advanced?.expectedGoalsAgainst, advanced?.gamesPlayed || gp);
  let goalsAgainstPerGame = advanced
    ? actualGaPerGame * 0.45 + expectedGaPerGame * 0.55
    : actualGaPerGame;
  goalsAgainstPerGame = shrink(goalsAgainstPerGame, gp, 2.78, 22);
  goalsAgainstPerGame /= clamp(consensusFactor, 0.97, 1.04);

  const winRate = shrink(rate(player.wins, gp), gp, 0.47, 20) * clamp(consensusFactor, 0.94, 1.08);
  const goalsRate = shrink(rate(player.goals, gp), gp, 0.001, 80);
  const assistsRate = shrink(rate(player.assists, gp), gp, 0.035, 60);

  const wins = Math.max(0, Math.round(winRate * projectedGames));
  const saves = Math.max(0, Math.round(savesPerGame * projectedGames));
  const goalsAgainst = Math.max(0, Math.round(goalsAgainstPerGame * projectedGames));
  const goals = Math.max(0, Math.round(goalsRate * projectedGames));
  const assists = Math.max(0, Math.round(assistsRate * projectedGames));
  const fantasyPoints = round(
    saves * GOALIE_SCORING.saves +
    goalsAgainst * GOALIE_SCORING.goalsAgainst +
    wins * GOALIE_SCORING.wins +
    goals * GOALIE_SCORING.goals +
    assists * GOALIE_SCORING.assists,
    1
  );

  return {
    modelVersion: "Champions Projection Model 1.0",
    season: "2026-27",
    gamesPlayed: projectedGames,
    wins,
    saves,
    goalsAgainst,
    goals,
    assists,
    fantasyPoints,
    confidence: projectionConfidence(player, advanced),
    consensusRank: averageRank(ranks) == null ? null : round(averageRank(ranks), 1),
    advanced: {
      expectedGoalsAgainst: advanced?.expectedGoalsAgainst == null ? null : round(advanced.expectedGoalsAgainst, 1),
      goalsSavedAboveExpected: advanced?.goalsSavedAboveExpected == null ? null : round(advanced.goalsSavedAboveExpected, 1),
      savePercentage: advanced?.savePercentage == null ? null : round(advanced.savePercentage, 3)
    },
    sources: advanced
      ? ["NHL 2025-26 goalie totals", "MoneyPuck GSAx/xGA inputs", "2026-27 expert consensus ranks"]
      : ["NHL 2025-26 goalie totals", "2026-27 expert consensus ranks"]
  };
}

export function createPlayerProjection(player, advanced, ranks) {
  return player.rosterType === "G"
    ? projectGoalie(player, advanced, ranks)
    : projectSkater(player, advanced, ranks);
}
