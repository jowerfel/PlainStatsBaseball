import { Router } from 'express'
import { cached } from '../cache.js'
import * as mlb from '../mlbClient.js'
import {
  deriveSingles,
  attachWar,
  computeJWinsFieldingForSeason,
  computeJWinsComplete,
} from '../derivedStats.js'

const router = Router()

const POOL_SIZE = 3000
const FACET_TO_GROUP_AND_STAT = {
  batting: { group: 'hitting', stat: 'war' },
  pitching: { group: 'pitching', stat: 'war_pitching' },
  fielding: { group: 'fielding', stat: 'war_fielding' },
}


async function fetchFacetSeasonRows(facet, season) {
  const { group, stat } = FACET_TO_GROUP_AND_STAT[facet]
  const isCurrentSeason = Number(season) === new Date().getFullYear()
  const ttl = isCurrentSeason ? 5 * 60 * 1000 : 24 * 60 * 60 * 1000
  const data = await cached(`jwins-facet-season:${facet}:${season}`, ttl, () =>
    mlb.getSeasonLeaderboard({ season, group, limit: POOL_SIZE }),
  )

  if (facet === 'fielding') {
    // Same multi-position-per-player grouping as routes/leaderboards.js's
    // groupFieldingSplitsByPlayer — a player who played multiple positions in the season
    // otherwise appears as multiple partial rows instead of one real total.
    const groups = new Map()
    for (const split of data.stats?.[0]?.splits || []) {
      const playerId = split.player?.id
      if (!playerId) continue
      if (!groups.has(playerId)) {
        groups.set(playerId, { player: split.player, team: split.team, entries: [] })
      }
      groups.get(playerId).entries.push({
        stat: split.stat,
        position: split.position?.abbreviation || split.stat?.position?.abbreviation || null,
      })
    }
    return [...groups.values()]
      .map((g) => ({
        playerId: g.player.id,
        playerName: g.player.fullName,
        teamName: g.team?.name,
        jwins:
          g.entries.length > 1
            ? computeJWinsFieldingForSeason(g.entries)
            : (() => {
                const s = { ...g.entries[0].stat }
                attachWar(s, 'fielding', g.entries[0].position)
                return s.war_fielding
              })(),
      }))
      .filter((r) => r.jwins !== null)
      .sort((a, b) => b.jwins - a.jwins)
  }

  return (data.stats?.[0]?.splits || [])
    .map((split) => {
      const s = { ...split.stat }
      if (facet === 'batting') s.singles = deriveSingles(s)
      attachWar(s, group)
      return {
        playerId: split.player?.id,
        playerName: split.player?.fullName,
        teamName: split.team?.name,
        jwins: s[stat],
      }
    })
    .filter((r) => r.playerId && r.jwins !== null && r.jwins !== undefined)
    .sort((a, b) => b.jwins - a.jwins)
}


const CAREER_FIELDING_YEARS_BACK = 60

async function buildFieldingCareerLeaderboard() {
  const currentYear = new Date().getFullYear()
  const startYear = currentYear - CAREER_FIELDING_YEARS_BACK + 1

  const seasonResults = await Promise.all(
    Array.from({ length: CAREER_FIELDING_YEARS_BACK }, (_, i) => startYear + i).map(async (year) => {
      try {
        return await fetchFacetSeasonRows('fielding', year)
      } catch (err) {
        console.error(`buildFieldingCareerLeaderboard: failed to fetch ${year}:`, err.message)
        return []
      }
    }),
  )

  const careerTotals = new Map() // playerId -> { playerId, playerName, teamName, jwins }
  for (const seasonRows of seasonResults) {
    for (const row of seasonRows) {
      if (!careerTotals.has(row.playerId)) {
        careerTotals.set(row.playerId, { ...row, jwins: 0 })
      }
      const entry = careerTotals.get(row.playerId)
      entry.jwins += row.jwins
      entry.teamName = row.teamName // most-recent-season team, good enough for display
    }
  }

  return [...careerTotals.values()].sort((a, b) => b.jwins - a.jwins)
}


