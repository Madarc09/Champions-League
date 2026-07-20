# Champions League Fantasy Hockey

A Vercel-ready Next.js site for the Champions League salary-cap fantasy league.

## Current build

- Home page standings with links for Joe, Lucas, Dan, Adam, Darren, Nick, Rob, and Ernie.
- Individual draft room and saved roster page for every manager.
- Complete 2025–26 NHL regular-season leaderboard plus current zero-game rookies and recent 2024–2026 NHL draft picks.
- Click a player name to add him; click his NHL headshot on the projected roster to remove him.
- Search by player or NHL team.
- Filters for all players, forwards, defence, and goalies.
- NHL.com player headshots and current team information appear directly on the draft board when available. Zero-game prospects fall back to the player silhouette until NHL publishes a headshot.
- Every statistical leaderboard category is sortable:
  - Player name
  - 2026–27 salary
  - Position
  - Goals
  - Assists
  - Hits
  - Shots on goal
  - Fantasy points
- Salaries load for the entire leaderboard before the table opens. There is no per-player salary button.
- Sticky leaderboard headings.
- Daily Faceoff-style projected lineup:
  - Four forward lines
  - Three defence pairs
  - Two goalie spots
- Sticky projected-roster header showing cap remaining, cap used, roster size, and league cap.
- Automatic cap and position validation.
- Rosters can be edited and re-saved at any time until a future deadline feature is added.
- Shared roster storage through Upstash Redis, with a browser-storage fallback.

## League settings

The 2026–27 NHL salary cap is set to **$104,000,000**.

Required roster:

- 12 forwards
- 6 defence
- 2 goalies

Different Champions League teams may select the same NHL player. A player cannot appear twice on one manager's roster.

## Fantasy scoring

Skaters:

- Goal: 2.0
- Assist: 1.5
- Hit: 0.25
- Shot on goal: 1.0

Goalies:

- Save: 0.25
- Goal against: -1.0
- Win: 5.0
- Goal: 50.0
- Assist: 7.0

All values are easy to edit in:

```text
data/league-config.js
```

## Salary source

The NHL statistics service does not include contracts or cap hits. This build uses the open-source **CapSpace** project that was shared through the hockey development community on Reddit.

The server loads all 32 CapSpace team contract pages together, reads the first 2026–27 cap-hit column in both the NHL roster and signed non-roster sections, combines the results into one salary snapshot, and caches that snapshot. This includes signed rookies who have not played an NHL game. This avoids the old per-player lookup that blocked the Draft action and returned inconsistent values.

Salary snapshot behaviour:

- One league-wide refresh instead of one request every time a player is clicked.
- Six-hour normal refresh interval.
- Seven-day Upstash fallback snapshot if CapSpace is temporarily unavailable.
- Players without a signed 2026–27 contract remain visible but are marked unsigned and cannot be selected.
- Previously saved roster cap hits are replaced with the latest loaded snapshot when the team page opens.

CapSpace data is community-maintained and may trail a brand-new transaction briefly. The project also retains the existing private CSV/admin salary tools as an emergency correction path, but league users cannot alter salaries from the draft page.

## GitHub and Vercel

The ZIP is arranged with `package.json`, `app`, `components`, `data`, and `lib` at its top level.

1. Extract the ZIP.
2. Upload the extracted contents directly to the GitHub repository.
3. Import that repository into Vercel.
4. Leave the Framework Preset as **Next.js**.
5. Leave the build, install, and output-directory settings at their defaults.

## Connect Upstash

In Vercel, open **Settings → Environment Variables** and add:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Copy both values from the existing Upstash Redis database, apply them to Production, Preview, and Development, and redeploy.

Upstash stores:

- Shared manager rosters.
- The latest complete salary snapshot, including a stale fallback if the live source is temporarily unavailable.

Without Upstash, rosters still save in the current browser and salary requests still use Next.js/Vercel caching.

## Optional admin key

To protect salary refresh or emergency import endpoints, add:

```text
ADMIN_KEY
```

The normal draft-room experience does not require an admin key.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Main files

```text
app/page.js                         Home page and standings
app/team/[team]/page.js             Individual manager page
components/RosterBuilder.js         Sortable draft room and projected lineup
app/api/players/route.js            NHL stats plus full salary snapshot
app/api/rosters/[team]/route.js     Shared roster loading and saving
app/api/salaries/refresh/route.js   Forced salary refresh for an administrator
lib/nhl.js                          NHL stats, current zero-game rookies, recent draft classes, rosters, and headshots
lib/capspace-snapshot.js            League-wide 2026–27 salary loader and cache
data/league-config.js               Teams, cap, roster limits, and scoring
```


- Filter the draft board with an NHL team dropdown beside the position buttons.

## Nick's Locker Room

Nick's Draft Room now includes a **Locker Room** subpage at `/team/nick/locker-room`. It loads the same saved roster from Upstash (or the browser fallback), refreshes the saved players against the current player snapshot, and displays the 2025–26 stats in the open centre of `public/nick-locker-room.png`.
