#!/usr/bin/env python3
"""
pull_statcast.py — pulls Statcast pitch-level data from Baseball Savant and loads it into
the local SQLite database (see ../db/schema.sql).

Uses pybaseball (https://github.com/jldbc/pybaseball) rather than adapting
coperyan/statcast-api, which was the spec's original suggested reference — that repo is a
thin, largely unmaintained wrapper (4 stars, no releases) around the same CSV endpoint, and
its own README points to pybaseball as ITS reference. pybaseball is actively maintained and
already handles the chunking/date-range logic this script needs.

IMPORTANT — verified while building this: pybaseball hits baseballsavant.mlb.com directly.
That domain was NOT reachable from the sandbox this file was built in (blocked by egress
allowlist — confirmed via a direct request that came back "Host not in allowlist"). This
script's logic has been checked against pybaseball's real function signatures and Savant's
real CSV column names (also confirmed independently, not assumed from the original spec),
but the actual network pull has NOT been end-to-end tested against live Savant data. Test
this for real from wherever it actually deploys before trusting it in production, ideally
with `python pull_statcast.py --start 2026-06-01 --end 2026-06-01 --dry-run` first.

Column mapping corrections vs. the original spec (see db/schema.sql for the same notes):
  - Savant's raw column is `launch_speed`, not `exit_velocity`. We map it on ingest.
  - There is no boolean `barrel` column. Savant provides `launch_speed_angle` (int 1-6,
    where 6 = barrel). is_barrel is computed as (launch_speed_angle == 6).
  - xwOBA per-pitch comes from `estimated_woba_using_speedangle`.

Usage:
    python pull_statcast.py --start 2026-08-08 --end 2026-08-08
    python pull_statcast.py --start 2026-08-08 --end 2026-08-08 --dry-run   # no DB write
    python pull_statcast.py --backfill-days 7                              # last N days

Run nightly during the season via schedule_etl.sh (cron). See ../etl/README.md for what's
still undecided (backfill depth, hosting).
"""

import argparse
import sqlite3
import sys
from datetime import date, timedelta
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "db" / "plainstats.sqlite"
SCHEMA_PATH = Path(__file__).resolve().parent.parent / "db" / "schema.sql"


def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def ensure_schema(conn):
    """Create tables if they don't exist yet. Safe to call every run."""
    with open(SCHEMA_PATH) as f:
        schema_sql = f.read()
    # schema.sql uses plain CREATE TABLE; make it idempotent for repeated ETL runs
    idempotent_sql = schema_sql.replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ")
    conn.executescript(idempotent_sql)
    conn.commit()


def fetch_statcast_range(start_dt, end_dt):
    """Pull raw pitch-level Statcast data for a date range. Returns a pandas DataFrame."""
    try:
        import pybaseball
    except ImportError:
        print(
            "pybaseball is not installed. Run: pip install pybaseball --break-system-packages",
            file=sys.stderr,
        )
        sys.exit(1)

    pybaseball.cache.enable()  # avoid re-downloading the same date range on retry
    df = pybaseball.statcast(start_dt=start_dt, end_dt=end_dt, verbose=True)
    return df


def load_pitches(conn, df, dry_run=False):
    """Map the raw Savant DataFrame into statcast_pitches rows and insert them."""
    if df is None or df.empty:
        print("No rows returned for this date range — nothing to load.")
        return 0

    required_cols = [
        "pitcher", "batter", "game_date", "pitch_type", "release_speed",
        "release_spin_rate", "launch_speed", "launch_angle", "launch_speed_angle",
        "estimated_woba_using_speedangle", "description",
    ]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        print(
            f"WARNING: expected columns missing from Savant response: {missing}. "
            "Savant may have changed its export format since this script was written — "
            "check https://baseballsavant.mlb.com/csv-docs for the current schema.",
            file=sys.stderr,
        )

    rows = []
    for _, r in df.iterrows():
        is_barrel = 1 if r.get("launch_speed_angle") == 6 else 0
        rows.append((
            r.get("pitcher"),
            r.get("batter"),
            str(r.get("game_date")),
            r.get("pitch_type"),
            r.get("release_speed"),
            r.get("release_spin_rate"),
            r.get("launch_speed"),      # -> exit_velocity column
            r.get("launch_angle"),
            is_barrel,
            r.get("estimated_woba_using_speedangle"),  # -> xwoba column
            r.get("description"),
        ))

    if dry_run:
        print(f"[dry-run] Would insert {len(rows)} rows into statcast_pitches. Sample:")
        for row in rows[:3]:
            print("  ", row)
        return len(rows)

    conn.executemany(
        """
        INSERT INTO statcast_pitches
            (player_id, batter_id, game_date, pitch_type, release_speed,
             release_spin_rate, exit_velocity, launch_angle, is_barrel, xwoba, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.commit()
    print(f"Inserted {len(rows)} rows into statcast_pitches.")
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description="Pull Statcast data into the local SQLite DB.")
    parser.add_argument("--start", help="Start date YYYY-MM-DD")
    parser.add_argument("--end", help="End date YYYY-MM-DD")
    parser.add_argument(
        "--backfill-days", type=int,
        help="Pull the last N days instead of an explicit range (used by nightly cron).",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Fetch and print row counts without writing to the database.",
    )
    args = parser.parse_args()

    if args.backfill_days:
        end = date.today()
        start = end - timedelta(days=args.backfill_days)
        start_dt, end_dt = start.isoformat(), end.isoformat()
    elif args.start and args.end:
        start_dt, end_dt = args.start, args.end
    else:
        parser.error("Provide either --start/--end or --backfill-days")
        return

    print(f"Pulling Statcast data from {start_dt} to {end_dt}...")
    df = fetch_statcast_range(start_dt, end_dt)

    conn = get_connection()
    try:
        ensure_schema(conn)
        load_pitches(conn, df, dry_run=args.dry_run)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
