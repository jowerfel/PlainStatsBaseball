// Simple in-memory TTL cache for the MLB Stats API proxy layer.
// Spec section 9: "recommend a simple in-memory TTL cache (5-10 min) on the Express layer
// to avoid hammering the API during high-traffic leaderboard views."
//
// This is intentionally NOT the leaderboard_cache SQLite table from section 3 — that table
// is for computed/aggregated leaderboard results once the Statcast pipeline exists. This
// cache is a much simpler process-memory cache in front of raw upstream API responses, so
// the app works before any database is stood up. Swap or supplement with leaderboard_cache
// once section 7 step 7 (SQLite + ETL) is built.

const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 minutes

const store = new Map()

export function cacheGet(key) {
  const entry = store.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return undefined
  }
  return entry.value
}

export function cacheSet(key, value, ttlMs = DEFAULT_TTL_MS) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs })
}

// Wrap an async fetcher with caching. fn should return the value to cache (not a Response).
export async function cached(key, ttlMs, fn) {
  const hit = cacheGet(key)
  if (hit !== undefined) return hit
  const value = await fn()
  cacheSet(key, value, ttlMs)
  return value
}
