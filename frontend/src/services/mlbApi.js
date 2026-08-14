// Frontend service layer. Calls OUR Express backend (/api/...), which proxies and caches
// the upstream MLB Stats API. Never call statsapi.mlb.com directly from the browser — that's
// what the backend proxy is for (CORS, caching, combining sources later with Statcast data).

const API_BASE = import.meta.env.VITE_API_URL || '/api'

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.message || data.error || `Request failed (${res.status})`)
    err.status = res.status
    err.body = data
    throw err
  }
  return data
}

export function searchPlayers(query) {
  return apiGet(`/players/search?q=${encodeURIComponent(query)}`)
}

export function getPlayer(playerId, season) {
  const q = season ? `?season=${season}` : ''
  return apiGet(`/players/${playerId}${q}`)
}

export function getPlayerGameLog(playerId, { season, group = 'hitting' } = {}) {
  const params = new URLSearchParams()
  if (season) params.set('season', season)
  params.set('group', group)
  return apiGet(`/players/${playerId}/gamelog?${params.toString()}`)
}

export function getPlayerYearByYear(playerId, { group = 'hitting' } = {}) {
  const params = new URLSearchParams()
  params.set('group', group)
  return apiGet(`/players/${playerId}/year-by-year?${params.toString()}`)
}

export function getLeaderboard({ group = 'hitting', season, stats = [], sortStat, minPA, minIP, limit = 100 } = {}) {
  const params = new URLSearchParams()
  params.set('group', group)
  if (season) params.set('season', season)
  if (stats.length) params.set('stats', stats.join(','))
  if (sortStat) params.set('sortStat', sortStat)
  if (minPA) params.set('minPA', minPA)
  if (minIP) params.set('minIP', minIP)
  params.set('limit', limit)
  return apiGet(`/leaderboard?${params.toString()}`)
}

export function getPitcherNextStart(playerId, teamId) {
  return apiGet(`/pitchers/${playerId}/next-start?teamId=${teamId}`)
}

export function getPitcherRecentStarts(playerId) {
  return apiGet(`/pitchers/${playerId}/recent-starts`)
}

export function getLiveGames(date) {
  const q = date ? `?date=${encodeURIComponent(date)}` : ''
  return apiGet(`/live${q}`)
}

export function getStandings(season) {
  const q = season ? `?season=${encodeURIComponent(season)}` : ''
  return apiGet(`/standings${q}`)
}

export function getHealth() {
  return apiGet('/health')
}