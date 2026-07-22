import { GOALIE_SCORING, SCORING } from "@/data/league-config";
import { MODEL_WEIGHTS } from "@/data/projection-context";

const SEASON_WEIGHTS = [0.55, 0.3, 0.15];
const POSITION_PRIORS = {
  F: { goals: 0.18, assists: 0.28, shots: 1.8, hits: 0.9 },
  D: { goals: 0.07, assists: 0.22, shots: 1.35, hits: 1.05 }
};

function clamp(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.min(maximum, Math.max(minimum, number));
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function rate(total, games) {
  return Number(games) > 0 ? Number(total || 0) / Number(games) : 0;
}

function weightedAverage(records, getter, fallback = 0) {
  let total = 0;
  let usedWeight = 0;
  records.slice(0, 3).forEach((record, index) => {
    const value = Number(getter(record));
    if (!Number.isFinite(value)) return;
    const weight = SEASON_WEIGHTS[index] || 0;
    total += value * weight;
    usedWeight += weight;
  });
  return usedWeight > 0 ? total / usedWeight : fallback;
}

function weightedRate(records, key, fallback = 0) {
  return weightedAverage(records, (record) => rate(record?.[key], record?.gamesPlayed), fallback);
}

function averageRank(ranks) {
  const values = Object.entries(ranks || {})
    .filter(([source, value]) => source !== "champions" && Number.isFinite(Number(value)))
    .map(([, value]) => Number(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function consensusFactor(ranks) {
  const rank = averageRank(ranks);
  if (rank == null) return 1;
  if (rank <= 5) return 1.05;
  if (rank <= 15) return 1.04;
  if (rank <= 30) return 1.03;
  if (rank <= 60) return 1.02;
  if (rank <= 120) return 1.01;
  if (rank <= 200) return 1;
  if (rank <= 300) return 0.99;
  return 0.98;
}

function ageAtSeasonStart(birthDate) {
  if (!birthDate) return null;
  const born = new Date(`${String(birthDate).slice(0, 10)}T00:00:00Z`);
  const seasonStart = new Date("2026-10-01T00:00:00Z");
  if (Number.isNaN(born.getTime())) return null;
  let age = seasonStart.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday =
    seasonStart.getUTCMonth() < born.getUTCMonth() ||
    (seasonStart.getUTCMonth() === born.getUTCMonth() && seasonStart.getUTCDate() < born.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 16 && age <= 50 ? age : null;
}

function ageCurve(player) {
  const age = ageAtSeasonStart(player?.birthDate);
  if (age == null) return { age: null, goals: 1, assists: 1, shots: 1, hits: 1 };
  if (age <= 21) return { age, goals: 1.04, assists: 1.045, shots: 1.035, hits: 1.015 };
  if (age <= 24) return { age, goals: 1.025, assists: 1.03, shots: 1.02, hits: 1.01 };
  if (age <= 29) return { age, goals: 1, assists: 1, shots: 1, hits: 1 };
  if (age <= 32) return { age, goals: 0.99, assists: 0.995, shots: 0.99, hits: 1 };
  if (age <= 35) return { age, goals: 0.97, assists: 0.98, shots: 0.975, hits: 0.995 };
  return { age, goals: 0.945, assists: 0.96, shots: 0.955, hits: 0.985 };
}

function fallbackHistory(player) {
  return [{
    seasonId: 20252026,
    gamesPlayed: Number(player.gamesPlayed || 0),
    goals: Number(player.goals || 0),
    assists: Number(player.assists || 0),
    shots: Number(player.shots || 0),
    hits: Number(player.hits || 0),
    wins: Number(player.wins || 0),
    saves: Number(player.saves || 0),
    goalsAgainst: Number(player.goalsAgainst || 0),
    shutouts: Number(player.shutouts || 0)
  }];
}

function expectedSkaterGames(player, history, ranks, context) {
  const games = history.filter((row) => Number(row.gamesPlayed || 0) > 0);
  if (!games.length) {
    const consensus = averageRank(ranks);
    const rookieBase = consensus != null && consensus <= 100 ? 66 : player.draftYear >= 2025 ? 52 : 40;
    return clamp(Math.round(context?.player?.games || rookieBase), 20, 84);
  }

  const weighted = weightedAverage(games, (row) => row.gamesPlayed, Number(player.gamesPlayed || 70));
  const healthySeasonShare = games.filter((row) => Number(row.gamesPlayed || 0) >= 75).length / games.length;
  const durabilityNudge = healthySeasonShare >= 2 / 3 ? 1.5 : healthySeasonShare === 0 ? -2 : 0;
  const rankNudge = averageRank(ranks) != null && averageRank(ranks) <= 75 ? 1 : 0;
  const manual = Number(context?.player?.games);
  const estimate = Number.isFinite(manual) ? manual : weighted + durabilityNudge + rankNudge;
  return clamp(Math.round(estimate), 45, 84);
}

function expectedGoalieGames(player, history, ranks, context) {
  const games = history.filter((row) => Number(row.gamesPlayed || 0) > 0);
  const rank = averageRank(ranks);
  if (!games.length) {
    const rookieBase = rank != null && rank <= 100 ? 38 : 18;
    return clamp(Math.round(context?.player?.games || rookieBase), 8, 62);
  }

  const weighted = weightedAverage(games, (row) => row.gamesPlayed, Number(player.gamesPlayed || 32));
  const roleTarget = rank == null ? weighted : rank <= 40 ? 55 : rank <= 100 ? 46 : rank <= 200 ? 36 : 27;
  const manual = Number(context?.player?.games);
  const estimate = Number.isFinite(manual) ? manual : weighted * 0.72 + roleTarget * 0.28;
  return clamp(Math.round(estimate), 10, 62);
}

function weightedModel(candidates, weights) {
  let total = 0;
  let used = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const value = Number(candidates[key]);
    if (!Number.isFinite(value)) continue;
    total += value * weight;
    used += weight;
  }
  return used > 0 ? total / used : 0;
}

function roleEnvironment(player, nhlHistory, advancedBundle, context) {
  const latest = nhlHistory[0] || {};
  const previous = nhlHistory[1] || {};
  const line = advancedBundle?.line || null;
  const team = advancedBundle?.team || null;

  const latestToi = Number(latest.timeOnIcePerGameSeconds || 0);
  const previousToi = Number(previous.timeOnIcePerGameSeconds || 0);
  const toiRatio = latestToi > 0 && previousToi > 0 ? clamp(latestToi / previousToi, 0.95, 1.05) : 1;

  const latestPp = Number(latest.powerPlayTimeOnIcePerGameSeconds || 0);
  const previousPp = Number(previous.powerPlayTimeOnIcePerGameSeconds || 0);
  const ppRatio = latestPp > 0 && previousPp > 0 ? clamp(latestPp / previousPp, 0.94, 1.06) : 1;

  const lineOffense = Number(line?.xGoalsForPer60);
  const lineFactor = Number.isFinite(lineOffense) ? clamp(1 + (lineOffense - 2.7) * 0.025, 0.95, 1.05) : 1;
  const teamOffense = Number(team?.xGoalsForPer60);
  const teamFactor = Number.isFinite(teamOffense) ? clamp(1 + (teamOffense - 2.7) * 0.035, 0.94, 1.06) : 1;
  const teamShots = Number(team?.goalsForPer60);
  const shotEnvironment = Number.isFinite(teamShots) ? clamp(1 + (teamShots - 2.7) * 0.018, 0.96, 1.04) : teamFactor;

  const coach = context?.team || {};
  const playerContext = context?.player || {};
  const manual = playerContext.multipliers || {};
  const age = ageCurve(player);

  return {
    goals: clamp(toiRatio * Math.sqrt(ppRatio) * lineFactor * teamFactor * age.goals * Number(manual.goals || 1) * Number(coach.offense || 1), 0.88, 1.14),
    assists: clamp(toiRatio * ppRatio * lineFactor * teamFactor * age.assists * Number(manual.assists || 1) * Number(coach.offense || 1), 0.88, 1.14),
    shots: clamp(toiRatio * shotEnvironment * age.shots * Number(manual.shots || 1) * Number(coach.shots || 1), 0.9, 1.12),
    hits: clamp(toiRatio * age.hits * Number(manual.hits || 1) * Number(coach.hits || 1), 0.9, 1.12),
    line,
    team,
    role: playerContext.role || null,
    age: age.age,
    ageFactors: age,
    notes: [...(playerContext.notes || []), ...(coach.note ? [coach.note] : [])]
  };
}

function advancedRate(history, key, fallback) {
  return weightedAverage(history || [], (row) => rate(row?.[key], row?.gamesPlayed), fallback);
}

function safeStatProjection(raw, baseline, player) {
  if (Number(player.gamesPlayed || 0) < 25) return Math.max(0, Math.round(raw));
  return Math.max(0, Math.round(clamp(raw, baseline * 0.84, baseline * 1.24)));
}

function signedNumber(value, digits = 0) {
  const number = round(value, digits);
  if (number === 0) return "±0";
  return `${number > 0 ? "+" : ""}${number}`;
}

function categoryReason(label, actual, model, advancedLabel) {
  const candidates = model?.candidates || {};
  const final = Number(model?.final || 0);
  const previous = Number(actual || 0);
  const direction = final > previous ? "increase" : final < previous ? "decrease" : "hold";
  return `${label} ${previous} → ${final} (${signedNumber(final - previous)}): ${direction} reflects a three-season baseline of ${round(candidates.nhlHistory, 1)}, ${advancedLabel} at ${round(candidates.moneyPuck, 1)}, and role/line/team context at ${round(candidates.roleEnvironment, 1)}.`;
}

function skaterCategoryReasons(player, models) {
  return {
    goals: categoryReason("Goals", player.goals, models.goals, "the expected-goal model"),
    assists: categoryReason("Assists", player.assists, models.assists, "the primary/secondary-assist model"),
    shots: categoryReason("Shots", player.shots, models.shots, "the expected-shot model"),
    hits: categoryReason("Hits", player.hits, models.hits, "the advanced/historical hit model")
  };
}

function goalieCategoryReason(label, actual, candidates, final, advancedLabel) {
  const previous = Number(actual || 0);
  return `${label} ${previous} → ${final} (${signedNumber(final - previous)}): three-season workload/results project ${round(candidates.nhlHistory, 1)}, ${advancedLabel} projects ${round(candidates.moneyPuck, 1)}, and team/coach context projects ${round(candidates.roleEnvironment, 1)}.`;
}

function skaterReasons(player, projection, environment, advancedBundle, nhlHistory, ranks) {
  const reasons = [];
  const gpDelta = projection.gamesPlayed - Number(player.gamesPlayed || 0);
  if (Math.abs(gpDelta) >= 3) {
    reasons.push(`${Math.abs(gpDelta)} ${gpDelta > 0 ? "more" : "fewer"} games are forecast from a 55/30/15 weighting of the last three NHL seasons.`);
  } else {
    reasons.push("Games played stay close to last season because the three-year durability record is stable.");
  }

  const latestAdvanced = advancedBundle?.latest;
  if (latestAdvanced?.shootingTalentAdjustedXGoals != null || latestAdvanced?.xGoals != null) {
    const expected = round(latestAdvanced.shootingTalentAdjustedXGoals ?? latestAdvanced.xGoals, 1);
    const actual = Number(player.goals || 0);
    reasons.push(`MoneyPuck's latest expected-goal input was ${expected} versus ${actual} actual goals, so finishing is adjusted without dragging the player toward a league-average forward.`);
  } else {
    reasons.push("No expected-goal record was available, so the model leans more heavily on the player's own three-season scoring rate.");
  }

  if (environment.role) reasons.push(`${environment.role}: ${environment.notes[0] || "The role layer keeps top-line and power-play usage in the forecast."}`);
  else if (environment.line?.players?.length) {
    reasons.push(`Role context uses the most-played 2025–26 unit (${environment.line.players.join(" / ")}) plus the team's five-on-five offensive environment.`);
  } else {
    reasons.push("Role context uses recent ice time, power-play usage and the team's five-on-five offensive environment.");
  }

  if (environment.age != null) reasons.push(`Age ${environment.age} is handled with a small position-neutral age-curve adjustment; it cannot overpower the player's own three-season record.`);

  const rank = averageRank(ranks);
  if (rank != null) reasons.push(`Public fantasy ranks average ${round(rank, 1)} and are used only as a 5–10% guardrail, not as a blanket scoring boost.`);
  return reasons.slice(0, 4);
}

function goalieReasons(player, projection, advancedBundle, environment, ranks) {
  const reasons = [];
  const gpDelta = projection.gamesPlayed - Number(player.gamesPlayed || 0);
  reasons.push(`${projection.gamesPlayed} games are projected from three-year workload, current standing in public rankings and the likely starter/share role.`);

  const latest = advancedBundle?.latest;
  if (latest?.goalsSavedAboveExpected != null) {
    reasons.push(`MoneyPuck's latest ${round(latest.goalsSavedAboveExpected, 1)} GSAx and ${round(latest.expectedGoalsAgainst, 1)} xGA inform save and goals-against rates.`);
  } else {
    reasons.push("The advanced goalie feed was unavailable, so saves and goals against lean on the goalie's own three-year rates.");
  }

  if (environment?.team?.xGoalsAgainstPer60 != null) {
    reasons.push(`The team/coach environment proxy uses a ${round(environment.team.xGoalsAgainstPer60, 2)} five-on-five xGA/60 defensive rate.`);
  }
  const rank = averageRank(ranks);
  if (rank != null) reasons.push(`Consensus rank ${round(rank, 1)} is a bounded workload and sanity-check input rather than a direct stat multiplier.`);
  if (Math.abs(gpDelta) >= 4) reasons.unshift(`${Math.abs(gpDelta)} ${gpDelta > 0 ? "more" : "fewer"} appearances than last season materially changes the counting-stat ceiling.`);
  return reasons.slice(0, 4);
}

function projectSkater(player, nhlHistoryInput, advancedBundle, ranks, context) {
  const nhlHistory = nhlHistoryInput?.length ? nhlHistoryInput : fallbackHistory(player);
  const type = player.rosterType === "D" ? "D" : "F";
  const prior = POSITION_PRIORS[type];
  const projectedGames = expectedSkaterGames(player, nhlHistory, ranks, context);
  const environment = roleEnvironment(player, nhlHistory, advancedBundle, context);
  const consensus = consensusFactor(ranks);
  const advancedHistory = advancedBundle?.history || [];

  const models = {};
  for (const stat of ["goals", "assists", "shots", "hits"]) {
    const ownRate = weightedRate(nhlHistory, stat, prior[stat]);
    const nhlCandidate = ownRate * projectedGames;

    let mpRate = ownRate;
    if (stat === "goals") {
      const xgRate = advancedRate(advancedHistory, "shootingTalentAdjustedXGoals", NaN);
      const plainXgRate = advancedRate(advancedHistory, "xGoals", NaN);
      mpRate = Number.isFinite(xgRate) ? xgRate : Number.isFinite(plainXgRate) ? plainXgRate : ownRate;
    } else if (stat === "assists") {
      const primary = advancedRate(advancedHistory, "primaryAssists", NaN);
      const secondary = advancedRate(advancedHistory, "secondaryAssists", NaN);
      mpRate = Number.isFinite(primary) || Number.isFinite(secondary)
        ? (Number.isFinite(primary) ? primary : 0) + (Number.isFinite(secondary) ? secondary : 0)
        : ownRate;
    } else if (stat === "shots") {
      const expectedShots = advancedRate(advancedHistory, "expectedShotsOnGoal", NaN);
      const actualShots = advancedRate(advancedHistory, "shotsOnGoal", NaN);
      mpRate = Number.isFinite(expectedShots) ? expectedShots : Number.isFinite(actualShots) ? actualShots : ownRate;
    } else if (stat === "hits") {
      const advancedHits = advancedRate(advancedHistory, "hits", NaN);
      mpRate = Number.isFinite(advancedHits) ? advancedHits : ownRate;
    }

    const candidates = {
      nhlHistory: nhlCandidate,
      moneyPuck: mpRate * projectedGames,
      roleEnvironment: nhlCandidate * environment[stat],
      consensus: nhlCandidate * consensus
    };
    const raw = weightedModel(candidates, MODEL_WEIGHTS.skater[stat]);
    models[stat] = {
      candidates: Object.fromEntries(Object.entries(candidates).map(([key, value]) => [key, round(value, 1)])),
      final: safeStatProjection(raw, nhlCandidate, player)
    };
  }

  const goals = models.goals.final;
  const assists = models.assists.final;
  const shots = models.shots.final;
  const hits = models.hits.final;
  const fantasyPoints = round(
    goals * SCORING.goals +
    assists * SCORING.assists +
    hits * SCORING.hits +
    shots * SCORING.shots,
    1
  );

  const projection = {
    modelVersion: "Champions Projection Model 2.0",
    season: "2026-27",
    gamesPlayed: projectedGames,
    goals,
    assists,
    hits,
    shots,
    fantasyPoints,
    confidence: nhlHistory.length >= 3 && advancedHistory.length >= 2 ? "High" : nhlHistory.length >= 2 ? "Medium" : "Low",
    consensusRank: averageRank(ranks) == null ? null : round(averageRank(ranks), 1),
    modelBreakdown: models,
    context: {
      role: environment.role,
      ageAtSeasonStart: environment.age,
      mostUsedLine: environment.line?.players || null,
      lineXGoalsForPer60: environment.line?.xGoalsForPer60 == null ? null : round(environment.line.xGoalsForPer60, 2),
      teamXGoalsForPer60: environment.team?.xGoalsForPer60 == null ? null : round(environment.team.xGoalsForPer60, 2),
      notes: environment.notes
    },
    advanced: {
      xGoals: advancedBundle?.latest?.xGoals == null ? null : round(advancedBundle.latest.xGoals, 1),
      shootingTalentAdjustedXGoals: advancedBundle?.latest?.shootingTalentAdjustedXGoals == null ? null : round(advancedBundle.latest.shootingTalentAdjustedXGoals, 1),
      onIceXGoalsPercentage: advancedBundle?.latest?.onIceXGoalsPercentage == null ? null : round(advancedBundle.latest.onIceXGoalsPercentage, 1)
    },
    statReasons: skaterCategoryReasons(player, models),
    sources: [
      "NHL three-season production, usage and age curve",
      "MoneyPuck three-season expected and line/team data",
      "Role, linemate and team/coach environment layer",
      "Public fantasy-rank sanity check"
    ]
  };
  projection.reasons = skaterReasons(player, projection, environment, advancedBundle, nhlHistory, ranks);
  return projection;
}

function goalieTeamFactors(advancedBundle, context) {
  const team = advancedBundle?.team || null;
  const xgf = Number(team?.xGoalsForPer60);
  const xga = Number(team?.xGoalsAgainstPer60);
  const strength = Number.isFinite(xgf) && Number.isFinite(xga) && xgf + xga > 0 ? xgf / (xgf + xga) : 0.5;
  const coach = context?.team || {};
  return {
    win: clamp(1 + (strength - 0.5) * 1.2, 0.88, 1.12) * Number(coach.goalieWins || 1),
    saves: clamp(1 + ((Number.isFinite(xga) ? xga : 2.7) - 2.7) * 0.04, 0.92, 1.08),
    goalsAgainst: clamp(1 + ((Number.isFinite(xga) ? xga : 2.7) - 2.7) * 0.06, 0.9, 1.1),
    team
  };
}

function projectGoalie(player, nhlHistoryInput, advancedBundle, ranks, context) {
  const nhlHistory = nhlHistoryInput?.length ? nhlHistoryInput : fallbackHistory(player);
  const projectedGames = expectedGoalieGames(player, nhlHistory, ranks, context);
  const consensus = consensusFactor(ranks);
  const environment = goalieTeamFactors(advancedBundle, context);
  const advancedHistory = advancedBundle?.history || [];

  const nhlWinRate = weightedRate(nhlHistory, "wins", 0.42);
  const nhlSaveRate = weightedRate(nhlHistory, "saves", 24.5);
  const nhlGaRate = weightedRate(nhlHistory, "goalsAgainst", 2.8);

  const mpSaveRate = advancedRate(advancedHistory, "saves", nhlSaveRate);
  const mpXgaRate = advancedRate(advancedHistory, "expectedGoalsAgainst", nhlGaRate);
  const gsaxPerGame = advancedRate(advancedHistory, "goalsSavedAboveExpected", 0);
  const mpGaRate = Math.max(1.4, mpXgaRate - gsaxPerGame);

  const winCandidates = {
    nhlHistory: nhlWinRate * projectedGames,
    moneyPuck: nhlWinRate * projectedGames,
    roleEnvironment: nhlWinRate * projectedGames * environment.win,
    consensus: nhlWinRate * projectedGames * consensus
  };
  const saveCandidates = {
    nhlHistory: nhlSaveRate * projectedGames,
    moneyPuck: mpSaveRate * projectedGames,
    roleEnvironment: nhlSaveRate * projectedGames * environment.saves,
    consensus: nhlSaveRate * projectedGames * consensus
  };
  const gaCandidates = {
    nhlHistory: nhlGaRate * projectedGames,
    moneyPuck: mpGaRate * projectedGames,
    roleEnvironment: nhlGaRate * projectedGames * environment.goalsAgainst,
    consensus: nhlGaRate * projectedGames / consensus
  };

  const wins = Math.max(0, Math.round(weightedModel(winCandidates, MODEL_WEIGHTS.goalie.wins)));
  const saves = Math.max(0, Math.round(weightedModel(saveCandidates, MODEL_WEIGHTS.goalie.saves)));
  const goalsAgainst = Math.max(0, Math.round(weightedModel(gaCandidates, MODEL_WEIGHTS.goalie.goalsAgainst)));
  const goals = Math.max(0, Math.round(weightedRate(nhlHistory, "goals", 0) * projectedGames));
  const assists = Math.max(0, Math.round(weightedRate(nhlHistory, "assists", 0.03) * projectedGames));
  const fantasyPoints = round(
    saves * GOALIE_SCORING.saves +
    goalsAgainst * GOALIE_SCORING.goalsAgainst +
    wins * GOALIE_SCORING.wins +
    goals * GOALIE_SCORING.goals +
    assists * GOALIE_SCORING.assists,
    1
  );

  const projection = {
    modelVersion: "Champions Projection Model 2.0",
    season: "2026-27",
    gamesPlayed: projectedGames,
    wins,
    saves,
    goalsAgainst,
    goals,
    assists,
    fantasyPoints,
    confidence: nhlHistory.length >= 3 && advancedHistory.length >= 2 ? "High" : nhlHistory.length >= 2 ? "Medium" : "Low",
    consensusRank: averageRank(ranks) == null ? null : round(averageRank(ranks), 1),
    modelBreakdown: {
      wins: { candidates: Object.fromEntries(Object.entries(winCandidates).map(([key, value]) => [key, round(value, 1)])), final: wins },
      saves: { candidates: Object.fromEntries(Object.entries(saveCandidates).map(([key, value]) => [key, round(value, 1)])), final: saves },
      goalsAgainst: { candidates: Object.fromEntries(Object.entries(gaCandidates).map(([key, value]) => [key, round(value, 1)])), final: goalsAgainst }
    },
    context: {
      teamXGoalsAgainstPer60: environment.team?.xGoalsAgainstPer60 == null ? null : round(environment.team.xGoalsAgainstPer60, 2),
      teamXGoalsForPer60: environment.team?.xGoalsForPer60 == null ? null : round(environment.team.xGoalsForPer60, 2)
    },
    advanced: {
      expectedGoalsAgainst: advancedBundle?.latest?.expectedGoalsAgainst == null ? null : round(advancedBundle.latest.expectedGoalsAgainst, 1),
      goalsSavedAboveExpected: advancedBundle?.latest?.goalsSavedAboveExpected == null ? null : round(advancedBundle.latest.goalsSavedAboveExpected, 1),
      savePercentage: advancedBundle?.latest?.savePercentage == null ? null : round(advancedBundle.latest.savePercentage, 3)
    },
    statReasons: {
      wins: goalieCategoryReason("Wins", player.wins, winCandidates, wins, "the advanced goalie model"),
      saves: goalieCategoryReason("Saves", player.saves, saveCandidates, saves, "the shot-volume model"),
      goalsAgainst: goalieCategoryReason("Goals against", player.goalsAgainst, gaCandidates, goalsAgainst, "the xGA/GSAx model")
    },
    sources: [
      "NHL three-season goalie workload and results",
      "MoneyPuck three-season xGA/GSAx data",
      "Team/coach defensive and win environment",
      "Public fantasy-rank sanity check"
    ]
  };
  projection.reasons = goalieReasons(player, projection, advancedBundle, environment, ranks);
  return projection;
}

export function createPlayerProjection(player, nhlHistory, advancedBundle, ranks, context = {}) {
  return player.rosterType === "G"
    ? projectGoalie(player, nhlHistory, advancedBundle, ranks, context)
    : projectSkater(player, nhlHistory, advancedBundle, ranks, context);
}
