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
const seasonType = ref(route.query.season === 'career' ? 'career' : 'season')
const season = ref(
  route.query.season && String(route.query.season) !== 'career'
    ? String(route.query.season)
    : String(new Date().getFullYear()),
)

const availableStats = computed(() => getStatsByGroup(group.value))

const rows = ref([])
const loading = ref(false)
const errorMsg = ref('')
const hasSearched = ref(false)
const copyMsg = ref('')
const activeSortStat = ref(selectedStats.value[0] || null)
const activeSortDir = ref('desc')


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

// StatTable's own header click normally does a purely client-side re-sort, which is only
// correct if the rows it's holding are the full/true population for whatever column got
// clicked. Here they're NOT — `rows` is a server-side top-N slice already sorted by one
// particular stat, so re-sorting a different stat column client-side would just reorder
// that same incomplete slice instead of showing the actual leaders for that stat (this was
// the leaderboard sorting bug). Re-running the search against the backend with the newly
// clicked stat as sortStat gets the real top-N for that stat instead.
function onSortRequested(col) {
  if (!col.isStat) return
  if (activeSortStat.value === col.key) {
    activeSortDir.value = activeSortDir.value === 'desc' ? 'asc' : 'desc'
  } else {
    activeSortStat.value = col.key
    activeSortDir.value = 'desc'
  }
  runSearch()
}

async function runSearch() {
  loading.value = true
  errorMsg.value = ''
  hasSearched.value = true

  // Keep the active sort stat valid — if it was deselected, fall back to the first checked stat.
  if (!selectedStats.value.includes(activeSortStat.value)) {
    activeSortStat.value = selectedStats.value[0] || null
    activeSortDir.value = 'desc'
  }

  // Reflect filters in the URL so the leaderboard is shareable (spec 5.1)
  const seasonValue = seasonType.value === 'career' ? 'career' : season.value
  router.replace({
    query: {
      group: group.value,
      stats: selectedStats.value.join(','),
      sortStat: activeSortStat.value || undefined,
      minPA: minPA.value || undefined,
      minIP: minIP.value || undefined,
      season: seasonValue,
    },
  })

  try {
    const data = await getLeaderboard({
      group: group.value,
      stats: selectedStats.value,
      sortStat: activeSortStat.value,
      season: seasonValue,
      minPA: group.value === 'hitting' ? minPA.value || undefined : undefined,
      minIP: group.value === 'pitching' ? minIP.value || undefined : undefined,
      limit: 100,
    })
    rows.value = data.rows || []
    if (activeSortDir.value === 'asc') {
      rows.value = [...rows.value].reverse()
    }
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
      </label>
    </fieldset>

    <fieldset>
      <legend>Filters</legend>
      <label class="checkbox-row">
        <input type="radio" value="season" v-model="seasonType" />
        Season
      </label>
      <label class="checkbox-row">
        <input type="radio" value="career" v-model="seasonType" />
        Career
      </label>
      <div v-if="seasonType === 'season'">
        <label for="season-input">Season</label>
        <input id="season-input" v-model.number="season" type="number" min="1900" max="2100" />
      </div>

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
    <StatTable
      v-else
      :columns="columns"
      :rows="tableRows"
      :on-header-click="onSortRequested"
      :active-sort-key="activeSortStat"
      :active-sort-dir="activeSortDir"
    />
  </div>
</template>