# Champions League 2026–27 Live Launch

This build converts the draft site into the live 2026–27 league.

## Live-season changes

- NHL scoring now reads season `20262027` (2026–27 regular season).
- Adam is removed from the active manager list because no roster was submitted before the deadline.
- All human rosters are hard-locked server-side. The roster API rejects edits even if someone bypasses the UI.
- Existing human roster records are not rewritten. Deploy this build with the same Upstash Redis credentials as the current site so all submitted picks remain intact.
- Saved 2025–26 player totals can no longer leak into 2026–27 standings when a current player is temporarily absent from the live feed.

## ChatGPT team

- `ChatGPT` is a normal standings competitor.
- It follows the same $104,000,000 cap and exact 12 F / 6 D / 2 G roster limits.
- The site optimizes the 2026–27 projection board, stores the first legal roster in Upstash, and never changes it afterward.

## Dream Team

- `Dream Team` is a benchmark, not a standings competitor.
- It follows the same $104,000,000 cap and exact 12 F / 6 D / 2 G roster limits.
- Membership is optimized from current 2026–27 Champions League fantasy points, with preseason projection used only as a tie-breaker.
- A weekly snapshot is stored in Upstash. Once that week's roster exists, page refreshes cannot reshuffle it.
- Vercel Cron calls `/api/cron/dream-team` every Monday at 09:05 UTC. The roster route also lazily creates the current week's snapshot if the cron has not run yet.
- Standings now show how many players from each roster are also on the current Dream Team (`x/20`).

## Deployment

Keep the existing Upstash/KV environment variables attached to the Vercel project. `CRON_SECRET` is optional; if configured, Vercel will send it to the cron route as a Bearer token.

## Homepage refinement
- Replaced the league-wide Top Performers board with the current weekly Dream Team roster.
- Dream Team rows show position, headshot, NHL team, salary-cap hit, and current 2026–27 fantasy points.
- Dream Team players remain clickable for the detailed hockey card.
- Added the full Champions League scoring breakdown directly under the public standings:
  - Skaters: G 2.0, A 1.5, SOG 1.0, HIT 0.25.
  - Goalies: W 5, SV 0.25, GA -1, SO 5, A 7, G 50.
