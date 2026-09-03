import { Router } from 'express'
import { cached } from '../cache.js'
import * as mlb from '../mlbClient.js'

const router = Router()

// GET /api/standings?season=2026&leagueId=103,104
//

router.get('/', async (req, res) => {
  const season = req.query.season || new Date().getFullYear()
  const leagueId = req.query.leagueId || '103,104'

  try {
    const [divisionData, wildCardData] = await Promise.all([
      cached(`standings:${season}:${leagueId}:division`, 10 * 60 * 1000, () =>
        mlb.getStandings(season, leagueId, 'regularSeason'),
      ),
      cached(`standings:${season}:${leagueId}:wildcard`, 10 * 60 * 1000, () =>
        mlb.getStandings(season, leagueId, 'wildCard').catch((err) => {
          console.error('wildcard standings fetch failed:', err.message)
          return { records: [] }
        }),
      ),
    ])

    const records = (divisionData.records || []).map((record) => ({
      league: record.league?.name || '',
      division: record.division?.name || '',
      teamRecords: (record.teamRecords || []).map((teamRecord) => ({
        teamId: teamRecord.team?.id,
        teamName: teamRecord.team?.name,
        abbreviation: teamRecord.team?.abbreviation,
        wins: teamRecord.wins,
        losses: teamRecord.losses,
        winPct: teamRecord.winningPercentage,
        streak: teamRecord.streak?.streakCode || null,
        lastTen: teamRecord.records?.split?.lastTen || null,
        divisionRank: teamRecord.divisionRank,
        gamesBack: teamRecord.gamesBack,
        runsScored: teamRecord.runsScored,
        runsAllowed: teamRecord.runsAllowed,
      })),
    }))

    // Wild card standings come back per-league (not per-division), and only really make
    // sense for the non-division-leader teams chasing a wild card spot, but the API
    // includes everyone with a wildCardRank — division leaders show a "-" wcGamesBack.
    const wildCardRecords = (wildCardData.records || []).map((record) => ({
      league: record.league?.name || '',
      teamRecords: (record.teamRecords || [])
        .map((teamRecord) => ({
          teamId: teamRecord.team?.id,
          teamName: teamRecord.team?.name,
          abbreviation: teamRecord.team?.abbreviation,
          wins: teamRecord.wins,
          losses: teamRecord.losses,
          winPct: teamRecord.winningPercentage,
          wildCardRank: teamRecord.wildCardRank,
          wildCardGamesBack: teamRecord.wildCardGamesBack,
          wildCardEliminationNumber: teamRecord.wildCardEliminationNumber,
        }))
        .sort((a, b) => Number(a.wildCardRank) - Number(b.wildCardRank)),
    }))

    res.json({ season, leagueId, records, wildCardRecords })
  } catch (err) {
    console.error('standings failed:', err.message)
    res.status(502).json({ error: 'Could not load MLB standings.' })
  }
})

export default router
