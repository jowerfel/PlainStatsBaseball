// Article management CLI — the ONLY way to add or delete articles.//
// Adding/deleting used to be public HTTP endpoints (POST/DELETE /api/articles), but
// Joshua asked for "only I can add and delete" once the site is actually published. An
// HTTP endpoint reachable by anyone who knows the URL can't guarantee that — even with a
// hidden "admin" button in the frontend, the underlying POST/DELETE routes are still
// callable directly with curl by anyone. The only way to actually make this owner-only is
// to not expose it over the network at all: this script talks straight to articlesStore.js
// (the same file the server itself reads from) and only runs locally, in your own
// terminal, with your own filesystem access — there's nothing for the public site to attack.
//
// Run these from the backend/ folder (so relative PDF paths resolve the way you'd expect):
//
//   node scripts/manage-articles.js add "Trade Deadline Preview" ./drafts/deadline.pdf
//   node scripts/manage-articles.js list
//   node scripts/manage-articles.js delete <article-id>
//
// "list" is there so you can find an article's id before deleting it — the public site
// intentionally doesn't show ids anywhere.

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { listArticles, createArticle, deleteArticle, ARTICLES_UPLOAD_DIR } from '../articlesStore.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function printUsage() {
  console.log(`Usage:
  node scripts/manage-articles.js add "<title>" <path-to-pdf>
  node scripts/manage-articles.js list
  node scripts/manage-articles.js delete <article-id>`)
}

function addArticle(title, pdfPath) {
  if (!title || !title.trim()) {
    console.error('Error: title is required.')
    process.exit(1)
  }
  if (!pdfPath) {
    console.error('Error: path to a PDF file is required.')
    process.exit(1)
  }

  const resolvedPath = path.resolve(process.cwd(), pdfPath)
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: file not found: ${resolvedPath}`)
    process.exit(1)
  }
  if (path.extname(resolvedPath).toLowerCase() !== '.pdf') {
    console.error('Error: only .pdf files are accepted.')
    process.exit(1)
  }

  // Same "never trust the original filename" approach the old upload route used — copy
  // under a fresh random name so two articles can never collide and nothing in the
  // original filename (spaces, odd characters, a path-traversal attempt) matters.
  const storedFilename = `${crypto.randomUUID()}.pdf`
  fs.mkdirSync(ARTICLES_UPLOAD_DIR, { recursive: true })
  fs.copyFileSync(resolvedPath, path.join(ARTICLES_UPLOAD_DIR, storedFilename))

  const { size } = fs.statSync(resolvedPath)
  const article = createArticle({
    title: title.trim(),
    storedFilename,
    originalFilename: path.basename(resolvedPath),
    fileSizeBytes: size,
  })

  console.log(`Added article "${article.title}" (id: ${article.id})`)
}

function listAll() {
  const articles = listArticles()
  if (articles.length === 0) {
    console.log('No articles yet.')
    return
  }
  for (const a of articles) {
    console.log(`${a.id}  ${a.title}  (${a.likes} likes, ${a.views} views, uploaded ${a.uploadedAt})`)
  }
}

function removeArticle(id) {
  if (!id) {
    console.error('Error: article id is required. Run "list" first to find it.')
    process.exit(1)
  }
  const deleted = deleteArticle(id)
  if (!deleted) {
    console.error(`Error: no article found with id ${id}`)
    process.exit(1)
  }
  console.log(`Deleted article ${id}`)
}

const [, , command, ...args] = process.argv

switch (command) {
  case 'add':
    addArticle(args[0], args[1])
    break
  case 'list':
    listAll()
    break
  case 'delete':
    removeArticle(args[0])
    break
  default:
    printUsage()
    process.exit(command ? 1 : 0)
}
