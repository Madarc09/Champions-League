# SALARY CAP SPACE — Static Salary System

This version removes the former frozen-cache and live salary fallback systems.

## Source of truth

The draft room reads `data/SALARY_CAP_SPACE.json` for every normal salary. It does not contact CapSpace or another salary API while managers use the site.

Vercel runs `scripts/build-salary-cap-space.mjs` immediately before `next build`. The script copies the exact live Champions League player list, preserves every salary already displayed, isolates the `$0` players, fills matching active contracts from CapSpace, applies the small explicit recent-contract supplement list, and then writes:

- `data/SALARY_CAP_SPACE.json` — machine-readable source used by the website.
- `data/SALARY_CAP_SPACE.csv` — readable full list.
- `data/SALARY_CAP_SPACE_ZERO_LIST.csv` — only players that still have `$0` after matching.

The deployment fails instead of replacing the site when the live player feed is empty or contains duplicate player IDs.

## Runtime behaviour

Salary order is deliberately simple:

1. Nick's shared manual correction, when one exists.
2. The player's entry in `SALARY_CAP_SPACE.json`.
3. `$0` / unresolved and blocked from drafting until corrected.

There is no normal runtime salary scrape, stale salary cache, 450-contract threshold, or automatic Redis master.

## Nick's editor

Nick's Salary Admin tab remains available for contracts signed after the file was generated or for a rare missed match. A correction updates every manager through the existing Upstash salary override table. The download control exports the static file with Nick's overrides merged into it.


## Deployment note

The ZIP contains empty-header placeholders because this workspace cannot persist the live endpoint’s 10.5 MB JSON response. During Vercel’s `prebuild`, the source files are replaced with the complete static snapshot before Next.js compiles the site. Normal manager page loads never rebuild or fetch salary data. If the live source itself cannot be read, the build stops before deployment rather than publishing an empty salary file.
