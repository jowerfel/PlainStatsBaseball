#!/usr/bin/env node
// Diagnostic for "a player with a real, high JWinsF is missing from the fielding
// leaderboard." Run on your machine/server (this sandbox can't reach statsapi.mlb.com).
//
//   node scripts/diagnose-fielding-leaderboard.js               (defaults to Ozzie Smith, career)
//   node scripts/diagnose-fielding-leaderboard.js <playerId> career
//   node scripts/diagnose-fielding-leaderboard.js <playerId> 1985
//
// Get <playerId> from the URL of any player's own page on the site (/players/<id>).
// Ozzie Smith's id (122439, from mlb.com/player/ozzie-smith-122439) is the default so
// this is copy-paste-runnable with no lookup step.
//
// This calls the SAME two code paths the site itself uses — routes/players.js's
// per-player fielding fetch (what a player's own page uses) and routes/leaderboards.js's
// leaderboard pool fetch (what the JWins fielding leaderboard uses) — for the same
// player and season, and prints both so we can see exactly where they diverge, instead
// of guessing.

import * as mlb from '../mlbClient.js'
import { extractFieldingSeasonTotal } from '../derivedStats.js'
import { computeJWinsFieldingForSeason } from '../jwinsFormula.js'

const [, , playerIdArg, seasonArg] = process.argv
const playerId = playerIdArg || '122439' // Ozzie Smith
const season = seasonArg || 'career'

async function main() {
  const personData = await mlb.getPerson(playerId)
  const person = personData?.people?.[0]
  console.log(`Player: ${person?.fullName || '(name unavailable)'} (id ${playerId})\n`)

  console.log('=== BROAD CHECK: how big/complete is the career+fielding leaderboard pool overall? ===')
  const broadLeaderboardRaw = await mlb.getSeasonLeaderboard({ season: 'career', group: 'fielding', limit: 3000 })
  const broadSplits = broadLeaderboardRaw?.stats?.[0]?.splits || []
  const uniquePlayers = new Set(broadSplits.map((s) => s.player?.id)).size
  console.log('Total career-fielding splits returned:', broadSplits.length)
  console.log('Unique players among those splits:', uniquePlayers)
  const broadHittingRaw = await mlb.getSeasonLeaderboard({ season: 'career', group: 'hitting', limit: 3000 })
  const broadHittingSplits = broadHittingRaw?.stats?.[0]?.splits || []
  console.log('(For comparison) total career-hitting splits returned:', broadHittingSplits.length)
  if (uniquePlayers < broadHittingSplits.length / 2) {
    console.log('*** Fielding\'s career pool has WAY fewer unique players than hitting\'s —')
    console.log('*** strong sign this is a systemic gap in what MLB\'s API returns for')
    console.log('*** career+fielding specifically, not a one-off issue with any single player.')
  }
  console.log('')

  console.log('=== PATH 1: per-player fetch (what the player\'s own page uses) ===')
  const personSeasonRaw = await mlb.getPersonSeasonStats(playerId, season, 'fielding')
  console.log('Raw splits count:', personSeasonRaw?.stats?.[0]?.splits?.length ?? 'none')
  const extracted = extractFieldingSeasonTotal(personSeasonRaw)
  console.log('positionSplits:', JSON.stringify(extracted?.positionSplits?.map((p) => ({
    position: p.position,
    innings: p.stat?.innings,
    putOuts: p.stat?.putOuts,
    assists: p.stat?.assists,
    errors: p.stat?.errors,
  })), null, 2))
  const jwinsFViaPlayerPage = extracted?.positionSplits
    ? computeJWinsFieldingForSeason(extracted.positionSplits)
    : null
  console.log('JWinsF computed via player-page path:', jwinsFViaPlayerPage)

  console.log('\n=== PATH 2: leaderboard pool fetch (what the JWins fielding leaderboard uses) ===')
  const allSplits = season === 'career' ? broadSplits : (await mlb.getSeasonLeaderboard({ season, group: 'fielding', limit: 3000 })).stats?.[0]?.splits || []
  console.log('Total splits in the pool for this season:', allSplits.length)
  const thisPlayersSplits = allSplits.filter((s) => s.player?.id === playerId)
  console.log(`Splits belonging to ${person?.fullName || `player ${playerId}`}:`, thisPlayersSplits.length)
  if (thisPlayersSplits.length === 0) {
    console.log('\n*** THIS PLAYER HAS ZERO SPLITS IN THE LEADERBOARD POOL AT ALL. ***')
    console.log('*** That means MLB\'s /stats leaderboard endpoint (used for the ')
    console.log('*** leaderboard) is not returning this player for this season/career')
    console.log('*** query, even though their per-player /people/{id}/stats endpoint')
    console.log('*** (used for their own page) does. Two different upstream MLB API')
    console.log('*** endpoints, and this one appears to be leaving this player out —')
    console.log('*** most likely because they retired before whatever cutoff or')
    console.log('*** ranking threshold this leaderboard endpoint applies internally.')
  } else {
    console.log('positionSplits from the leaderboard pool:', JSON.stringify(thisPlayersSplits.map((s) => ({
      position: s.position?.abbreviation || s.stat?.position?.abbreviation,
      innings: s.stat?.innings,
      putOuts: s.stat?.putOuts,
      assists: s.stat?.assists,
      errors: s.stat?.errors,
    })), null, 2))
    const jwinsFViaLeaderboard = computeJWinsFieldingForSeason(
      thisPlayersSplits.map((s) => ({
        stat: s.stat,
        position: s.position?.abbreviation || s.stat?.position?.abbreviation || null,
      })),
    )
    console.log('JWinsF computed via leaderboard-pool path:', jwinsFViaLeaderboard)
    console.log('\nMatches player-page value:', Math.abs((jwinsFViaLeaderboard ?? NaN) - (jwinsFViaPlayerPage ?? NaN)) < 0.01)
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err.message)
  console.error(err.stack)
})
