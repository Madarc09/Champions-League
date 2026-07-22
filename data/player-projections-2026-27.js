/**
 * Champions League 2026-27 static projection board.
 *
 * This is the authoritative manual layer used by the draft room.  A record in
 * this file always wins over the live formula.  The live model remains only as
 * a fallback for players who have not been reviewed yet.
 *
 * Each reviewed player has three scenarios:
 *   floor    = cautious outcome
 *   balanced = number displayed by default
 *   upside   = healthy/favourable deployment outcome
 *
 * Update this file rather than changing numbers inside a React component.
 */
export const STATIC_PROJECTION_META = {
  model: "Champions Static Projection Board 1.0",
  season: "2026-27",
  updatedAt: "2026-07-22",
  reviewedPlayers: 25,
  method: "Three-scenario manual review with a balanced projection used by the website."
};

export const STATIC_PLAYER_PROJECTIONS = {
  "connor mcdavid": {
    floor: { gamesPlayed: 80, goals: 44, assists: 82, shots: 294, hits: 36 },
    balanced: { gamesPlayed: 82, goals: 49, assists: 92, shots: 315, hits: 39 },
    upside: { gamesPlayed: 84, goals: 55, assists: 101, shots: 337, hits: 43 },
    reasons: [
      "Elite three-year playmaking and PP1 usage support another season near 90 assists.",
      "The balanced goal forecast stays near his established scoring level instead of regressing him toward an average forward."
    ]
  },
  "nathan mackinnon": {
    floor: { gamesPlayed: 76, goals: 45, assists: 68, shots: 324, hits: 57 },
    balanced: { gamesPlayed: 80, goals: 51, assists: 77, shots: 356, hits: 63 },
    upside: { gamesPlayed: 83, goals: 57, assists: 84, shots: 383, hits: 69 },
    reasons: [
      "League-leading shot volume keeps the goal projection in the low 50s even with modest shooting regression.",
      "Colorado's top-line and PP1 environment preserves his elite assist ceiling."
    ]
  },
  "nikita kucherov": {
    floor: { gamesPlayed: 72, goals: 37, assists: 75, shots: 218, hits: 31 },
    balanced: { gamesPlayed: 77, goals: 43, assists: 85, shots: 240, hits: 35 },
    upside: { gamesPlayed: 81, goals: 48, assists: 93, shots: 260, hits: 39 },
    reasons: [
      "Tampa Bay's offence continues to run through him at even strength and on PP1.",
      "A slightly conservative games estimate limits the balanced total without cutting his per-game talent."
    ]
  },
  "macklin celebrini": {
    floor: { gamesPlayed: 78, goals: 39, assists: 62, shots: 275, hits: 49 },
    balanced: { gamesPlayed: 82, goals: 47, assists: 74, shots: 305, hits: 55 },
    upside: { gamesPlayed: 84, goals: 53, assists: 82, shots: 328, hits: 60 },
    reasons: [
      "A young-star development curve and expanding offensive role lift each scoring category.",
      "The balanced case still stays below the full breakout ceiling shown in the upside scenario."
    ]
  },
  "leon draisaitl": {
    floor: { gamesPlayed: 68, goals: 40, assists: 63, shots: 218, hits: 37 },
    balanced: { gamesPlayed: 77, goals: 48, assists: 74, shots: 252, hits: 42 },
    upside: { gamesPlayed: 82, goals: 55, assists: 82, shots: 275, hits: 46 },
    reasons: [
      "His proven finishing and power-play role justify a high-40s goal midpoint.",
      "The largest uncertainty is games played, so the three scenarios spread workload more than talent."
    ]
  },
  "david pastrnak": {
    floor: { gamesPlayed: 73, goals: 32, assists: 59, shots: 260, hits: 79 },
    balanced: { gamesPlayed: 79, goals: 39, assists: 66, shots: 286, hits: 86 },
    upside: { gamesPlayed: 83, goals: 46, assists: 73, shots: 310, hits: 92 },
    reasons: [
      "High-volume shooting and a central PP1 role support a rebound in goals.",
      "Boston's surrounding offence keeps the assist forecast below the most aggressive upside outcome."
    ]
  },
  "kirill kaprizov": {
    floor: { gamesPlayed: 70, goals: 36, assists: 39, shots: 242, hits: 46 },
    balanced: { gamesPlayed: 77, goals: 43, assists: 48, shots: 273, hits: 52 },
    upside: { gamesPlayed: 82, goals: 50, assists: 55, shots: 296, hits: 58 },
    reasons: [
      "His individual scoring rate remains elite when healthy.",
      "Durability is the main reason the balanced projection does not use the full upside total."
    ]
  },
  "cale makar": {
    floor: { gamesPlayed: 72, goals: 17, assists: 53, shots: 190, hits: 32 },
    balanced: { gamesPlayed: 78, goals: 21, assists: 62, shots: 210, hits: 36 },
    upside: { gamesPlayed: 82, goals: 25, assists: 70, shots: 230, hits: 40 },
    reasons: [
      "Elite PP1 deployment and transition offence keep him at the top of the defence tier.",
      "The balanced projection uses a normal health allowance rather than assuming every game."
    ]
  },
  "jason robertson": {
    floor: { gamesPlayed: 78, goals: 38, assists: 48, shots: 278, hits: 45 },
    balanced: { gamesPlayed: 82, goals: 44, assists: 56, shots: 302, hits: 49 },
    upside: { gamesPlayed: 84, goals: 50, assists: 62, shots: 322, hits: 53 },
    reasons: [
      "Stable top-line and PP1 deployment supports another high-volume scoring season.",
      "The midpoint assumes a normal shooting result rather than either a cold or career-best finish."
    ]
  },
  "matt boldy": {
    floor: { gamesPlayed: 72, goals: 35, assists: 40, shots: 237, hits: 55 },
    balanced: { gamesPlayed: 78, goals: 41, assists: 48, shots: 266, hits: 61 },
    upside: { gamesPlayed: 82, goals: 47, assists: 54, shots: 287, hits: 66 },
    reasons: [
      "A mature shooting profile and large offensive role keep the goal estimate above 40.",
      "The upside case assumes stronger health and sustained first-unit usage."
    ]
  },
  "zach werenski": {
    floor: { gamesPlayed: 70, goals: 18, assists: 52, shots: 235, hits: 27 },
    balanced: { gamesPlayed: 77, goals: 22, assists: 60, shots: 263, hits: 30 },
    upside: { gamesPlayed: 82, goals: 26, assists: 67, shots: 284, hits: 33 },
    reasons: [
      "Heavy minutes, PP1 responsibility and shot generation drive the projection.",
      "The balanced line assumes his role remains unchanged but includes a modest missed-game allowance."
    ]
  },
  "quinn hughes": {
    floor: { gamesPlayed: 70, goals: 6, assists: 62, shots: 173, hits: 6 },
    balanced: { gamesPlayed: 76, goals: 9, assists: 72, shots: 198, hits: 7 },
    upside: { gamesPlayed: 81, goals: 12, assists: 80, shots: 215, hits: 8 },
    reasons: [
      "Assists remain the foundation because of elite puck possession and first-unit power-play usage.",
      "Goals are kept conservative because his fantasy value comes more from creation than finishing."
    ]
  },
  "andrei vasilevskiy": {
    floor: { gamesPlayed: 50, wins: 31, saves: 1175, goalsAgainst: 125, shutouts: 2, goals: 0, assists: 0 },
    balanced: { gamesPlayed: 55, wins: 36, saves: 1300, goalsAgainst: 130, shutouts: 3, goals: 0, assists: 0 },
    upside: { gamesPlayed: 59, wins: 41, saves: 1400, goalsAgainst: 132, shutouts: 5, goals: 0, assists: 0 },
    reasons: [
      "Tampa Bay team strength and a clear starter role support a mid-30s win projection.",
      "The workload is held below a maximum-use season to account for modern goalie management."
    ]
  },
  "martin necas": {
    floor: { gamesPlayed: 74, goals: 32, assists: 55, shots: 201, hits: 77 },
    balanced: { gamesPlayed: 80, goals: 38, assists: 64, shots: 220, hits: 85 },
    upside: { gamesPlayed: 84, goals: 43, assists: 70, shots: 235, hits: 91 },
    reasons: [
      "A strong offensive role and pace-driven environment support growth in both goals and assists.",
      "The balanced case assumes role stability rather than a further promotion."
    ]
  },
  "nick suzuki": {
    floor: { gamesPlayed: 78, goals: 25, assists: 63, shots: 175, hits: 57 },
    balanced: { gamesPlayed: 82, goals: 30, assists: 72, shots: 190, hits: 62 },
    upside: { gamesPlayed: 84, goals: 35, assists: 79, shots: 204, hits: 67 },
    reasons: [
      "Durability, first-line minutes and PP1 usage make his assist floor unusually stable.",
      "The upside case depends on Montreal's young finishers converting more of his chances."
    ]
  },
  "wyatt johnston": {
    floor: { gamesPlayed: 78, goals: 37, assists: 38, shots: 195, hits: 52 },
    balanced: { gamesPlayed: 82, goals: 43, assists: 45, shots: 214, hits: 57 },
    upside: { gamesPlayed: 84, goals: 49, assists: 51, shots: 230, hits: 62 },
    reasons: [
      "A young-player growth curve and premium scoring role support another strong goal season.",
      "The balanced case trims the highest shooting outcome while retaining his expanded opportunity."
    ]
  },
  "auston matthews": {
    floor: { gamesPlayed: 65, goals: 35, assists: 34, shots: 260, hits: 46 },
    balanced: { gamesPlayed: 74, goals: 44, assists: 43, shots: 305, hits: 52 },
    upside: { gamesPlayed: 81, goals: 54, assists: 50, shots: 345, hits: 58 },
    reasons: [
      "The scoring rate remains elite; the projection spread is driven mainly by health and games played.",
      "The balanced case restores normal shot volume without assuming a peak 60-goal season."
    ]
  },
  "jack hughes": {
    floor: { gamesPlayed: 64, goals: 31, assists: 54, shots: 245, hits: 4 },
    balanced: { gamesPlayed: 73, goals: 39, assists: 65, shots: 290, hits: 5 },
    upside: { gamesPlayed: 80, goals: 47, assists: 75, shots: 325, hits: 6 },
    reasons: [
      "Per-game offence and PP1 creation support elite totals whenever he is available.",
      "A cautious durability assumption separates the balanced line from the upside ceiling."
    ]
  },
  "cole caufield": {
    floor: { gamesPlayed: 77, goals: 39, assists: 34, shots: 245, hits: 47 },
    balanced: { gamesPlayed: 81, goals: 46, assists: 42, shots: 271, hits: 51 },
    upside: { gamesPlayed: 84, goals: 53, assists: 48, shots: 290, hits: 55 },
    reasons: [
      "Shot volume and a permanent PP1 shooting role sustain a high goal projection.",
      "The balanced case applies modest regression from a peak finishing season."
    ]
  },
  "brady tkachuk": {
    floor: { gamesPlayed: 65, goals: 25, assists: 39, shots: 240, hits: 175 },
    balanced: { gamesPlayed: 75, goals: 31, assists: 48, shots: 285, hits: 210 },
    upside: { gamesPlayed: 82, goals: 37, assists: 56, shots: 320, hits: 238 },
    reasons: [
      "His rare combination of shots and hits creates a strong fantasy floor even before scoring.",
      "The range is mostly workload-driven following a shortened season."
    ]
  },
  "evan bouchard": {
    floor: { gamesPlayed: 78, goals: 16, assists: 62, shots: 205, hits: 27 },
    balanced: { gamesPlayed: 82, goals: 20, assists: 70, shots: 225, hits: 30 },
    upside: { gamesPlayed: 84, goals: 24, assists: 78, shots: 245, hits: 33 },
    reasons: [
      "Edmonton PP1 usage keeps the assist projection near the top of the defence pool.",
      "Goals are centred near his multi-year level rather than a single-season spike."
    ]
  },
  "jack eichel": {
    floor: { gamesPlayed: 70, goals: 27, assists: 56, shots: 245, hits: 33 },
    balanced: { gamesPlayed: 77, goals: 33, assists: 65, shots: 277, hits: 36 },
    upside: { gamesPlayed: 82, goals: 39, assists: 72, shots: 300, hits: 40 },
    reasons: [
      "Top-line and PP1 deployment support elite assist and shot totals.",
      "The balanced case uses a realistic health allowance instead of a full 84-game assumption."
    ]
  },
  "mikko rantanen": {
    floor: { gamesPlayed: 68, goals: 29, assists: 59, shots: 190, hits: 50 },
    balanced: { gamesPlayed: 77, goals: 37, assists: 70, shots: 225, hits: 58 },
    upside: { gamesPlayed: 82, goals: 45, assists: 78, shots: 250, hits: 64 },
    reasons: [
      "A normal workload and established top-six/PP1 production create a large rebound from a shortened season.",
      "The balanced line remains below his healthiest peak seasons."
    ]
  },
  "matthew tkachuk": {
    floor: { gamesPlayed: 60, goals: 24, assists: 43, shots: 185, hits: 75 },
    balanced: { gamesPlayed: 72, goals: 31, assists: 56, shots: 225, hits: 95 },
    upside: { gamesPlayed: 80, goals: 38, assists: 65, shots: 255, hits: 110 },
    reasons: [
      "The model restores his established per-game scoring and physical rates after a heavily shortened season.",
      "Health is the dominant uncertainty, producing a wide floor-to-upside range."
    ]
  },
  "lane hutson": {
    floor: { gamesPlayed: 78, goals: 8, assists: 58, shots: 118, hits: 29 },
    balanced: { gamesPlayed: 82, goals: 11, assists: 68, shots: 132, hits: 32 },
    upside: { gamesPlayed: 84, goals: 14, assists: 75, shots: 145, hits: 35 },
    reasons: [
      "PP1 responsibility and a growing offensive role drive another strong assist projection.",
      "Goals remain modest because his primary fantasy value is puck movement and creation."
    ]
  }
};
