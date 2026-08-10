<script setup>
import { ref, onMounted } from 'vue'
import { getLiveGames } from '@/services/mlbApi.js'

const games = ref([])
const date = ref(new Date().toISOString().slice(0, 10))
const loading = ref(false)
const errorMsg = ref('')
const lastLoaded = ref('')

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await getLiveGames(date.value)
    games.value = data.games || []
    lastLoaded.value = new Date().toLocaleTimeString()
  } catch (err) {
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
    <button type="submit" style="margin-left: 8px;">Refresh</button>
    <span v-if="lastLoaded" class="muted"> Last loaded {{ lastLoaded }}</span>
  </form>

  <p v-if="loading" class="muted">Loading live games&hellip;</p>
  <p v-else-if="errorMsg" class="error-text">{{ errorMsg }}</p>
  <p v-else-if="games.length === 0" class="muted">No MLB games found for this date.</p>

  <div v-else class="table-scroll section">
    <table class="plain-table">
      <thead>
        <tr>
          <th>Game</th>
          <th>Score</th>
          <th>Status</th>
          <th>Pitchers</th>
          <th>Matchup</th>
          <th>Count</th>
          <th>Latest</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="game in games" :key="game.gamePk">
          <td>
            {{ game.teams?.away?.team?.name || 'Away' }}
            @
            {{ game.teams?.home?.team?.name || 'Home' }}
          </td>
          <td>{{ score(game, 'away') }} - {{ score(game, 'home') }}</td>
          <td>{{ inningText(game) }}</td>
          <td>
            {{ pitcherName(game, 'away') }}
            /
            {{ pitcherName(game, 'home') }}
          </td>
          <td>{{ matchupText(game) }}</td>
          <td>{{ countText(game) }}</td>
          <td>{{ latestPlay(game) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
