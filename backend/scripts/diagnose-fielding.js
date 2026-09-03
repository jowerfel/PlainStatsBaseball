#!/usr/bin/env node


import * as mlb from '../mlbClient.js'

const playerId = process.argv[2] || '592450' // Aaron Judge
const season = process.argv[3] || String(new Date().getFullYear())

console.log(`Fetching fielding stats for player ${playerId}, season ${season}...\n`)

try {
  const raw = await mlb.getPersonSeasonStats(playerId, season, 'fielding')
  console.log('=== RAW response from statsapi.mlb.com ===')
  console.log(JSON.stringify(raw, null, 2))

  console.log('\n=== What extractSeasonSplit (routes/players.js) would pull out ===')
  const splits = raw?.stats?.[0]?.splits
  console.log('raw.stats array length:', raw?.stats?.length ?? 'undefined (raw.stats is missing entirely)')
  console.log('raw.stats[0]?.splits:', splits === undefined ? 'undefined' : `array of ${splits.length}`)
  if (splits && splits.length > 0) {
    console.log('splits[0].stat (this is what should end up as fieldingSeasonStats):')
    console.log(JSON.stringify(splits[0].stat, null, 2))
  } else {
    console.log('\n*** No splits found. This means the player has no fielding stats on ')
    console.log('*** record for this season/group combination in the MLB API itself —')
    console.log('*** not a bug in this codebase, just genuinely no data for this query.')
    console.log('*** Try a different season, or a player you know played the field that year.')
  }
} catch (err) {
  console.error('Request FAILED:', err.message)
  if (err.upstreamBody) {
    console.error('Upstream response body:', err.upstreamBody)
  }
  console.error('\nIf this is a network error, check your internet connection / firewall.')
  console.error('If this is a 4xx/5xx from MLB, the message above should say which one.')
}
