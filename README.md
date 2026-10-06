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

## V7 live-season UI updates
- Homepage right board is now a roster carousel: Dream Team plus every locked league roster.
- Desktop uses integrated previous/next controls; mobile supports horizontal swipe inside the roster board.
- All carousel rosters are enriched from the same live NHL snapshot already used by standings, avoiding extra per-team API calls.
- Skynet T-104 uses a new command-room background with tall left/right prediction terminals and an open central roster bay.

## Dream Team Challenge

The live site includes `/dream-team-challenge`, a weekly mini-game that is completely isolated from drafted league rosters.

- The existing AI Dream Team opens each league week as the target.
- Logged-in managers may submit unlimited cap-legal 12F / 6D / 2G challenge rosters under the same $104M cap.
- Challenge entries are stored under `champions-league:dream-challenge:2026-27:*` Redis keys and never write to the league roster keys.
- Attempts are re-scored from current 2026–27 NHL fantasy totals whenever the challenge is read.
- A human roster must strictly exceed the current holder to take the crown; ties do not dethrone the holder.
- The public Dream Team roster display shows the current challenge crown holder.
- The established league `Dream Team players` overlap statistic remains based on the AI weekly roster, so the mini-game cannot alter that league-side metric.
- `dreamWeekKey()` still controls the Monday 4 AM Toronto rollover. The next request after rollover generates the new weekly AI roster if the cron has not already done so.

## V8.6 — Daily roster points + NHL Pick 'Em

- Homepage `PLAYING TODAY` mode now shows each visible player's league-day fantasy points (10 AM Eastern reset) instead of season FPTS, and the roster header total switches to today's points as well.
- Mini Games is now available to Nick's existing manager login for testing.
- Mini Games includes the preserved Dream Team Challenge and a new NHL Pick 'Em game.
- Pick 'Em uses the actual Eastern calendar date, allows picks/changes until scheduled puck drop, then locks the game and records W/L from final NHL scores.
- Pick 'Em data lives under its own Redis namespace and never writes to league rosters or standings.

## V8.8 scoring validation

- NHL Pick 'Em days are visually separated into individual Monday-Sunday day boards.
- Season NHL stat reports now refresh every 60 seconds instead of using the old six-hour report cache.
- TODAY continues to use live NHL Game Center boxscores plus the NHL daily stats reports.
- Standings FPTS overlays only the live daily points that are ahead of the official daily report, so live production appears in season totals without double-counting after NHL cumulative stats catch up.
- `/api/standings` exposes the number of live-overlay players/points and the season refresh interval under `leagueDay.dailyStats` for diagnostics.

## V9 Pick 'Em Clubhouse

- NHL Pick 'Em is opt-in: a manager appears in the standings only after saving at least one pick.
- All existing pool manager logins can access Mini Games.
- Pick 'Em scoring: Win = 2 points, Regulation Loss = 0, OT/Shootout Loss = 1.
- Standings are season-long and ranked by Pick 'Em points.
- The Monday-Sunday card automatically advances each Monday; all day drawers begin collapsed.
- Nick's existing Pick 'Em Redis keys remain compatible; other managers use matching isolated namespaces.
- The page uses `public/pickem-clubhouse.webp` as a permanent visual background while all meaningful standings/schedule text remains live HTML.

## V10 Pick ’Em Long Table rebuild

The Pick ’Em page was visually rebuilt around a restrained Viking long-table clubhouse. The permanent background is `public/pickem-viking-table.webp`; all standings, records, dates, schedules and controls remain live HTML/API content. The new surface uses cool graphite glass with steel borders and limited whiskey-gold accents rather than the prior brown card treatment. The Pick ’Em scoring/auth/data model is unchanged.
