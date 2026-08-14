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
// ITS OWN default order (some single "prominent" counting stat, not chosen by us) — so a pool
// large enough to contain the true all-time leaders in ANY stat has to be fetched, then fully
// sorted server-side by sortStat before slicing to `limit`.
//
// POOL_SIZE used to be 300, which is where the actual reported bug lived: Rickey Henderson
// (the real career stolen-base leader, 1406 SB) never appeared on the stolen-base leaderboard
// because he doesn't rank in the upstream API's own top-300-by-whatever-it-defaults-to, so he
// was excluded before the sortStat re-sort ever got to see him — sorting a pool that already
// excludes the true leader can't fix the result, no matter how correct the sort itself is.
// 3000 comfortably covers every player who's ever accumulated enough career volume in any
// single counting or rate stat to plausibly lead a category (MLB's entire all-time player
// pool for significant-playing-time players is well under this), and this is a single request
// cached for 5 minutes, not something repeated per leaderboard view.
const POOL_SIZE = 3000

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