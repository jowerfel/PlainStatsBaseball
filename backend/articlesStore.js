// Storage for the News Articles feature.
//

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const ARTICLES_DIR = path.join(__dirname, 'articles')
const DATA_DIR = path.join(__dirname, 'db')
const COUNTERS_FILE = path.join(DATA_DIR, 'article-counters.json')

function ensureStorageReady() {
  if (!fs.existsSync(ARTICLES_DIR)) fs.mkdirSync(ARTICLES_DIR, { recursive: true })
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(COUNTERS_FILE)) fs.writeFileSync(COUNTERS_FILE, JSON.stringify({}, null, 2))
}

function readCounters() {
  ensureStorageReady()
  try {
    const raw = fs.readFileSync(COUNTERS_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (err) {
    // Corrupted file (e.g. a partial write from a crash mid-save) — fail safe to empty
    // counters rather than crashing every request that touches articles. Likes/views would
    // reset for everyone, which is unfortunate but recoverable; the bad file is left on
    // disk rather than silently overwritten, so it can still be inspected.
    console.error('articlesStore: failed to read/parse article-counters.json, treating as empty:', err.message)
    return {}
  }
}

function writeCounters(counters) {
  ensureStorageReady()
  fs.writeFileSync(COUNTERS_FILE, JSON.stringify(counters, null, 2))
}

// Each article's entry is { likedBy: [visitorId, ...], viewedBy: [visitorId, ...] } —
// arrays of visitor ids rather than a raw number, so a repeat visitor can be recognized
// and only counted once. Ensures an entry exists for `filename` without overwriting one
// that's already there.
function ensureEntry(counters, filename) {
  if (!counters[filename]) counters[filename] = { likedBy: [], viewedBy: [] }
  // Migrates the old shape ({likes: N, views: N}, from before per-visitor tracking) to
  // the new one on first touch, rather than losing existing counts outright. There's no
  // way to know WHO the old raw count represents, so those pre-existing likes/views are
  // preserved as a starting offset rather than discarded — see toPublicCounts below.
  if (typeof counters[filename].likes === 'number' && !counters[filename].likedBy) {
    counters[filename] = {
      likedBy: [],
      viewedBy: [],
      legacyLikes: counters[filename].likes,
      legacyViews: counters[filename].views,
    }
  }
  return counters[filename]
}

function toPublicCounts(entry) {
  return {
    likes: (entry.legacyLikes || 0) + entry.likedBy.length,
    views: (entry.legacyViews || 0) + entry.viewedBy.length,
  }
}

// "my-trade-deadline-preview.md" -> "My Trade Deadline Preview" — used only when a file
// has no top-level # heading to use as the title instead (see extractTitle).
function titleFromFilename(filename) {
  const base = filename.replace(/\.md$/i, '')
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// A title is: the first "# Heading" line in the file if it has one, otherwise the
// filename prettified. Either way, the heading line (if used as the title) is stripped
// out of the body that gets sent back for rendering, so it isn't shown twice.
function extractTitle(markdown, filename) {
  const lines = markdown.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '') continue
    const match = line.match(/^#\s+(.+)$/)
    if (match) {
      return { title: match[1].trim(), body: lines.slice(i + 1).join('\n').trim() }
    }
    break // first non-blank line isn't a heading — stop looking, use the filename instead
  }
  return { title: titleFromFilename(filename), body: markdown.trim() }
}

// README.md is excluded on purpose — that's the file explaining this folder's workflow
// to Joshua, not an article. Without this exclusion it would otherwise get scanned and
// shown to site visitors as a real published article, which would be a real bug.
function listMarkdownFiles() {
  ensureStorageReady()
  try {
    return fs
      .readdirSync(ARTICLES_DIR)
      .filter((f) => f.toLowerCase().endsWith('.md') && f.toLowerCase() !== 'readme.md')
  } catch (err) {
    console.error('articlesStore: failed to read articles folder:', err.message)
    return []
  }
}

// Returns every current article, newest-file-first (by file modified time — the closest
// thing to "upload order" when articles are just files dropped into a folder, not rows
// inserted with a timestamp). `visitorId` (optional) is used to also report whether THIS
// visitor has already liked each article, so the frontend can show the like button in the
// right state (liked vs. not) without a separate request per article.
export function listArticles(visitorId) {
  const files = listMarkdownFiles()
  const counters = readCounters()
  let countersChanged = false

  const articles = files.map((filename) => {
    const before = counters[filename]
    const entry = ensureEntry(counters, filename)
    if (entry !== before) countersChanged = true
    const stat = fs.statSync(path.join(ARTICLES_DIR, filename))
    const raw = fs.readFileSync(path.join(ARTICLES_DIR, filename), 'utf-8')
    const { title } = extractTitle(raw, filename)
    return {
      filename,
      title,
      ...toPublicCounts(entry),
      likedByVisitor: visitorId ? entry.likedBy.includes(visitorId) : false,
      modifiedAt: stat.mtime.toISOString(),
    }
  })

  // Only write back if something was actually new — avoids a disk write on every single
  // list request once the counters file already has every current article in it.
  if (countersChanged) writeCounters(counters)

  return articles.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt))
}

// Returns one article's title + rendered-ready markdown body, or null if the file doesn't
// exist (deleted, renamed, or never existed — all look the same from here, which is fine).
export function getArticle(filename, visitorId) {
  const files = listMarkdownFiles()
  if (!files.includes(filename)) return null

  const counters = readCounters()
  const entry = ensureEntry(counters, filename)
  writeCounters(counters)

  const raw = fs.readFileSync(path.join(ARTICLES_DIR, filename), 'utf-8')
  const { title, body } = extractTitle(raw, filename)
  return {
    filename,
    title,
    body,
    ...toPublicCounts(entry),
    likedByVisitor: visitorId ? entry.likedBy.includes(visitorId) : false,
  }
}

// Adds a like from this visitor if they haven't already liked it — a second call from the
// same visitorId is a no-op (not an error), so the frontend can call this idempotently
// without needing to track state perfectly on its own. Returns { likes, views,
// likedByVisitor }, or null if the file doesn't exist.
export function addLike(filename, visitorId) {
  if (!visitorId) return null
  if (!listMarkdownFiles().includes(filename)) return null
  const counters = readCounters()
  const entry = ensureEntry(counters, filename)
  if (!entry.likedBy.includes(visitorId)) {
    entry.likedBy.push(visitorId)
    writeCounters(counters)
  }
  return { ...toPublicCounts(entry), likedByVisitor: true }
}

// Removes this visitor's like, if they had one. A no-op (not an error) if they hadn't
// liked it, for the same idempotency reason as addLike.
export function removeLike(filename, visitorId) {
  if (!visitorId) return null
  if (!listMarkdownFiles().includes(filename)) return null
  const counters = readCounters()
  const entry = ensureEntry(counters, filename)
  const idx = entry.likedBy.indexOf(visitorId)
  if (idx !== -1) {
    entry.likedBy.splice(idx, 1)
    writeCounters(counters)
  }
  return { ...toPublicCounts(entry), likedByVisitor: false }
}

// Records a view from this visitor if they haven't already been counted for this article
// — a reload, or opening the article again later, does NOT add another view. Returns
// { likes, views }, or null if the file doesn't exist.
export function addView(filename, visitorId) {
  if (!visitorId) return null
  if (!listMarkdownFiles().includes(filename)) return null
  const counters = readCounters()
  const entry = ensureEntry(counters, filename)
  if (!entry.viewedBy.includes(visitorId)) {
    entry.viewedBy.push(visitorId)
    writeCounters(counters)
  }
  return toPublicCounts(entry)
}
