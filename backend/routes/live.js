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

// GET /api/live/:gamePk — full pitch-by-pitch play log and both teams' boxscore stats
// for one game. Works for live AND completed games — the MLB feed/live endpoint keeps
// returning the full play-by-play and boxscore after a game ends, it just stops updating,
// so this same route serves "what happened in that game" whether it's in progress or over.
router.get('/:gamePk', async (req, res) => {
  const { gamePk } = req.params

  try {
    // /boxscore and /playByPlay are dedicated, lighter-weight endpoints for the same
    // data feed/live combines — used instead of feed/live, which is documented as the
    // LIVE-in-progress firehose and can 404 for completed/historical games depending on
    // the gamePk (this is what broke every single game on this page: feed/live was being
    // called unconditionally, and it doesn't reliably serve older games at all). These
    // two endpoints are built to serve any game's data regardless of how long ago it
    // was played.
    const [boxscoreRaw, playByPlayRaw, linescoreRaw] = await Promise.all([
      cached(`game-boxscore:${gamePk}`, 15 * 1000, () => mlb.getGameBoxscore(gamePk)),
      cached(`game-playbyplay:${gamePk}`, 15 * 1000, () => mlb.getGamePlayByPlay(gamePk)),
      cached(`game-linescore:${gamePk}`, 15 * 1000, () => mlb.getGameLinescore(gamePk).catch(() => null)),
    ])

    res.json({
      gamePk: Number(gamePk),
      teams: {
        away: boxscoreRaw?.teams?.away?.team || null,
        home: boxscoreRaw?.teams?.home?.team || null,
      },
      linescore: linescoreRaw,
      innings: summarizeInnings(playByPlayRaw),
      boxscore: summarizeBoxscore(boxscoreRaw),
    })
  } catch (err) {
    // err.message is included in the response (not just logged) so a real failure —
    // wrong gamePk, MLB API being unreachable, a genuine parsing bug — is visible in the
    // browser's network tab instead of hidden behind one generic "could not load"
    // message that looks identical no matter what actually went wrong.
    console.error(`live/${gamePk} failed:`, err.message)
    console.error(err.stack)
    res.status(502).json({ error: 'Could not load this game.', detail: err.message })
  }
})

// Groups a /playByPlay response's top-level `allPlays` array (one entry per PLATE
// APPEARANCE, each carrying its own playEvents array — the individual pitches/pickoffs/
// etc. within that at-bat) by inning and half-inning, so the frontend can render a
// natural "top 1st, bottom 1st, top 2nd, ..." view instead of one flat list of at-bats.
// Confirmed via MLB's own /game/{gamePk}/playByPlay endpoint: allPlays sits at the TOP
// LEVEL of this response, unlike feed/live where the same array is nested under
// liveData.plays.
function summarizeInnings(playByPlay) {
  const allPlays = playByPlay?.allPlays || []
  const innings = new Map() // "1-top" -> { inning, half, atBats: [] }

  for (const play of allPlays) {
    const inningNum = play.about?.inning
    const half = play.about?.isTopInning ? 'top' : 'bottom'
    if (inningNum === undefined) continue
    const key = `${inningNum}-${half}`
    if (!innings.has(key)) {
      innings.set(key, { inning: inningNum, half, atBats: [] })
    }

    innings.get(key).atBats.push({
      atBatIndex: play.atBatIndex,
      batter: play.matchup?.batter || null,
      pitcher: play.matchup?.pitcher || null,
      batSide: play.matchup?.batSide?.code || null,
      pitchHand: play.matchup?.pitchHand?.code || null,
      result: play.result
        ? {
            description: play.result.description,
            event: play.result.event,
            rbi: play.result.rbi,
            awayScore: play.result.awayScore,
            homeScore: play.result.homeScore,
          }
        : null,
      // Every individual pitch (or pickoff attempt, mound visit, etc.) within this
      // at-bat — playEvents' own isPitch flag tells a real pitch apart from other game
      // events the MLB feed also logs inline (throws over, replay reviews, etc.).
      pitches: (play.playEvents || [])
        .filter((e) => e.isPitch)
        .map((e) => ({
          pitchNumber: e.pitchNumber,
          type: e.details?.type?.description || null,
          description: e.details?.description || null,
          speed: e.pitchData?.startSpeed ?? null,
          balls: e.count?.balls,
          strikes: e.count?.strikes,
          outs: e.count?.outs,
        })),
    })
  }

  return [...innings.values()].sort((a, b) => a.inning - b.inning || (a.half === 'top' ? -1 : 1))
}

// A /boxscore response's teams.{away,home}.players is a record keyed by an id-derived
// string (MLB's own feed quirk), each with .person, .position, and .stats.{batting,
// pitching,fielding} for THIS game — reshaped into arrays (sorted by batting order where
// available) since that's easier to render as two simple tables than an object keyed by
// an arbitrary string. Matching is done by comparing each player's OWN person.id field
// against the roster id lists rather than assuming any particular key format, so this
// works correctly regardless of exactly how that key is formatted.
function summarizeBoxscore(boxscore) {
  if (!boxscore) return null

  function summarizeTeam(teamBox) {
    if (!teamBox) return { batters: [], pitchers: [] }
    const playersById = teamBox.players || {}
    const battingOrderIds = new Set(teamBox.batters || [])
    const pitcherIds = new Set(teamBox.pitchers || [])

    const batters = Object.values(playersById)
      .filter((p) => battingOrderIds.has(p.person?.id) && p.stats?.batting)
      .map((p) => ({
        personId: p.person?.id,
        fullName: p.person?.fullName,
        position: p.position?.abbreviation || null,
        battingOrder: p.battingOrder || null,
        stats: p.stats.batting,
      }))
      .sort((a, b) => Number(a.battingOrder || 999) - Number(b.battingOrder || 999))

    const pitchers = Object.values(playersById)
      .filter((p) => pitcherIds.has(p.person?.id) && p.stats?.pitching)
      .map((p) => ({
        personId: p.person?.id,
        fullName: p.person?.fullName,
        stats: p.stats.pitching,
      }))

    return { batters, pitchers }
  }

  return {
    away: summarizeTeam(boxscore.teams?.away),
    home: summarizeTeam(boxscore.teams?.home),
  }
}

export default router
