// Frontend service layer. Calls OUR Express backend (/api/...), which proxies and caches
// the upstream MLB Stats API. Never call statsapi.mlb.com directly from the browser — that's
// what the backend proxy is for (CORS, caching, combining sources later with Statcast data).

import { getVisitorId } from './visitorId.js'

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

// Plain JSON-body POST (no request body needed for like/view — those are just an action).
async function apiPost(path) {
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.message || data.error || `Request failed (${res.status})`)
    err.status = res.status
    err.body = data
    throw err
  }
  return data
}

// Article-specific variants that attach the anonymous visitor id header (see
// services/visitorId.js) — only the articles endpoints need this, so it isn't added to
// the general-purpose apiGet/apiPost above, which every other (MLB-data) call also uses.
async function articlesGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'x-visitor-id': getVisitorId() },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.message || data.error || `Request failed (${res.status})`)
    err.status = res.status
    err.body = data
    throw err
  }
  return data
}

async function articlesMutate(path, method) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'x-visitor-id': getVisitorId() },
  })
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

export function getLeaderboard({ group = 'hitting', season, stats = [], sortStat, minPA, minIP, minInnings, limit = 100 } = {}) {
  const params = new URLSearchParams()
  params.set('group', group)
  if (season) params.set('season', season)
  if (stats.length) params.set('stats', stats.join(','))
  if (sortStat) params.set('sortStat', sortStat)
  if (minPA) params.set('minPA', minPA)
  if (minIP) params.set('minIP', minIP)
  if (minInnings) params.set('minInnings', minInnings)
  params.set('limit', limit)
  return apiGet(`/leaderboard?${params.toString()}`)
}

// JWins Complete combines a player's batting, pitching, AND fielding JWins into one
// number — no single MLB API endpoint has all three at once, so this hits a dedicated
// backend route that merges them (see backend/routes/jwins.js).
export function getJWinsComplete({ season, limit = 50 } = {}) {
  const params = new URLSearchParams()
  if (season) params.set('season', season)
  params.set('limit', limit)
  return apiGet(`/jwins/complete?${params.toString()}`)
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

export function getArticles() {
  return articlesGet('/articles')
}

// Articles are identified by their .md filename now (see backend/articlesStore.js) rather
// than a generated id — encodeURIComponent handles any spaces/special characters in a
// filename so the request URL stays valid.
export function getArticle(filename) {
  return articlesGet(`/articles/${encodeURIComponent(filename)}`)
}

export function likeArticle(filename) {
  return articlesMutate(`/articles/${encodeURIComponent(filename)}/like`, 'POST')
}

// "Unlike" — removes this visitor's like. A separate function (rather than likeArticle
// toggling) so the frontend's intent is explicit at the call site.
export function unlikeArticle(filename) {
  return articlesMutate(`/articles/${encodeURIComponent(filename)}/like`, 'DELETE')
}

export function recordArticleView(filename) {
  return articlesMutate(`/articles/${encodeURIComponent(filename)}/view`, 'POST')
}