async function fetchCompleteSeasonRows(season) {
  const isCurrentSeason = Number(season) === new Date().getFullYear() || season === 'career'
  const ttl = isCurrentSeason ? 5 * 60 * 1000 : 24 * 60 * 60 * 1000

  const [hittingData, pitchingData] = await Promise.all([
    cached(`jwins-pool:hitting:${season}`, ttl, () =>
      mlb.getSeasonLeaderboard({ season, group: 'hitting', limit: POOL_SIZE }),
    ),
    cached(`jwins-pool:pitching:${season}`, ttl, () =>
      mlb.getSeasonLeaderboard({ season, group: 'pitching', limit: POOL_SIZE }),
    ),
  ])

  // playerId -> { playerId, playerName, teamName, batting, pitching, fielding }
  const merged = new Map()

  function upsert(playerId, playerName, teamName) {
    if (!merged.has(playerId)) {
      merged.set(playerId, { playerId, playerName, teamName, batting: null, pitching: null, fielding: null })
    }
    const entry = merged.get(playerId)
    // Keep whichever team name we saw most recently across the three pools — good
    // enough for display; a player's precise multi-team season still shows correctly
    // on their own year-by-year page.
    if (teamName) entry.teamName = teamName
    return entry
  }

  for (const split of hittingData.stats?.[0]?.splits || []) {
    const playerId = split.player?.id
    if (!playerId) continue
    const mergedStat = { ...split.stat }
    mergedStat.singles = deriveSingles(mergedStat)
    attachWar(mergedStat, 'hitting')
    upsert(playerId, split.player?.fullName, split.team?.name).batting = mergedStat.war
  }

  for (const split of pitchingData.stats?.[0]?.splits || []) {
    const playerId = split.player?.id
    if (!playerId) continue
    const mergedStat = { ...split.stat }
    attachWar(mergedStat, 'pitching')
    upsert(playerId, split.player?.fullName, split.team?.name).pitching = mergedStat.war_pitching
  }

  
  if (season === 'career') {
    const fieldingCareerRows = await cached(
      `jwins-fielding-career-totals:${CAREER_FIELDING_YEARS_BACK}`,
      24 * 60 * 60 * 1000,
      () => buildFieldingCareerLeaderboard(),
    )
    for (const row of fieldingCareerRows) {
      upsert(row.playerId, row.playerName, row.teamName).fielding = row.jwins
    }
  } else {
    const fieldingData = await cached(`jwins-pool:fielding:${season}`, ttl, () =>
      mlb.getSeasonLeaderboard({ season, group: 'fielding', limit: POOL_SIZE }),
    )
    // Fielding pool needs the same multi-position-per-player grouping as the regular
    // leaderboard route (see routes/leaderboards.js's groupFieldingSplitsByPlayer for the
    // full reasoning) before JWinsF can be computed correctly per player.
    const fieldingSplits = fieldingData.stats?.[0]?.splits || []
    const fieldingGroups = new Map()
    for (const split of fieldingSplits) {
      const playerId = split.player?.id
      if (!playerId) continue
      if (!fieldingGroups.has(playerId)) {
        fieldingGroups.set(playerId, { player: split.player, team: split.team, entries: [] })
      }
      fieldingGroups.get(playerId).entries.push({
        stat: split.stat,
        position: split.position?.abbreviation || split.stat?.position?.abbreviation || null,
      })
    }
    for (const g of fieldingGroups.values()) {
      const jwinsF =
        g.entries.length > 1
          ? computeJWinsFieldingForSeason(g.entries)
          : (() => {
              const stat = { ...g.entries[0].stat }
              attachWar(stat, 'fielding', g.entries[0].position)
              return stat.war_fielding
            })()
      upsert(g.player.id, g.player.fullName, g.team?.name).fielding = jwinsF
    }
  }

  return [...merged.values()]
    .map((entry) => ({
      ...entry,
      // "jwins" (not jwinsComplete) so this return shape matches fetchFacetSeasonRows's
      // { playerId, playerName, teamName, jwins } exactly — /best-single-season treats
      // every facet, including complete, identically once it has that common shape.
      jwins: computeJWinsComplete({
        batting: entry.batting,
        pitching: entry.pitching,
        fielding: entry.fielding,
      }),
      // Kept alongside jwins so a Complete leaderboard/chart can still show the batting/
      // pitching/fielding breakdown per player, not just the combined total.
      batting: entry.batting,
      pitching: entry.pitching,
      fielding: entry.fielding,
    }))
    // A player with no computable component at all (jwins === null) can't be ranked —
    // excluded rather than sorted arbitrarily to the top or bottom.
    .filter((r) => r.jwins !== null)
    .sort((a, b) => b.jwins - a.jwins)
}

