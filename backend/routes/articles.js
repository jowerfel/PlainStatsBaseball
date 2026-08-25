import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import crypto from 'crypto'
import {
  listArticles,
  getArticle,
  createArticle,
  incrementLike,
  incrementView,
  deleteArticle,
  ARTICLES_UPLOAD_DIR,
} from '../articlesStore.js'

const router = Router()

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024 // 25 MB — generous for a text-heavy PDF article

// Stores the uploaded PDF under a random filename (never the original filename verbatim,
// to avoid path-traversal tricks or two uploads colliding) but keeps the .pdf extension
// so the static file server and browsers both handle it correctly.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ARTICLES_UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}.pdf`),
})

function pdfFileFilter(req, file, cb) {
  const isPdfMime = file.mimetype === 'application/pdf'
  const isPdfExt = path.extname(file.originalname || '').toLowerCase() === '.pdf'
  if (isPdfMime && isPdfExt) return cb(null, true)
  cb(new Error('Only PDF files are accepted.'))
}

const upload = multer({
  storage,
  fileFilter: pdfFileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
})

// Shapes an article for API responses — adds the browser-facing PDF url (built from the
// static-served path, see index.js's express.static mount) rather than exposing the raw
// disk filename as the "url" the frontend uses.
function toPublicArticle(article) {
  return {
    id: article.id,
    title: article.title,
    likes: article.likes,
    views: article.views,
    uploadedAt: article.uploadedAt,
    fileSizeBytes: article.fileSizeBytes,
    pdfUrl: `/articles/${article.storedFilename}`,
  }
}

// GET /api/articles — newest first
router.get('/', (req, res) => {
  try {
    res.json({ articles: listArticles().map(toPublicArticle) })
  } catch (err) {
    console.error('articles list failed:', err.message)
    res.status(500).json({ error: 'Could not load articles.' })
  }
})

// GET /api/articles/:id
router.get('/:id', (req, res) => {
  const article = getArticle(req.params.id)
  if (!article) return res.status(404).json({ error: 'Article not found.' })
  res.json({ article: toPublicArticle(article) })
})

// POST /api/articles — multipart/form-data with fields: title, pdf (file)
router.post('/', (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'PDF is too large (25 MB max).' : err.message
      return res.status(400).json({ error: message })
    }
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed.' })
    }

    const title = (req.body.title || '').trim()
    if (!title) {
      return res.status(400).json({ error: 'Title is required.' })
    }
    if (!req.file) {
      return res.status(400).json({ error: 'A PDF file is required.' })
    }

    try {
      const article = createArticle({
        title,
        storedFilename: req.file.filename,
        originalFilename: req.file.originalname,
        fileSizeBytes: req.file.size,
      })
      res.status(201).json({ article: toPublicArticle(article) })
    } catch (createErr) {
      console.error('articles create failed:', createErr.message)
      res.status(500).json({ error: 'Could not save the article.' })
    }
  })
})

// POST /api/articles/:id/like
router.post('/:id/like', (req, res) => {
  const article = incrementLike(req.params.id)
  if (!article) return res.status(404).json({ error: 'Article not found.' })
  res.json({ article: toPublicArticle(article) })
})

// POST /api/articles/:id/view — called once per open, from the frontend, when someone
// actually opens an article's PDF (not on every list render, which would inflate views
// just from browsing the list page).
router.post('/:id/view', (req, res) => {
  const article = incrementView(req.params.id)
  if (!article) return res.status(404).json({ error: 'Article not found.' })
  res.json({ article: toPublicArticle(article) })
})

// DELETE /api/articles/:id — not exposed in the frontend UI yet (Joshua didn't ask for
// article management/removal), but included so cleaning up a bad upload doesn't require
// hand-editing the JSON file and manually deleting the PDF from disk.
router.delete('/:id', (req, res) => {
  const deleted = deleteArticle(req.params.id)
  if (!deleted) return res.status(404).json({ error: 'Article not found.' })
  res.json({ ok: true })
})

export default router
