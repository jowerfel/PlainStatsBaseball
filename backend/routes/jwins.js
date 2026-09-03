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

// Fetches one season's leaderboard for a single facet (batting/pitching/fielding) and
// returns { playerId, playerName, teamName, jwins } rows, sorted highest JWins first.
// Shared by /best-single-season below, which needs exactly this "one season, one facet,
// ranked" shape repeated across many years.
//
// A completed past season's stats never change, so those are cached far longer (24h) than
// the current, still-in-progress season (5min, same as the rest of this app's caching) —
// without that distinction, /best-single-season would re-fetch ~30 historical seasons
// worth of data every 5 minutes for no reason, since only the current year's numbers can
// actually move.
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

// Builds a CAREER fielding leaderboard by summing each player's JWinsF across many
// individual SEASON leaderboards, instead of asking MLB's API for one aggregate
// "stats=career&group=fielding" leaderboard directly.
//
// Why: that direct career+fielding leaderboard query appears to leave out most players
// who didn't play recently — Ozzie Smith (retired 1996) and other older Hall of Famers
// don't show up in it at all, even though the exact same player's PER-PLAYER career
// fielding stats (routes/players.js, a completely different MLB endpoint) come back
// correct and complete. Rather than depend on that one endpoint working right (which,
// after real investigation, it doesn't for career+fielding specifically), this route
// builds the career total itself from season-by-season data, the same season-mode
// fielding leaderboard call that DOES work correctly (confirmed: current/recent players
// show up on it fine). Each season's JWinsF was already correctly computed with that
// season's own innings-prorated positional bonus, so summing the per-season numbers is a
// valid career total — no double-counting or re-derivation needed.
//
// This is deliberately capped and heavily cached (like /best-single-season) since it's
// the same "many years x one upstream call each" shape. CAREER_FIELDING_YEARS_BACK
// caps how far back this goes for the same reason /best-single-season caps at 60 —
// literally every MLB season back to 1876 would mean 100+ upstream calls per request.
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

// Fetches one season's JWins Complete leaderboard — batting + pitching + fielding merged
// by player, same logic as the /complete route below, factored out so
// /best-single-season can call it per-year too (see fetchFacetSeasonRows for the same
// pattern applied to a single facet).
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

  // FIELDING: career mode does NOT use MLB's direct "stats=career&group=fielding"
  // leaderboard query — confirmed, that query excludes most players who didn't play
  // recently (Ozzie Smith and other older Hall of Famers are simply absent from it,
  // despite their own per-player career fielding stats being complete and correct via a
  // different MLB endpoint). Instead, career fielding here is built by summing each
  // player's JWinsF across many individual season leaderboards (see
  // buildFieldingCareerLeaderboard) — the season-mode fielding leaderboard call IS
  // confirmed working correctly. Season mode (a specific year) still uses the direct
  // single-season call, which isn't affected by this issue.
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
// JWins Complete combines a player's batting, pitching, AND fielding JWins into one
// number (see computeJWinsComplete in jwinsFormula.js) — but the MLB Stats API has no
// single endpoint that returns all three facets for every player at once, and the
// regular /api/leaderboard route only ever pulls ONE group per request. So this fetches
// large hitting, pitching, and fielding pools independently (same POOL_SIZE approach and
// reasoning as routes/leaderboards.js — see that file's big comment on why 3000, not a
// smaller number, is needed to not silently exclude the true leader), merges them by
// player id, computes each player's JWins Complete from whichever components they
// actually have data for, and sorts by that.
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
//
// The best individual PLAYER-SEASON performances for one JWins facet — e.g. "what's the
// single greatest batting JWins season anyone has ever had," not "who's good this year."
// Scans multiple past seasons (not literally every MLB season back to 1876 — that would
// mean 150+ upstream API calls per request; `years` caps how far back to look, default 30
// and capped at 60, a real scope limit that's stated plainly in the response rather than
// silently pretending this is exhaustive all-time history) and keeps the single best
// season-row per player across that whole window (so one all-time great isn't just
// filling the entire top 10 with 8 of their own seasons), then ranks by JWins.
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
              // Complete needs 3 upstream calls PER YEAR (hitting+pitching+fielding
              // pools) instead of 1, same as a single /complete request — 30 years of
              // that is 90 calls for one page load, which is genuinely heavy. It's
              // allowed here because Joshua asked for it directly, but it's the reason
              // this whole result is cached (see the 5min wrapper above) rather than
              // re-run on every request, and why yearsBack is capped at 60 regardless of
              // facet.
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
