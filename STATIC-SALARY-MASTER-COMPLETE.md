# Champions League static salary master complete

Completed July 22, 2026.

## Final database

- 32 NHL teams
- 2,197 player records
- 1,425 signed 2026–27 cap hits
- 772 unsigned / `$0` records
- 750 active-roster records
- 732 non-roster records
- 715 unsigned draft choices

## Website behavior

The Draft Room now reads `data/SALARY_CAP_SPACE.json` exclusively. The file is generated from the completed master CSV/workbook bundled in `data/`.

There is no live salary-site request, Redis salary override, rookie seed, or fallback salary source in the player route. A record with a cap hit of `$0` is treated as unsigned and cannot be drafted for free.

The matcher uses team, normalized player name, and position. `NAS`/`NSH` and `WAS`/`WSH` are normalized, and the two Vancouver Elias Pettersson records are preserved separately as forward and defence.

## Source files

- `data/SALARY_CAP_MASTER_2026-27.xlsx`
- `data/SALARY_CAP_MASTER_2026-27.csv`
- `data/SALARY_CAP_SPACE.json`
- `data/SALARY_CAP_SPACE.csv`
- `data/SALARY_CAP_SPACE_ZERO_LIST.csv`

## Validation

Run:

```bash
npm run build:salaries
npm run validate:salaries
```

The validator confirms 2,197 records, 32 teams, valid non-negative salaries, no duplicate team/name/position records, and distinct Vancouver forward/defence entries for Elias Pettersson.
