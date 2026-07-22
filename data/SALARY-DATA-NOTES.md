# Salary data files

- `salaries-2026-27.csv` is the source-controlled verified safeguard list. It is intentionally human-readable and non-empty.
- `verified-salary-corrections.js` is the runtime form of those safeguards.
- The complete signed-contract master is created only after a strict 32-team audit and is frozen in Upstash under the versioned v4 key.
- Nick can download the complete player-pool CSV from the Salary Admin tab after deployment.
- A player with no matched salary remains `unresolved`; the draft room never converts that state to `$0`.

The league audit also requires each team’s parsed salary-row count to exactly match the salary-bearing roster count published on that team page.
