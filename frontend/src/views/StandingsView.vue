<script setup>
import { ref, onMounted } from 'vue'
import { getStandings, getHealth } from '@/services/mlbApi.js'

const season = ref(new Date().getFullYear())
const records = ref([])
const loading = ref(false)
const errorMsg = ref('')
const lastLoaded = ref('')
const backendHealthy = ref(true)

async function load() {
  loading.value = true
  errorMsg.value = ''
  backendHealthy.value = true
  try {
    await getHealth()
    const data = await getStandings(season.value)
    records.value = data.records || []
    lastLoaded.value = new Date().toLocaleTimeString()
  } catch (err) {
    backendHealthy.value = false
    errorMsg.value = err.message || 'Could not load standings.'
    records.value = []
  } finally {
    loading.value = false
  }
}

function recordText(teamRecord) {
  return `${teamRecord.wins}-${teamRecord.losses}`
}

onMounted(load)
</script>

<template>
  <h1>Standings</h1>
  <p class="subtitle">Team records, playoff races, and scoring summaries from the MLB standings feed.</p>

  <form class="plain-form" @submit.prevent="load">
    <label for="standings-season">Season</label>
    <input id="standings-season" type="number" v-model.number="season" min="1903" max="2099" />
    <button type="submit" style="margin-left: 8px;">Refresh</button>
    <span v-if="lastLoaded" class="muted"> Last loaded {{ lastLoaded }}</span>
  </form>

  <p v-if="loading" class="muted">Loading standings&hellip;</p>
  <p v-else-if="errorMsg" class="error-text">
    {{ errorMsg }}
    <template v-if="!backendHealthy"> Try restarting the backend and reloading the page.</template>
  </p>

  <div v-else-if="records.length === 0" class="muted">No standings data available.</div>

  <template v-else>
    <div v-for="(record, idx) in records" :key="idx" class="section">
      <h2>{{ record.league }} — {{ record.division }}</h2>
      <div class="table-scroll">
        <table class="plain-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Team</th>
              <th>W-L</th>
              <th>Win %</th>
              <th>GB</th>
              <th>Streak</th>
              <th>Last 10</th>
              <th>RS</th>
              <th>RA</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(team, teamIdx) in record.teamRecords" :key="team.teamId">
              <td>{{ team.divisionRank }}</td>
              <td>{{ team.abbreviation || team.teamName }}</td>
              <td>{{ recordText(team) }}</td>
              <td>{{ team.winPct }}</td>
              <td>{{ team.gamesBack || '—' }}</td>
              <td>{{ team.streak || '—' }}</td>
              <td>{{ team.lastTen || '—' }}</td>
              <td>{{ team.runsScored ?? '—' }}</td>
              <td>{{ team.runsAllowed ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </template>
</template>
