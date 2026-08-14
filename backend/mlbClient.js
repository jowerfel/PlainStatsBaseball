// Thin wrapper around statsapi.mlb.com. See spec section 2.
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

// NOTE: the MLB Stats API has no `/people/search?names=` endpoint — that was an incorrect
// assumption carried over from the original build spec. Verified against the endpoint list
// in toddrob99/MLB-StatsAPI (the most widely used community wrapper, 800+ stars): the real
// endpoints are `people` (takes personIds, plural, for IDs you already know) and `person`
// (single known ID) — neither does name search. The actual way to search players by name is
// `/sports/{sportId}/players?season=` (full active roster for that season) filtered
// client-side, which is what community tools (e.g. mlbstatsapi's get_people_id) do under the
// hood. This returns hundreds of players, so it's cached longer and season-scoped.
export function getAllActivePlayers(season, sportId = 1) {
  return mlbGet(`/sports/${sportId}/players`, { season })
}

// Historical player search support.
//
// There is still no real `/people/search?names=` endpoint on the live API (checked again —
// only `people` and `person`, which both require IDs you already have). The `sports/{id}/players`
// endpoint above DOES accept a historical `season` and returns every player who appeared that
// year (not just currently-active players) — that's how community tools resolve old names to
// IDs (e.g. looking up a 2008 World Series roster). So "search all of history" means sweeping
// this endpoint across a set of season snapshots and de-duping by person id. We don't sweep
// every MLB season back to 1876 on every request (100+ upstream calls); instead the route layer
// picks a manageable, cached set of snapshot years — see routes/players.js for the year list
// and caching strategy.
export function getPlayersForSeason(season, sportId = 1) {
  return mlbGet(`/sports/${sportId}/players`, { season })
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

// Season-by-season career line, one row per year (and per team, if a player was traded
// mid-season — the API gives a split per team stint). `stats=yearByYear` is a documented
// stat type on this endpoint, separate from 'season' and 'career'.
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

export function getTeams(sportId = 1) {
  return mlbGet('/teams', { sportId })
}

export function getTeamRoster(teamId) {
  return mlbGet(`/teams/${teamId}/roster`)
}

export function getStandings(season, leagueId = '103,104') {
  return mlbGet('/standings', { leagueId, season })
}

export function getSeasonLeaderboard({ season, group = 'hitting', sportId = 1, limit = 100 }) {
  const params = {
    stats: season === 'career' ? 'career' : 'season',
    group,
    sportId,
    limit,
  }
  if (season !== 'career') {
    params.season = season
  }
  return mlbGet('/stats', params)
}