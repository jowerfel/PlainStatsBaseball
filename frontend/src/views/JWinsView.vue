<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getLeaderboard, getJWinsComplete } from '@/services/mlbApi.js'
import { formatStatValue } from '@/data/statDictionary.js'
import StatTable from '@/components/StatTable.vue'

const route = useRoute()
const router = useRouter()

// Three tabs: career leaders (any single facet), single-season leaders (any single
// facet, a chosen year), and JWins Complete (batting+pitching+fielding combined).
const VALID_TABS = ['career', 'season', 'complete']
const activeTab = ref(VALID_TABS.includes(route.query.tab) ? route.query.tab : 'career')

// For the career/season tabs — which single JWins facet to show.
const facet = ref(['pitching', 'fielding'].includes(route.query.facet) ? route.query.facet : 'batting')
const facetToGroupAndStat = {
  batting: { group: 'hitting', stat: 'war' },
  pitching: { group: 'pitching', stat: 'war_pitching' },
  fielding: { group: 'fielding', stat: 'war_fielding' },
}

const season = ref(route.query.season || String(new Date().getFullYear()))

const rows = ref([])
const loading = ref(false)
const errorMsg = ref('')

function syncUrl() {
  router.replace({
    query: {
      tab: activeTab.value,
      facet: activeTab.value !== 'complete' ? facet.value : undefined,
      season: activeTab.value === 'season' || activeTab.value === 'complete' ? season.value : undefined,
    },
  })
}

