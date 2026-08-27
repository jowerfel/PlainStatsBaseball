import { Router } from 'express'
import { listArticles, getArticle, addLike, removeLike, addView } from '../articlesStore.js'

const router = Router()

// Read-only + like/view/unlike API. There is no create or delete route here at all —
// adding an article is dropping a .md file into backend/articles/, and deleting one is
// removing that file. An HTTP endpoint that could create/delete articles would be
// reachable by anyone on the public internet, not just Joshua — a plain folder on the
// server's own filesystem has no such exposure.
//
// Articles are identified by filename (URL-encoded in the :filename param) rather than a
// generated id, since the filename IS the identity now — there's no database row to
// generate an id for.
//
// Likes and views are per-visitor (see articlesStore.js's big comment for what "visitor"
// means on a site with no accounts) — every like/view/unlike request needs an
// x-visitor-id header identifying who's asking, generated and persisted client-side in
// localStorage (see frontend/src/services/visitorId.js). Not a header a user could
// realistically be expected to forge by accident, but also not remotely tamper-proof —
// same trust level as the rest of this site's local-storage-based features.
function getVisitorId(req) {
  const id = req.get('x-visitor-id')
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

function toPublicListItem(article) {
  return {
    filename: article.filename,
    title: article.title,
    likes: article.likes,
    views: article.views,
    likedByVisitor: article.likedByVisitor,
  }
}

// GET /api/articles — newest first, list view (no body content, just what's needed for a list)
router.get('/', (req, res) => {
  try {
    const visitorId = getVisitorId(req)
    res.json({ articles: listArticles(visitorId).map(toPublicListItem) })
  } catch (err) {
    console.error('articles list failed:', err.message)
    res.status(500).json({ error: 'Could not load articles.' })
  }
})

// GET /api/articles/:filename — one article's full content for reading
router.get('/:filename', (req, res) => {
  const filename = decodeURIComponent(req.params.filename)
  const visitorId = getVisitorId(req)
  const article = getArticle(filename, visitorId)
  if (!article) return res.status(404).json({ error: 'Article not found.' })
  res.json({ article })
})

// POST /api/articles/:filename/like — adds this visitor's like (idempotent: calling it
// again while already liked just returns the current state, no error, no double-count).
router.post('/:filename/like', (req, res) => {
  const filename = decodeURIComponent(req.params.filename)
  const visitorId = getVisitorId(req)
  if (!visitorId) return res.status(400).json({ error: 'Missing visitor id.' })
  const result = addLike(filename, visitorId)
  if (!result) return res.status(404).json({ error: 'Article not found.' })
  res.json({ filename, ...result })
})

// DELETE /api/articles/:filename/like — removes this visitor's like, letting them
// "unlike" an article they'd previously liked.
router.delete('/:filename/like', (req, res) => {
  const filename = decodeURIComponent(req.params.filename)
  const visitorId = getVisitorId(req)
  if (!visitorId) return res.status(400).json({ error: 'Missing visitor id.' })
  const result = removeLike(filename, visitorId)
  if (!result) return res.status(404).json({ error: 'Article not found.' })
  res.json({ filename, ...result })
})

// POST /api/articles/:filename/view — called once, from the frontend, when someone
// actually opens an article (not on every list render, which would inflate views just
// from browsing the list page). Idempotent per visitor — a reload or re-opening the same
// article later does not add another view.
router.post('/:filename/view', (req, res) => {
  const filename = decodeURIComponent(req.params.filename)
  const visitorId = getVisitorId(req)
  if (!visitorId) return res.status(400).json({ error: 'Missing visitor id.' })
  const result = addView(filename, visitorId)
  if (!result) return res.status(404).json({ error: 'Article not found.' })
  res.json({ filename, ...result })
})

export default router
