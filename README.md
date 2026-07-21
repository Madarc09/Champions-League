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
- Manager login records and server-side sessions.
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

### Nick locker compact-card update
Nick's Locker Room now uses a precisely aligned centre overlay with three player cards per row. Each card places the player name above a rectangular NHL headshot, compact statistics beside the image, and the fantasy-point total by itself beneath the image.

### Nick locker card readability update
- Larger player names, stat text, fantasy totals, and headshots.
- Tighter spacing between stat labels and values.
- Every displayed statistic now includes the fantasy points generated by that category.

## Nick Locker Room flip-card update

Nick's Locker Room now displays compact hockey-card fronts with only the player name, NHL headshot, and total fantasy points. Selecting a player flips and lifts the card to reveal the complete 2025-26 stat breakdown and the fantasy-point contribution of each category. Only one card is expanded at a time.

## Nick locker card update

The locker front now displays each complete NHL headshot with only the player name and total fantasy points. Selecting a player opens a large animated hockey card with the full 2025–26 stat and fantasy-point breakdown. Close the card with the × button, the Escape key, or by selecting the shaded background.

## Nick locker card design update
- Removed the projected-lineup instruction strip from the locker.
- Shifted the full roster grid slightly left to align with the empty locker opening.
- Reworked the player popup into an original black-and-gold, circular-photo, landscape hockey-card design inspired by premium mid-1990s cup-chase inserts. It does not use copied card artwork, logos, or scans.

## Multi-source player rankings

Nick's locker-room hockey card now compares each selected player across NHL.com,
ESPN, Yahoo's latest public pre-rank, CBS Sports' Top 200, and the Champions
League's own 2025-26 scoring rank. The server caches the combined snapshot in the
existing Upstash database when those environment variables are connected. It
also keeps verified fallbacks for key roster players when a publisher blocks an
automated refresh.

## Mobile hockey-card popup

The Nick Locker Room popup has a dedicated phone layout at 720px and below. It is viewport-fixed, vertically stacked, scrollable, and uses phone-sized typography rather than inheriting measurements from the wide locker canvas. Desktop presentation is unchanged.


## Latest mobile locker update

- The complete Nick locker stage is scaled down on phones so substantially more of the roster is visible at once.
- The phone view opens centred on the projected roster.
- Horizontal touch scrolling remains enabled so either side locker can still be viewed.
- Desktop sizing and the mobile player popup card are unchanged.

## Mobile locker/card follow-up

- Keeps the zoomed-out mobile locker width and horizontal scrolling.
- Stretches the mobile locker vertically to use the visible space beneath the header.
- Renders the player hockey-card popup directly under the document body so the scaled/scrollable locker cannot distort or clip it.
- Desktop locker and desktop popup styling are unchanged.

## Locker Room pages

Every manager now has a Draft Room and Locker Room:

- `/team/joe/locker-room`
- `/team/lucas/locker-room`
- `/team/dan/locker-room`
- `/team/adam/locker-room`
- `/team/darren/locker-room`
- `/team/nick/locker-room`
- `/team/rob/locker-room`
- `/team/ernie/locker-room`

Each page reads that manager's own saved roster, statistics, ranking cards, and total fantasy points. Until custom artwork is created for the other managers, all pages intentionally use Nick's finished locker as a temporary background. Replace individual paths in `data/locker-config.js` as each background is completed.

## Individual Locker Room backgrounds

Each manager now has a separate 1672×941 background in `public/`, selected in
`data/locker-config.js`. The centre roster area stays in the same location on
every image, so future artwork changes do not require changing the roster CSS.

Current themes:
- Joe: Edmonton/Oilers wall, three Basement Bar championships.
- Lucas: retired dirty-moustache room, three Basement Bar championships.
- Dan: retired dirty-moustache room, one Basement Bar championship.
- Adam: retired gaming/hockey room. The exact title count was not supplied, so
  the header currently says only `CHAMPION` rather than inventing a number.
- Darren: Vegas-style wall, one Forever League championship.
- Rob: Matthew Knies/Leafs room, one Basement Bar championship and no Forever title.
- Ernie: Blues Brothers/St. Louis room, one Forever League championship.
- Nick: existing custom locker retained unchanged.

## Live fantasy standings and locker navigation

The home standings table now ranks all eight managers by the summed fantasy points of their saved roster. The calculation uses the active player-stat snapshot and automatically falls back to the fantasy-point values stored with each roster.

