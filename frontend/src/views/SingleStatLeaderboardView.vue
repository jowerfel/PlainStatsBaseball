<script setup>
import { ref, computed, watchEffect } from 'vue'
import { getLeaderboard } from '@/services/mlbApi.js'
import { statDictionary, getStatsByGroup } from '@/data/statDictionary.js'
import StatTable from '@/components/StatTable.vue'

const props = defineProps({
  statKey: { type: String, required: true },
})

const rows = ref([])
const loading = ref(true)
const errorMsg = ref('')
const showCount = ref(25)

const def = computed(() => statDictionary[props.statKey])
const otherHitting = computed(() => getStatsByGroup('hitting').filter((s) => s.key !== props.statKey))
const otherPitching = computed(() => getStatsByGroup('pitching').filter((s) => s.key !== props.statKey))

const columns = computed(() => [
  { key: 'playerName', label: 'Player', isStat: false, link: (row) => `/players/${row.id}` },
  { key: 'teamName', label: 'Team', isStat: false },
  { key: props.statKey, label: def.value?.simpleName || props.statKey, isStat: true },
])

const tableRows = computed(() =>
  rows.value.slice(0, showCount.value).map((r) => ({
    id: r.playerId,
    playerName: r.playerName,
    teamName: r.teamName,
    [props.statKey]: r.stat?.[props.statKey],
  })),
)

async function load() {
  const group = def.value?.group || 'hitting'
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await getLeaderboard({ group, stats: [props.statKey], limit: 100 })
    rows.value = data.rows || []
  } catch (err) {
    errorMsg.value = err.message || 'Could not load the leaderboard.'
  } finally {
    loading.value = false
  }
}

watchEffect(() => {
  showCount.value = 25
  if (props.statKey) load()
})
</script>

<template>
  <template v-if="def">
    <h1>{{ def.simpleName }}</h1>
    <p class="subtitle">{{ def.shortExplain }}</p>

    <div class="layout-two-col">
      <div class="layout-main">
        <p v-if="loading" class="muted">Loading&hellip;</p>
        <p v-else-if="errorMsg" class="error-text">{{ errorMsg }}</p>
        <StatTable
          v-else
          :columns="columns"
          :rows="tableRows"
          :caption="`Top ${tableRows.length} by ${def.simpleName}, current season`"
        />

        <p v-if="!loading && !errorMsg && rows.length > showCount">
          <a href="#" @click.prevent="showCount += 25">Show more</a>
        </p>
      </div>

      <div class="layout-sidebar">
        <h3>Other hitting stats</h3>
        <ul class="text-links-list">
          <li v-for="s in otherHitting" :key="s.key">
            <RouterLink :to="`/leaderboards/${s.key}`">{{ s.simpleName }}</RouterLink>
          </li>
        </ul>
        <h3>Other pitching stats</h3>
        <ul class="text-links-list">
          <li v-for="s in otherPitching" :key="s.key">
            <RouterLink :to="`/leaderboards/${s.key}`">{{ s.simpleName }}</RouterLink>
          </li>
        </ul>
      </div>
    </div>
  </template>
  <p v-else class="error-text">Unknown stat "{{ statKey }}".</p>
</template>
