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

- Player search, player rundown (bio, season stats, game log)
- Single-stat leaderboards for expanded hitting/pitching stats, sortable
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
   is implemented instead by pulling the full active-roster list
   (`/sports/{sportId}/players?season=`) and filtering by name server-side, cached for an
   hour. See the note in `backend/mlbClient.js`.
2. **Savant's raw CSV doesn't have `exit_velocity` or a boolean `barrel` column.** The real
   columns are `launch_speed` and `launch_speed_angle` (a 1-6 zone where 6 = barrel). The
   ETL script maps these correctly; the app-facing stat key (`exit_velocity`) is unchanged
   so nothing in the frontend needed to change. See `backend/db/schema.sql`.

Also swapped the spec's suggested `coperyan/statcast-api` reference for `pybaseball`
directly — the former is a thin, unmaintained 4-star wrapper that itself points to
pybaseball as its own reference implementation.

## Still open (from the original spec's own "open decisions" list)

- Statcast backfill depth (current season vs. multi-year)
- Final hosting for the persistent SQLite file + nightly cron

## Troubleshooting

- If the standings page returns "Not found" or the live tab never finishes loading, restart the backend server so the latest route code is active.
- Test the backend directly at `http://localhost:3001/api/live` and `http://localhost:3001/api/standings`.
- The backend now logs the mounted API routes on startup, so you can confirm the running process has `/api/standings` enabled.
