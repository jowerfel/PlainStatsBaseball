import { Router } from 'express'
import { cached } from '../cache.js'
import * as mlb from '../mlbClient.js'
import { deriveSingles, attachWar } from '../derivedStats.js'

const router = Router()

// GET /api/players/search?q=judge
//
// Uses a hybrid approach:
// 1. Caches the full active rosters for the current/previous year to guarantee current 
//    stars aren't truncated by MLB API search limits.
// 2. Uses the native /people/search endpoint to find historical players, bypassing 
//    the 3000-player limit of the old career leaderboards method.
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase()
  if (q.length < 2) {
    return res.json({ people: [] })
  }
  
  try {
    const currentYear = new Date().getFullYear()

    // Fetch active players (guarantees Aaron Judge is found) and native search (handles historical)
    const [rosterPools, searchData] = await Promise.all([
      Promise.all(
        [currentYear, currentYear - 1].map((year) =>
          cached(`active-players:${year}`, 60 * 60 * 1000, () =>
            mlb.getAllActivePlayers(year).catch((err) => {
              console.error(`active-players:${year} fetch failed:`, err.message)
              return { people: [] }
            }),
          ),
        ),
      ),
      cached(`search:${q}`, 60 * 60 * 1000, async () => {
        const response = await fetch(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(q)}`)
        if (!response.ok) throw new Error(`Upstream status: ${response.status}`)
        return response.json()
      })
    ])

    const byId = new Map()

    // 1. Add active roster players first
    for (const pool of rosterPools) {
      for (const person of pool.people || []) {
        if (person && !byId.has(person.id)) {
          byId.set(person.id, {
            id: person.id,
            fullName: person.fullName,
            primaryNumber: person.primaryNumber,
          })
        }
      }
    }

    // 2. Add historical/search endpoint players
    for (const person of searchData.people || []) {
      if (person && !byId.has(person.id)) {
        byId.set(person.id, {
          id: person.id,
          fullName: person.fullName,
          primaryNumber: person.primaryNumber,
        })
      }
    }

    // Filter, sort, and slice the combined pool
    const matches = [...byId.values()]
      .filter((p) => (p.fullName || '').toLowerCase().includes(q))
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .slice(0, 25)

    res.json({
      people: matches,
      poolSize: byId.size,
    })
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
    // Not a real MLB API field — the API only gives total hits plus 2B/3B/HR — but it's
    // the natural base unit for custom hitting formulas (e.g. a weighted slugging), so
    // it's derived here once and passed straight through everywhere hitting stats flow.
    merged.singles = deriveSingles(merged)
  } else {
    const battersFaced = Number(merged.battersFaced || 0)
    if (battersFaced > 0) {
      merged.k_pct = (Number(merged.strikeOuts || 0) / battersFaced) * 100
      merged.bb_pct = (Number(merged.baseOnBalls || 0) / battersFaced) * 100
    }
    merged.baseOnBallsPitching = merged.baseOnBalls
  }

  // WAR isn't published by the MLB Stats API at all — attachWar computes Joshua's own
  // custom WAR formula (see derivedStats.js) and sets `merged.war` (hitting) or
  // `merged.war_pitching` (pitching), covering this player's page, year-by-year, career,
  // and leaderboards from one shared implementation.
  attachWar(merged, group)

  return merged
}

export default router