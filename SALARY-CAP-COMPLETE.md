# Champions League salary-cap correction

Corrected July 22, 2026 after the Adam Fox audit failure was identified.

## The defect that was removed

The previous version accepted any combined scrape containing at least 450 contracts, even when one or more NHL team pages failed. It could therefore freeze a permanently incomplete master. The bundled `data/salaries-2026-27.csv` was also only a header, so the earlier completion claim was inaccurate.

## Corrected behavior

The replacement master uses a new Redis key and will not reuse the defective snapshot. A master is accepted only after:

1. All 32 NHL team pages load successfully.
2. Each team produces a valid contract table; failed pages are retried three times.
3. For every team, the number of parsed salary rows exactly matches the salary-bearing roster count published on that team page.
4. The combined audit contains at least 450 signed contract records.
5. The Rangers source returns Adam Fox at **$9,500,000**.
6. All verified contract safeguards pass.

If any check fails, the new master is not saved. A failed future re-audit also leaves the last valid master untouched.

## Salary matching

The draft room now resolves salaries in this order:

1. Nick's saved override by NHL player ID.
2. Frozen master by NHL player ID, when supplied by a safeguard.
3. Frozen master by current NHL team plus canonical player name.
4. Name-only fallback for an unambiguous legacy row.
5. Unresolved and blocked from drafting.

The team-aware index prevents different players with the same normalized name from sharing a salary.

## Verified safeguards included

The source-controlled review list now contains 16 real rows rather than an empty file. It includes Adam Fox, Jason Robertson, Gavin McKenna, and the major July 9–21 contracts already audited. Jason Robertson remains fixed at **$12,000,000** even when the primary source lags.

The complete pool-sized CSV remains available to Nick through **Salary Admin → Download master CSV** after the strict master is created.

## Nick-only controls

Nick can:

- search all players;
- show unresolved players only;
- save a salary correction for the entire league;
- download the current pool salary CSV; and
- deliberately run a new full 32-team audit.

The API verifies Nick's authenticated session for all three write/export/audit operations. Other managers cannot invoke them directly.

## Deployment

Deploy this project over the current Vercel project without changing the existing Upstash variables. The versioned master key forces one clean 32-team rebuild; rosters, login records, and previous Nick salary overrides use separate keys and remain intact.

## Validation completed in this workspace

- `npm run validate:salaries` passed.
- The CapSpace parser passed a synthetic Rangers contract fixture.
- Adam Fox and Jason Robertson regression rows passed.
- All modified non-JSX JavaScript files passed `node --check`.
- All project JSX files passed TypeScript's JSX parser with `--noResolve`.

A complete `next build` could not be run because this workspace has no installed `node_modules`, and the offline npm cache is missing `uncrypto@0.1.3`. Vercel will install the locked dependencies during deployment.
