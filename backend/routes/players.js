import { Router } from 'express'
import { cached } from '../cache.js'
import * as mlb from '../mlbClient.js'
import {
  deriveSingles,
  deriveSplat,
  deriveRangeFactor,
  attachWar,
  extractFieldingSeasonTotal,
  sumFieldingStats,
  computeJWinsFieldingForSeason,
  computeJWinsComplete,
} from '../derivedStats.js'

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
    const [person, hittingSeason, pitchingSeason, fieldingSeason] = await Promise.all([
      cached(`person:${personId}`, 10 * 60 * 1000, () =>
        mlb.getPerson(personId, 'currentTeam'),
      ),
      cached(`season-hitting:${personId}:${season}`, 5 * 60 * 1000, () =>
        mlb.getPersonSeasonStats(personId, season, 'hitting').catch(() => null),
      ),
      cached(`season-pitching:${personId}:${season}`, 5 * 60 * 1000, () =>
        mlb.getPersonSeasonStats(personId, season, 'pitching').catch(() => null),
      ),
      cached(`season-fielding:${personId}:${season}`, 5 * 60 * 1000, () =>
        mlb.getPersonSeasonStats(personId, season, 'fielding').catch(() => null),
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
    const fieldingExtracted = extractFieldingSeasonTotal(fieldingSeason)
    const fieldingStats = mergeDerivedStats(
      fieldingExtracted?.stat || null,
      'fielding',
      personId,
      season,
      fieldingExtracted?.positionSplits,
    )

    // CAREER FIELDING BUG FIX: for career mode, fieldingStats.war_fielding above is
    // WRONG — extractFieldingSeasonTotal/mergeDerivedStats treats the whole career as if
    // it were ONE season, so a career's worth of innings (e.g. 21,785 for a 19-year
    // everyday shortstop) gets capped at the SAME single-season positional-value proration
    // (capped at fullSeasonInnings = 1350, see jwinsFormula.js) that a single real season
    // gets. That silently throws away 18 of 19 seasons' worth of positional value instead
    // of correctly adding each season's own (correctly capped) positional bonus — which is
    // exactly why summing the Year by Year table's JWinsF column gives a completely
    // different, much bigger number than the "Career At A Glance" total did. The fix:
    // build the career fielding total by fetching year-by-year data (the same call the
    // Year by Year table itself uses) and summing each season's OWN correctly-prorated
    // JWinsF — never compute JWinsF directly against career-totaled counting stats.
    let fieldingStatsFixed = fieldingStats
    if (season === 'career' && fieldingStats) {
      const yearByYearFieldingData = await cached(
        `year-by-year:${personId}:fielding`,
        60 * 60 * 1000,
        () => mlb.getPersonYearByYearStats(personId, 'fielding'),
      )
      const yearSplits = yearByYearFieldingData.stats?.[0]?.splits || []
      const seasonGroups = groupFieldingSplitsBySeasonAndTeam(yearSplits)
      let careerJwinsF = 0
      let hasAnySeason = false
      for (const seasonGroup of seasonGroups) {
        const seasonStats = mergeDerivedStats(
          seasonGroup.stat,
          'fielding',
          personId,
          seasonGroup.season,
          seasonGroup.positionSplits,
        )
        if (seasonStats?.war_fielding !== null && seasonStats?.war_fielding !== undefined) {
          careerJwinsF += seasonStats.war_fielding
          hasAnySeason = true
        }
      }
      fieldingStatsFixed = { ...fieldingStats, war_fielding: hasAnySeason ? careerJwinsF : null }
    }

    // JWins Complete: one number combining every facet of this player's game this season
    // — see computeJWinsComplete in jwinsFormula.js for exactly how missing components
    // are handled (a pure hitter's Complete is just their JWinsB, not JWinsB + a phantom
    // 0 for fielding/pitching they were never evaluated on).
    const jwinsComplete = computeJWinsComplete({
      batting: hittingStats?.war ?? null,
      pitching: pitchingStats?.war_pitching ?? null,
      fielding: fieldingStatsFixed?.war_fielding ?? null,
    })

    res.json({
      player,
      hittingSeasonStats: hittingStats,
      pitchingSeasonStats: pitchingStats,
      fieldingSeasonStats: fieldingStatsFixed,
      jwinsComplete,
    })
  } catch (err) {
    console.error('players/:id failed:', err.message)
    res.status(502).json({ error: 'Could not reach the MLB Stats API.' })
  }
})

