import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'

import playersRouter from './routes/players.js'
import leaderboardsRouter from './routes/leaderboards.js'
import pitchersRouter from './routes/pitchers.js'
import liveRouter from './routes/live.js'
import standingsRouter from './routes/standings.js'
import articlesRouter from './routes/articles.js'

const app = express()
const PORT = process.env.PORT || 3001

// ES modules don't have __dirname/__filename built in (those are CommonJS globals) —
// this is the standard way to reconstruct them: derive the current file's path from
// import.meta.url, then take its directory.
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')));


app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

app.use('/api/players', playersRouter)
app.use('/api/leaderboard', leaderboardsRouter)
app.use('/api/pitchers', pitchersRouter)
app.use('/api/live', liveRouter)
app.use('/api/standings', standingsRouter)
app.use('/api/articles', articlesRouter)

console.log('Mounted API routes: /api/players, /api/leaderboard, /api/pitchers, /api/live, /api/standings, /api/articles')

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Change the listen function to accept '0.0.0.0'
app.listen(PORT, '0.0.0.0', () => {
  console.log(`PlainStats backend listening on port ${PORT}`)
})
