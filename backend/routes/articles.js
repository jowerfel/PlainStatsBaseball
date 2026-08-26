import { Router } from 'express'
import { listArticles, getArticle, incrementLike, incrementView } from '../articlesStore.js'

const router = Router()

// Read-only + like/view-increment API. There is no create or delete route here at all —
// adding an article is dropping a .md file into backend/articles/, and deleting one is
// removing that file. Nothing to add here would make that any easier, and an HTTP
// endpoint that could create/delete articles would be reachable by anyone on the public
// internet, not just Joshua — a plain folder on the server's own filesystem has no such
// exposure.
//
// Articles are identified by filename (URL-encoded in the :filename param) rather than a
// generated id, since the filename IS the identity now — there's no database row to
// generate an id for.

function toPublicListItem(article) {
  return {
    filename: article.filename,
    title: article.title,
    likes: article.likes,
    views: article.views,
  }
}

// GET /api/articles — newest first, list view (no body content, just what's needed for a list)
router.get('/', (req, res) => {
  try {
    res.json({ articles: listArticles().map(toPublicListItem) })
  } catch (err) {
    console.error('articles list failed:', err.message)
    res.status(500).json({ error: 'Could not load articles.' })
  }
})

// GET /api/articles/:filename — one article's full content for reading
router.get('/:filename', (req, res) => {
  const filename = decodeURIComponent(req.params.filename)
  const article = getArticle(filename)
  if (!article) return res.status(404).json({ error: 'Article not found.' })
  res.json({ article })
})

// POST /api/articles/:filename/like
router.post('/:filename/like', (req, res) => {
  const filename = decodeURIComponent(req.params.filename)
  const counters = incrementLike(filename)
  if (!counters) return res.status(404).json({ error: 'Article not found.' })
  res.json({ filename, likes: counters.likes, views: counters.views })
})

// POST /api/articles/:filename/view — called once per open, from the frontend, when
// someone actually opens an article (not on every list render, which would inflate views
// just from browsing the list page).
router.post('/:filename/view', (req, res) => {
  const filename = decodeURIComponent(req.params.filename)
  const counters = incrementView(filename)
  if (!counters) return res.status(404).json({ error: 'Article not found.' })
  res.json({ filename, likes: counters.likes, views: counters.views })
})

export default router
