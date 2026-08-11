import { Router } from 'express'
import { cached } from '../cache.js'
import * as mlb from '../mlbClient.js'

const router = Router()

// GET /api/leaderboard?group=hitting&season=2026&stats=avg,ops&minPA=200&limit=50
//
// MVP note: this reads directly from the MLB Stats API's live season leaderboard
// (spec section 8 step 5/6) rather than any local leaderboard cache. For now it is a
// thin, cached pass-through from the MLB API plus optional season_stats overrides.
router.get('/', async (req, res) => {
  const season = req.query.season || new Date().getFullYear()
  const group = req.query.group === 'pitching' ? 'pitching' : 'hitting'
  const limit = Math.min(Number(req.query.limit) || 100, 300)
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

    rows = rows.map((row) => ({
      ...row,
      stat: {
        ...row.stat,
      },
    }))

    if (minPA !== null) {
      rows = rows.filter((r) => Number(r.stat?.plateAppearances || 0) >= minPA)
    }
    if (minIP !== null) {
      rows = rows.filter((r) => Number(r.stat?.inningsPitched || 0) >= minIP)
    }

    // If a specific statKey was requested for sorting, sort by it.
    const sortKey = statKeys[0]
    if (sortKey && rows.some((r) => r.stat?.[sortKey] !== undefined)) {
      const ascending = ['era', 'whip', 'bb_pct'].includes(sortKey)
      rows.sort((a, b) => {
        const aValue = Number(a.stat?.[sortKey] ?? 0)
        const bValue = Number(b.stat?.[sortKey] ?? 0)
        return ascending ? aValue - bValue : bValue - aValue
      })
    }

    res.json({
      season,
      group,
      count: rows.length,
      rows: rows.slice(0, limit),
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

  // The MLB Stats API returns pitching totals as hits/homeRuns/runs for leaderboard splits.
  // Map those values into the app's pitching stat keys so leaderboards and tables work.
  if (merged.hits !== undefined) merged.hitsAllowed = merged.hits
  if (merged.homeRuns !== undefined) merged.homeRunsAllowed = merged.homeRuns
  if (merged.runs !== undefined) merged.runsAllowed = merged.runs

  merged.baseOnBallsPitching = merged.baseOnBalls
  merged.war_pitching = merged.war
  return merged
}

export default router
