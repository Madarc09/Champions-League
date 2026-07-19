export const LEAGUE_NAME = "Champions League";
export const SEASON_LABEL = "2026–27";
export const STATS_SEASON_ID = 20252026;
export const SALARY_CAP = 104_000_000;

// Change scoring here later. The player search and fantasy-point totals update automatically.
export const SCORING = {
  goals: 2.0,
  assists: 1.5,
  hits: 1.0,
  shots: 1.0
};

export const ROSTER_LIMITS = {
  F: 12,
  D: 6,
  G: 2
};

export const TEAMS = [
  { slug: "joe", name: "Joe" },
  { slug: "lucas", name: "Lucas" },
  { slug: "dan", name: "Dan" },
  { slug: "adam", name: "Adam" },
  { slug: "darren", name: "Darren" },
  { slug: "nick", name: "Nick" },
  { slug: "rob", name: "Rob" },
  { slug: "ernie", name: "Ernie" }
];

export const DEFAULT_STANDINGS = TEAMS.map((team) => ({
  ...team,
  gp: 0,
  w: 0,
  l: 0,
  otl: 0,
  pts: 0
}));
