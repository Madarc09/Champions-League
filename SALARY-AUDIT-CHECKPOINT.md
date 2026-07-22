# Salary audit checkpoint — July 22, 2026

This checkpoint preserves the work completed before the full salary review was paused.

## Completed

- Added identity-based player deduplication across NHL season statistics, current NHL rosters, and recent draft/prospect lists.
- Duplicate detection no longer depends on team abbreviation, so a player cannot survive twice because one record uses a prospect/temporary ID or an older team value.
- When duplicates are found, the build keeps the stronger official record and preserves available headshot, team logo, draft, and rookie metadata.
- The player API now records a duplicate audit count and the affected names. This specifically addresses duplicate entries such as Macklin Celebrini.

## Preserved but not yet completed

- The project still contains the existing CapSpace snapshot loader and salary fallback tools.
- `data/salaries-2026-27.csv` is still only a template header; a verified permanent master salary table has not yet been filled.
- No claim is made that every missing 2026–27 salary has been checked or frozen in this checkpoint.

## Recommended continuation

1. Export the actual website player list once.
2. Match that list against one complete current contract source.
3. Manually verify only unmatched/unsigned players and recent signings.
4. Save the final values by NHL player ID in a static data file and make that file the primary salary source.
5. Keep the live loader only as an optional admin refresh—not as the user-facing dependency.
