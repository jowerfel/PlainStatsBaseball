<script setup>
import { computed, ref, onMounted } from 'vue'
import { getLiveGames, getHealth } from '@/services/mlbApi.js'

const games = ref([])
const date = ref(new Date().toISOString().slice(0, 10))
const filterState = ref('all')
const loading = ref(false)
const errorMsg = ref('')
const lastLoaded = ref('')
const backendHealthy = ref(true)

const filteredGames = computed(() =>
  games.value.filter((game) => {
    if (filterState.value === 'all') return true
    const state = game.status?.abstractGameState || ''
    if (filterState.value === 'live') return state === 'Live'
    if (filterState.value === 'scheduled') return state === 'Preview'
    if (filterState.value === 'final') return state === 'Final'
    return true
  }),
)

function formatTeamRecord(record) {
  return record ? `${record.wins}-${record.losses}` : '—'
}

function formatStartTime(game) {
  const dateValue = game.startTime || game.gameDate
  if (!dateValue) return '—'
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

async function load() {
  loading.value = true
  errorMsg.value = ''
  backendHealthy.value = true
  try {
    await getHealth()
    const data = await getLiveGames(date.value)
    games.value = data.games || []
    lastLoaded.value = new Date().toLocaleTimeString()
  } catch (err) {
    backendHealthy.value = false
    errorMsg.value = err.message || 'Could not load live games.'
    games.value = []
  } finally {
    loading.value = false
  }
}

function score(game, side) {
  const value = game.teams?.[side]?.score
  return value === null || value === undefined ? '-' : value
}

function pitcherName(game, side) {
  return game.teams?.[side]?.probablePitcher?.fullName || 'TBD'
}

function inningText(game) {
  if (game.status?.abstractGameState !== 'Live') return game.status?.detailedState || 'Scheduled'
  const half = game.inning?.half ? `${game.inning.half} ` : ''
  return `${half}${game.inning?.ordinal || game.inning?.current || ''}`.trim()
}

function matchupText(game) {
  const batter = game.matchup?.batter?.fullName
  const pitcher = game.matchup?.pitcher?.fullName
  if (!batter && !pitcher) return '—'
  return `${batter || 'Batter TBD'} vs ${pitcher || 'Pitcher TBD'}`
}

function countText(game) {
  const balls = game.count?.balls
  const strikes = game.count?.strikes
  const outs = game.count?.outs
  if (balls === undefined && strikes === undefined && outs === undefined) return '—'
  return `${balls ?? 0}-${strikes ?? 0}, ${outs ?? 0} out${outs === 1 ? '' : 's'}`
}

function latestPlay(game) {
  return game.currentPlay?.result?.description || game.status?.detailedState || '—'
}

onMounted(load)
</script>

<template>
  <h1>Live Games</h1>
  <p class="subtitle">Scores, probable pitchers, current matchups, and the latest live play.</p>

  <form class="plain-form" @submit.prevent="load">
    <label for="live-date">Date</label>
    <input id="live-date" v-model="date" type="date" />
    <label for="live-filter" style="margin-left: 16px;">Show</label>
    <select id="live-filter" v-model="filterState" style="margin-left: 4px;">
      <option value="all">All games</option>
      <option value="live">Live only</option>
      <option value="scheduled">Scheduled</option>
      <option value="final">Final</option>
    </select>
    <button type="submit" style="margin-left: 8px;">Refresh</button>
    <span v-if="lastLoaded" class="muted"> Last loaded {{ lastLoaded }}</span>
  </form>

  <p v-if="loading" class="muted">Loading live games&hellip;</p>
  <p v-else-if="errorMsg" class="error-text">
    {{ errorMsg }}
    <template v-if="!backendHealthy"> Try restarting the backend and reloading the page.</template>
  </p>
  <p v-else-if="games.length === 0" class="muted">No MLB games found for this date.</p>

  <div v-else class="table-scroll section">
    <table class="plain-table">
      <thead>
        <tr>
          <th>Game</th>
          <th>Score</th>
          <th>Status</th>
          <th>Venue</th>
          <th>Pitchers</th>
          <th>Matchup</th>
          <th>Count</th>
          <th>Latest</th>
          <th>Start</th>
          <th>Linescore</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="game in filteredGames" :key="game.gamePk">
          <td>
            {{ game.teams?.away?.team?.name || 'Away' }}
            @
            {{ game.teams?.home?.team?.name || 'Home' }}
            <div class="muted" style="font-size: 11px;">{{ game.venueName || game.venue?.name || 'Unknown venue' }}</div>
          </td>
          <td>
            {{ score(game, 'away') }} - {{ score(game, 'home') }}
            <div class="muted" style="font-size: 11px;">
              {{ game.teams?.away?.team?.abbreviation || '' }} {{ formatTeamRecord(game.teams?.away?.record) }}
              vs
              {{ game.teams?.home?.team?.abbreviation || '' }} {{ formatTeamRecord(game.teams?.home?.record) }}
            </div>
          </td>
          <td>{{ inningText(game) }}</td>
          <td>{{ game.venueName || '—' }}</td>
          <td>{{ formatStartTime(game) }}</td>
          <td>
            {{ pitcherName(game, 'away') }}
            /
            {{ pitcherName(game, 'home') }}
          </td>
          <td>{{ matchupText(game) }}</td>
          <td>{{ countText(game) }}</td>
          <td>{{ latestPlay(game) }}</td>
          <td>{{ formatStartTime(game) }}</td>
          <td>
            {{ game.linescore.away.runs ?? '-' }}-{{ game.linescore.home.runs ?? '-' }}
            {{ game.linescore.away.hits != null && game.linescore.home.hits != null ? `, ${game.linescore.away.hits}-${game.linescore.home.hits} H` : '' }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
