# Champions League Fantasy Hockey

A Vercel-ready website for an eight-manager salary-cap fantasy hockey league.

## Current build

- Home page with standings and links for Joe, Lucas, Dan, Adam, Darren, Nick, Rob, and Ernie.
- Separate roster page for every manager.
- Scrollable 2025–26 NHL player leaderboard sorted by fantasy points.
- Search by player name or NHL team.
- Click a player’s **name** in the leaderboard to add him.
- Click a player’s **name** on the projected lineup card to remove him.
- Rosters remain editable until the league adds a deadline.
- Daily Faceoff-style lineup card:
  - 12 forwards across four lines
  - 6 defence across three pairs
  - 2 goalies
- Salary-cap validation against the **$104,000,000** 2026–27 ceiling.
- Shared roster saving through Upstash Redis, with browser storage as a fallback.
- Duplicate players are allowed on different Champions League teams but not twice on the same roster.

## Fantasy scoring

Skaters:

- Goal: 2.0
- Assist: 1.5
- Hit: 1.0
- Shot on goal: 1.0

Goalies:

- Save: 0.25
- Goal against: -1
- Win: 5
- Goal: 50
- Assist: 7

All values are easy to change in `data/league-config.js`.

## Salary data

The site now looks up 2026–27 cap hits from **CapSpace’s public player contract endpoint**. CapSpace is the open-source NHL cap project shared by its developer community on Reddit. The server first requests the JSON player record using the NHL player ID and then uses the public player page as a fallback.

Salary values appear directly below each player’s name. A player is only added after a valid 2026–27 cap hit is found and the roster passes the cap check.

The included CSV and Upstash salary storage remain available as a backup or override layer:

```text
data/salaries-2026-27.csv
```

## Upload to GitHub

1. Extract the ZIP.
2. Upload the extracted contents directly to the root of the GitHub repository.
3. Confirm `package.json`, `app`, `components`, `data`, and `lib` are visible at the repository’s top level.
4. Commit the files.

## Deploy on Vercel

1. Import the GitHub repository into Vercel.
2. Leave Framework Preset as **Next.js**.
3. Leave Root Directory blank because the project files are already at the repository root.
4. Deploy.

## Connect Upstash for shared rosters

In the Vercel project, open **Settings → Environment Variables** and add:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Apply both to Production, Preview, and Development, then redeploy.

Without Upstash, the roster still works but is saved only in that browser.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Main project structure

```text
app/page.js                         Home page and standings
app/team/[team]/page.js             Individual manager page
components/RosterBuilder.js         Leaderboard, click-to-draft, lineup card, cap, and saving
app/api/players/route.js            NHL 2025–26 statistics
app/api/rosters/[team]/route.js     Shared roster loading and saving
app/api/salaries/lookup/route.js    Automatic 2026–27 salary lookup
lib/capspace-salaries.js            CapSpace JSON integration and HTML fallback
lib/nhl.js                          NHL statistics integration
lib/salaries.js                     Salary cache and CSV/Upstash backup layer
data/league-config.js               League rules, scoring, cap, and teams
```
