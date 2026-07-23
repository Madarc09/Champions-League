# Champions League Fantasy Hockey

A Vercel-ready Next.js site for the Champions League salary-cap fantasy league.

## Current build

- Home page standings with links for Joe, Lucas, Dan, Adam, Darren, Nick, Rob, Ernie, and Ethan.
- Individual draft room and saved roster page for every manager.
- Complete 2025–26 NHL regular-season leaderboard plus current zero-game rookies and recent 2024–2026 NHL draft picks.
- Click a player image to inspect his projection, use the Draft button to add him, and use the × control in the projected roster to remove him.
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
- Compact projected roster beside the player pool:
  - 12 forward spots
  - 6 defence spots
  - 2 goalie spots
- Sticky projected-roster header showing cap remaining, cap used, roster size, and league cap.
- Automatic cap and position validation.
- Rosters can be edited and re-saved at any time until a future deadline feature is added.
- Shared private roster storage through Upstash Redis. An older browser copy is read only as an emergency recovery aid if one already exists.

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
- Shutout: 5.0
- Goal: 50.0
- Assist: 7.0

All values are easy to edit in:

```text
data/league-config.js
```

## Frozen 2026–27 salary master

The salary audit is complete. The project now contains the full static league salary database:

- **32 NHL teams**
- **2,197 player records**
- **1,425 signed 2026–27 cap hits**
- **772 `$0` records** for players without a listed 2026–27 contract
- **750 active-roster**, **732 non-roster**, and **715 unsigned draft-choice** records

The source workbook and its deployment copies are:

```text
data/SALARY_CAP_MASTER_2026-27.xlsx   Complete audited workbook
data/SALARY_CAP_MASTER_2026-27.csv    Version-control-friendly master
data/SALARY_CAP_SPACE.json             Runtime salary source used by the website
data/SALARY_CAP_SPACE_ZERO_LIST.csv    Every unsigned/$0 record
```

The Draft Room reads `data/SALARY_CAP_SPACE.json` **exclusively**. It no longer refreshes salaries from CapSpace, a salary API, Redis, or a manager-entered override. This keeps every manager on the same frozen one-year salary table.

A `$0` entry means that the master does not contain a signed 2026–27 cap hit. The player remains visible but cannot be drafted as a free player. Buyouts, retained salary, bonus carryovers, and other non-player cap charges are excluded from the master.

Player matching uses NHL team, normalized player name, and position. Team-code aliases are normalized (`NAS` → `NSH`, `WAS` → `WSH`), and the two Vancouver players named Elias Pettersson remain separate through the forward/defence position key.

To rebuild the runtime JSON and CSV copies after intentionally editing the master CSV:

```bash
npm run build:salaries
npm run validate:salaries
```

The player identity pass in `lib/nhl.js` still removes duplicate NHL feed records before the Draft Room is returned.

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

Without Upstash, manager login and shared roster saving are unavailable. The bundled frozen salary master still supplies every normal salary.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Main files

