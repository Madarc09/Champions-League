# Champions League Fantasy Hockey — 2026–27 Live

Clean production rebuild of the Champions League salary-cap pool.

## Live rules

- Cap: **$104,000,000**
- Roster: **12 F / 6 D / 2 G**
- Human rosters are locked for the season.
- Adam is not in the 2026–27 pool.
- Skynet T-104 is a locked AI entrant.
- Dream Team is a weekly cap-legal 12F/6D/2G benchmark.

### Scoring

Skaters: G 2.0 · A 1.5 · SOG 1.0 · HIT 0.25

Goalies: W 5 · SV 0.25 · GA −1 · SO 5 · A 7 · G 50

## Production data

The site uses the NHL 2026–27 stats feed (`seasonId=20262027`). Saved roster players are reconciled against live NHL identities so rookies with prospect-era IDs can still connect to their official NHL player record. Gavin McKenna is explicitly safeguarded to NHL player ID `8486067`.

The frozen salary database used at runtime is `data/SALARY_CAP_SPACE.json`.

## Upstash

Deploy with the **same Upstash Redis environment variables as the existing site** so the submitted human rosters and saved preseason predictions remain intact:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

## Vercel

Upload the extracted project to GitHub with `package.json` at the repository root, then deploy as a standard Next.js project. `vercel.json` includes the weekly Dream Team cron.

## Local

```bash
npm install
npm run dev
```