// GET /api/players/:id/year-by-year?group=hitting
router.get('/:id/year-by-year', async (req, res) => {
  const personId = req.params.id
  const group = ['pitching', 'fielding'].includes(req.query.group) ? req.query.group : 'hitting'

  try {
    const data = await cached(
      `year-by-year:${personId}:${group}`,
      60 * 60 * 1000,
      () => mlb.getPersonYearByYearStats(personId, group),
    )
    const splits = data.stats?.[0]?.splits || []
    const seasons = (group === 'fielding' ? groupFieldingSplitsBySeasonAndTeam(splits) : splits)
      .map((split) => ({
        season: split.season,
        team: split.team?.name || null,
        sport: split.sport?.abbreviation || null,
        ...mergeDerivedStats(split.stat, group, personId, split.season, split.positionSplits),
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

function mergeDerivedStats(stats, group, personId, season, positionSplits) {
  if (!stats) return null
  const merged = { ...stats }

  if (group === 'hitting') {
    // Not a real MLB API field — the API only gives total hits plus 2B/3B/HR — but it's
    // the natural base unit for custom hitting formulas (e.g. a weighted slugging), so
    // it's derived here once and passed straight through everywhere hitting stats flow.
    merged.singles = deriveSingles(merged)
    // SPLAT ("Swing Produces Lazy Air Trajectory") — see the big caveat comment on
    // deriveSplat in derivedStats.js: this is airOuts/AB, the closest real substitute for
    // a genuine pop-up count, which the MLB Stats API doesn't provide.
    merged.splat = deriveSplat(merged)
    attachWar(merged, 'hitting')
  } else if (group === 'pitching') {
    const battersFaced = Number(merged.battersFaced || 0)
    if (battersFaced > 0) {
      merged.k_pct = (Number(merged.strikeOuts || 0) / battersFaced) * 100
      merged.bb_pct = (Number(merged.baseOnBalls || 0) / battersFaced) * 100
    }
    merged.baseOnBallsPitching = merged.baseOnBalls
    attachWar(merged, 'pitching')
  } else if (group === 'fielding') {
    // putOuts, assists, errors, chances, and fielding% (as `fielding`, a string like
    // ".987") already come straight from the MLB API. caughtStealing/stolenBases on a
    // fielding stat object mean something different than the hitting group's own fields
    // of the same name (a catcher's caught-stealing defense, not the fielder's own base-
    // stealing) — aliased to distinct keys so they don't collide in statDictionary's flat
    // key space (see the fielding section comment there).
    if (merged.caughtStealing !== undefined) merged.fieldingCaughtStealing = merged.caughtStealing
    if (merged.stolenBases !== undefined) merged.fieldingStolenBases = merged.stolenBases
    merged.rangeFactor = deriveRangeFactor(merged)

    // JWinsF needs the positional run value applied PER POSITION for a multi-position
    // season (see computeJWinsFieldingForSeason in jwinsFormula.js) — a single combined
    // putOuts+assists+errors total loses which position each stat came from, so this
    // can't reuse the generic attachWar(merged, 'fielding') path when there's more than
    // one position split. Falls back to that simpler single-position path (or a bare
    // "no position known" case) when there's nothing more specific to work with.
    if (positionSplits && positionSplits.length > 1) {
      merged.war_fielding = computeJWinsFieldingForSeason(positionSplits)
    } else {
      const singlePosition = positionSplits?.[0]?.position || null
      attachWar(merged, 'fielding', singlePosition)
    }
  }

  return merged
}

// Groups year-by-year fielding splits by season+team, summing across positions within
// each group (see extractFieldingSeasonTotal for the full reasoning) — WITHOUT collapsing
// genuinely different team stints in the same year (a real mid-season trade correctly
// stays as separate rows, same as hitting/pitching already do; only same-team,
// same-season, different-POSITION splits get combined). Also carries each group's raw
// positionSplits through (not just the combined display stat), since JWinsF needs the
// per-position pieces to apply each position's own run value correctly — see
// computeJWinsFieldingForSeason in jwinsFormula.js.
function groupFieldingSplitsBySeasonAndTeam(splits) {
  const groups = new Map()
  for (const split of splits) {
    const key = `${split.season}:${split.team?.id ?? 'none'}`
    if (!groups.has(key)) {
      groups.set(key, { season: split.season, team: split.team, sport: split.sport, entries: [] })
    }
    groups.get(key).entries.push({
      stat: split.stat,
      position: split.position?.abbreviation || split.stat?.position?.abbreviation || null,
    })
  }
  return [...groups.values()].map((g) => ({
    season: g.season,
    team: g.team,
    sport: g.sport,
    stat: g.entries.length === 1 ? g.entries[0].stat : sumFieldingStats(g.entries.map((e) => e.stat)),
    positionSplits: g.entries,
  }))
}

export default router