```text
app/page.js                              Home page and standings
app/team/[team]/page.js                  Individual manager page
components/RosterBuilder.js              Sortable draft room and projected lineup
app/api/players/route.js                 NHL stats plus frozen master salary matching
app/api/rosters/[team]/route.js          Shared roster loading and saving
lib/salary-cap-space.js                  Team/name/position salary indexes
data/SALARY_CAP_MASTER_2026-27.xlsx      Complete 32-team source workbook
data/SALARY_CAP_MASTER_2026-27.csv       Static source used for future rebuilds
data/SALARY_CAP_SPACE.json               Exclusive runtime salary source
data/SALARY_CAP_SPACE_ZERO_LIST.csv      Unsigned and $0 records
scripts/build-static-salary-master.mjs   Rebuild JSON/CSV from the master CSV
scripts/validate-static-salary-master.mjs Validate counts, duplicates, and special identities
lib/nhl.js                               NHL stats, rookies, draft picks, rosters, headshots, deduplication
data/league-config.js                    Teams, reveal date, cap, roster limits, and scoring
data/player-projections-2026-27.js       Editorial static projection overrides
lib/static-projections.js                Full-pool static review and scenario ranges
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
- `/team/ethan/locker-room`

Each page reads that manager's saved roster, statistics, ranking cards, public predictions, and total fantasy points. Before opening day, the owner can see the roster while other visitors receive a sealed-roster display. Every manager has a separate background selected through `data/locker-config.js`.

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
- Ethan: general hockey room with subtle Edmonton-style navy/orange accents and one Stanley Cup in the Forever Pool display.
- Nick: existing custom locker retained unchanged.

## Live fantasy standings and locker navigation

The home standings table now ranks all nine managers by the summed fantasy points of their saved roster. The calculation uses the active player-stat snapshot and automatically falls back to the fantasy-point values stored with each roster.

Each Locker Room displays the manager's total fantasy points and current place. The lower-left and lower-right locker links follow the live standings order: the higher-ranked neighbour is on the left and the lower-ranked neighbour is on the right. First place has no left link, and last place has no right link.

Shared rosters are read from the existing Upstash connection. Before the reveal date, individual player selections never leave the roster API for another manager; only aggregate team totals are used by the public standings endpoint.

## Joe concert-stage background
Joe now uses the Oilers concert-stage artwork while retaining the shared roster overlay, standings navigation, and mobile behavior.

- Updated roster transparency: occupied cards approximately 60% transparent and empty slots approximately 80% transparent.

## Arena home dashboard

The home page now uses `public/champions-home-arena.png` as a full-width arena background. All text and data are HTML overlays rather than baked into the image.

The live dashboard includes:

- Nine-team standings ranked by completed-season fantasy points, with a separate 2026–27 projected team-points column.
- Top 10 forwards, top 10 defence, top 10 goalies and a top-five rookie race.
- Player headshots, NHL team and fantasy points. Private manager roster assignments are not shown before opening day.
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

The Draft Room requires a manager login. Locker Rooms, submitted season/player predictions, projection cards, and public standings remain viewable by everyone. Only the manager who owns a team can edit that team's roster or predictions.

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
| Ethan | `nahte` |

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

Each manager's roster is independent: Joe, Nick, Ethan, or any other manager may draft the same NHL player. The only duplicate restriction is that one NHL player cannot appear twice on the same manager's roster.

Roster identities remain private during the draft. Before **September 29, 2026**, another manager's Locker Room returns no roster objects or player IDs and shows only the public season/player predictions plus a sealed-roster notice. The roster API automatically changes to public read access when the 2026–27 NHL regular season begins; roster writes always remain restricted to the authenticated owner.

The public home page receives only aggregate team totals: completed 2025–26 fantasy points and 2026–27 projected fantasy points. Before opening night it does not receive roster player IDs or full roster objects. Submitted season and player predictions are public in every Locker Room, while only the authenticated owner receives editing controls.

Older browser-only roster and prediction saves are migrated once into the signed-in manager's private Upstash records. The browser copy is deleted only after the migration succeeds. New versions no longer use browser storage as a save fallback.

## Nick Locker Room prediction-panel update

- Nick now uses `public/nick-locker-room.png`, the rustic Toronto sports cabin artwork.
- Nick's submitted team predictions render in the left prediction panel.
- Nick's submitted player-award predictions render in the right prediction panel.
- Prediction selections refresh from Upstash about every three seconds while the page is open.
- Other viewers see the submitted choices, or solid TBA tiles when no selection has been made. Only Nick receives the editing controls.
- Nick-specific roster, total-points, and standings-neighbour overlays were realigned to the new artwork.

## Prediction candidate menus

The Future Predictions page is optimized to fit within a normal desktop browser window. Each player-award menu initially shows 25 expected candidates. The expected list uses the cached NHL.com and ESPN 2026-27 fantasy rankings when available, with 2025-26 award-specific production as the fallback ordering. Each award also has a search field that can find any eligible player outside the suggested 25. Team conference restrictions and private Upstash auto-save remain unchanged.

## Locker Room prediction editing

Future Predictions are now edited directly inside each manager's private Locker Room.

- Click any team logo or player headshot in the prediction panels to edit that category.
- Team choices are restricted by conference where required.
- Player awards open with the top 25 expected candidates and provide full eligible-player search.
- Changes save immediately to the manager's private Upstash record.
- The former `/team/<manager>/predictions` URL redirects to that manager's Locker Room.

## Final manager backgrounds and solid TBA predictions

- Rob now uses the Matthew Knies / Leafs background.
- Ernie now uses the Blues Brothers background.
- Adam now uses the Team Canada / Dirty Doni background.
- Empty prediction selections now render as solid, high-contrast panels so the background does not show through them.
- Rob, Ernie, and Adam use the outer prediction-well alignment shared by Joe, Darren, Lucas, and Dan.


## Draft room visual update

The draft room uses a compact 60/40 workspace: the searchable player pool and pinned Projected Performance card occupy the left side, while the complete 20-player projected roster remains visible on the right. Projected values stay separate from completed-season draft-board statistics.

---

## Champions Projection Database (Model 2.0)

The Draft Room builds a searchable 2026–27 projection for every player returned by the NHL player pool. **Static Projection Board 2.0** covers the entire pool: 50 editorial overrides are stored directly in `data/player-projections-2026-27.js`, and every remaining player is passed through the frozen full-board review rules in `lib/static-projections.js`. No player is labelled as a random or missing-model fallback.

### Four model components

1. **NHL three-season production and usage**
   - Uses 2025–26, 2024–25 and 2023–24 regular-season reports.
   - Seasons are weighted 55% / 30% / 15%.
   - Skaters use games, goals, assists, shots, hits, total ice time and the separate NHL power-play report.
   - Birth date from the current NHL roster feed adds a small age-curve adjustment for development or decline; it is deliberately bounded so age cannot overpower proven production.
   - Goalies use games, wins, saves, goals against, shutouts, goals and assists.
2. **MoneyPuck three-season expected-stat model**
   - Uses the approved downloadable skater and goalie summaries for the same three seasons.
   - Goals use talent-adjusted expected goals or xG when available.
   - Shots use expected shots on goal.
   - Assists use primary plus secondary assists.
   - Goalies use xGA, GSAx, saves and save percentage.
3. **Role, linemate and team/coach environment**
   - Uses recent NHL ice time and power-play usage.
   - Uses the player's most-used MoneyPuck five-on-five line/pair and that unit's xGF/60.
   - Uses team five-on-five xGF/60 or xGA/60 as a coach/system environment proxy.
   - Confirmed offseason changes can be entered in `data/projection-context.js`, including a new coach, announced line, PP promotion, reduced workload or expected starter share. The file is intentionally empty by default so the model does not invent offseason information.
4. **Independent public-rank sanity check**
   - Uses NHL.com, ESPN, Yahoo and CBS rank signals already collected by `lib/rankings.js`.
   - This is only a small 5–10% guardrail. A high ranking no longer applies the same blanket boost to every category.

### Important safeguards

- Established stars are anchored to their own three-season level, not pulled toward an average NHL forward. This prevents results such as Connor McDavid falling to 26 goals solely because of league-average regression.
- Each category has its own weights. Hits lean most heavily on the player's historical style, while goals and goalie results give more weight to expected-stat inputs.
- For established players, the final category result is bounded around the three-season baseline so one damaged or missing feed cannot create an absurd projection.
- Projection cards store the four candidate values, final category value, confidence, source list and a category-by-category explanation showing the three-season, advanced-stat and role/environment estimates behind each increase or decrease.
- Draft-table FPTS remain completed 2025–26 fantasy points. A separate PROJ column shows the balanced 2026–27 projected fantasy total, while the full floor/balanced/upside detail remains inside the Projected Performance card.

### Files

- `lib/nhl-history.js` — downloads and caches three seasons of NHL player production and usage.
- `lib/moneypuck.js` — downloads and caches three seasons of MoneyPuck skater/goalie summaries plus current line and team data.
- `data/player-projections-2026-27.js` — authoritative editorial floor/balanced/upside overrides and static-board metadata.
- `data/projection-context.js` — documented manual layer for confirmed coach, line, PP and workload changes.
- `lib/projections.js` — Champions Projection Model 2.0 ensemble, category calculations, bounded age curve and explanation generator.
- `lib/static-projections.js` — full-pool static review policy, category guardrails, three-scenario ranges and final fantasy-point calculation.
- `app/api/players/route.js` — attaches projections to every searchable player.
- `components/RosterBuilder.js` — searchable projection cards, actual-versus-projected comparisons and explanations.

### Data attribution and limits

MoneyPuck lists its downloadable data as free for non-commercial use with attribution. This private friends-pool project uses only the files listed on MoneyPuck's approved data page: `https://moneypuck.com/data.htm`.

