# Statcast ETL

## Status: script written and logic-tested, NOT live-network-tested

`pull_statcast.py` is real and working code, not a stub. What's been verified:

- Uses `pybaseball` (not `coperyan/statcast-api` — that repo turned out to be a thin,
  unmaintained 4-star wrapper that itself points to pybaseball as its own reference).
- Column mapping was checked against pybaseball's actual documented output columns, not
  just the original build spec's assumptions — and this caught two real bugs in the spec:
  - Savant's raw exit-velocity column is `launch_speed`, not `exit_velocity`. Fixed in
    `../db/schema.sql` and the ETL script; the app-facing stat key stays `exit_velocity`.
  - There's no `barrel` boolean in the raw feed. Savant provides `launch_speed_angle`
    (1-6 zone, 6 = barrel). `is_barrel` is now computed from that, not copied directly.
- The row-mapping and SQLite insert logic was tested end-to-end against a synthetic
  DataFrame built with real Savant column names (including a null-batted-ball-outcome row,
  e.g. a called strike) — inserts, `is_barrel` computation, and null-handling all checked out.

What's NOT verified: an actual live pull from `baseballsavant.mlb.com`. The sandbox this was
built in has that domain blocked at the network egress layer (confirmed directly — a raw
request to the Savant CSV endpoint came back "Host not in allowlist", and pybaseball
silently swallowed that into an empty DataFrame rather than raising, so watch for that
failure mode specifically if you see 0 rows come back unexpectedly).

**Before relying on this**, run once with `--dry-run` from an environment that can actually
reach Savant:

```
pip install -r requirements.txt --break-system-packages
python pull_statcast.py --start 2026-08-08 --end 2026-08-08 --dry-run
```

If that prints real row samples, drop `--dry-run` to write to SQLite for real.

## What's still needed after that

1. `schedule_etl.sh` is written (cron entry point, `--backfill-days 1` nightly) but not
   scheduled anywhere yet — needs a host with persistent disk (a VPS or Railway/Render
   instance; won't work on Vercel/Netlify).
2. `season_stats` and `players` tables in `../db/schema.sql` aren't populated by anything
   yet — only `statcast_pitches` has a working loader. `pitcher_starts` (aggregated
   per-start rows, not raw pitches) also needs its own aggregation step, likely a second
   script or a SQL view over `statcast_pitches` grouped by pitcher + game_date.
3. Once `pitcher_starts` has real rows, implement the Stuff Grade formula (spec 5.3.1) and
   the auto-summary template (5.3.2), and un-stub the two 501 endpoints in
   `../routes/pitchers.js`.
4. Update `../routes/leaderboards.js` to check `leaderboard_cache` before falling back to
   the live MLB Stats API pass-through it currently does, and to actually surface the
   Statcast-only stats (xwOBA, Barrel%, exit velocity, spin rate) that the leaderboard UI
   already has checkboxes for but currently renders as "—".

## Open decisions from the original spec, still unresolved

- Backfill depth: current season only, or multi-year history? (`--backfill-days` supports
  either; someone just needs to pick a number and run it once.)
- Final hosting choice for the persistent SQLite file + cron.
