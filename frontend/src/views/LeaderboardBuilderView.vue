<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getLeaderboard } from '@/services/mlbApi.js'
import { getStatsByGroup, formatValueAs } from '@/data/statDictionary.js'
import { getCustomStatsByGroup, getCustomStat, isCustomStatKey, computeCustomStat } from '@/data/customStats.js'
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
const availableCustomStats = computed(() => getCustomStatsByGroup(group.value))

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

// Custom stats have no statDictionary entry, so they're marked isStat: false (skips
// StatTable's dictionary-driven formatting/quality-dot logic) but still get a real
// simpleName label and a pre-formatted display value, computed below.
const columns = computed(() => [
  { key: 'playerName', label: 'Player', isStat: false, link: (row) => `/players/${row.id}` },
  { key: 'teamName', label: 'Team', isStat: false },
  ...selectedStats.value.map((key) => {
    const customDef = isCustomStatKey(key) ? getCustomStat(key) : null
    return {
      key,
      isStat: !customDef,
      label: customDef ? customDef.name : key,
    }
  }),
])

// Custom stats aren't returned by the backend (it doesn't know the formulas) — they're
// computed here, client-side, from the same raw `stat` object the backend already sends
// for every row (which includes the base fields like AB/H/2B/3B/HR/etc. formulas need).
// Custom values are pre-formatted into display strings since they skip StatTable's
// dictionary-driven number formatting (isStat: false above); numeric sort still works off
// the raw number kept in `<key>_raw`.
const tableRows = computed(() =>
  rows.value.map((r) => {
    const row = { id: r.playerId, playerName: r.playerName, teamName: r.teamName }
    for (const key of selectedStats.value) {
      if (isCustomStatKey(key)) {
        const def = getCustomStat(key)
        const raw = computeCustomStat(def, r.stat)
        row[key] = raw === null ? '—' : formatValueAs(def.format || 'decimal3', raw)
        row[`${key}_raw`] = raw
      } else {
        row[key] = r.stat?.[key]
      }
    }
    return row
  }),
)

// A custom stat's value only exists client-side, so the backend can't sort by it. When the
// active sort is a custom stat, sort the already-fetched rows here instead of re-querying.
const displayRows = computed(() => {
  if (!activeSortStat.value || !isCustomStatKey(activeSortStat.value)) return tableRows.value
  const rawKey = `${activeSortStat.value}_raw`
  const dir = activeSortDir.value === 'asc' ? 1 : -1
  return [...tableRows.value].sort((a, b) => {
    const av = a[rawKey]
    const bv = b[rawKey]
    if (av === null || av === undefined) return 1
    if (bv === null || bv === undefined) return -1
    return (av - bv) * dir
  })
})

// StatTable's own header click normally does a purely client-side re-sort, which is only
// correct if the rows it's holding are the full/true population for whatever column got
// clicked. Here they're NOT — `rows` is a server-side top-N slice already sorted by one
// particular stat, so re-sorting a different stat column client-side would just reorder
// that same incomplete slice instead of showing the actual leaders for that stat (this was
// the leaderboard sorting bug). Re-running the search against the backend with the newly
// clicked stat as sortStat gets the real top-N for that stat instead — UNLESS the clicked
// stat is a custom one, which the backend doesn't know how to sort by; that case just
// re-sorts the rows already on screen (see displayRows above).
function onSortRequested(col) {
  if (!col.isStat) return
  if (activeSortStat.value === col.key) {
    activeSortDir.value = activeSortDir.value === 'desc' ? 'asc' : 'desc'
  } else {
    activeSortStat.value = col.key
    const customDef = isCustomStatKey(col.key) ? getCustomStat(col.key) : null
    activeSortDir.value = customDef ? (customDef.goodDirection === 'low' ? 'asc' : 'desc') : 'desc'
  }
  if (isCustomStatKey(col.key)) return // displayRows handles it reactively, no refetch needed
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

  // The backend can only sort by stats it recognizes. If the active sort is a custom
  // stat, ask it to sort by the first real (non-custom) selected stat instead, then
  // displayRows re-sorts the fetched pool by the custom stat client-side.
  const backendSortStat = isCustomStatKey(activeSortStat.value)
    ? selectedStats.value.find((k) => !isCustomStatKey(k)) || undefined
    : activeSortStat.value

  try {
    const data = await getLeaderboard({
      group: group.value,
      stats: selectedStats.value.filter((k) => !isCustomStatKey(k)),
      sortStat: backendSortStat,
      season: seasonValue,
      minPA: group.value === 'hitting' ? minPA.value || undefined : undefined,
      minIP: group.value === 'pitching' ? minIP.value || undefined : undefined,
      limit: 100,
    })
    rows.value = data.rows || []
    if (!isCustomStatKey(activeSortStat.value) && activeSortDir.value === 'asc') {
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

    <fieldset v-if="availableCustomStats.length">
      <legend>Custom stats</legend>
      <label v-for="s in availableCustomStats" :key="s.key" class="checkbox-row">
        <input
          type="checkbox"
          :checked="selectedStats.includes(s.key)"
          @change="toggleStat(s.key)"
        />
        {{ s.name }}
        <span class="muted">— {{ s.formula }}</span>
      </label>
      <p class="muted" style="margin: 4px 0 0 0;">
        Want to add your own? Edit <code>frontend/src/data/customStats.js</code> — just a
        name and a formula, no other code to touch.
      </p>
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
      :rows="displayRows"
      :on-header-click="onSortRequested"
      :active-sort-key="activeSortStat"
      :active-sort-dir="activeSortDir"
    />
  </div>
</template>