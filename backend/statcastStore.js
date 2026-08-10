import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, 'db', 'plainstats.sqlite')

let db = null
let checkedSchema = false
let hasPitchTable = false
let hasSeasonStatsTable = false

function openDb() {
  if (!fs.existsSync(DB_PATH)) return null
  if (!db) db = new Database(DB_PATH, { readonly: true, fileMustExist: true })
  return db
}

function tableExists(database, tableName) {
  const row = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName)
  return Boolean(row)
}

function getStatus() {
  const database = openDb()
  if (!database) {
    return { available: false, reason: 'No local Statcast database found yet.' }
  }

  if (!checkedSchema) {
    hasPitchTable = tableExists(database, 'statcast_pitches')
    hasSeasonStatsTable = tableExists(database, 'season_stats')
    checkedSchema = true
  }

  return {
    available: hasPitchTable || hasSeasonStatsTable,
    hasPitchTable,
    hasSeasonStatsTable,
    reason: hasPitchTable || hasSeasonStatsTable ? '' : 'Statcast tables are not present yet.',
  }
}

function seasonLike(season) {
  return `${season || new Date().getFullYear()}-%`
}

export function getStatcastStatus() {
  return getStatus()
}

export function getHitterStatcastSummary(playerId, season) {
  const status = getStatus()
  if (!status.hasPitchTable) return null
  const database = openDb()
  return database
    .prepare(
      `
      SELECT
        AVG(xwoba) AS xwoba,
        AVG(exit_velocity) AS exit_velocity,
        100.0 * SUM(CASE WHEN is_barrel = 1 THEN 1 ELSE 0 END)
          / NULLIF(SUM(CASE WHEN exit_velocity IS NOT NULL THEN 1 ELSE 0 END), 0) AS barrel_pct,
        COUNT(*) AS pitch_count
      FROM statcast_pitches
      WHERE batter_id = ?
        AND game_date LIKE ?
      `,
    )
    .get(playerId, seasonLike(season))
}

export function getPitcherStatcastSummary(playerId, season) {
  const status = getStatus()
  if (!status.hasPitchTable) return null
  const database = openDb()
  return database
    .prepare(
      `
      SELECT
        AVG(release_speed) AS avg_velo,
        AVG(release_spin_rate) AS spin_rate,
        100.0 * SUM(CASE
          WHEN description IN ('swinging_strike', 'swinging_strike_blocked', 'foul_tip')
          THEN 1 ELSE 0 END)
          / NULLIF(SUM(CASE
            WHEN description IN (
              'swinging_strike', 'swinging_strike_blocked', 'foul',
              'foul_tip', 'foul_bunt', 'hit_into_play'
            )
            THEN 1 ELSE 0 END), 0) AS whiff_pct,
        COUNT(*) AS pitch_count
      FROM statcast_pitches
      WHERE player_id = ?
        AND game_date LIKE ?
      `,
    )
    .get(playerId, seasonLike(season))
}

export function getHitterStatcastSummaries(playerIds, season) {
  const status = getStatus()
  if (!status.hasPitchTable || playerIds.length === 0) return new Map()
  const database = openDb()
  const placeholders = playerIds.map(() => '?').join(',')
  const rows = database
    .prepare(
      `
      SELECT
        batter_id AS playerId,
        AVG(xwoba) AS xwoba,
        AVG(exit_velocity) AS exit_velocity,
        100.0 * SUM(CASE WHEN is_barrel = 1 THEN 1 ELSE 0 END)
          / NULLIF(SUM(CASE WHEN exit_velocity IS NOT NULL THEN 1 ELSE 0 END), 0) AS barrel_pct
      FROM statcast_pitches
      WHERE batter_id IN (${placeholders})
        AND game_date LIKE ?
      GROUP BY batter_id
      `,
    )
    .all(...playerIds, seasonLike(season))
  return new Map(rows.map((row) => [String(row.playerId), row]))
}

export function getPitcherStatcastSummaries(playerIds, season) {
  const status = getStatus()
  if (!status.hasPitchTable || playerIds.length === 0) return new Map()
  const database = openDb()
  const placeholders = playerIds.map(() => '?').join(',')
  const rows = database
    .prepare(
      `
      SELECT
        player_id AS playerId,
        AVG(release_speed) AS avg_velo,
        AVG(release_spin_rate) AS spin_rate,
        100.0 * SUM(CASE
          WHEN description IN ('swinging_strike', 'swinging_strike_blocked', 'foul_tip')
          THEN 1 ELSE 0 END)
          / NULLIF(SUM(CASE
            WHEN description IN (
              'swinging_strike', 'swinging_strike_blocked', 'foul',
              'foul_tip', 'foul_bunt', 'hit_into_play'
            )
            THEN 1 ELSE 0 END), 0) AS whiff_pct
      FROM statcast_pitches
      WHERE player_id IN (${placeholders})
        AND game_date LIKE ?
      GROUP BY player_id
      `,
    )
    .all(...playerIds, seasonLike(season))
  return new Map(rows.map((row) => [String(row.playerId), row]))
}

export function getSeasonStatMap(playerIds, season, group) {
  const status = getStatus()
  if (!status.hasSeasonStatsTable || playerIds.length === 0) return new Map()
  const database = openDb()
  const placeholders = playerIds.map(() => '?').join(',')
  const rows = database
    .prepare(
      `
      SELECT player_id AS playerId, stat_key AS statKey, stat_value AS statValue
      FROM season_stats
      WHERE player_id IN (${placeholders})
        AND season = ?
        AND stat_group = ?
      `,
    )
    .all(...playerIds, season, group)

  const map = new Map()
  for (const row of rows) {
    const key = String(row.playerId)
    if (!map.has(key)) map.set(key, {})
    map.get(key)[row.statKey] = row.statValue
  }
  return map
}

export function getPitcherGameDateSummaries(playerId, season) {
  const status = getStatus()
  if (!status.hasPitchTable) return new Map()
  const database = openDb()
  const rows = database
    .prepare(
      `
      SELECT
        game_date AS gameDate,
        AVG(release_speed) AS avg_velo,
        AVG(release_spin_rate) AS avg_spin_rate,
        100.0 * SUM(CASE
          WHEN description IN ('swinging_strike', 'swinging_strike_blocked', 'foul_tip')
          THEN 1 ELSE 0 END)
          / NULLIF(SUM(CASE
            WHEN description IN (
              'swinging_strike', 'swinging_strike_blocked', 'foul',
              'foul_tip', 'foul_bunt', 'hit_into_play'
            )
            THEN 1 ELSE 0 END), 0) AS whiff_pct,
        COUNT(*) AS pitch_count
      FROM statcast_pitches
      WHERE player_id = ?
        AND game_date LIKE ?
      GROUP BY game_date
      `,
    )
    .all(playerId, seasonLike(season))
  return new Map(rows.map((row) => [row.gameDate, row]))
}
