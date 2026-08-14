import { Router } from 'express'
import { cached } from '../cache.js'
import * as mlb from '../mlbClient.js'

const router = Router()

// Snapshot years swept for historical search. The `sports/1/players?season=YYYY` endpoint
// returns every player who appeared in MLB that season (not just "currently active" players),
// so sampling one season per era gives broad name coverage of MLB history without hammering
// the upstream API with 100+ calls per search. A player who appeared in ANY MLB season is very
// likely to also appear in a nearby sampled year's roster (careers span multiple years), so a
// ~5-year stride from 1901 (AL founding) to present catches effectively all of major-league
// history while keeping the snapshot set small and cacheable.
function buildSearchSnapshotYears() {
  const currentYear = new Date().getFullYear()
  const years = []
  for (let y = currentYear; y >= 1901; y -= 5) {
    years.push(y)
  }
  if (years[years.length - 1] !== 1901) years.push(1901)
  // Always include the current year exactly (in case the stride skipped it) and last year,
  // so brand-new rookies show up immediately.
  years.unshift(currentYear - 1)
  return [...new Set(years)]
}

const SEARCH_SNAPSHOT_YEARS = buildSearchSnapshotYears()

// GET /api/players/search?q=judge
//
// The MLB Stats API has no name-search endpoint (see mlbClient.js note on getPlayersForSeason).
// This sweeps a fixed set of historical season snapshots (see buildSearchSnapshotYears above),
// merges + de-dupes the results by person id, and filters by name server-side. Each season
// snapshot is cached separately and long-term (season rosters, especially historical ones,
// never change), so only the first search after a cold start pays the full fetch cost —
// subsequent searches of any name reuse the same cached snapshots.
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase()
  if (q.length < 2) {
    return res.json({ people: [] })
  }
  try {
    const snapshots = await Promise.all(
      SEARCH_SNAPSHOT_YEARS.map((year) =>
        cached(`season-players:${year}`, 24 * 60 * 60 * 1000, () =>
          mlb.getPlayersForSeason(year).catch(() => ({ people: [] })),
        ),
      ),
    )
    const byId = new Map()
    for (const snapshot of snapshots) {
      for (const p of snapshot.people || []) {
        if (!byId.has(p.id)) byId.set(p.id, p)
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