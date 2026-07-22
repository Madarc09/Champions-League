# Champions League salary-cap completion

Completed July 22, 2026.

## What changed

The draft room no longer depends on a salary-site refresh every time a manager opens the player pool.

On the first player-pool request after deployment, the server:

1. Loads the existing mostly complete 2026–27 contract snapshot.
2. Applies the verified recent-contract corrections in `data/verified-salary-corrections.js`.
3. Saves the finished salary master permanently in Upstash Redis.
4. Uses that frozen master for all future draft-room requests.

The frozen table is not refreshed automatically. This makes the league salary values stable after they are established.

## Verified corrections retained

- Jason Robertson — Dallas — $12,000,000 cap hit — one year.
- Gavin McKenna — Toronto — $1,075,000 cap hit — entry-level contract safeguard for the new prospect pool.

The recent-contract audit file checked 14 prominent July signings against the existing source. Robertson was the confirmed lagging entry; the other 13 were already present.

## Salary priority

For each player, the draft room now uses:

1. A Nick-saved league correction, when one exists.
2. The frozen 2026–27 salary master.
3. The verified rookie/name safeguard.
4. `Unsigned` when no valid cap hit exists.

An unresolved player cannot be drafted as a free `$0` player.

## Nick-only controls

When Nick is authenticated, the Draft Room includes a **Salary Admin** tab. Nick can:

- Search every player or team.
- Show unresolved players only.
- Save a cap hit using formats such as `12000000`, `12m`, or `850k`.
- Download the exact player-pool salary table as a CSV.
- Explicitly rebuild the frozen master when the league intentionally wants a new snapshot.

Salary write, export, and rebuild routes verify Nick's server-side login session. Other managers cannot use those routes by manually entering the URL.

A correction updates Nick's current page immediately. Other open manager pages poll the shared correction table every 30 seconds, and all new page loads use the corrected figure.

## Duplicate-player protection

The combined NHL statistics, roster, and prospect feeds now receive a final identity-deduplication pass. It prefers the official NHL record and merges useful metadata, preventing a player such as Macklin Celebrini from appearing twice under separate feed records.

## Files added or changed

- `lib/static-salary-master.js`
- `data/verified-salary-corrections.js`
- `app/api/players/route.js`
- `app/api/salaries/route.js`
- `app/api/salaries/refresh/route.js`
- `app/api/salaries/export/route.js`
- `components/RosterBuilder.js`
- `app/globals.css`
- `lib/nhl.js`
- `README.md`

## Deployment behavior

Upload this project over the current GitHub/Vercel project while retaining the existing Upstash environment variables. The first successful player-pool load creates the frozen master under a new Redis key, so it will not overwrite rosters, logins, or prior salary corrections.

After deployment, sign in as Nick and open **Salary Admin**. The header reports:

- frozen master contract count;
- unresolved player-pool count;
- verified correction count.

The CSV export is available from the same tab.

## Validation performed

- Every server, data, library, and script file passed `node --check`.
- The modified JSX and API files passed TypeScript syntax parsing with `allowJs`.
- Nick-only authorization exists on save, export, and rebuild routes.
- Blank salaries remain unresolved rather than becoming `$0`.
- Players without a valid salary are blocked from drafting.

A full `next build` was not run in this workspace because the uploaded checkpoint did not include `node_modules` and the execution environment could not download the missing npm package cache. Vercel will install the locked dependencies during deployment.
