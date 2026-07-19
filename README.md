# Champions League Fantasy Hockey

A Vercel-ready starter site for an eight-manager salary-cap fantasy hockey league.

## Included in this first build

- Home page with a standings table.
- Team links for Joe, Lucas, Dan, Adam, Darren, Nick, Rob, and Ernie.
- Separate editable roster page for every manager.
- Scrollable NHL player leaderboard using 2025–26 regular-season statistics, sorted by fantasy points.
- Fantasy-point calculation for skaters:
  - Goal: 2.0
  - Assist: 1.5
  - Hit: 1.0
  - Shot on goal: 1.0
- Fantasy-point calculation for goalies:
  - Save: 0.25
  - Goal against: -1
  - Win: 5
  - Goal: 50
  - Assist: 7
- 2026–27 salary cap set to **$104,000,000**.
- Legal roster limits:
  - 12 forwards
  - 6 defence
  - 2 goalies
- Duplicate players are allowed on different Champions League teams.
- Duplicate players are blocked within the same roster.
- Cap and position validation.
- One-click Draft buttons, roster removal, editing, and re-saving.
- Daily Faceoff-style lineup card with four forward lines, three defence pairs, and two goalie slots.
- Shared storage through Upstash Redis.
- Browser storage fallback before Upstash is connected.
- Automatic 2026–27 cap-hit lookup when players appear in the table or are drafted; league users cannot manually change salaries.

## Important data note

The public NHL statistics service supplies goals, assists, hits, shots, and goalie results. It does **not** supply player contract cap hits.

Because there is no dependable official free NHL contract API, salary information is kept as a separate editable data layer. This prevents the league site from breaking whenever a third-party salary website changes its page layout.

Salary values load automatically from the configured public salary source and are cached in Upstash when connected. The Draft button remains visible; if a cap hit is not loaded yet, pressing Draft performs the lookup first.

## Upload to GitHub

1. Extract the zip file.
2. Open the `champions-league-starter` folder.
3. Create a new empty GitHub repository.
4. Upload **the contents of the folder**, including `app`, `components`, `data`, `lib`, `scripts`, and `package.json`.
5. Commit the files to the repository.

## Deploy on Vercel

1. In Vercel, choose **Add New → Project**.
2. Import the GitHub repository.
3. Leave Framework Preset as **Next.js**.
4. Leave the build settings at their defaults.
5. Deploy.

The site works immediately, but roster and manually entered salary data will initially be saved only in each browser.

## Connect the existing Upstash database

In the Vercel project:

1. Open **Settings → Environment Variables**.
2. Add:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. Copy the matching REST URL and REST token from the existing Upstash database.
4. Apply both variables to Production, Preview, and Development.
5. Redeploy the Vercel project.

After that, rosters and imported salary data are shared across devices.

Salary updates are handled through the CSV import rather than by league users on the draft page.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

Create `.env.local` using `.env.example` when testing shared saving locally.

## Change scoring later

Open:

```text
data/league-config.js
```

Edit only the values inside `SCORING`:

```js
export const SCORING = {
  goals: 2.0,
  assists: 1.5,
  hits: 1.0,
  shots: 1.0
};
```

Fantasy points shown in player search results will update automatically.

## Change teams, cap, or roster sizes

All of these settings are also in:

```text
data/league-config.js
```

- `SALARY_CAP`
- `ROSTER_LIMITS`
- `TEAMS`
- `DEFAULT_STANDINGS`

## Salary CSV import

The included file is:

```text
data/salaries-2026-27.csv
```

Format:

```csv
playerId,name,capHit
8478402,Example Player,12500000
```

The NHL player ID appears in player-search API responses and is stored with every roster player.

With Upstash environment variables available locally, run:

```bash
npm run import:salaries
```

Or import another CSV file:

```bash
node scripts/import-salaries.mjs path/to/file.csv
```

## Current intentional placeholders

- Standings begin at zero because the league scoring/standings update rules have not been defined yet.
- Salary lookups depend on the external salary page being available; successfully resolved values are cached when Upstash is connected.
- Team authentication has not been added yet.

## Main project structure

```text
app/page.js                    Home page and standings
app/team/[team]/page.js        Individual team page
components/RosterBuilder.js    Leaderboard, Draft buttons, lineup card, cap, and saving interface
app/api/players/route.js       NHL stats search
app/api/rosters/[team]/route.js Shared roster loading/saving
app/api/salaries/route.js      Shared salary loading/saving
data/league-config.js          League rules and scoring
lib/nhl.js                     NHL statistics integration
lib/salaries.js                Salary storage layer
scripts/import-salaries.mjs    Bulk CSV importer
```
