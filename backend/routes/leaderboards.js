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
  const group = ['pitching', 'fielding'].includes(req.query.group) ? req.query.group : 'hitting'
  const limit = Math.min(Number(req.query.limit) || 100, POOL_SIZE)
  const statKeys = (req.query.stats || '').split(',').filter(Boolean)
  const sortStat = statKeys.includes(req.query.sortStat) ? req.query.sortStat : statKeys[0]
  const minPA = req.query.minPA ? Number(req.query.minPA) : null
  const minIP = req.query.minIP ? Number(req.query.minIP) : null
  const minInnings = req.query.minInnings ? Number(req.query.minInnings) : null

  try {
    const cacheKey = `leaderboard:${group}:${season}:${POOL_SIZE}`
    const data = await cached(cacheKey, 5 * 60 * 1000, () =>
      mlb.getSeasonLeaderboard({ season, group, limit: POOL_SIZE }),
    )

    const splits = data.stats?.[0]?.splits || []

    // Fielding leaderboard splits have the same multi-position-per-player issue as a
    // single player's own season stats (see the big comment on sumFieldingStats in
    // derivedStats.js) — a player who played more than one position that season can
    // appear as MULTIPLE separate rows here, each with only that position's partial
    // stats, instead of one row with their real combined season. Grouped and summed by
    // player before building display rows, so a multi-position player shows up once,
    // correctly, on a fielding leaderboard instead of fragmented (or effectively
    // under-ranked, since each partial row individually looks worse than their real total).
    const groupedSplits = group === 'fielding' ? groupFieldingSplitsByPlayer(splits) : splits

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
      // Fielding's own innings-played field, reported the same "whole.thirds" way as
      // pitching IP (see inningsPitchedToDecimal in derivedStats.js) — compared as a
      // plain string-prefix number here since a minimum-innings filter only needs to be
      // roughly right, not innings-and-thirds precise.
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

// Groups fielding leaderboard splits by player, summing across positions (see
// sumFieldingStats in derivedStats.js) so a player who played multiple positions in the
// season shows up as ONE row with their real combined totals — not fragmented into
// several partial-stat rows. A leaderboard is inherently a whole-season view, so a
// player's team here is whichever team their most recent/largest split belongs to (good
// enough for display purposes on a leaderboard row; the precise multi-team breakdown
// still shows correctly on that player's own year-by-year page).
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