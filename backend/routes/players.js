import { Router } from 'express'
import { cached } from '../cache.js'
import * as mlb from '../mlbClient.js'

const router = Router()

// Stat keys swept to build a broad historical player pool via the all-time career leaderboard
// (see mlbClient.js getCareerLeaders). No single stat's "top N" list covers everyone — a
// leadoff hitter with 3000 hits and zero home runs won't show up in a home-run-sorted top
// list — so several different counting stats (offense + pitching) are pulled and merged.
// Each is its own upstream call, independently cached, at a generous limit so the merged
// pool is wide.
const CAREER_SEARCH_STAT_SWEEPS = [
  { group: 'hitting' },
  { group: 'pitching' },
]

// GET /api/players/search?q=judge
//
// The MLB Stats API has no name-search endpoint (confirmed — see mlbClient.js). Historical
// coverage comes from `/stats?stats=career` (no season param), which is MLB's own all-time
// leaderboard data — the same endpoint the app's leaderboard feature already uses successfully
// for career results. Pulling the full hitting and pitching all-time career pools (a few
// thousand rows each, well within one request's limit) and merging + de-duping by person id
// gives a name pool covering effectively all of MLB history in two cached upstream calls,
// rather than the many small season-by-season roster snapshots this used to sweep.
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase()
  if (q.length < 2) {
    return res.json({ people: [] })
  }
  try {
    const pools = await Promise.all(
      CAREER_SEARCH_STAT_SWEEPS.map(({ group }) =>
        cached(`career-leaders:${group}`, 24 * 60 * 60 * 1000, () =>
          mlb.getCareerLeaders({ group }).catch(() => ({ stats: [] })),
        ),
      ),
    )
    const byId = new Map()
    for (const pool of pools) {
      const splits = pool.stats?.[0]?.splits || []
      for (const split of splits) {
        const person = split.player
        if (person && !byId.has(person.id)) {
          byId.set(person.id, {
            id: person.id,
            fullName: person.fullName,
            primaryNumber: person.primaryNumber,
          })
        }
      }
    }
    const matches = [...byId.values()]
      .filter((p) => (p.fullName || '').toLowerCase().includes(q))
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .slice(0, 25)
    res.json({ people: matches })
  } catch (err) {
    console.error('players/search failed:', err.message)
    res.status(502).json({ error: 'Could not reach the MLB Stats API.' })
  }
})

// GET /api/players/:id?season=2026
router.get('/:id', async (req, res) => {
  const personId = req.params.id
  const season = req.query.season || new Date().getFullYear()

  try {
    const [person, hittingSeason, pitchingSeason] = await Promise.all([
      cached(`person:${personId}`, 10 * 60 * 1000, () =>
        mlb.getPerson(personId, 'currentTeam'),
      ),
      cached(`season-hitting:${personId}:${season}`, 5 * 60 * 1000, () =>
        mlb.getPersonSeasonStats(personId, season, 'hitting').catch(() => null),
      ),
      cached(`season-pitching:${personId}:${season}`, 5 * 60 * 1000, () =>
        mlb.getPersonSeasonStats(personId, season, 'pitching').catch(() => null),
      ),
    ])

    const player = (person.people && person.people[0]) || null
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' })
    }

    const hittingStats = mergeDerivedStats(
      extractSeasonSplit(hittingSeason),
      'hitting',
      personId,
      season,
    )
    const pitchingStats = mergeDerivedStats(
      extractSeasonSplit(pitchingSeason),
      'pitching',
      personId,
      season,
    )

    res.json({
      player,
      hittingSeasonStats: hittingStats,
      pitchingSeasonStats: pitchingStats,
    })
  } catch (err) {
    console.error('players/:id failed:', err.message)
    res.status(502).json({ error: 'Could not reach the MLB Stats API.' })
  }
})

// GET /api/players/:id/year-by-year?group=hitting
//
// Returns one row per season (per team stint) of the player's career, oldest first, plus
// the same derived stats used elsewhere so the frontend can render it with the existing
// stat-formatting helpers. Historical players with no data for a group (e.g. a pitcher
// with no hitting stats) just get an empty seasons array.
router.get('/:id/year-by-year', async (req, res) => {
  const personId = req.params.id
  const group = req.query.group === 'pitching' ? 'pitching' : 'hitting'

  try {
    const data = await cached(
      `year-by-year:${personId}:${group}`,
      60 * 60 * 1000,
      () => mlb.getPersonYearByYearStats(personId, group),
    )
    const splits = data.stats?.[0]?.splits || []
    const seasons = splits
      .map((split) => ({
        season: split.season,
        team: split.team?.name || null,
        sport: split.sport?.abbreviation || null,
        ...mergeDerivedStats(split.stat, group, personId, split.season),
      }))
      .sort((a, b) => Number(a.season) - Number(b.season))
    res.json({ seasons })
  } catch (err) {
    console.error('players/:id/year-by-year failed:', err.message)
    res.status(502).json({ error: 'Could not reach the MLB Stats API.' })
  }
})

// GET /api/players/:id/gamelog?season=2026&group=hitting
router.get('/:id/gamelog', async (req, res) => {
  const personId = req.params.id
  const season = req.query.season || new Date().getFullYear()
  const group = req.query.group === 'pitching' ? 'pitching' : 'hitting'

  try {
    const data = await cached(
      `gamelog:${personId}:${season}:${group}`,
      5 * 60 * 1000,
      () => mlb.getPersonGameLog(personId, season, group),
    )
    const splits = data.stats?.[0]?.splits || []
    res.json({ games: splits.slice(-15).reverse() })
  } catch (err) {
    console.error('players/:id/gamelog failed:', err.message)
    res.status(502).json({ error: 'Could not reach the MLB Stats API.' })
  }
})

function extractSeasonSplit(seasonResponse) {
  if (!seasonResponse) return null
  const split = seasonResponse.stats?.[0]?.splits?.[0]
  return split ? split.stat : null
}

function mergeDerivedStats(stats, group, personId, season) {
  if (!stats) return null
  const merged = { ...stats }

  if (group === 'hitting') {
    // plain MLB API mode only
  } else {
    const battersFaced = Number(merged.battersFaced || 0)
    if (battersFaced > 0) {
      merged.k_pct = (Number(merged.strikeOuts || 0) / battersFaced) * 100
      merged.bb_pct = (Number(merged.baseOnBalls || 0) / battersFaced) * 100
    }
    merged.baseOnBallsPitching = merged.baseOnBalls
    merged.war_pitching = merged.war
  }

  return merged
}

export default router