async function loadFacetLeaderboard(seasonValue) {
  loading.value = true
  errorMsg.value = ''
  try {
    const { group, stat } = facetToGroupAndStat[facet.value]
    const data = await getLeaderboard({
      group,
      season: seasonValue,
      stats: [stat],
      sortStat: stat,
      limit: 50,
    })
    rows.value = (data.rows || []).map((r, idx) => ({
      id: r.playerId,
      rank: idx + 1,
      playerName: r.playerName,
      teamName: r.teamName,
      jwins: r.stat?.[stat],
    }))
  } catch (err) {
    errorMsg.value = err.message || 'Could not load this leaderboard.'
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function loadComplete() {
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await getJWinsComplete({ season: season.value, limit: 50 })
    rows.value = (data.rows || []).map((r, idx) => ({
      id: r.playerId,
      rank: idx + 1,
      playerName: r.playerName,
      teamName: r.teamName,
      batting: r.batting,
      pitching: r.pitching,
      fielding: r.fielding,
      jwinsComplete: r.jwinsComplete,
    }))
  } catch (err) {
    errorMsg.value = err.message || 'Could not load the JWins Complete leaderboard.'
    rows.value = []
  } finally {
    loading.value = false
  }
}

function load() {
  syncUrl()
  if (activeTab.value === 'career') {
    loadFacetLeaderboard('career')
  } else if (activeTab.value === 'season') {
    loadFacetLeaderboard(season.value)
  } else {
    loadComplete()
  }
}

function setTab(tab) {
  activeTab.value = tab
  load()
}

const facetLabel = computed(() => {
  if (facet.value === 'pitching') return 'JWinsP (pitching)'
  if (facet.value === 'fielding') return 'JWinsF (fielding)'
  return 'JWinsB (batting)'
})

const columns = computed(() => {
  if (activeTab.value === 'complete') {
    return [
      { key: 'rank', label: '#', isStat: false },
      { key: 'playerName', label: 'Player', isStat: false, link: (row) => `/players/${row.id}` },
      { key: 'teamName', label: 'Team', isStat: false },
      { key: 'battingDisplay', label: 'JWinsB', isStat: false },
      { key: 'pitchingDisplay', label: 'JWinsP', isStat: false },
      { key: 'fieldingDisplay', label: 'JWinsF', isStat: false },
      { key: 'completeDisplay', label: 'JWins Complete', isStat: false },
    ]
  }
  return [
    { key: 'rank', label: '#', isStat: false },
    { key: 'playerName', label: 'Player', isStat: false, link: (row) => `/players/${row.id}` },
    { key: 'teamName', label: 'Team', isStat: false },
    { key: 'jwinsDisplay', label: facetLabel.value, isStat: false },
  ]
})

// Pre-formatted for display rather than routed through StatTable's dictionary-driven
// formatting — Complete's three component columns aren't real statDictionary entries on
// their own (they're the same war/war_pitching/war_fielding values, just relabeled per
// column here), so this keeps that formatting decision local to this page.
const displayRows = computed(() =>
  rows.value.map((r) => {
    if (activeTab.value === 'complete') {
      return {
        ...r,
        battingDisplay: formatStatValue('war', r.batting),
        pitchingDisplay: formatStatValue('war_pitching', r.pitching),
        fieldingDisplay: formatStatValue('war_fielding', r.fielding),
        completeDisplay: formatStatValue('war', r.jwinsComplete),
      }
    }
    return { ...r, jwinsDisplay: formatStatValue(facetToGroupAndStat[facet.value].stat, r.jwins) }
  }),
)

const leader = computed(() => (rows.value.length > 0 ? rows.value[0] : null))

onMounted(load)
</script>

<template>
  <h1>JWins</h1>
  <p class="subtitle">
    PlainStats' own custom Wins Above Replacement — batting, pitching, fielding, or all
    three combined. See the <RouterLink to="/about">About page</RouterLink> for exactly
    how each is calculated.
  </p>

  <div class="section" style="display: flex; gap: 16px; flex-wrap: wrap;">
    <label class="checkbox-row" style="display: inline; margin-right: 10px;">
      <input type="radio" value="career" :checked="activeTab === 'career'" @change="setTab('career')" />
      Career Leaders
    </label>
    <label class="checkbox-row" style="display: inline; margin-right: 10px;">
      <input type="radio" value="season" :checked="activeTab === 'season'" @change="setTab('season')" />
      Single Season Leaders
    </label>
    <label class="checkbox-row" style="display: inline;">
      <input type="radio" value="complete" :checked="activeTab === 'complete'" @change="setTab('complete')" />
      JWins Complete
    </label>
  </div>

  <div class="section" v-if="activeTab !== 'complete'" style="display: flex; gap: 16px; flex-wrap: wrap;">
    <div>
      <strong class="muted" style="font-size: 12px;">Facet:</strong>
      <label class="checkbox-row" style="display: inline; margin-right: 10px;">
        <input type="radio" value="batting" :checked="facet === 'batting'" @change="facet = 'batting'; load()" />
        Batting
      </label>
      <label class="checkbox-row" style="display: inline; margin-right: 10px;">
        <input type="radio" value="pitching" :checked="facet === 'pitching'" @change="facet = 'pitching'; load()" />
        Pitching
      </label>
      <label class="checkbox-row" style="display: inline;">
        <input type="radio" value="fielding" :checked="facet === 'fielding'" @change="facet = 'fielding'; load()" />
        Fielding
      </label>
    </div>
  </div>

  <form v-if="activeTab === 'season' || activeTab === 'complete'" class="plain-form" @submit.prevent="load">
    <label for="jwins-season">Season</label>
    <input id="jwins-season" v-model="season" type="number" min="1900" max="2100" />
    <button type="submit" style="margin-left: 8px;">Go</button>
  </form>

  <div class="section">
    <p v-if="loading" class="muted">Loading&hellip;</p>
    <p v-else-if="errorMsg" class="error-text">{{ errorMsg }}</p>
    <template v-else>
      <p v-if="leader" class="muted">
        Leader: <strong>{{ leader.playerName }}</strong>
        <template v-if="activeTab === 'complete'"> — {{ formatStatValue('war', leader.jwinsComplete) }} JWins Complete</template>
        <template v-else> — {{ formatStatValue(facetToGroupAndStat[facet].stat, leader.jwins) }} {{ facetLabel }}</template>
      </p>
      <StatTable :columns="columns" :rows="displayRows" />
    </template>
  </div>
</template>
