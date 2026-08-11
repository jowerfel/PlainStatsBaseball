import express from 'express'
import cors from 'cors'

import playersRouter from './routes/players.js'
import leaderboardsRouter from './routes/leaderboards.js'
import pitchersRouter from './routes/pitchers.js'
import liveRouter from './routes/live.js'
import standingsRouter from './routes/standings.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

app.use('/api/players', playersRouter)
app.use('/api/leaderboard', leaderboardsRouter)
app.use('/api/pitchers', pitchersRouter)
app.use('/api/live', liveRouter)
app.use('/api/standings', standingsRouter)

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.listen(PORT, () => {
  console.log(`PlainStats backend listening on http://localhost:${PORT}`)
})
