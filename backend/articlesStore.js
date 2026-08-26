// Storage for the News Articles feature.
//
// The article itself — title and content — lives as a plain .md file dropped into
// backend/articles/. That folder IS the source of truth for which articles exist: adding
// an article is just saving a new .md file there, and deleting one is just removing the
// file. No command to run, no ids to look up first.
//
// Likes and views can't live in the .md file itself (there's nowhere sensible to put a
// mutable counter inside a content file that's meant to be hand-edited), so those are
// tracked separately in a small JSON file keyed by filename. On every read, this scans
// the articles folder and matches each file against its counters — a file with no
// counters entry yet (a newly dropped-in article) gets one created on first read.
//
// This is NOT the SQLite setup described in db/schema.sql — that's for the Statcast
// pipeline and isn't wired up anywhere in this codebase yet (see statcastStore.js). A
// folder of files plus a small JSON counters sidecar is the right-sized tool for what's
// fundamentally a handful of articles.

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
// inserted with a timestamp).
export function listArticles() {
  const files = listMarkdownFiles()
  const counters = readCounters()
  let countersChanged = false

  const articles = files.map((filename) => {
    if (!counters[filename]) {
      counters[filename] = { likes: 0, views: 0 }
      countersChanged = true
    }
    const stat = fs.statSync(path.join(ARTICLES_DIR, filename))
    const raw = fs.readFileSync(path.join(ARTICLES_DIR, filename), 'utf-8')
    const { title } = extractTitle(raw, filename)
    return {
      filename,
      title,
      likes: counters[filename].likes,
      views: counters[filename].views,
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
export function getArticle(filename) {
  const files = listMarkdownFiles()
  if (!files.includes(filename)) return null

  const counters = readCounters()
  if (!counters[filename]) {
    counters[filename] = { likes: 0, views: 0 }
    writeCounters(counters)
  }

  const raw = fs.readFileSync(path.join(ARTICLES_DIR, filename), 'utf-8')
  const { title, body } = extractTitle(raw, filename)
  return {
    filename,
    title,
    body,
    likes: counters[filename].likes,
    views: counters[filename].views,
  }
}

// Likes are a simple increment, not tied to a logged-in user (this site has no accounts
// anywhere else either) — one click = one like, same trust level as the rest of the site's
// local-storage-based "follow a player" feature. incrementLike/incrementView both return
// the updated counts, or null if the file doesn't exist, so the route can 404 correctly.
export function incrementLike(filename) {
  if (!listMarkdownFiles().includes(filename)) return null
  const counters = readCounters()
  if (!counters[filename]) counters[filename] = { likes: 0, views: 0 }
  counters[filename].likes += 1
  writeCounters(counters)
  return counters[filename]
}

export function incrementView(filename) {
  if (!listMarkdownFiles().includes(filename)) return null
  const counters = readCounters()
  if (!counters[filename]) counters[filename] = { likes: 0, views: 0 }
  counters[filename].views += 1
  writeCounters(counters)
  return counters[filename]
}
