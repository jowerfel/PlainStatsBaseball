// Thin wrapper around statsapi.mlb.com. 
// This is the ONLY place raw fetch() calls to the upstream API should live on the backend —
// route handlers call these functions, not fetch() directly, so caching/error-handling stays
// consistent.

const BASE_URL = 'https://statsapi.mlb.com/api/v1'

async function mlbGet(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value)
    }
  }

  const res = await fetch(url.toString())
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const err = new Error(`MLB Stats API ${res.status} for ${url.pathname}${url.search}`)
    err.status = res.status
    err.upstreamBody = body
    throw err
  }
  return res.json()
}

export function getAllActivePlayers(season, sportId = 1) {
  return mlbGet(`/sports/${sportId}/players`, { season })
}


export function getCareerLeaders({ group = 'hitting', sportId = 1, limit = 3000 } = {}) {
  return mlbGet('/stats', { stats: 'career', group, sportId, limit })
}

export function getPerson(personId, hydrate = 'currentTeam') {
  return mlbGet(`/people/${personId}`, { hydrate })
}

export function getPersonGameLog(personId, season, group = 'hitting') {
  return mlbGet(`/people/${personId}/stats`, {
    stats: 'gameLog',
    season,
    group,
  })
}

export function getPersonSeasonStats(personId, season, group = 'hitting') {
  const params = {
    stats: season === 'career' ? 'career' : 'season',
    group,
  }
  if (season !== 'career') {
    params.season = season
  }
  return mlbGet(`/people/${personId}/stats`, params)
}


export function getPersonYearByYearStats(personId, group = 'hitting') {
  return mlbGet(`/people/${personId}/stats`, {
    stats: 'yearByYear',
    group,
  })
}

export function getSchedule({ teamId, startDate, endDate, sportId = 1 } = {}) {
  return mlbGet('/schedule', { sportId, teamId, startDate, endDate })
}

export function getScheduleForDate({ date, sportId = 1, hydrate } = {}) {
  return mlbGet('/schedule', { sportId, date, hydrate })
}

export function getScheduleRange({ teamId, startDate, endDate, sportId = 1, hydrate } = {}) {
  return mlbGet('/schedule', { sportId, teamId, startDate, endDate, hydrate })
}

export function getLiveGameFeed(gamePk) {
  return mlbGet(`/game/${gamePk}/feed/live`)
}

// Separate, lighter-weight endpoints for the same game data feed/live combines — used
// instead of feed/live for a completed/historical game, since feed/live is documented as
// the LIVE-in-progress firehose and can 404 for older completed games depending on the
// gamePk, while these two dedicated endpoints are built to serve any game regardless of
// how long ago it was played.
export function getGameBoxscore(gamePk) {
  return mlbGet(`/game/${gamePk}/boxscore`)
}

export function getGamePlayByPlay(gamePk) {
  return mlbGet(`/game/${gamePk}/playByPlay`)
}

export function getGameLinescore(gamePk) {
  return mlbGet(`/game/${gamePk}/linescore`)
}

export function getTeams(sportId = 1) {
  return mlbGet('/teams', { sportId })
}

export function getTeamRoster(teamId) {
  return mlbGet(`/teams/${teamId}/roster`)
}

export function getStandings(season, leagueId = '103,104', standingsTypes) {
  const params = { leagueId, season }
  if (standingsTypes) params.standingsTypes = standingsTypes
  return mlbGet('/standings', params)
}

// Regular-season start/end dates for a given year — used to figure out how much of the
// season has actually elapsed (see projections.js's date-aware pitcher pace fix). MLB's
// own `/seasons` endpoint returns this per-season, rather than us hardcoding "the season
// runs April to October," which drifts a few days every year and breaks entirely for the
// lockout-shortened 2020/2022 calendars.
export function getSeasonDates(season, sportId = 1) {
  return mlbGet('/seasons', { season, sportId })
}

export function getSeasonLeaderboard({ season, group = 'hitting', sportId = 1, limit = 100, statType } = {}) {
  const params = {
    stats: season === 'career' ? 'career' : (statType || 'season'),
    group,
    sportId,
    limit,
  }
  if (season !== 'career') {
    params.season = season
  }
  return mlbGet('/stats', params)
}