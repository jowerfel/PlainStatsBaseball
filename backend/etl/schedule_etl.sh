#!/usr/bin/env bash
# Cron entry point — pull the last day's Statcast data nightly during the season.
#
# Example crontab entry (run at 5am, after the previous night's games are finalized):
#   0 5 * * * /path/to/plainstats/backend/etl/schedule_etl.sh >> /var/log/plainstats-etl.log 2>&1
#
# Needs a host with persistent disk (the SQLite file lives at ../db/plainstats.sqlite) —
# this will NOT work on Vercel/Netlify. See spec section 1 hosting note.

set -euo pipefail
cd "$(dirname "$0")"

python3 pull_statcast.py --backfill-days 1
