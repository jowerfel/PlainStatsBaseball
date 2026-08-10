import { getPersonGameLog } from './mlbClient.js'
import { getPitcherGameDateSummaries } from './statcastStore.js'

const playerId = '687396'
const season = new Date().getFullYear()
const gameLog = await getPersonGameLog(playerId, season, 'pitching')
const statcastByDate = getPitcherGameDateSummaries(playerId, season)
const splits = (gameLog && gameLog.stats && gameLog.stats[0] && gameLog.stats[0].splits) || []
const starts = splits.slice(-8).reverse().map((split) => {
  const statcast = statcastByDate.get(split.date) || {}
  const opponent = typeof split.opponent === 'string'
    ? (() => {
      try { return JSON.parse(split.opponent) } catch { return split.opponent }
    })()
    : split.opponent
  return {
    gameDate: split.date,
    opponent: opponent && (opponent.name || opponent.teamName || opponent.triCode || String(opponent)),
    inningsPitched: split.stat && split.stat.inningsPitched,
    earnedRuns: split.stat && split.stat.earnedRuns,
    runsAllowed: split.stat && split.stat.runs,
    hitsAllowed: split.stat && split.stat.hits,
    homeRunsAllowed: split.stat && split.stat.homeRuns,
    walks: split.stat && split.stat.baseOnBalls,
    hitByPitch: (split.stat && split.stat.hitBatsmen) ?? (split.stat && split.stat.hitByPitch),
    strikeouts: split.stat && split.stat.strikeOuts,
    avg_velo: statcast.avg_velo || null,
    avg_spin_rate: statcast.avg_spin_rate || null,
    whiff_pct: statcast.whiff_pct || null,
    pitch_count: statcast.pitch_count || null,
    stuff_grade: null,
  }
})

console.log(JSON.stringify(starts, null, 2))
