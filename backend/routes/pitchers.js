import { Router } from 'express'
import { cached } from '../cache.js'
import * as mlb from '../mlbClient.js'
import { getPitcherGameDateSummaries, getStatcastStatus } from '../statcastStore.js'

const router = Router()

// GET /api/pitchers/:id/next-start?teamId=147
//
// Looks for a real probable-starter assignment first. If MLB has not posted one yet, estimate
// from the pitcher's most recent start and match that date to the team's upcoming schedule.
router.get('/:id/next-start', async (req, res) => {
  const playerId = String(req.params.id)
  const teamId = req.query.teamId
  if (!teamId) {
    return res.status(400).json({ error: 'teamId query param is required.' })
  }

  const today = new Date()
  const startDate = today.toISOString().slice(0, 10)
  const endDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  try {
    const data = await cached(
      `schedule:${teamId}:${startDate}:${endDate}:probable`,
      5 * 60 * 1000,
      () =>
        mlb.getScheduleRange({
          teamId,
          startDate,
          endDate,
          hydrate: 'probablePitcher,linescore',
        }),
    )
    const games = (data.dates || []).flatMap((d) => d.games || [])
    const upcomingGames = games.filter((g) => g.status?.abstractGameState !== 'Final')
    const probableGame = upcomingGames.find((game) =>
      gameProbablePitcherIds(game).includes(playerId),
    )

    if (probableGame) {
      return res.json({
        nextGame: probableGame,
        estimate: {
          type: 'probable',
          estimatedStartDate: probableGame.gameDate,
          confidence: 'high',
          reason: 'MLB schedule lists this pitcher as a probable starter.',
        },
      })
    }

    const season = new Date().getFullYear()
    const recent = await cached(
      `pitcher-gamelog:${playerId}:${season}`,
      5 * 60 * 1000,
      () => mlb.getPersonGameLog(playerId, season, 'pitching').catch(() => null),
    )
    const lastStart = findMostRecentStart(recent)
    const estimatedStartDate = lastStart ? addDays(lastStart.date, 5) : null
    const estimatedGame = estimatedStartDate
      ? closestGameOnOrAfter(upcomingGames, estimatedStartDate)
      : upcomingGames[0] || null
    const nextGame = estimatedGame || upcomingGames[0] || null

    res.json({
      nextGame,
      estimate: {
        type: 'estimate',
        estimatedStartDate: nextGame?.gameDate || estimatedStartDate,
        confidence: lastStart ? 'medium' : 'low',
        reason: lastStart
          ? `Estimated from last start on ${lastStart.date} plus a typical five-day starter cycle.`
          : 'No recent start was found, so this falls back to the team schedule.',
      },
    })
  } catch (err) {
    console.error('pitchers/:id/next-start failed:', err.message)
    res.status(502).json({ error: 'Could not reach the MLB Stats API.' })
  }
})

// GET /api/pitchers/:id/recent-starts
router.get('/:id/recent-starts', async (req, res) => {
  const playerId = String(req.params.id)
  const season = req.query.season || new Date().getFullYear()

  try {
    const [gameLog, statcastByDate] = await Promise.all([
      cached(`pitcher-gamelog:${playerId}:${season}`, 5 * 60 * 1000, () =>
        mlb.getPersonGameLog(playerId, season, 'pitching').catch(() => null),
      ),
      Promise.resolve(getPitcherGameDateSummaries(playerId, season)),
    ])

    const starts = ((gameLog?.stats?.[0]?.splits || [])
      .filter((split) => Number(split.stat?.gamesStarted || 0) > 0)
      .slice(-8)
      .reverse()
      .map((split) => {
        const statcast = statcastByDate.get(split.date) || {}
        return {
          gameDate: split.date,
          opponent: split.opponent || split.opponent?.name || null,
          inningsPitched: split.stat?.inningsPitched,
          earnedRuns: split.stat?.earnedRuns,
          runsAllowed: split.stat?.runs,
          hitsAllowed: split.stat?.hits,
          homeRunsAllowed: split.stat?.homeRuns,
          walks: split.stat?.baseOnBalls,
          hitByPitch: split.stat?.hitBatsmen ?? split.stat?.hitByPitch,
          strikeouts: split.stat?.strikeOuts,
          avg_velo: statcast.avg_velo ?? null,
          avg_spin_rate: statcast.avg_spin_rate ?? null,
          whiff_pct: statcast.whiff_pct ?? null,
          pitch_count: statcast.pitch_count ?? null,
          stuff_grade: calculateStuffGrade(statcast),
        }
      }))

    res.json({
      starts,
      statcastStatus: getStatcastStatus(),
      message:
        starts.length && starts.some((start) => start.pitch_count)
          ? ''
          : 'Recent starts are shown from MLB game logs. Run the Statcast ETL to add velocity, spin, whiff rate, and Stuff Grade.',
    })
  } catch (err) {
    console.error('pitchers/:id/recent-starts failed:', err.message)
    res.status(502).json({ error: 'Could not load pitcher starts.' })
  }
})

// GET /api/pitchers/:id/summary — auto-generated template summary (spec 5.3.2)
// Same blocker as above: depends on pitcher_starts data.
router.get('/:id/summary', (req, res) => {
  res.status(501).json({
    error: 'not_implemented',
    message: 'Auto-summary requires recent-starts data from the Statcast ETL pipeline.',
  })
})

export default router

function gameProbablePitcherIds(game) {
  const ids = [
    game.teams?.away?.probablePitcher?.id,
    game.teams?.home?.probablePitcher?.id,
  ].filter(Boolean)
  return ids.map(String)
}

function findMostRecentStart(gameLog) {
  const splits = gameLog?.stats?.[0]?.splits || []
  const starts = splits.filter((split) => Number(split.stat?.gamesStarted || 0) > 0)
  return starts.at(-1) || null
}

function addDays(isoDate, days) {
  const dt = new Date(`${isoDate}T12:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString()
}

function closestGameOnOrAfter(games, isoDate) {
  const target = new Date(isoDate).getTime()
  return (
    games
      .filter((game) => new Date(game.gameDate).getTime() >= target - 24 * 60 * 60 * 1000)
      .sort(
        (a, b) =>
          Math.abs(new Date(a.gameDate).getTime() - target) -
          Math.abs(new Date(b.gameDate).getTime() - target),
      )[0] || null
  )
}

function calculateStuffGrade(statcast = {}) {
  const velo = Number(statcast.avg_velo)
  const spin = Number(statcast.avg_spin_rate)
  const whiff = Number(statcast.whiff_pct)
  if (!Number.isFinite(velo) && !Number.isFinite(spin) && !Number.isFinite(whiff)) return null

  let score = 50
  if (Number.isFinite(velo)) score += (velo - 93) * 2
  if (Number.isFinite(spin)) score += (spin - 2250) / 60
  if (Number.isFinite(whiff)) score += (whiff - 25) * 0.7
  return Math.max(20, Math.min(80, Math.round(score)))
}
