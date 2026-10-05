export const LEAGUE_NAME = "Champions League";
export const SEASON_LABEL = "2026–27";
export const STATS_SEASON_ID = 20262027;
export const SALARY_CAP = 104_000_000;

// The 2026–27 league is live. Human draft picks are frozen for the season.
export const ROSTERS_LOCKED = true;
export const ROSTER_LOCKED_AT = "2026-10-05T13:26:00-04:00";
export const PREDICTIONS_LOCKED = true;
export const PREDICTIONS_LOCKED_AT = "2026-09-29T17:00:00-04:00";

// Rosters are public now that the league has launched.
export const ROSTER_REVEAL_AT = "2026-10-05T13:26:00-04:00";
export function rostersArePublic(now = Date.now()) {
  const revealTime = Date.parse(ROSTER_REVEAL_AT);
  return Number.isFinite(revealTime) && Number(now) >= revealTime;
}

export const SCORING = {
  goals: 2.0,
  assists: 1.5,
  hits: 0.25,
  shots: 1.0
};

export const GOALIE_SCORING = {
  saves: 0.25,
  goalsAgainst: -1.0,
  wins: 5.0,
  shutouts: 5.0,
  goals: 50.0,
  assists: 7.0
};

export const ROSTER_LIMITS = {
  F: 12,
  D: 6,
  G: 2
};

// Adam did not submit a roster before the deadline and is not part of the pool.
export const TEAMS = [
  { slug: "joe", name: "Joe" },
  { slug: "lucas", name: "Lucas" },
  { slug: "dan", name: "Dan" },
  { slug: "darren", name: "Darren" },
  { slug: "nick", name: "Nick" },
  { slug: "rob", name: "Rob" },
  { slug: "ernie", name: "Ernie" },
  { slug: "ethan", name: "Ethan" }
];

export const BOT_TEAM = {
  slug: "chatgpt",
  name: "Skynet T-104",
  kind: "bot",
  description: "An AI-built $104M cap roster selected once before launch and locked for the season."
};

export const DREAM_TEAM = {
  slug: "dream-team",
  name: "Dream Team",
  kind: "dream",
  description: "The best cap-legal 12F / 6D / 2G roster from current 2026–27 fantasy points, refreshed once per league week."
};

export const STANDINGS_TEAMS = [...TEAMS, BOT_TEAM];
export const PUBLIC_TEAMS = [...STANDINGS_TEAMS, DREAM_TEAM];

export const DEFAULT_STANDINGS = STANDINGS_TEAMS.map((team) => ({
  ...team,
  gp: 0,
  w: 0,
  l: 0,
  otl: 0,
  pts: 0
}));
