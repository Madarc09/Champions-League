import { GOALIE_SCORING, SCORING } from "@/data/league-config";
import {
  STATIC_PLAYER_PROJECTIONS,
  STATIC_PROJECTION_META
} from "@/data/player-projections-2026-27";
import { canonicalContextName } from "@/data/projection-context";

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function clamp(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.min(maximum, Math.max(minimum, number));
}

function rate(total, games) {
  return Number(games) > 0 ? Number(total || 0) / Number(games) : 0;
}

function fantasyPoints(player, stats) {
  if (player?.rosterType === "G") {
    return round(
      Number(stats.saves || 0) * GOALIE_SCORING.saves
      + Number(stats.goalsAgainst || 0) * GOALIE_SCORING.goalsAgainst
      + Number(stats.wins || 0) * GOALIE_SCORING.wins
      + Number(stats.shutouts || 0) * GOALIE_SCORING.shutouts
      + Number(stats.goals || 0) * GOALIE_SCORING.goals
      + Number(stats.assists || 0) * GOALIE_SCORING.assists,
      1
    );
  }

  return round(
    Number(stats.goals || 0) * SCORING.goals
    + Number(stats.assists || 0) * SCORING.assists
    + Number(stats.hits || 0) * SCORING.hits
    + Number(stats.shots || 0) * SCORING.shots,
    1
  );
}

function scenarioWithFantasy(player, scenario = {}) {
  return {
    ...scenario,
    fantasyPoints: fantasyPoints(player, scenario)
  };
}

function guardedBlend(modelValue, baselineValue, modelWeight, lower, upper) {
  const model = Number(modelValue);
  const baseline = Number(baselineValue);
  if (!Number.isFinite(baseline) || baseline <= 0) return Math.max(0, Math.round(Number.isFinite(model) ? model : 0));
  const blended = (Number.isFinite(model) ? model : baseline) * modelWeight + baseline * (1 - modelWeight);
  return Math.max(0, Math.round(clamp(blended, baseline * lower, baseline * upper)));
}

function ageUpside(player) {
  const birth = player?.birthDate ? new Date(`${String(player.birthDate).slice(0, 10)}T00:00:00Z`) : null;
  if (!birth || Number.isNaN(birth.getTime())) return 1.28;
  const seasonStart = new Date("2026-09-29T00:00:00Z");
  let age = seasonStart.getUTCFullYear() - birth.getUTCFullYear();
  if (
    seasonStart.getUTCMonth() < birth.getUTCMonth()
    || (seasonStart.getUTCMonth() === birth.getUTCMonth() && seasonStart.getUTCDate() < birth.getUTCDate())
  ) age -= 1;
  if (age <= 22) return 1.5;
  if (age <= 25) return 1.38;
  if (age >= 34) return 1.18;
  return 1.28;
}

function scaleScenario(scenario, gameFactor, rateFactor, goalie = false, upside = false) {
  const gamesPlayed = goalie
    ? clamp(Math.round(Number(scenario.gamesPlayed || 0) * gameFactor), 8, 64)
    : clamp(Math.round(Number(scenario.gamesPlayed || 0) * gameFactor), 20, 84);
  const gameRatio = Number(scenario.gamesPlayed || 0) > 0 ? gamesPlayed / Number(scenario.gamesPlayed) : gameFactor;

  if (goalie) {
    return {
      gamesPlayed,
      wins: Math.max(0, Math.round(Number(scenario.wins || 0) * gameRatio * rateFactor)),
      saves: Math.max(0, Math.round(Number(scenario.saves || 0) * gameRatio * rateFactor)),
      goalsAgainst: Math.max(0, Math.round(Number(scenario.goalsAgainst || 0) * gameRatio * (upside ? 0.96 : 1.05))),
      shutouts: Math.max(0, Math.round(Number(scenario.shutouts || 0) * gameRatio * (upside ? 1.18 : 0.78))),
      goals: Math.max(0, Math.round(Number(scenario.goals || 0) * gameRatio)),
      assists: Math.max(0, Math.round(Number(scenario.assists || 0) * gameRatio))
    };
  }

  return {
    gamesPlayed,
    goals: Math.max(0, Math.round(Number(scenario.goals || 0) * gameRatio * rateFactor)),
    assists: Math.max(0, Math.round(Number(scenario.assists || 0) * gameRatio * rateFactor)),
    shots: Math.max(0, Math.round(Number(scenario.shots || 0) * gameRatio * (upside ? 1.05 : 0.95))),
    hits: Math.max(0, Math.round(Number(scenario.hits || 0) * gameRatio * (upside ? 1.04 : 0.96)))
  };
}

