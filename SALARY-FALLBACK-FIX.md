# Salary fallback repair

This package fixes the regression where every player appeared without a salary.

## Cause

The previous build made ordinary draft-page requests depend on a perfect 32-team salary audit. If one team page failed or its published row count did not exactly match the parser, the frozen master failed to initialize. The player API caught that failure and continued with a null master, which made nearly every player unresolved.

## Repair

1. Ordinary draft pages first reuse the previous working salary cache, including the original `v3-rookies` Redis cache created by the working deployment.
2. A stale cache remains usable because an expired cache timestamp does not invalidate signed contracts.
3. Normal source refreshes accept a plausible bulk snapshot; exact 32-team row-count validation is reserved for Nick's explicit audit button.
4. If the frozen master fails, the player API falls back directly to the working salary snapshot instead of returning blanks.
5. Verified corrections are applied directly in the player API, so Adam Fox and Jason Robertson remain correct even during a master-storage failure.
6. Failure to save a newly created master to Redis no longer erases the in-memory salary data for the current request.

## Validation

- Existing salary-system validation passed with a simulated 495-contract league master.
- A dedicated legacy-cache regression test returned 460 salaries from the old Redis key with zero live team-page requests.
- JavaScript syntax checks passed across the project.

The strict full-audit button remains available to Nick, but its failure cannot replace or hide the working salary set.
