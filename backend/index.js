import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

import playersRouter from './routes/players.js'
import leaderboardsRouter from './routes/leaderboards.js'
import pitchersRouter from './routes/pitchers.js'
import liveRouter from './routes/live.js'
import standingsRouter from './routes/standings.js'
import articlesRouter from './routes/articles.js'
import jwinsRouter from './routes/jwins.js'

const app = express()
const PORT = process.env.PORT || 3001

// ES modules don't have __dirname/__filename built in (those are CommonJS globals) —
// this is the standard way to reconstruct them: derive the current file's path from
// import.meta.url, then take its directory.
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

app.use(cors())
app.use(express.json())
// redirect: false matters here — without it, express.static's default behavior is to
// 301-redirect a request for a path matching a real ON-DISK DIRECTORY (e.g. "/articles")
// to a trailing-slash version ("/articles/"), assuming it might find an index.html to
// serve from inside. That redirect respons BEFORE the SPA fallback below ever runs — which
// is exactly what broke reloading the Articles page: an old, unused directory literally
// named "public/articles" was left over from an earlier version of this feature (back
// when uploaded PDFs were stored there; articles are markdown files elsewhere now), and
// its mere existence on disk was enough to hijack the "/articles" CLIENT-SIDE ROUTE into
// a static-file redirect instead of ever reaching the Vue app. Disabling the redirect
// means express.static just says "not a file, moving on" for any directory-shaped path
// with no matching real file, letting the SPA fallback below handle it correctly — this
// protects against the exact same class of bug happening again with any other route name
// that happens to collide with a real (even stale/unused) folder under public/.
app.use(express.static(path.join(__dirname, 'public'), { redirect: false }));


app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

app.use('/api/players', playersRouter)
app.use('/api/leaderboard', leaderboardsRouter)
app.use('/api/pitchers', pitchersRouter)
app.use('/api/live', liveRouter)
app.use('/api/standings', standingsRouter)
app.use('/api/articles', articlesRouter)
app.use('/api/jwins', jwinsRouter)

console.log('Mounted API routes: /api/players, /api/leaderboard, /api/pitchers, /api/live, /api/standings, /api/articles, /api/jwins')

// An unmatched /api/* request is a real 404 — no such endpoint exists, so say so plainly.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// SPA fallback: this Express server is what actually serves the built frontend (see
// express.static(public) above — the deploy workflow copies frontend/dist/* into
// backend/public/), and client-side routes like /articles, /settings, /compare, /about
// only exist inside the Vue app's own JavaScript, not as real files or real Express
// routes. Without this, a fresh visit or a RELOAD on one of those URLs asks this server
// directly for e.g. "/articles" — express.static doesn't have a file by that name, so
// the request fell through to the catch-all above and got Express's plain JSON 404
// instead of ever loading the page. Serving index.html for any other GET request lets
// the browser load the Vue app itself, which then reads the URL and shows the right page
// — the actual fix for "reloading /articles shows {"error":"Not found"}". Must come
// AFTER express.static and the /api routes above, so real static files (JS/CSS/images)
// and real API calls are still handled correctly first; this only catches what's left.
//
// This only works when backend/public/index.html actually exists — i.e. the frontend has
// been built (`npm run build` in frontend/) and copied in (`cp -r dist/* ../backend/public/`).
// In local dev, where the frontend runs on its own via `npm run dev` (Vite), that file
// was never built at all — Vite's own dev server handles client-side routing itself, and
// this backend isn't the one serving the frontend in that setup. res.sendFile() throwing
// an uncaught ENOENT for a missing index.html would crash the whole Node process (Express
// doesn't catch fs errors inside a route handler on its own), so this checks the file
// exists first and responds with a plain explanation instead of taking the server down —
// this is expected/normal in local dev, not a bug to "fix" by faking a build.
const indexHtmlPath = path.join(__dirname, 'public', 'index.html')
app.get('*', (req, res) => {
  if (!fs.existsSync(indexHtmlPath)) {
    return res
      .status(404)
      .send(
        'backend/public/index.html not found — the frontend hasn\'t been built into ' +
          'this backend yet. If you\'re running the frontend separately in dev mode ' +
          '(npm run dev), that\'s expected: this backend only serves the frontend in a ' +
          'production-style setup, after running `npm run build` in frontend/ and ' +
          'copying dist/* into backend/public/.',
      )
  }
  res.sendFile(indexHtmlPath)
})

// Change the listen function to accept '0.0.0.0'
app.listen(PORT, '0.0.0.0', () => {
  console.log(`PlainStats backend listening on port ${PORT}`)
})
