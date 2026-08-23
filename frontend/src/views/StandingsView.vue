<script setup>
import { ref, onMounted } from 'vue'
import { getStandings, getHealth } from '@/services/mlbApi.js'

const season = ref(new Date().getFullYear())
const records = ref([])
const wildCardRecords = ref([])
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
    wildCardRecords.value = data.wildCardRecords || []
    lastLoaded.value = new Date().toLocaleTimeString()
  } catch (err) {
    backendHealthy.value = false
    errorMsg.value = err.message || 'Could not load standings.'
    records.value = []
    wildCardRecords.value = []
  } finally {
    loading.value = false
  }
}

function recordText(teamRecord) {
  return `${teamRecord.wins}-${teamRecord.losses}`
}

// Wild card leaders (rank 1-3, in each league) are already in a playoff spot; rank 4+ are
// chasing it. A thin rule between them makes the cutoff visually obvious without extra markup.
function isLastWildCardSpot(teamRecord) {
  return Number(teamRecord.wildCardRank) === 3
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

    <div class="section" v-if="wildCardRecords.length">
      <h2>Wild Card Standings</h2>
      <p class="muted">
        The top 3 teams per league (above the line) hold a wild card spot. GB is games
        behind the last wild card spot, not the division leader.
      </p>
      <div v-for="(record, idx) in wildCardRecords" :key="idx" class="section">
        <h3>{{ record.league }}</h3>
        <div class="table-scroll">
          <table class="plain-table">
            <thead>
              <tr>
                <th>WC Rank</th>
                <th>Team</th>
                <th>W-L</th>
                <th>Win %</th>
                <th>WC GB</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="team in record.teamRecords" :key="team.teamId">
                <tr :class="{ 'wc-cutoff-row': isLastWildCardSpot(team) }">
                  <td>{{ team.wildCardRank ?? '—' }}</td>
                  <td>{{ team.abbreviation || team.teamName }}</td>
                  <td>{{ recordText(team) }}</td>
                  <td>{{ team.winPct }}</td>
                  <td>{{ team.wildCardGamesBack || '—' }}</td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </template>
</template>
