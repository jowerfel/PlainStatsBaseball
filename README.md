# PlainStats

Baseball stats in plain English. See the original build prompt in the project for full
feature spec — this README covers what's actually built and what changed from that spec
during implementation.

## Running it

```
cd backend && npm install && npm start      # http://localhost:3001
cd frontend && npm install && npm run dev   # http://localhost:5173, proxies /api to backend
```

## What's working end-to-end

- Player search across MLB history (not just current active rosters), player rundown
  (bio, season stats, year-by-year career table, game log)
- Single-stat leaderboards for expanded hitting/pitching stats, sortable, including
  all-time career leaderboards
- Custom leaderboard builder with shareable URLs
- Followed pitchers and hitters (localStorage)
- Pitcher tracker with probable-starter lookup, fallback next-start estimate, and recent
  starts from MLB game logs
- Live games tab with score, status, probable pitchers, current matchup, count, linescore,
  and venue/start-time details
- Standings tab with division-by-division team records, win percentage, games back, streak,
  last 10, and runs scored/allowed
- Flat, Craigslist-style UI throughout, exactly per the original design spec

## Data notes

- **Stat names** now stay as their real baseball abbreviations (`AVG`, `OBP`, `IP`,
  `WAR`, etc.) while tooltips provide the full name, a short explanation, and one extra
  reading note.
- **WAR** is supported through the `season_stats` SQLite table because MLB's public Stats
  API does not reliably provide one standard WAR field in normal season stat responses.
  Populate `season_stats` from your chosen WAR source and the frontend will display it.
- The `backend/etl/pull_statcast.py` script is real, logic-tested code (see
  `backend/etl/README.md`), but has not been run against live Baseball Savant data — the
  sandbox this was built in has that domain blocked at the network layer.

## Corrections made to the original build spec

Two things in the original spec didn't match the real MLB Stats API / Baseball Savant,
caught by checking against the actual APIs and a widely-used community wrapper
(toddrob99/MLB-StatsAPI) rather than assuming the spec's endpoint names were correct:

1. **There is no `/people/search?names=` endpoint on the MLB Stats API.** Player search
   is implemented instead by pulling MLB's all-time career leaderboard data
   (`/stats?stats=career`, hitting and pitching, no `season` param) and filtering the
   merged player pool by name server-side, cached for 24 hours. This covers players from
   any era, not just the current active roster — see the note in `backend/mlbClient.js`
   and `backend/routes/players.js`.
2. **Savant's raw CSV doesn't have `exit_velocity` or a boolean `barrel` column.** The real
   columns are `launch_speed` and `launch_speed_angle` (a 1-6 zone where 6 = barrel). The
   ETL script maps these correctly; the app-facing stat key (`exit_velocity`) is unchanged
   so nothing in the frontend needed to change. See `backend/db/schema.sql`.

Also swapped the spec's suggested `coperyan/statcast-api` reference for `pybaseball`
directly — the former is a thin, unmaintained 4-star wrapper that itself points to
pybaseball as its own reference implementation.

## Leaderboard notes

The leaderboard pulls a large pool (3000 rows) from MLB's stats endpoint and sorts the
*entire* pool server-side by whichever stat is active, rather than trusting MLB's own
default sort order and only re-sorting a small top slice — a smaller pool size (300)
previously caused real career leaders in specific stats (e.g. stolen bases) to be cut
before the sort ever saw them, since the upstream default sort favors different stats.
See `POOL_SIZE` in `backend/routes/leaderboards.js`.

## Still open (from the original spec's own "open decisions" list)

- Statcast backfill depth (current season vs. multi-year)
- Final hosting for the persistent SQLite file + nightly cron

## Troubleshooting

- If the standings page returns "Not found" or the live tab never finishes loading, restart the backend server so the latest route code is active.
- Test the backend directly at `http://localhost:3001/api/live` and `http://localhost:3001/api/standings`.
- The backend now logs the mounted API routes on startup, so you can confirm the running process has `/api/standings` enabled.
- `backend/package.json` has `"type": "module"`, so every `.js` file in `backend/` is an ES
  module — use `import`, not `require()`, and `__dirname`/`__filename` aren't available
  automatically (derive them from `import.meta.url` via `fileURLToPath`, as `index.js`
  already does for serving `backend/public`). Using CommonJS syntax anywhere in `backend/`
  will crash the server on startup with `ReferenceError: require is not defined in ES
  module scope`.