function fullBoardSkaterReview(player, fallbackProjection = {}) {
  const actualGames = Number(player.gamesPlayed || 0);
  const gamesPlayed = clamp(Math.round(Number(fallbackProjection.gamesPlayed || actualGames || 58)), 20, 84);
  const established = actualGames >= 20;
  const upsideLimit = ageUpside(player);

  const baseline = established ? {
    goals: rate(player.goals, actualGames) * gamesPlayed,
    assists: rate(player.assists, actualGames) * gamesPlayed,
    shots: rate(player.shots, actualGames) * gamesPlayed,
    hits: rate(player.hits, actualGames) * gamesPlayed
  } : null;

  const balanced = {
    gamesPlayed,
    goals: established
      ? guardedBlend(fallbackProjection.goals, baseline.goals, 0.45, 0.74, upsideLimit)
      : Math.max(0, Math.round(Number(fallbackProjection.goals || 0))),
    assists: established
      ? guardedBlend(fallbackProjection.assists, baseline.assists, 0.45, 0.76, upsideLimit)
      : Math.max(0, Math.round(Number(fallbackProjection.assists || 0))),
    shots: established
      ? guardedBlend(fallbackProjection.shots, baseline.shots, 0.35, 0.82, Math.min(upsideLimit, 1.3))
      : Math.max(0, Math.round(Number(fallbackProjection.shots || 0))),
    hits: established
      ? guardedBlend(fallbackProjection.hits, baseline.hits, 0.3, 0.82, Math.min(upsideLimit, 1.3))
      : Math.max(0, Math.round(Number(fallbackProjection.hits || 0)))
  };

  const floor = scaleScenario(balanced, established ? 0.91 : 0.82, 0.92, false, false);
  const upside = scaleScenario(balanced, established ? 1.05 : 1.12, established ? 1.08 : 1.18, false, true);
  const actualPoints = Number(player.goals || 0) + Number(player.assists || 0);
  const projectedPoints = balanced.goals + balanced.assists;
  const direction = projectedPoints > actualPoints + 8 ? "growth" : projectedPoints < actualPoints - 8 ? "regression" : "stability";

  return {
    floor,
    balanced,
    upside,
    reasons: [
      established
        ? `The full-board review anchors ${player.name} to his 2025–26 per-game production, then blends the three-season NHL, MoneyPuck, usage and environment model inside category guardrails.`
        : `${player.name} has a limited NHL sample, so the static board leans more heavily on role, prospect rank and comparable-player rates while keeping a wider floor-to-upside range.`,
      direction === "growth"
        ? "The balanced line allows a measured increase where projected games, age or role support it; the upside case requires the favourable deployment to hold."
        : direction === "regression"
          ? "The balanced line applies modest regression, but it cannot collapse far below the player's own established scoring rate because one missing feed is never treated as zero."
          : "The balanced line stays close to the player's established level, with most uncertainty placed in games played rather than an arbitrary talent change."
    ]
  };
}

