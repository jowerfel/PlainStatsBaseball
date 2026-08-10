import { Router } from 'express'
import { cached } from '../cache.js'
import * as mlb from '../mlbClient.js'
import {
  getHitterStatcastSummaries,
  getPitcherStatcastSummaries,
  getSeasonStatMap,
  getStatcastStatus,
} from '../statcastStore.js'

const router = Router()

// GET /api/leaderboard?group=hitting&season=2026&stats=avg,ops&minPA=200&limit=50
//
// MVP note: this reads directly from the MLB Stats API's live season leaderboard
// (spec section 8 step 5/6) rather than the SQLite `leaderboard_cache` table (section 3),
// since Statcast-derived stats (xwOBA, Barrel%) aren't available until the Python ETL
// pipeline (section 7 step 7) is built and backfilled. Once that exists, this route should
// check `leaderboard_cache` first and fall back to computing from `season_stats` +
// `statcast_pitches`, per the original spec. For now it's a thin, cached pass-through.
router.get('/', async (req, res) => {
  const season = req.query.season || new Date().getFullYear()
  const group = req.query.group === 'pitching' ? 'pitching' : 'hitting'
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const statKeys = (req.query.stats || '').split(',').filter(Boolean)
  const minPA = req.query.minPA ? Number(req.query.minPA) : null
  const minIP = req.query.minIP ? Number(req.query.minIP) : null

  try {
    const cacheKey = `leaderboard:${group}:${season}:${limit}`
    const data = await cached(cacheKey, 5 * 60 * 1000, () =>
      mlb.getSeasonLeaderboard({ season, group, limit: 300 }),
    )

    const splits = data.stats?.[0]?.splits || []

    let rows = splits.map((split) => ({
      playerId: split.player?.id,
      playerName: split.player?.fullName,
      teamId: split.team?.id,
      teamName: split.team?.name,
      stat: withDerivedStats(split.stat, group),
    }))

    const playerIds = rows.map((row) => row.playerId).filter(Boolean)
    const statcastMap =
      group === 'pitching'
        ? getPitcherStatcastSummaries(playerIds, season)
        : getHitterStatcastSummaries(playerIds, season)
    const seasonStatMap = getSeasonStatMap(playerIds, Number(season), group)

    rows = rows.map((row) => ({
      ...row,
      stat: {
        ...row.stat,
        ...(seasonStatMap.get(String(row.playerId)) || {}),
        ...(statcastMap.get(String(row.playerId)) || {}),
      },
    }))

    if (minPA !== null) {
      rows = rows.filter((r) => Number(r.stat?.plateAppearances || 0) >= minPA)
    }
    if (minIP !== null) {
      rows = rows.filter((r) => Number(r.stat?.inningsPitched || 0) >= minIP)
    }

    // If a specific statKey was requested for sorting, sort by it (Statcast-only keys like
    // xwoba/barrel_pct aren't present yet — see MVP note above — so sorting on those is a
    // no-op until the ETL pipeline populates them).
    const sortKey = statKeys[0]
    if (sortKey && rows.some((r) => r.stat?.[sortKey] !== undefined)) {
      rows.sort((a, b) => Number(b.stat?.[sortKey] || 0) - Number(a.stat?.[sortKey] || 0))
    }

    res.json({
      season,
      group,
      count: rows.length,
      rows: rows.slice(0, limit),
      statcastStatus: getStatcastStatus(),
    })
  } catch (err) {
    console.error('leaderboard failed:', err.message)
    res.status(502).json({ error: 'Could not reach the MLB Stats API.' })
  }
})

function withDerivedStats(stat = {}, group) {
  const merged = { ...stat }
  if (group !== 'pitching') return merged

  const battersFaced = Number(merged.battersFaced || 0)
  if (battersFaced > 0) {
    merged.k_pct = (Number(merged.strikeOuts || 0) / battersFaced) * 100
    merged.bb_pct = (Number(merged.baseOnBalls || 0) / battersFaced) * 100
  }
  merged.baseOnBallsPitching = merged.baseOnBalls
  merged.war_pitching = merged.war
  return merged
}

export default router
