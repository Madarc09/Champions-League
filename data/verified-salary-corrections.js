// Deterministic safeguards for contracts that were missing or stale in the
// site's existing salary source. The static SALARY_CAP_SPACE file remains the
// first choice; these are used only if that file was not generated.
export const VERIFIED_SALARY_CORRECTIONS_BY_NAME = {
  adamfox: {
    playerId: "8479323",
    name: "Adam Fox",
    teamAbbreviation: "NYR",
    position: "D",
    capHit: 9_500_000,
    source: "salary safeguard",
    verifiedAt: "2026-07-22"
  },
  jasonrobertson: {
    playerId: "8480027",
    name: "Jason Robertson",
    teamAbbreviation: "DAL",
    position: "LW",
    capHit: 12_000_000,
    source: "salary safeguard",
    verifiedAt: "2026-07-22"
  },
  nicholasrobertson: {
    playerId: "8481582",
    name: "Nicholas Robertson",
    teamAbbreviation: "PIT",
    position: "LW",
    capHit: 3_250_000,
    source: "salary safeguard",
    verifiedAt: "2026-07-22"
  },
  gavinmckenna: {
    name: "Gavin McKenna",
    teamAbbreviation: "TOR",
    position: "LW",
    capHit: 1_075_000,
    source: "salary safeguard",
    verifiedAt: "2026-07-22"
  }
};
