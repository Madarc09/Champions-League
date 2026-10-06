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