// GET /api/jwins/complete?season=2026&limit=50
// GET /api/jwins/complete?season=career&limit=50
//

router.get('/complete', async (req, res) => {
  const season = req.query.season || new Date().getFullYear()
  const limit = Math.min(Number(req.query.limit) || 50, POOL_SIZE)

  try {
    const rows = await fetchCompleteSeasonRows(season)

    res.json({
      season,
      poolSize: rows.length,
      rows: rows.slice(0, limit).map((r) => ({
        playerId: r.playerId,
        playerName: r.playerName,
        teamName: r.teamName,
        batting: r.batting,
        pitching: r.pitching,
        fielding: r.fielding,
        jwinsComplete: r.jwins,
      })),
    })
  } catch (err) {
    console.error('jwins/complete failed:', err.message)
    res.status(502).json({ error: 'Could not reach the MLB Stats API.' })
  }
})

// GET /api/jwins/best-single-season?facet=batting&years=30&limit=50

router.get('/best-single-season', async (req, res) => {
  const facet = ['pitching', 'fielding', 'complete'].includes(req.query.facet) ? req.query.facet : 'batting'
  const yearsBack = Math.min(Number(req.query.years) || 30, 60)
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const currentYear = new Date().getFullYear()
  const startYear = currentYear - yearsBack + 1

  try {
    const result = await cached(
      `jwins-best-single-season:${facet}:${yearsBack}`,
      5 * 60 * 1000, // short TTL is fine here — the expensive per-season fetches underneath are what carry the real 24h cache for historical years
      async () => {
        const seasonResults = await Promise.all(
          Array.from({ length: yearsBack }, (_, i) => startYear + i).map(async (year) => {
            try {
              
              const rows =
                facet === 'complete' ? await fetchCompleteSeasonRows(year) : await fetchFacetSeasonRows(facet, year)
              return rows.slice(0, 25).map((r) => ({ ...r, season: year })) // top 25/season is plenty to find the all-time best
            } catch (err) {
              // One bad season shouldn't sink the whole request — skip it and keep going.
              console.error(`jwins/best-single-season: failed to fetch ${year}:`, err.message)
              return []
            }
          }),
        )

        const allSeasonRows = seasonResults.flat()

        // Keep only each player's SINGLE best season within the window, so the
        // leaderboard shows the best seasons BY DIFFERENT PLAYERS, not one dominant
        // career hogging every spot with a string of their own great years.
        const bestPerPlayer = new Map()
        for (const row of allSeasonRows) {
          const existing = bestPerPlayer.get(row.playerId)
          if (!existing || row.jwins > existing.jwins) {
            bestPerPlayer.set(row.playerId, row)
          }
        }

        return [...bestPerPlayer.values()].sort((a, b) => b.jwins - a.jwins)
      },
    )

    res.json({
      facet,
      yearsScanned: yearsBack,
      earliestSeason: startYear,
      latestSeason: currentYear,
      rows: result.slice(0, limit),
    })
  } catch (err) {
    console.error('jwins/best-single-season failed:', err.message)
    res.status(502).json({ error: 'Could not reach the MLB Stats API.' })
  }
})

export default router