Each Locker Room displays the manager's total fantasy points and current place. The lower-left and lower-right locker links follow the live standings order: the higher-ranked neighbour is on the left and the lower-ranked neighbour is on the right. First place has no left link, and last place has no right link.

Shared rosters are read from the existing Upstash connection. Browser-only roster saves are also included on that browser.

## Joe concert-stage background
Joe now uses the Oilers concert-stage artwork while retaining the shared roster overlay, standings navigation, and mobile behavior.

- Updated roster transparency: occupied cards approximately 60% transparent and empty slots approximately 80% transparent.

## Arena home dashboard

The home page now uses `public/champions-home-arena.png` as a full-width arena background. All text and data are HTML overlays rather than baked into the image.

The live dashboard includes:

- Eight-team standings ranked only by total fantasy points from saved rosters.
- Top 10 forwards, top 10 defence, top 10 goalies and a top-five rookie race.
- Player headshots, NHL team, fantasy points and the Champions League manager(s) rostering each player.
- A transparent `public/champions-league-logo.png` watermark generated from the supplied league logo.
- NHL 2025–26 regular-season statistics using the scoring values in `data/league-config.js`.

The player leaderboard endpoint is `app/api/home-dashboard/route.js`. The home display is `components/HomeDashboard.js`.

## Future Predictions

Every league manager now has a predictions page at:

```text
/team/<manager>/predictions
```

The page saves six player-award predictions and four NHL team predictions. It uses the full NHL player directory, filters Vezina/Norris/Calder choices by eligibility, restricts the conference champion dropdowns to the correct conference, and loads NHL team logos from the NHL standings/team assets feed. Predictions use the same Upstash environment variables as saved rosters and fall back to browser storage when Upstash is unavailable.

## Mobile home page

The mobile home page retains the original horizontally scrollable arena composition. Its standings panel has been narrowed so the complete manager name and FPTS column open together on a phone; the Top Performers panel remains one horizontal swipe to the right.

## Manager login database

The Draft Room and Future Predictions pages now require a manager login. Locker Rooms and the public standings remain viewable by everyone.

Manager accounts are automatically seeded into the existing Upstash Redis database the first time someone signs in. Passwords are stored as salted `scrypt` hashes; plaintext passwords are never written to Redis.

Temporary starter credentials are case-insensitive:

| Username | Starter password |
|---|---|
| Joe | `eoj` |
| Lucas | `sacul` |
| Dan | `nad` |
| Adam | `mada` |
| Darren | `nerrad` |
| Nick | `kcin` |
| Rob | `bor` |
| Ernie | `einre` |

Each password is simply the manager name written backwards. These intentionally simple starter passwords should be replaced with manager-selected passwords after the login flow is confirmed.

Authentication behaviour:

- Login page: `/login`
- Sessions are random, server-side Upstash records lasting 30 days.
- The browser receives only a secure, HTTP-only session cookie.
- A manager can save only their own roster and predictions.
- Visiting another manager's Draft Room or Predictions page redirects to the signed-in manager's page.
- Other managers' Locker Rooms remain public for standings navigation.
- Logging out destroys the server-side session.

Upstash is required for authentication. The existing `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` environment variables are reused; no additional database is needed.

## Private Upstash manager data

The site accepts either Vercel/Upstash credential naming convention:

- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
- `KV_REST_API_URL` + `KV_REST_API_TOKEN`

Roster selections (draft picks), Locker Rooms, and Future Predictions are private to the authenticated manager. The roster and predictions API routes verify the server-side session on both reads and writes; changing the URL cannot reveal another manager's data.

The public home page receives only aggregate team fantasy-point totals. It does not receive roster player IDs, player ownership, predictions, or full roster objects. Player ownership on the Top Performers panel is therefore labelled private.

Older browser-only roster and prediction saves are migrated once into the signed-in manager's private Upstash records. The browser copy is deleted only after the migration succeeds. New versions no longer use browser storage as a save fallback.

Locker Rooms now require login and redirect managers back to their own room if they try another manager's URL. Neighbouring standings positions may still be shown visually at the bottom of the locker, but they are no longer clickable roster links.

## Public Locker Rooms with private rosters

All eight Locker Room routes are publicly viewable. The signed-in manager sees their own saved roster, while every other visitor sees TBA placeholders in that locker. Team fantasy-point totals, standings position, backgrounds, and previous/next Locker Room navigation remain public. Draft Room and Predictions data remain private to the matching manager account.
