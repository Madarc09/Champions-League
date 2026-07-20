// Optional verified salary corrections keyed by NHL player ID.
// Normal league salaries load automatically from CapSpace. Only add a value
// here when the public source needs a temporary correction.
export const SEED_SALARIES = {};

// Name-based safeguards are useful for newly signed rookies whose official NHL
// player ID may not yet be present in every public data feed.
export const SEED_SALARIES_BY_NAME = {
  gavinmckenna: {
    capHit: 1075000,
    source: "verified-seed",
    updatedAt: "2026-07-03"
  }
};
