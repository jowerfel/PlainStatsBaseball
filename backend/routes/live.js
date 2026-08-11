import { Router } from 'express'
import { cached } from '../cache.js'
import * as mlb from '../mlbClient.js'

const router = Router()

// GET /api/live?date=2026-08-09
router.get('/', async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10)

  try {
    const schedule = await cached(`live-schedule:${date}`, 30 * 1000, () =>
      mlb.getScheduleForDate({
        date,
        hydrate: 'probablePitcher,linescore',
      }),
    )
    const games = (schedule.dates || []).flatMap((d) => d.games || [])

    const liveGames = await Promise.all(
      games.map(async (game) => {
        const isLive = game.status?.abstractGameState === 'Live'
        const feed = isLive
          ? await cached(`live-feed:${game.gamePk}`, 15 * 1000, () =>
              mlb.getLiveGameFeed(game.gamePk).catch(() => null),
            )
          : null
        return summarizeGame(game, feed)
      }),
    )

    res.json({ date, count: liveGames.length, games: liveGames })
  } catch (err) {
    console.error('live failed:', err.message)
    res.status(502).json({ error: 'Could not load live MLB games.' })
  }
})

function summarizeGame(game, feed) {
  const linescore = feed?.liveData?.linescore || game.linescore || {}
  const currentPlay = feed?.liveData?.plays?.currentPlay || null
  const matchup = currentPlay?.matchup || {}
  const count = currentPlay?.count || linescore.count || {}
  const probablePitchers = {
    away:
      game.teams?.away?.probablePitcher ||
      feed?.gameData?.probablePitchers?.away ||
      null,
    home:
      game.teams?.home?.probablePitcher ||
      feed?.gameData?.probablePitchers?.home ||
      null,
  }

  return {
    gamePk: game.gamePk,
    gameDate: game.gameDate,
    status: game.status,
    venue: game.venue,
    gameType: game.gameType,
    teams: {
      away: {
        team: game.teams?.away?.team,
        score: game.teams?.away?.score ?? linescore.teams?.away?.runs ?? null,
        probablePitcher: probablePitchers.away,
        record: game.teams?.away?.team?.leagueRecord || null,
      },
      home: {
        team: game.teams?.home?.team,
        score: game.teams?.home?.score ?? linescore.teams?.home?.runs ?? null,
        probablePitcher: probablePitchers.home,
        record: game.teams?.home?.team?.leagueRecord || null,
      },
    },
    startTime: game.gameDate,
    venueName: game.venue?.name || null,
    linescore: {
      away: {
        runs: linescore.teams?.away?.runs ?? null,
        hits: linescore.teams?.away?.hits ?? null,
        errors: linescore.teams?.away?.errors ?? null,
      },
      home: {
        runs: linescore.teams?.home?.runs ?? null,
        hits: linescore.teams?.home?.hits ?? null,
        errors: linescore.teams?.home?.errors ?? null,
      },
    },
    inning: {
      current: linescore.currentInning,
      ordinal: linescore.currentInningOrdinal,
      half: linescore.inningHalf,
      state: linescore.inningState,
    },
    count: {
      balls: count.balls,
      strikes: count.strikes,
      outs: count.outs ?? linescore.outs,
    },
    matchup: {
      batter: matchup.batter || null,
      pitcher: matchup.pitcher || null,
    },
    currentPlay: currentPlay
      ? {
          result: currentPlay.result,
          about: currentPlay.about,
        }
      : null,
  }
}

export default router
