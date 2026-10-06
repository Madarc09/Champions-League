# Champions League 2026–27 — V12 Pick ’Em Exact-Asset Rebuild

This build replaces the Pick ’Em presentation with the exact user-approved assets supplied in-chat:

- `public/pickem-long-table-final.png` — exact long-table room background
- `public/pickem-logo-final.png` — exact transparent NHL PICK’EM title graphic

The Pick ’Em page itself now consists of only three visual layers:

1. Exact background photograph
2. Live API-driven translucent Pick ’Em standings and weekly calendar
3. Exact transparent PICK’EM logo overlay

All existing Pick ’Em behavior remains intact: manager opt-in, W=2 / L=0 / OTL=1 scoring, weekly schedule, saved picks, live scores, collapsible days, matchup info, personal records, and Redis persistence.

No fake navigation, standings, dates, or scores are baked into the new page design.

## V12.1 — Open Clubhouse + Endless Table
- `/mini-games` is publicly viewable; existing pool-manager authentication is only required when saving a pick.
- Matchup Info is viewable before login. Personal pick history appears after signing in.
- The opt-in leaderboard rule is unchanged: a manager is listed only after saving at least one pick.
- Expanded game-day sections now extend over a table-only texture derived from the approved Pick 'Em room art, so the wooden tabletop continues below the original image height.

## V12.2 mobile standings cleanup
- Added a permanent HOME link to the Pick 'Em page.
- On phones, Pick 'Em standings use a compact six-column ledger: Rank, Manager, W, L, OTL, PTS.
- Desktop standings remain unchanged with GP, recent form and win percentage.
- Dynamic leaderboard values remain live; Nick currently displays 0-0-0 and 0 PTS while no picks are settled.

## V14 — Skynet Pick 'Em
- Skynet T-104 is now a real Pick 'Em participant using the same W=2 / OTL=1 / L=0 standings rules.
- Tuesday, October 6, 2026 is bootstrapped automatically on the first Pick 'Em load after deployment (only for games that have not started).
- Future daily Skynet picks are generated at midnight America/Toronto via `/api/cron/pick-em-skynet`.
- Two UTC cron windows cover EDT/EST; the handler only runs when Toronto local hour is midnight.
- If a cron is missed, Pick 'Em page/API load safely fills only still-unstarted games for the current day.
- Skynet chooses from current NHL record/points rate, recent form, goal differential, home/road performance and a small home-ice factor.
- Pick and settled-result events for all managers are mirrored into a private Redis audit list (`champions-league:mini-games:pick-em:v1:private-history`). No public API exposes that history.
