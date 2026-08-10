<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getLeaderboard } from '@/services/mlbApi.js'
import { getStatsByGroup } from '@/data/statDictionary.js'
import StatTable from '@/components/StatTable.vue'

const route = useRoute()
const router = useRouter()

const group = ref(route.query.group === 'pitching' ? 'pitching' : 'hitting')
const selectedStats = ref(
  route.query.stats ? String(route.query.stats).split(',') : ['avg', 'ops'],
)
const minPA = ref(route.query.minPA || '')
const minIP = ref(route.query.minIP || '')
const season = ref(route.query.season || new Date().getFullYear())

const availableStats = computed(() => getStatsByGroup(group.value))

const rows = ref([])
const loading = ref(false)
const errorMsg = ref('')
const hasSearched = ref(false)
const copyMsg = ref('')

// Statcast-derived stats show values when backend/db/plainstats.sqlite has been populated
// by the ETL. Before that, they still appear so shared leaderboards do not break.
const statcastOnlyKeys = ['xwoba', 'barrel_pct', 'exit_velocity', 'spin_rate', 'k_pct', 'bb_pct']

function toggleStat(key) {
  const idx = selectedStats.value.indexOf(key)
  if (idx === -1) {
    selectedStats.value.push(key)
  } else {
    selectedStats.value.splice(idx, 1)
  }
}

const columns = computed(() => [
  { key: 'playerName', label: 'Player', isStat: false, link: (row) => `/players/${row.id}` },
  { key: 'teamName', label: 'Team', isStat: false },
  ...selectedStats.value.map((key) => ({ key, isStat: true, label: key })),
])

const tableRows = computed(() =>
  rows.value.map((r) => ({
    id: r.playerId,
    playerName: r.playerName,
    teamName: r.teamName,
    ...Object.fromEntries(selectedStats.value.map((key) => [key, r.stat?.[key]])),
  })),
)

async function runSearch() {
  loading.value = true
  errorMsg.value = ''
  hasSearched.value = true

  // Reflect filters in the URL so the leaderboard is shareable (spec 5.1)
  router.replace({
    query: {
      group: group.value,
      stats: selectedStats.value.join(','),
      minPA: minPA.value || undefined,
      minIP: minIP.value || undefined,
      season: season.value,
    },
  })

  try {
    const data = await getLeaderboard({
      group: group.value,
      stats: selectedStats.value,
      season: season.value,
      minPA: group.value === 'hitting' ? minPA.value || undefined : undefined,
      minIP: group.value === 'pitching' ? minIP.value || undefined : undefined,
      limit: 100,
    })
    rows.value = data.rows || []
  } catch (err) {
    errorMsg.value = err.message || 'Could not build the leaderboard.'
  } finally {
    loading.value = false
  }
}

function copyLink() {
  navigator.clipboard.writeText(window.location.href).then(() => {
    copyMsg.value = 'Link copied.'
    setTimeout(() => (copyMsg.value = ''), 2000)
  })
}

// If the URL arrived with query params (someone followed a shared link), run the search immediately.
if (route.query.stats) {
  runSearch()
}
</script>

<template>
  <h1>Custom Leaderboard Builder</h1>
  <p class="subtitle">Pick the stats you care about and filter by playing time.</p>

  <form class="plain-form" @submit.prevent="runSearch">
    <fieldset>
      <legend>Category</legend>
      <label class="checkbox-row">
        <input type="radio" value="hitting" v-model="group" @change="selectedStats = ['avg', 'ops']" />
        Hitting
      </label>
      <label class="checkbox-row">
        <input type="radio" value="pitching" v-model="group" @change="selectedStats = ['era', 'whip']" />
        Pitching
      </label>
    </fieldset>

    <fieldset>
      <legend>Stats to show</legend>
      <label v-for="s in availableStats" :key="s.key" class="checkbox-row">
        <input
          type="checkbox"
          :checked="selectedStats.includes(s.key)"
          @change="toggleStat(s.key)"
        />
        {{ s.simpleName }}
        <span v-if="statcastOnlyKeys.includes(s.key)" class="muted">
          (Statcast/derived)
        </span>
      </label>
    </fieldset>

    <fieldset>
      <legend>Filters</legend>
      <label for="season-input">Season</label>
      <input id="season-input" v-model="season" type="number" min="1900" max="2100" />

      <template v-if="group === 'hitting'">
        <label for="minpa-input">Minimum plate appearances</label>
        <input id="minpa-input" v-model="minPA" type="number" min="0" placeholder="e.g. 200" />
      </template>
      <template v-else>
        <label for="minip-input">Minimum innings pitched</label>
        <input id="minip-input" v-model="minIP" type="number" min="0" placeholder="e.g. 50" />
      </template>
    </fieldset>

    <button type="submit">Build leaderboard</button>
  </form>

  <div class="section" v-if="hasSearched">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <h2 style="border: none; margin: 0;">Results</h2>
      <span>
        <a href="#" @click.prevent="copyLink">Copy link to this leaderboard</a>
        <span v-if="copyMsg" class="muted"> — {{ copyMsg }}</span>
      </span>
    </div>

    <p v-if="loading" class="muted">Loading&hellip;</p>
    <p v-else-if="errorMsg" class="error-text">{{ errorMsg }}</p>
    <p v-else-if="selectedStats.length === 0" class="muted">Pick at least one stat above.</p>
    <StatTable v-else :columns="columns" :rows="tableRows" />
  </div>
</template>
