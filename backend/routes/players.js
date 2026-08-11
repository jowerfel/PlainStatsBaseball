import { Router } from 'express'
import { cached } from '../cache.js'
import * as mlb from '../mlbClient.js'

const router = Router()

// GET /api/players/search?q=judge
//
// The MLB Stats API has no name-search endpoint (see mlbClient.js note on getAllActivePlayers).
// This pulls the full active-player list for the current season (cached for an hour — that
// list barely changes intra-day) and filters by name server-side. Slightly heavier per-request
// than a real search endpoint would be, but it's a single cached array lookup once warm.
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase()
  if (q.length < 2) {
    return res.json({ people: [] })
  }
  const season = new Date().getFullYear()
  try {
    const data = await cached(`active-players:${season}`, 60 * 60 * 1000, () =>
      mlb.getAllActivePlayers(season),
    )
    const allPlayers = data.people || []
    const matches = allPlayers
      .filter((p) => (p.fullName || '').toLowerCase().includes(q))
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
