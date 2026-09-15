<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { getLiveGameDetail } from '@/services/mlbApi.js'

const props = defineProps({
  gamePk: { type: String, required: true },
})

const data = ref(null)
const loading = ref(true)
const errorMsg = ref('')
// Which inning/half keys are expanded to show their at-bats — collapsed by default
// except the most recent one, so a full 9-inning game doesn't dump every pitch of every
// at-bat on screen at once.
const expandedInnings = ref(new Set())
let pollTimer = null

async function load() {
  errorMsg.value = ''
  try {
    const result = await getLiveGameDetail(props.gamePk)
    data.value = result
    if (expandedInnings.value.size === 0 && result.innings?.length) {
      // Auto-expand the most recent inning on first load only — after that, respect
      // whatever the person has manually opened/closed.
      const last = result.innings[result.innings.length - 1]
      expandedInnings.value.add(`${last.inning}-${last.half}`)
    }
  } catch (err) {
    errorMsg.value = err.body?.detail || err.message || 'Could not load this game.'
  } finally {
    loading.value = false
  }
}

function toggleInning(key) {
  if (expandedInnings.value.has(key)) {
    expandedInnings.value.delete(key)
  } else {
    expandedInnings.value.add(key)
  }
  // Set mutations don't trigger Vue reactivity on their own — reassigning a new Set
  // (copying the current contents) is what actually makes the template re-render.
  expandedInnings.value = new Set(expandedInnings.value)
}

function inningLabel(inning) {
  const half = inning.half === 'top' ? 'Top' : 'Bottom'
  return `${half} ${inning.inning}`
}

onMounted(() => {
  load()
  // Only poll while the game is actually live — a completed game's data won't change,
  // and polling a finished game forever would just waste requests.
  pollTimer = setInterval(() => {
    if (data.value?.status?.abstractGameState === 'Live') load()
  }, 15000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <p v-if="loading" class="muted">Loading game&hellip;</p>
  <p v-else-if="errorMsg" class="error-text">{{ errorMsg }}</p>

  <template v-else-if="data">
    <h1>
      {{ data.teams?.away?.name || 'Away' }}
      @
      {{ data.teams?.home?.name || 'Home' }}
    </h1>
    <p class="subtitle">
      {{ data.status?.detailedState || '' }}
      <template v-if="data.venue?.name"> — {{ data.venue.name }}</template>
    </p>

    <div class="section" v-if="data.linescore">
      <div class="table-scroll">
        <table class="plain-table">
          <thead>
            <tr>
              <th>Team</th>
              <th v-for="inn in data.linescore.innings || []" :key="inn.num">{{ inn.num }}</th>
              <th>R</th>
              <th>H</th>
              <th>E</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{{ data.teams?.away?.abbreviation || 'Away' }}</td>
              <td v-for="inn in data.linescore.innings || []" :key="inn.num">{{ inn.away?.runs ?? '' }}</td>
              <td>{{ data.linescore.teams?.away?.runs ?? '—' }}</td>
              <td>{{ data.linescore.teams?.away?.hits ?? '—' }}</td>
              <td>{{ data.linescore.teams?.away?.errors ?? '—' }}</td>
            </tr>
            <tr>
              <td>{{ data.teams?.home?.abbreviation || 'Home' }}</td>
              <td v-for="inn in data.linescore.innings || []" :key="inn.num">{{ inn.home?.runs ?? '' }}</td>
              <td>{{ data.linescore.teams?.home?.runs ?? '—' }}</td>
              <td>{{ data.linescore.teams?.home?.hits ?? '—' }}</td>
              <td>{{ data.linescore.teams?.home?.errors ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="section">
      <h2>Play by Play</h2>
      <p v-if="!data.innings || data.innings.length === 0" class="muted">No play-by-play available yet.</p>
      <div v-for="inn in data.innings" :key="`${inn.inning}-${inn.half}`" style="margin-bottom: 10px;">
        <a href="#" @click.prevent="toggleInning(`${inn.inning}-${inn.half}`)">
          {{ expandedInnings.has(`${inn.inning}-${inn.half}`) ? '▾' : '▸' }} {{ inningLabel(inn) }}
        </a>
        <div v-if="expandedInnings.has(`${inn.inning}-${inn.half}`)" style="margin-left: 16px; margin-top: 6px;">
          <div v-for="ab in inn.atBats" :key="ab.atBatIndex" style="margin-bottom: 10px;">
            <p style="margin: 0;">
              <strong>{{ ab.batter?.fullName || 'Batter' }}</strong> vs {{ ab.pitcher?.fullName || 'Pitcher' }}
              <span v-if="ab.result?.description" class="muted"> — {{ ab.result.description }}</span>
            </p>
            <div v-if="ab.pitches && ab.pitches.length" class="table-scroll" style="margin-top: 4px;">
              <table class="plain-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Pitch</th>
                    <th>Speed</th>
                    <th>Count</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in ab.pitches" :key="p.pitchNumber">
                    <td>{{ p.pitchNumber }}</td>
                    <td>{{ p.type || '—' }}</td>
                    <td>{{ p.speed !== null ? `${p.speed} mph` : '—' }}</td>
                    <td>{{ p.balls ?? 0 }}-{{ p.strikes ?? 0 }}, {{ p.outs ?? 0 }} out{{ p.outs === 1 ? '' : 's' }}</td>
                    <td>{{ p.description || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="section" v-if="data.boxscore">
      <h2>Boxscore</h2>
      <template v-for="side in ['away', 'home']" :key="side">
        <h3>{{ data.teams?.[side]?.name || side }}</h3>
        <p class="muted" style="margin: 0 0 4px 0;">Batting</p>
        <div class="table-scroll">
          <table class="plain-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Pos</th>
                <th>AB</th>
                <th>R</th>
                <th>H</th>
                <th>RBI</th>
                <th>BB</th>
                <th>SO</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in data.boxscore[side]?.batters || []" :key="b.personId">
                <td><RouterLink :to="`/players/${b.personId}`">{{ b.fullName }}</RouterLink></td>
                <td>{{ b.position || '—' }}</td>
                <td>{{ b.stats?.atBats ?? '—' }}</td>
                <td>{{ b.stats?.runs ?? '—' }}</td>
                <td>{{ b.stats?.hits ?? '—' }}</td>
                <td>{{ b.stats?.rbi ?? '—' }}</td>
                <td>{{ b.stats?.baseOnBalls ?? '—' }}</td>
                <td>{{ b.stats?.strikeOuts ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="muted" style="margin: 10px 0 4px 0;">Pitching</p>
        <div class="table-scroll">
          <table class="plain-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>IP</th>
                <th>H</th>
                <th>R</th>
                <th>ER</th>
                <th>BB</th>
                <th>SO</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in data.boxscore[side]?.pitchers || []" :key="p.personId">
                <td><RouterLink :to="`/players/${p.personId}`">{{ p.fullName }}</RouterLink></td>
                <td>{{ p.stats?.inningsPitched ?? '—' }}</td>
                <td>{{ p.stats?.hits ?? '—' }}</td>
                <td>{{ p.stats?.runs ?? '—' }}</td>
                <td>{{ p.stats?.earnedRuns ?? '—' }}</td>
                <td>{{ p.stats?.baseOnBalls ?? '—' }}</td>
                <td>{{ p.stats?.strikeOuts ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </template>
</template>
