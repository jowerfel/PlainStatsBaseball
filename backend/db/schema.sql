-- Copied verbatim from spec section 3. Not yet wired to any code — db.js (better-sqlite3
-- connection helper) doesn't exist yet, and nothing in routes/ reads from this schema.
-- This becomes live once the Statcast ETL pipeline (see ../etl/README.md) is built.

CREATE TABLE players (
  player_id INTEGER PRIMARY KEY,       -- MLB person ID, reuse as your key
  full_name TEXT,
  team_id INTEGER,
  position TEXT,
  bats TEXT,
  throws TEXT,
  birth_date TEXT,
  updated_at TEXT
);

CREATE TABLE season_stats (
  player_id INTEGER,
  season INTEGER,
  stat_group TEXT,        -- 'hitting' or 'pitching'
  stat_key TEXT,           -- e.g. 'avg', 'era', 'xwoba'
  stat_value REAL,
  PRIMARY KEY (player_id, season, stat_group, stat_key)
);

CREATE TABLE pitcher_starts (
  start_id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER,
  game_date TEXT,
  opponent_team_id INTEGER,
  innings_pitched REAL,
  earned_runs INTEGER,
  strikeouts INTEGER,
  walks INTEGER,
  avg_velo REAL,
  avg_spin_rate REAL,
  whiff_pct REAL,
  updated_at TEXT
);

-- CORRECTION (verified against a real pybaseball.statcast() DataFrame, not just the original
-- spec text): Savant's raw CSV column is `launch_speed`, not `exit_velocity` — the app-level
-- stat key stays `exit_velocity` (see statDictionary.js) but the ETL must map it from
-- `launch_speed` on ingest. There's also no boolean `barrel` column in the raw feed; Savant
-- provides `launch_speed_angle`, an int 1-6 zone where 6 = barrel. is_barrel below is
-- computed by the ETL as (launch_speed_angle == 6), not copied directly from any single
-- source column.
CREATE TABLE statcast_pitches (
  pitch_id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER,          -- pitcher (raw column: pitcher)
  batter_id INTEGER,          -- raw column: batter
  game_date TEXT,
  pitch_type TEXT,
  release_speed REAL,
  release_spin_rate REAL,
  exit_velocity REAL,         -- mapped from raw column: launch_speed
  launch_angle REAL,
  is_barrel INTEGER,          -- computed: 1 if launch_speed_angle == 6, else 0
  xwoba REAL,                 -- mapped from raw column: estimated_woba_using_speedangle
  description TEXT
);

CREATE TABLE leaderboard_cache (
  cache_key TEXT PRIMARY KEY,   -- hash of filter params
  result_json TEXT,
  generated_at TEXT
);
