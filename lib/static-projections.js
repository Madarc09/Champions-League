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

function fantasyPoints(player, stats) {
  if (player?.rosterType === "G") {
    return round(
      Number(stats.saves || 0) * GOALIE_SCORING.saves
      + Number(stats.goalsAgainst || 0) * GOALIE_SCORING.goalsAgainst
      + Number(stats.wins || 0) * GOALIE_SCORING.wins
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

export function applyStaticProjection(player, fallbackProjection) {
  const key = canonicalContextName(player?.name);
  const reviewed = STATIC_PLAYER_PROJECTIONS[key];

  if (!reviewed) {
    return {
      ...fallbackProjection,
      projectionSource: "model-fallback",
      reviewed: false,
      range: null
    };
  }

  const floor = scenarioWithFantasy(player, reviewed.floor);
  const balanced = scenarioWithFantasy(player, reviewed.balanced);
  const upside = scenarioWithFantasy(player, reviewed.upside);

  return {
    ...fallbackProjection,
    ...balanced,
    modelVersion: STATIC_PROJECTION_META.model,
    season: STATIC_PROJECTION_META.season,
    confidence: "Reviewed",
    projectionSource: "static-reviewed",
    reviewed: true,
    fantasyPoints: balanced.fantasyPoints,
    range: { floor, balanced, upside },
    reasons: reviewed.reasons || fallbackProjection?.reasons || [],
    statReasons: null
  };
}

export function staticProjectionSummary() {
  return {
    ...STATIC_PROJECTION_META,
    reviewedPlayers: Object.keys(STATIC_PLAYER_PROJECTIONS).length
  };
}
