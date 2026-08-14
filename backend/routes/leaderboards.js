import { Router } from 'express'
import { cached } from '../cache.js'
import * as mlb from '../mlbClient.js'

const router = Router()

// GET /api/leaderboard?group=hitting&season=2026&stats=avg,ops&sortStat=ops&minPA=200&limit=50
//
// MVP note: this reads directly from the MLB Stats API's live season leaderboard
// (spec section 8 step 5/6) rather than any local leaderboard cache. For now it is a
// thin, cached pass-through from the MLB API plus optional season_stats overrides.
//
// sortStat controls which of the requested stats the results are ranked by (defaults to the
// first one in `stats`). This matters because the upstream `/stats` endpoint returns rows in
// ITS OWN default order, not sorted by whatever the caller cares about — so a large enough
// pool is always fetched from upstream (POOL_SIZE, well above the max page the UI ever shows)
// and THEN fully sorted server-side by sortStat before slicing to `limit`. Only sorting the
// already-truncated top-`limit` rows (the previous behavior) silently drops any player whose
// best stat wasn't also good enough to land in MLB's own default-sorted top page — e.g.
// building a "career hits + stolen bases" board sorted by hits could cut a stolen-base leader
// who isn't a hits leader before the re-sort ever sees them.
const POOL_SIZE = 300

router.get('/', async (req, res) => {
  const season = req.query.season || new Date().getFullYear()
  const group = req.query.group === 'pitching' ? 'pitching' : 'hitting'
  const limit = Math.min(Number(req.query.limit) || 100, POOL_SIZE)
  const statKeys = (req.query.stats || '').split(',').filter(Boolean)
  const sortStat = statKeys.includes(req.query.sortStat) ? req.query.sortStat : statKeys[0]
  const minPA = req.query.minPA ? Number(req.query.minPA) : null
  const minIP = req.query.minIP ? Number(req.query.minIP) : null

  try {
    const cacheKey = `leaderboard:${group}:${season}:${POOL_SIZE}`
    const data = await cached(cacheKey, 5 * 60 * 1000, () =>
      mlb.getSeasonLeaderboard({ season, group, limit: POOL_SIZE }),
    )

    const splits = data.stats?.[0]?.splits || []

    let rows = splits.map((split) => ({
      playerId: split.player?.id,
      playerName: split.player?.fullName,
      teamId: split.team?.id,
      teamName: split.team?.name,
      stat: withDerivedStats(split.stat, group),
    }))

    if (minPA !== null) {
      rows = rows.filter((r) => Number(r.stat?.plateAppearances || 0) >= minPA)
    }
    if (minIP !== null) {
      rows = rows.filter((r) => Number(r.stat?.inningsPitched || 0) >= minIP)
    }

    // Always sort the FULL filtered pool by the active stat, not just the slice we're about
    // to return — see the note above for why sorting after truncation is the bug.
    if (sortStat && rows.some((r) => r.stat?.[sortStat] !== undefined)) {
      const ascending = ['era', 'whip', 'bb_pct'].includes(sortStat)
      rows.sort((a, b) => {
        const aValue = Number(a.stat?.[sortStat] ?? 0)
        const bValue = Number(b.stat?.[sortStat] ?? 0)
        return ascending ? aValue - bValue : bValue - aValue
      })
    }

    res.json({
      season,
      group,
      sortStat: sortStat || null,
      // True size of the (filtered) pool this leaderboard was drawn from, so the UI can be
      // honest about when it's showing everyone vs. a partial top slice.
      poolSize: rows.length,
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