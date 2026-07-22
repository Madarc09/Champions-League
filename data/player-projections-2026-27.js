/**
 * Champions League 2026-27 static projection board.
 *
 * This file stores the authoritative editorial overrides used by the draft room.
 * Every other NHL player is still covered by the frozen full-board review rules
 * in lib/static-projections.js, so nobody falls back to a random live estimate.
 *
 * Each reviewed player has three scenarios:
 *   floor    = cautious outcome
 *   balanced = number displayed by default
 *   upside   = healthy/favourable deployment outcome
 *
 * Update this file rather than changing numbers inside a React component.
 */
export const STATIC_PROJECTION_META = {
  model: "Champions Static Projection Board 2.0",
  season: "2026-27",
  updatedAt: "2026-07-22",
  editorialOverrides: 50,
  coverage: "Full NHL player pool",
  method: "Top-player editorial overrides plus a frozen three-scenario full-board review policy for every remaining player."
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

  ,"logan thompson": {
    floor: { gamesPlayed: 50, wins: 28, saves: 1240, goalsAgainst: 130, shutouts: 3, goals: 0, assists: 0 },
    balanced: { gamesPlayed: 58, wins: 34, saves: 1450, goalsAgainst: 139, shutouts: 4, goals: 0, assists: 0 },
    upside: { gamesPlayed: 63, wins: 39, saves: 1600, goalsAgainst: 146, shutouts: 6, goals: 0, assists: 0 },
    reasons: [
      "Washington's strong team environment and his established starter workload support a mid-30s win projection.",
      "The balanced line keeps his save rate near last season while avoiding an automatic repeat of every career-best result."
    ]
  },
  "connor hellebuyck": {
    floor: { gamesPlayed: 53, wins: 30, saves: 1320, goalsAgainst: 135, shutouts: 3, goals: 0, assists: 0 },
    balanced: { gamesPlayed: 60, wins: 36, saves: 1500, goalsAgainst: 140, shutouts: 5, goals: 0, assists: 0 },
    upside: { gamesPlayed: 64, wins: 41, saves: 1620, goalsAgainst: 145, shutouts: 7, goals: 0, assists: 0 },
    reasons: [
      "His multi-year workload and elite goaltending baseline keep him among the safest high-volume goalies.",
      "The range allows for Winnipeg's offseason uncertainty without assuming a major decline in individual performance."
    ]
  },
  "ilya sorokin": {
    floor: { gamesPlayed: 50, wins: 25, saves: 1250, goalsAgainst: 140, shutouts: 4, goals: 0, assists: 0 },
    balanced: { gamesPlayed: 57, wins: 31, saves: 1450, goalsAgainst: 142, shutouts: 6, goals: 0, assists: 0 },
    upside: { gamesPlayed: 62, wins: 36, saves: 1600, goalsAgainst: 146, shutouts: 8, goals: 0, assists: 0 },
    reasons: [
      "Strong individual save quality and a clear starter role support another large save total.",
      "Wins are kept below the elite-team goalies because the Islanders' scoring environment remains the larger risk."
    ]
  },
  "cutter gauthier": {
    floor: { gamesPlayed: 74, goals: 35, assists: 28, shots: 270, hits: 58 },
    balanced: { gamesPlayed: 80, goals: 43, assists: 35, shots: 300, hits: 65 },
    upside: { gamesPlayed: 84, goals: 50, assists: 42, shots: 330, hits: 72 },
    reasons: [
      "Elite shot volume and a permanent top-line shooting role support another 40-goal season.",
      "The balanced case adds modest playmaking growth while applying some regression to finishing."
    ]
  },
  "kyle connor": {
    floor: { gamesPlayed: 74, goals: 38, assists: 43, shots: 245, hits: 18 },
    balanced: { gamesPlayed: 80, goals: 45, assists: 50, shots: 275, hits: 20 },
    upside: { gamesPlayed: 84, goals: 52, assists: 58, shots: 300, hits: 23 },
    reasons: [
      "His first-line and PP1 usage preserve a high goal floor even if Winnipeg's roster changes around him.",
      "The midpoint sits slightly below a full repeat of his career-best scoring pace."
    ]
  },
  "tage thompson": {
    floor: { gamesPlayed: 70, goals: 34, assists: 35, shots: 240, hits: 31 },
    balanced: { gamesPlayed: 77, goals: 42, assists: 43, shots: 270, hits: 35 },
    upside: { gamesPlayed: 82, goals: 50, assists: 50, shots: 300, hits: 40 },
    reasons: [
      "A premium shooting role and heavy PP1 usage keep the goal projection in the low 40s.",
      "Durability and Buffalo's overall offensive consistency create most of the floor-to-upside spread."
    ]
  },
  "mark scheifele": {
    floor: { gamesPlayed: 73, goals: 31, assists: 43, shots: 198, hits: 40 },
    balanced: { gamesPlayed: 80, goals: 37, assists: 50, shots: 220, hits: 45 },
    upside: { gamesPlayed: 84, goals: 43, assists: 57, shots: 240, hits: 50 },
    reasons: [
      "Top-line centre minutes and PP1 deployment support another strong point total.",
      "The balanced projection trims the highest finishing outcome but keeps his established assist rate."
    ]
  },
  "dylan guenther": {
    floor: { gamesPlayed: 71, goals: 31, assists: 35, shots: 225, hits: 27 },
    balanced: { gamesPlayed: 78, goals: 38, assists: 42, shots: 250, hits: 30 },
    upside: { gamesPlayed: 83, goals: 45, assists: 49, shots: 275, hits: 34 },
    reasons: [
      "A young-player growth curve and a featured power-play shooting role support another step forward.",
      "The midpoint remains below the full breakout case because his NHL workload history is still developing."
    ]
  },
  "leo carlsson": {
    floor: { gamesPlayed: 72, goals: 28, assists: 42, shots: 190, hits: 48 },
    balanced: { gamesPlayed: 80, goals: 35, assists: 50, shots: 210, hits: 55 },
    upside: { gamesPlayed: 84, goals: 42, assists: 58, shots: 235, hits: 62 },
    reasons: [
      "Anaheim's offence is increasingly built around his top-line and PP1 usage.",
      "The balanced case assumes continued development without jumping immediately to the full star-level ceiling."
    ]
  },
  "jake guentzel": {
    floor: { gamesPlayed: 74, goals: 32, assists: 40, shots: 225, hits: 27 },
    balanced: { gamesPlayed: 80, goals: 38, assists: 47, shots: 250, hits: 30 },
    upside: { gamesPlayed: 84, goals: 44, assists: 53, shots: 275, hits: 34 },
    reasons: [
      "Tampa Bay's elite power play and high-end linemates keep both scoring categories strong.",
      "The midpoint uses his established multi-year finishing level rather than a single-season spike."
    ]
  },
  "brandon hagel": {
    floor: { gamesPlayed: 75, goals: 29, assists: 42, shots: 220, hits: 85 },
    balanced: { gamesPlayed: 81, goals: 35, assists: 50, shots: 245, hits: 95 },
    upside: { gamesPlayed: 84, goals: 41, assists: 57, shots: 268, hits: 105 },
    reasons: [
      "His top-six role, strong linemates and physical category production create a balanced fantasy profile.",
      "The projection assumes continued power-play involvement but not a major role expansion."
    ]
  },
  "sam reinhart": {
    floor: { gamesPlayed: 75, goals: 31, assists: 40, shots: 210, hits: 49 },
    balanced: { gamesPlayed: 81, goals: 38, assists: 47, shots: 235, hits: 55 },
    upside: { gamesPlayed: 84, goals: 45, assists: 54, shots: 260, hits: 62 },
    reasons: [
      "Florida's top-line and PP1 environment supports another high-end goal total.",
      "The balanced case regresses the most extreme finishing outcome while preserving his elite net-front role."
    ]
  },
  "aleksander barkov": {
    floor: { gamesPlayed: 64, goals: 19, assists: 48, shots: 145, hits: 52 },
    balanced: { gamesPlayed: 72, goals: 24, assists: 58, shots: 165, hits: 60 },
    upside: { gamesPlayed: 79, goals: 29, assists: 66, shots: 185, hits: 68 },
    reasons: [
      "Elite two-way deployment and premium linemates keep his assist rate strong whenever healthy.",
      "Games played is the main uncertainty, so the balanced line does not assume a full schedule."
    ]
  },
  "rasmus dahlin": {
    floor: { gamesPlayed: 71, goals: 14, assists: 51, shots: 195, hits: 64 },
    balanced: { gamesPlayed: 78, goals: 18, assists: 60, shots: 220, hits: 72 },
    upside: { gamesPlayed: 83, goals: 23, assists: 68, shots: 245, hits: 80 },
    reasons: [
      "Heavy minutes, PP1 control and strong shot generation keep him in the top defence tier.",
      "The balanced projection allows for Buffalo improvement without assuming a career-best team offence."
    ]
  },
  "matthew schaefer": {
    floor: { gamesPlayed: 74, goals: 11, assists: 42, shots: 165, hits: 70 },
    balanced: { gamesPlayed: 81, goals: 16, assists: 50, shots: 190, hits: 80 },
    upside: { gamesPlayed: 84, goals: 21, assists: 59, shots: 215, hits: 92 },
    reasons: [
      "A rapidly expanding top-pair and power-play role supports growth across every offensive category.",
      "The midpoint remains below the full sophomore-breakout ceiling while retaining his physical contribution."
    ]
  },
  "jake oettinger": {
    floor: { gamesPlayed: 50, wins: 30, saves: 1160, goalsAgainst: 130, shutouts: 3, goals: 0, assists: 0 },
    balanced: { gamesPlayed: 56, wins: 36, saves: 1300, goalsAgainst: 136, shutouts: 4, goals: 0, assists: 0 },
    upside: { gamesPlayed: 61, wins: 41, saves: 1450, goalsAgainst: 142, shutouts: 6, goals: 0, assists: 0 },
    reasons: [
      "Dallas' strong team environment provides one of the best win ceilings in the league.",
      "The save projection is moderated because the Stars can suppress shot volume in front of him."
    ]
  },
  "igor shesterkin": {
    floor: { gamesPlayed: 51, wins: 25, saves: 1300, goalsAgainst: 133, shutouts: 2, goals: 0, assists: 0 },
    balanced: { gamesPlayed: 58, wins: 31, saves: 1500, goalsAgainst: 139, shutouts: 4, goals: 0, assists: 0 },
    upside: { gamesPlayed: 63, wins: 37, saves: 1650, goalsAgainst: 145, shutouts: 6, goals: 0, assists: 0 },
    reasons: [
      "Elite individual goaltending and a secure starter role support a rebound in workload and wins.",
      "The Rangers' uncertain team environment keeps the balanced win total below his best seasons."
    ]
  },
  "clayton keller": {
    floor: { gamesPlayed: 74, goals: 26, assists: 51, shots: 220, hits: 22 },
    balanced: { gamesPlayed: 81, goals: 31, assists: 60, shots: 245, hits: 25 },
    upside: { gamesPlayed: 84, goals: 36, assists: 68, shots: 270, hits: 29 },
    reasons: [
      "Utah's offence continues to run through his top-line and PP1 creation.",
      "The balanced projection assumes stable health and normal finishing rather than a career-high spike."
    ]
  },
  "william nylander": {
    floor: { gamesPlayed: 72, goals: 32, assists: 40, shots: 245, hits: 22 },
    balanced: { gamesPlayed: 79, goals: 39, assists: 47, shots: 270, hits: 25 },
    upside: { gamesPlayed: 83, goals: 47, assists: 54, shots: 295, hits: 29 },
    reasons: [
      "A premium shooting role beside Toronto's elite centres supports another high-30s goal season.",
      "The balanced line includes a normal missed-game allowance and modest finishing regression."
    ]
  },
  "sidney crosby": {
    floor: { gamesPlayed: 72, goals: 25, assists: 51, shots: 210, hits: 36 },
    balanced: { gamesPlayed: 79, goals: 30, assists: 60, shots: 235, hits: 40 },
    upside: { gamesPlayed: 83, goals: 35, assists: 67, shots: 255, hits: 44 },
    reasons: [
      "His top-line, PP1 and face-of-the-offence role keeps the assist floor high despite age-related risk.",
      "The midpoint assumes continued elite playmaking with a modest reduction from his strongest scoring seasons."
    ]
  },
  "artemi panarin": {
    floor: { gamesPlayed: 70, goals: 25, assists: 49, shots: 200, hits: 18 },
    balanced: { gamesPlayed: 77, goals: 30, assists: 58, shots: 220, hits: 20 },
    upside: { gamesPlayed: 82, goals: 36, assists: 66, shots: 245, hits: 23 },
    reasons: [
      "Los Angeles should give him a featured top-six and first-unit power-play role.",
      "The balanced projection allows for an adjustment period with new linemates while preserving his elite playmaking."
    ]
  },
  "adrian kempe": {
    floor: { gamesPlayed: 73, goals: 30, assists: 35, shots: 230, hits: 78 },
    balanced: { gamesPlayed: 80, goals: 36, assists: 42, shots: 255, hits: 90 },
    upside: { gamesPlayed: 84, goals: 43, assists: 49, shots: 280, hits: 100 },
    reasons: [
      "High shot volume, physical play and a stable top-line role provide a strong category floor.",
      "Panarin's arrival improves the playmaking environment without requiring an unrealistic scoring jump."
    ]
  },
  "alex debrincat": {
    floor: { gamesPlayed: 74, goals: 32, assists: 35, shots: 240, hits: 31 },
    balanced: { gamesPlayed: 80, goals: 38, assists: 42, shots: 265, hits: 35 },
    upside: { gamesPlayed: 84, goals: 45, assists: 49, shots: 290, hits: 40 },
    reasons: [
      "Detroit continues to use him as a primary even-strength and PP1 shooter.",
      "The balanced forecast centres his finishing near his established range while adding modest assist growth."
    ]
  },
  "mitch marner": {
    floor: { gamesPlayed: 73, goals: 21, assists: 62, shots: 185, hits: 22 },
    balanced: { gamesPlayed: 80, goals: 26, assists: 73, shots: 205, hits: 25 },
    upside: { gamesPlayed: 84, goals: 32, assists: 82, shots: 225, hits: 29 },
    reasons: [
      "Vegas gives him elite finishers and a central PP1 distribution role.",
      "The midpoint keeps goals conservative while projecting another high-end assist season in the new environment."
    ]
  },
  "tim stutzle": {
    floor: { gamesPlayed: 74, goals: 27, assists: 46, shots: 215, hits: 62 },
    balanced: { gamesPlayed: 81, goals: 33, assists: 54, shots: 240, hits: 70 },
    upside: { gamesPlayed: 84, goals: 39, assists: 62, shots: 265, hits: 78 },
    reasons: [
      "A permanent first-line and PP1 role supports strong shot and assist volume.",
      "The balanced case assumes Ottawa's offence improves without pushing him immediately to the full breakout ceiling."
    ]
  }

};
