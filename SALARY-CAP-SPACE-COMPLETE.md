# SALARY CAP SPACE — Completed Static Replacement

## What this package does

The Champions League draft page now uses `data/SALARY_CAP_SPACE.json` as its normal salary source.

Before Vercel compiles the site, `scripts/build-salary-cap-space.mjs`:

1. Opens the current Champions League full-player endpoint.
2. Copies every player and every salary already displayed there.
3. Places every missing or `$0` salary into a zero-salary list.
4. Checks those zero players against the current CapSpace team contract pages.
5. Applies explicit supplements for known recent gaps such as Jason Robertson.
6. Writes the completed static JSON and CSV files before the website is compiled.

After the build, manager pages do not contact CapSpace or a salary API. They use the compiled static file exclusively, except for Nick's shared manual overrides.

## Generated files

- `data/SALARY_CAP_SPACE.json` — source used by the website.
- `data/SALARY_CAP_SPACE.csv` — readable full salary list.
- `data/SALARY_CAP_SPACE_ZERO_LIST.csv` — only players still showing `$0` after the contract check.

The ZIP contains header-only placeholders for these files. Vercel replaces them during `prebuild` because this workspace could reach but could not persist the live endpoint's 10.5 MB JSON response.

## Known regression checks

The automated fixture confirms:

- Adam Fox: $9,500,000.
- Nicholas Robertson: $3,250,000.
- Jason Robertson: $12,000,000 supplement.
- Existing non-zero salaries are preserved.
- A genuinely unresolved prospect remains on the zero list.
- Empty or duplicate source data cannot overwrite a successful static file.

## Nick-only correction tool

Nick's Salary Admin remains available for a later signing or an unusual missed match. It writes a league-wide Redis override. The normal static file remains unchanged, and all managers receive the override.

## Validation performed

- Salary fixture and failure-safety tests passed.
- All JavaScript and JSX syntax checks passed.
- Runtime folders contain no CapSpace, PuckPedia, Spotrac, old salary-master, stale-cache, or 450-contract-threshold calls.
- A complete local Next.js production build could not be run because this workspace does not have the npm dependency tarballs cached. Vercel will install the locked dependencies before running the build.
