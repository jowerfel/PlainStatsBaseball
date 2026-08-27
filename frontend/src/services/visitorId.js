// A stable, anonymous, per-browser id — used ONLY so the articles feature can recognize
// "the same visitor" clicking like or opening an article twice, so likes/views count once
// per person instead of once per click/reload (see backend/articlesStore.js's big comment
// for the full reasoning). This site has no accounts and no cookies; this is the same
// trust level and mechanism as the site's existing localStorage-based features (followed
// players, theme) — a real person clearing their browser storage, or visiting from a
// different browser/device, will look like a new visitor, and that's an accepted
// limitation rather than a bug to fix (a full account system would be a much bigger
// feature than "one like per person" calls for).
//
// Nothing here is sent anywhere except attached to article like/view requests — it isn't
// a general-purpose tracking id and isn't used by anything else on the site.

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