The values are **Champions League estimates**, not official projections from the NHL, MoneyPuck, ESPN, Yahoo or CBS. Statistical feeds cannot know an unannounced future line or coaching decision, so confirmed offseason information belongs in `data/projection-context.js` and should include a dated note.

## Draft board and locker-room correction

- Draft player rows now read left-to-right as position, player image, player name with salary and inline NHL team logo, goals, assists, shots, hits, completed-season FPTS, projected FPTS, and the Draft action.
- The completed and projected fantasy-point columns are labelled separately and fit within the board without horizontal scrolling.
- Projection cards now compare every displayed category against last season, show a signed increase/decrease, and include a brief model explanation.
- Locker Room team predictions now display Stanley Cup and Presidents Trophy on the top row, with West and East champions beneath them.


## Final roster-privacy, scoring, Ethan, and projection-board update

- Champions League drafts are independent. A player chosen by one manager remains available to every other manager, while duplicate entries inside one roster are still blocked.
- Locker-room rosters remain sealed from other visitors until **5:00 p.m. ET on September 29, 2026**, when the NHL regular season begins. Before that date only the owner's roster and everybody's public predictions are available. The reveal changes automatically at opening night through `ROSTER_REVEAL_AT` in `data/league-config.js`.
- The home standings continue to expose only aggregate completed-season and projected team points.
- Goalie shutouts now score **5 fantasy points** everywhere: actual NHL totals, hockey cards, projection cards, projected team totals, and the scoring breakdown.
- Ethan is a complete ninth manager with login, Draft Room, standings entry, public predictions, and a general-hockey Locker Room. His room records one Forever Pool championship and displays one cup.
- The Draft Room remains a 60/40 workspace with a tightly spaced, no-horizontal-scroll ten-column player table.
- Static Projection Board 2.0 covers the complete NHL pool. The 50 existing editorial overrides remain authoritative, while every other player receives a deterministic floor/balanced/upside static review built from the multi-source model and protected by personal-rate guardrails.

