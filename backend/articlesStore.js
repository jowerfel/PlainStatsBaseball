// Persistent storage for the News Articles feature — title, uploaded PDF filename, like
// count, and view count, saved to a plain JSON file on disk.
//
// This is NOT the SQLite setup described in db/schema.sql — that's for the Statcast
// pipeline and isn't wired up anywhere in this codebase yet (see statcastStore.js). Adding
// a real database just for a handful of article rows would be a lot of new surface area
// (a driver dependency, a connection helper, migrations) for what's fundamentally a small,
// low-write-frequency list — a JSON file is the right-sized tool here, matches how the rest
// of this backend already favors simple file/process-memory state over infrastructure, and
// is trivial for a non-database person to open and read directly if something looks wrong.
//
// Reads happen far more often than writes here (every page view of the article list is a
// read; a write only happens on upload, like, or view-count), so this loads the whole file
// into memory once and writes the full file back out on every mutation — simple and correct
// at the scale this feature needs (dozens to low hundreds of articles, not thousands).

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATA_DIR = path.join(__dirname, 'db')
const DATA_FILE = path.join(DATA_DIR, 'articles.json')
export const ARTICLES_UPLOAD_DIR = path.join(__dirname, 'public', 'articles')

function ensureStorageReady() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(ARTICLES_UPLOAD_DIR)) fs.mkdirSync(ARTICLES_UPLOAD_DIR, { recursive: true })
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2))
}

function readAll() {
  ensureStorageReady()
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    // Corrupted file (e.g. a partial write from a crash mid-save) — fail safe to an empty
    // list rather than crashing every request that touches articles. The bad file is left
    // on disk rather than silently overwritten, so it can still be inspected/recovered.
    console.error('articlesStore: failed to read/parse articles.json, treating as empty:', err.message)
    return []
  }
}

function writeAll(articles) {
  ensureStorageReady()
  fs.writeFileSync(DATA_FILE, JSON.stringify(articles, null, 2))
}

export function listArticles() {
  return readAll().sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
}

export function getArticle(id) {
  return readAll().find((a) => a.id === id) || null
}

export function createArticle({ title, storedFilename, originalFilename, fileSizeBytes }) {
  const articles = readAll()
  const article = {
    id: crypto.randomUUID(),
    title,
    storedFilename,
    originalFilename,
    fileSizeBytes,
    likes: 0,
    views: 0,
    uploadedAt: new Date().toISOString(),
  }
  articles.push(article)
  writeAll(articles)
  return article
}

// Likes are a simple increment, not tied to a logged-in user (this site has no accounts
// anywhere else either) — one click = one like, same trust level as the rest of the site's
// local-storage-based "follow a player" feature. incrementLike/incrementView both return
// the updated article, or null if the id doesn't exist, so the route can 404 correctly.
export function incrementLike(id) {
  const articles = readAll()
  const article = articles.find((a) => a.id === id)
  if (!article) return null
  article.likes += 1
  writeAll(articles)
  return article
}

export function incrementView(id) {
  const articles = readAll()
  const article = articles.find((a) => a.id === id)
  if (!article) return null
  article.views += 1
  writeAll(articles)
  return article
}

export function deleteArticle(id) {
  const articles = readAll()
  const article = articles.find((a) => a.id === id)
  if (!article) return false
  writeAll(articles.filter((a) => a.id !== id))
  const filePath = path.join(ARTICLES_UPLOAD_DIR, article.storedFilename)
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch (err) {
    console.error('articlesStore: failed to delete PDF file for article', id, err.message)
  }
  return true
}
