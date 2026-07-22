/**
 * Manual context layer for CONFIRMED offseason information that statistical
 * feeds cannot know yet (new coach, announced line, PP promotion, workload).
 *
 * Keep this empty until there is a dated, attributable change. The statistical
 * model already uses the player's most-used MoneyPuck line/pair, NHL ice time,
 * power-play usage and team environment. Manual entries are only for future
 * information that those historical feeds do not contain.
 *
 * Example player entry (do not activate without evidence):
 *
 * "example player": {
 *   asOf: "2026-09-20",
 *   source: "Team media availability",
 *   role: "Promoted to PP1",
 *   notes: ["Coach confirmed the player will open camp on the first unit."],
 *   multipliers: { goals: 1.02, assists: 1.04, shots: 1.02, hits: 1 }
 * }
 *
 * Example team/coach entry:
 *
 * EDM: {
 *   asOf: "2026-09-20",
 *   source: "Team announcement",
 *   offense: 1.02,
 *   shots: 1.01,
 *   goalieWins: 1,
 *   note: "The coach confirmed a faster five-on-five system."
 * }
 *
 * Every multiplier is bounded again inside lib/projections.js. A context note
 * can refine the forecast but cannot overpower three seasons of evidence.
 */
export const PLAYER_CONTEXT = {};

export const TEAM_COACH_CONTEXT = {};

export const MODEL_WEIGHTS = {
  skater: {
    goals: { nhlHistory: 0.4, moneyPuck: 0.3, roleEnvironment: 0.2, consensus: 0.1 },
    assists: { nhlHistory: 0.45, moneyPuck: 0.25, roleEnvironment: 0.2, consensus: 0.1 },
    shots: { nhlHistory: 0.5, moneyPuck: 0.25, roleEnvironment: 0.2, consensus: 0.05 },
    hits: { nhlHistory: 0.65, moneyPuck: 0.1, roleEnvironment: 0.2, consensus: 0.05 }
  },
  goalie: {
    wins: { nhlHistory: 0.5, moneyPuck: 0.2, roleEnvironment: 0.2, consensus: 0.1 },
    saves: { nhlHistory: 0.55, moneyPuck: 0.25, roleEnvironment: 0.15, consensus: 0.05 },
    goalsAgainst: { nhlHistory: 0.45, moneyPuck: 0.35, roleEnvironment: 0.15, consensus: 0.05 }
  }
};

export function canonicalContextName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-zA-Z0-9' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function projectionContextFor(player) {
  return {
    player: PLAYER_CONTEXT[canonicalContextName(player?.name)] || null,
    team: TEAM_COACH_CONTEXT[String(player?.team || "").toUpperCase()] || null
  };
}