## All-player static review record

The projection work is intentionally separated into two layers so it can be revisited without touching React layout code:

1. **Editorial overrides** — `data/player-projections-2026-27.js` stores the hand-reviewed top tier. Each entry contains floor, balanced, upside, and written reasoning.
2. **Full-board static review** — `lib/static-projections.js` covers every remaining player returned by the NHL pool. It freezes the review methodology for the season and converts the multi-source model into three stable scenarios.

The full-board review follows these rules:

- Established skaters are anchored to their own completed-season per-game rates at the projected workload.
- The NHL/MoneyPuck/usage/environment model is blended with that player-specific baseline; missing data is ignored rather than treated as zero.
- Goals and assists have wider growth bands for young players and tighter decline/growth bands for established veterans.
- Shots and hits use tighter category guardrails because they reflect repeatable role and playing style.
- Goalies project games, wins, saves, goals against, and shutouts separately.
- Every player receives floor, balanced, and upside scenarios plus a written explanation.
- The balanced scenario is the only number used for the Draft Room projected-FPTS column and team projected totals.
- Confirmed future changes—coach, linemates, PP unit, injury recovery, starter share—belong in `data/projection-context.js` with a dated note.

This README is the permanent projection rulebook. Future projection reviews should change the data/contexts and model version here rather than silently replacing numbers inside the interface.

