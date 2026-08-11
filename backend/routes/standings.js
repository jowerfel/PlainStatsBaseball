import { Router } from 'express'
import { cached } from '../cache.js'
import * as mlb from '../mlbClient.js'

const router = Router()

// GET /api/standings?season=2026&leagueId=103,104
router.get('/', async (req, res) => {
  const season = req.query.season || new Date().getFullYear()
  const leagueId = req.query.leagueId || '103,104'

  try {
    const data = await cached(`standings:${season}:${leagueId}`, 10 * 60 * 1000, () =>
      mlb.getStandings(season, leagueId),
    )

    const records = (data.records || []).map((record) => ({
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

    res.json({ season, leagueId, records })
  } catch (err) {
    console.error('standings failed:', err.message)
    res.status(502).json({ error: 'Could not load MLB standings.' })
  }
})

export default router