function fullBoardGoalieReview(player, fallbackProjection = {}) {
  const actualGames = Number(player.gamesPlayed || 0);
  const gamesPlayed = clamp(Math.round(Number(fallbackProjection.gamesPlayed || actualGames || 30)), 8, 64);
  const established = actualGames >= 10;

  const baseline = established ? {
    wins: rate(player.wins, actualGames) * gamesPlayed,
    saves: rate(player.saves, actualGames) * gamesPlayed,
    goalsAgainst: rate(player.goalsAgainst, actualGames) * gamesPlayed,
    shutouts: rate(player.shutouts, actualGames) * gamesPlayed
  } : null;

  const balanced = {
    gamesPlayed,
    wins: established ? guardedBlend(fallbackProjection.wins, baseline.wins, 0.45, 0.72, 1.35) : Math.max(0, Math.round(Number(fallbackProjection.wins || 0))),
    saves: established ? guardedBlend(fallbackProjection.saves, baseline.saves, 0.4, 0.8, 1.25) : Math.max(0, Math.round(Number(fallbackProjection.saves || 0))),
    goalsAgainst: established ? guardedBlend(fallbackProjection.goalsAgainst, baseline.goalsAgainst, 0.45, 0.82, 1.2) : Math.max(0, Math.round(Number(fallbackProjection.goalsAgainst || 0))),
    shutouts: established ? guardedBlend(fallbackProjection.shutouts, baseline.shutouts, 0.35, 0.55, 1.55) : Math.max(0, Math.round(Number(fallbackProjection.shutouts || 0))),
    goals: Math.max(0, Math.round(Number(fallbackProjection.goals || 0))),
    assists: Math.max(0, Math.round(Number(fallbackProjection.assists || 0)))
  };

  return {
    floor: scaleScenario(balanced, 0.88, 0.9, true, false),
    balanced,
    upside: scaleScenario(balanced, 1.08, 1.08, true, true),
    reasons: [
      established
        ? `The static goalie review blends ${player.name}'s three-season workload and rates with expected goals, team strength and the likely starter share.`
        : `${player.name} has a small recent NHL sample, so workload confidence is lower and the projection range is intentionally wider.`,
      "Wins, saves, goals against and shutouts are projected separately; shutouts now add five Champions League fantasy points."
    ]
  };
}

function normalizedReview(player, fallbackProjection) {
  return player?.rosterType === "G"
    ? fullBoardGoalieReview(player, fallbackProjection)
    : fullBoardSkaterReview(player, fallbackProjection);
}

export function applyStaticProjection(player, fallbackProjection = {}) {
  const key = canonicalContextName(player?.name);
  const editorial = STATIC_PLAYER_PROJECTIONS[key] || null;
  const review = editorial || normalizedReview(player, fallbackProjection);
  const floor = scenarioWithFantasy(player, review.floor);
  const balanced = scenarioWithFantasy(player, review.balanced);
  const upside = scenarioWithFantasy(player, review.upside);
  const editoriallyReviewed = Boolean(editorial);

  return {
    ...fallbackProjection,
    ...balanced,
    modelVersion: STATIC_PROJECTION_META.model,
    season: STATIC_PROJECTION_META.season,
    confidence: editoriallyReviewed ? "Editorial review" : fallbackProjection?.confidence || "Model review",
    projectionSource: editoriallyReviewed ? "static-editorial" : "static-full-board",
    reviewLevel: editoriallyReviewed ? "editorial" : "model-reviewed",
    reviewed: true,
    fantasyPoints: balanced.fantasyPoints,
    range: { floor, balanced, upside },
    reasons: review.reasons || fallbackProjection?.reasons || [],
    statReasons: editoriallyReviewed ? null : fallbackProjection?.statReasons || null
  };
}

export function staticProjectionSummary(poolSize = null) {
  const editorialOverrides = Object.keys(STATIC_PLAYER_PROJECTIONS).length;
  return {
    ...STATIC_PROJECTION_META,
    coverage: "Full NHL player pool",
    reviewedPlayers: Number.isFinite(Number(poolSize)) ? Number(poolSize) : "Full pool",
    editorialOverrides,
    modelReviewedPlayers: Number.isFinite(Number(poolSize))
      ? Math.max(0, Number(poolSize) - editorialOverrides)
      : "Remaining pool"
  };
}
