
const STORAGE_KEY = 'plainstats.visitorId'

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for older browsers without crypto.randomUUID — not cryptographically
  // strong, but this id only needs to be practically unique per browser, not
  // unguessable, so Math.random() here is an acceptable tradeoff for compatibility.
  return `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

let cachedId = null

export function getVisitorId() {
  if (cachedId) return cachedId
  try {
    const existing = localStorage.getItem(STORAGE_KEY)
    if (existing) {
      cachedId = existing
      return cachedId
    }
    const fresh = generateId()
    localStorage.setItem(STORAGE_KEY, fresh)
    cachedId = fresh
    return cachedId
  } catch {
    // localStorage unavailable (private browsing, storage disabled, etc.) — fall back to
    // an in-memory-only id for this page load. Likes/views will still work for this visit,
    // they just won't be remembered as "already liked" on the next visit.
    if (!cachedId) cachedId = generateId()
    return cachedId
  }
}