### What “all-player static review” means in this build

- The 50 named editorial entries are literal records committed in `data/player-projections-2026-27.js`.
- Every additional player receives a deterministic season review from `lib/static-projections.js`; the same inputs always produce the same floor, balanced, and upside line.
- Those remaining records are **model-reviewed rather than individually hand-written**. The interface labels the difference as `EDITORIAL REVIEW` or `STATIC REVIEW` instead of pretending every player received the same level of manual research.
- The live NHL directory supplies the complete player list, so rookies, signings, and newly listed players are covered without editing React code.
- The static-board metadata and this section preserve the model version, review rules, and source files needed to revisit any player later.

### Editorial override index (50 players)

Connor McDavid, Nathan MacKinnon, Nikita Kucherov, Macklin Celebrini, Leon Draisaitl, David Pastrnak, Kirill Kaprizov, Cale Makar, Jason Robertson, Matt Boldy, Zach Werenski, Quinn Hughes, Andrei Vasilevskiy, Martin Necas, Nick Suzuki, Wyatt Johnston, Auston Matthews, Jack Hughes, Cole Caufield, Brady Tkachuk, Evan Bouchard, Jack Eichel, Mikko Rantanen, Matthew Tkachuk, Lane Hutson, Logan Thompson, Connor Hellebuyck, Ilya Sorokin, Cutter Gauthier, Kyle Connor, Tage Thompson, Mark Scheifele, Dylan Guenther, Leo Carlsson, Jake Guentzel, Brandon Hagel, Sam Reinhart, Aleksander Barkov, Rasmus Dahlin, Matthew Schaefer, Jake Oettinger, Igor Shesterkin, Clayton Keller, William Nylander, Sidney Crosby, Artemi Panarin, Adrian Kempe, Alex DeBrincat, Mitch Marner, and Tim Stutzle.


## Draft Room AI Generated tab

The Draft Room now has two internal views: **Player Pool** and **AI Generated**. The AI Generated view is a local decision-support tool; it does not expose another manager’s roster and the random generator does not overwrite the user’s saved roster.

### Roster Assister

The assister accepts a position, number of remaining spots and a total salary budget. It creates several legal packages from the signed player pool:

- Projected Ceiling
- Best Projected Fantasy Points per Game
- Best Value per $1 million
- Balanced Spend

It also includes an affordable-player board that can be sorted by salary followed by projected FPG, salary followed by projected FPTS, projected FPG, projected FPTS or value. The **Use my remaining needs** button fills the controls from the manager’s current private roster and cap space.

### Random roster generator

The generator creates a private 12-forward, 6-defence and 2-goalie simulation under the league salary cap. Styles include Balanced, High-End + Rookie Fillers, Forward Heavy, Defence Heavy, Goalie Heavy, Highest Projected FPTS, Highest Projected FPG, Best Value, Young Upside, Safe Veterans, Boom or Bust and Random Chaos. Generated teams remain inside the AI Generated view and never replace the actual saved roster.

### Players with zero NHL games

When a player has no NHL games played, the Player Pool displays the static projected G/A/SOG/HIT and projected FPTS in blue instead of misleading zeroes. The separate P-FPTS column remains the official projection column.

### Mobile home standings

The mobile arena board uses a taller standings area so all nine managers, including ninth place, remain visible.
