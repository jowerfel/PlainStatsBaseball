// Frontend service layer. Calls OUR Express backend (/api/...), which proxies and caches
// the upstream MLB Stats API. Never call statsapi.mlb.com directly from the browser — that's
// what the backend proxy is for (CORS, caching, combining sources later with Statcast data).

const API_BASE = import.meta.env.VITE_API_URL || '/api'

// Uploaded PDFs are served as static files directly off the backend root (e.g.
// /articles/xyz.pdf), NOT under /api — API_BASE typically ends in "/api", so this strips
// that off to get the backend's root origin for building a full, fetchable PDF link.
// Falls back to API_BASE itself if it doesn't end in "/api" (unexpected config), which is
// still more useful than a broken relative link.
const BACKEND_ROOT = API_BASE.endsWith('/api') ? API_BASE.slice(0, -'/api'.length) : API_BASE

export function resolveArticlePdfUrl(pdfUrl) {
  return `${BACKEND_ROOT}${pdfUrl}`
}

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

// Multipart form upload (for the PDF article upload) — deliberately NOT using apiPost/
// apiGet's JSON handling, since a file upload needs FormData with no Content-Type header
// set manually (the browser sets the multipart boundary itself).
async function apiUpload(path, formData) {
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', body: formData })
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

export function getArticles() {
  return apiGet('/articles')
}

export function getArticle(articleId) {
  return apiGet(`/articles/${articleId}`)
}

export function uploadArticle({ title, file }) {
  const formData = new FormData()
  formData.set('title', title)
  formData.set('pdf', file)
  return apiUpload('/articles', formData)
}

export function likeArticle(articleId) {
  return apiPost(`/articles/${articleId}/like`)
}

export function recordArticleView(articleId) {
  return apiPost(`/articles/${articleId}/view`)
}