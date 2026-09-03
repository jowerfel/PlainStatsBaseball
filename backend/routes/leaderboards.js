import { Router } from 'express'
import { cached } from '../cache.js'
import * as mlb from '../mlbClient.js'
import {
  deriveSingles,
  deriveSplat,
  deriveRangeFactor,
  attachWar,
  sumFieldingStats,
  computeJWinsFieldingForSeason,
} from '../derivedStats.js'

const router = Router()


const POOL_SIZE = 3000


const CAREER_FIELDING_YEARS_BACK = 60

router.get('/', async (req, res) => {
  const season = req.query.season || new Date().getFullYear()
  const group = ['pitching', 'fielding'].includes(req.query.group) ? req.query.group : 'hitting'
  const limit = Math.min(Number(req.query.limit) || 100, POOL_SIZE)
  const statKeys = (req.query.stats || '').split(',').filter(Boolean)
  const sortStat = statKeys.includes(req.query.sortStat) ? req.query.sortStat : statKeys[0]
  const minPA = req.query.minPA ? Number(req.query.minPA) : null
  const minIP = req.query.minIP ? Number(req.query.minIP) : null
  const minInnings = req.query.minInnings ? Number(req.query.minInnings) : null

  try {
    let groupedSplits

    
    if (group === 'fielding' && season === 'career') {
      groupedSplits = await cached(
        `career-fielding-splits:${CAREER_FIELDING_YEARS_BACK}`,
        24 * 60 * 60 * 1000,
        () => buildCareerFieldingSplits(),
      )
    } else {
      const cacheKey = `leaderboard:${group}:${season}:${POOL_SIZE}`
      const data = await cached(cacheKey, 5 * 60 * 1000, () =>
        mlb.getSeasonLeaderboard({ season, group, limit: POOL_SIZE }),
      )
      const splits = data.stats?.[0]?.splits || []
      
      groupedSplits = group === 'fielding' ? groupFieldingSplitsByPlayer(splits) : splits
    }

    let rows = groupedSplits.map((split) => ({
      playerId: split.player?.id,
      playerName: split.player?.fullName,
      teamId: split.team?.id,
      teamName: split.team?.name,
      stat: withDerivedStats(split.stat, group, split.positionSplits),
    }))

    if (minPA !== null) {
      rows = rows.filter((r) => Number(r.stat?.plateAppearances || 0) >= minPA)
    }
    if (minIP !== null) {
      rows = rows.filter((r) => Number(r.stat?.inningsPitched || 0) >= minIP)
    }
    if (minInnings !== null) {
      
      rows = rows.filter((r) => Number(r.stat?.innings || 0) >= minInnings)
    }

    // Always sort the FULL filtered pool by the active stat, not just the slice we're about
    // to return — see the note above for why sorting after truncation is the bug.
    if (sortStat && rows.some((r) => r.stat?.[sortStat] !== undefined)) {
      const ascending = ['era', 'whip', 'bb_pct', 'errors'].includes(sortStat)
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


async function buildCareerFieldingSplits() {
  const currentYear = new Date().getFullYear()
  const startYear = currentYear - CAREER_FIELDING_YEARS_BACK + 1
  const years = Array.from({ length: CAREER_FIELDING_YEARS_BACK }, (_, i) => startYear + i)

  const seasonResults = await Promise.all(
    years.map(async (year) => {
      try {
        const isCurrentSeason = year === currentYear
        const ttl = isCurrentSeason ? 5 * 60 * 1000 : 24 * 60 * 60 * 1000
        const data = await cached(`leaderboard:fielding:${year}:${POOL_SIZE}`, ttl, () =>
          mlb.getSeasonLeaderboard({ season: year, group: 'fielding', limit: POOL_SIZE }),
        )
        const splits = data.stats?.[0]?.splits || []
        return groupFieldingSplitsByPlayer(splits).map((g) => ({
          ...g,
          jwinsF:
            g.positionSplits.length > 1
              ? computeJWinsFieldingForSeason(g.positionSplits)
              : (() => {
                  const s = { ...g.positionSplits[0].stat }
                  attachWar(s, 'fielding', g.positionSplits[0].position)
                  return s.war_fielding
                })(),
        }))
      } catch (err) {
        console.error(`buildCareerFieldingSplits: failed to fetch ${year}:`, err.message)
        return []
      }
    }),
  )

  // playerId -> { player, team, statAccumulator: [raw per-season stat objects], jwinsF }
  const careerTotals = new Map()
  for (const seasonRows of seasonResults) {
    for (const row of seasonRows) {
      const playerId = row.player?.id
      if (!playerId) continue
      if (!careerTotals.has(playerId)) {
        careerTotals.set(playerId, { player: row.player, team: row.team, rawStats: [], jwinsF: 0 })
      }
      const entry = careerTotals.get(playerId)
      entry.rawStats.push(row.stat)
      entry.jwinsF += row.jwinsF ?? 0
      entry.team = row.team // most-recent-season team, good enough for display
    }
  }

  return [...careerTotals.values()].map((entry) => {
    const combinedStat = entry.rawStats.length === 1 ? entry.rawStats[0] : sumFieldingStats(entry.rawStats)
    return {
      player: entry.player,
      team: entry.team,
      // war_fielding gets set directly (not left for withDerivedStats to compute) so the
      // correctly-summed career total survives — withDerivedStats would otherwise
      // recompute it from these summed raw stats using single-season proration and
      // reintroduce the exact bug this function exists to avoid.
      stat: { ...combinedStat, war_fielding: entry.jwinsF },
      positionSplits: null, // signals withDerivedStats to skip its own JWinsF computation — see below
    }
  })
}


function groupFieldingSplitsByPlayer(splits) {
  const groups = new Map()
  for (const split of splits) {
    const playerId = split.player?.id
    if (!groups.has(playerId)) {
      groups.set(playerId, { player: split.player, team: split.team, entries: [] })
    }
    groups.get(playerId).entries.push({
      stat: split.stat,
      position: split.position?.abbreviation || split.stat?.position?.abbreviation || null,
    })
  }
  return [...groups.values()].map((g) => ({
    player: g.player,
    team: g.team,
    stat: g.entries.length === 1 ? g.entries[0].stat : sumFieldingStats(g.entries.map((e) => e.stat)),
    positionSplits: g.entries,
  }))
}

function withDerivedStats(stat = {}, group, positionSplits) {
  const merged = { ...stat }

  if (group === 'fielding') {
    // putOuts, assists, errors, chances, and fielding% (as `fielding`) already come
    // straight from the MLB API. caughtStealing/stolenBases mean something different here
    // than in the hitting group (see the parallel comment in routes/players.js), so they're
    // aliased to distinct keys to avoid colliding in statDictionary's flat key space.
    if (merged.caughtStealing !== undefined) merged.fieldingCaughtStealing = merged.caughtStealing
    if (merged.stolenBases !== undefined) merged.fieldingStolenBases = merged.stolenBases
    merged.rangeFactor = deriveRangeFactor(merged)

    // positionSplits === null (not undefined/absent — an explicit null) is
    // buildCareerFieldingSplits' signal that war_fielding on `stat` was ALREADY computed
    // correctly (summed from each season's own correctly-capped JWinsF — see that
    // function's big comment) and must NOT be recomputed here. Recomputing against the
    // summed raw counting stats would reintroduce the exact career-proration bug that
    // function exists to avoid, since this generic path always treats its input as one
    // season's worth of innings.
    if (positionSplits === null) {
      return merged
    }

    // Same reasoning as routes/players.js's mergeDerivedStats: JWinsF's positional run
    // value has to apply per position for a multi-position season, not against one
    // combined counting-stat total, so a multi-position leaderboard row computes it from
    // the raw per-position pieces instead of the generic single-position attachWar path.
    if (positionSplits && positionSplits.length > 1) {
      merged.war_fielding = computeJWinsFieldingForSeason(positionSplits)
    } else {
      const singlePosition = positionSplits?.[0]?.position || null
      attachWar(merged, 'fielding', singlePosition)
    }
    return merged
  }

  if (group !== 'pitching') {
    // Same singles/SPLAT derivation as routes/players.js — kept in sync so custom
    // formulas and SPLAT behave the same in leaderboards as they do on a player's own page.
    merged.singles = deriveSingles(merged)
    merged.splat = deriveSplat(merged)
    attachWar(merged, 'hitting')
    return merged
  }

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
  // attachWar reads the raw `hits`/`homeRuns` fields (a pitching split's own allowed
  // totals) and sets `merged.war_pitching` — those raw fields are still present on `merged`
  // alongside the hitsAllowed/homeRunsAllowed aliases added just above, so this must run
  // after those raw fields are known, but doesn't actually depend on the aliases themselves.
  attachWar(merged, 'pitching')
  return merged
}

export default router