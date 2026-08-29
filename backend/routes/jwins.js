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
    const [hittingData, pitchingData, fieldingData] = await Promise.all([
      cached(`jwins-pool:hitting:${season}`, 5 * 60 * 1000, () =>
        mlb.getSeasonLeaderboard({ season, group: 'hitting', limit: POOL_SIZE }),
      ),
      cached(`jwins-pool:pitching:${season}`, 5 * 60 * 1000, () =>
        mlb.getSeasonLeaderboard({ season, group: 'pitching', limit: POOL_SIZE }),
      ),
      cached(`jwins-pool:fielding:${season}`, 5 * 60 * 1000, () =>
        mlb.getSeasonLeaderboard({ season, group: 'fielding', limit: POOL_SIZE }),
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

    const rows = [...merged.values()]
      .map((entry) => ({
        ...entry,
        jwinsComplete: computeJWinsComplete({
          batting: entry.batting,
          pitching: entry.pitching,
          fielding: entry.fielding,
        }),
      }))
      // A player with no computable component at all (jwinsComplete === null) can't be
      // ranked — excluded rather than sorted arbitrarily to the top or bottom.
      .filter((r) => r.jwinsComplete !== null)
      .sort((a, b) => b.jwinsComplete - a.jwinsComplete)

    res.json({
      season,
      poolSize: rows.length,
      rows: rows.slice(0, limit),
    })
  } catch (err) {
    console.error('jwins/complete failed:', err.message)
    res.status(502).json({ error: 'Could not reach the MLB Stats API.' })
  }
})

export default router
