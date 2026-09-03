<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getLeaderboard, getJWinsComplete, getJWinsBestSingleSeason } from '@/services/mlbApi.js'
import { formatStatValue } from '@/data/statDictionary.js'
import StatTable from '@/components/StatTable.vue'

const route = useRoute()
const router = useRouter()

// Three tabs, all leaderboards of JWins in one form or another:
//   - career: this player's whole career, one number
//   - season: one chosen year
//   - bestSeason: the best INDIVIDUAL SEASON anyone's ever had, scanned across many years
//     (not "who's good this year" — "what's the greatest season on record")
const VALID_TABS = ['career', 'season', 'bestSeason']
const activeTab = ref(VALID_TABS.includes(route.query.tab) ? route.query.tab : 'career')

// Facet is now Batting / Pitching / Fielding / Complete together (Complete used to be
// its own tab — folded into the facet selector instead, alongside the other three, since
// it's really just a 4th way of looking at the same "how good was this player" question).
const VALID_FACETS = ['batting', 'pitching', 'fielding', 'complete']
const facet = ref(VALID_FACETS.includes(route.query.facet) ? route.query.facet : 'batting')
const facetToGroupAndStat = {
  batting: { group: 'hitting', stat: 'war' },
  pitching: { group: 'pitching', stat: 'war_pitching' },
  fielding: { group: 'fielding', stat: 'war_fielding' },
}

const season = ref(route.query.season || String(new Date().getFullYear()))
const yearsBack = ref(route.query.years || '30')

const rows = ref([])
const loading = ref(false)
const errorMsg = ref('')
const scanInfo = ref(null) // { yearsScanned, earliestSeason, latestSeason } — only set for bestSeason tab

function syncUrl() {
  router.replace({
    query: {
      tab: activeTab.value,
      facet: facet.value,
      season: activeTab.value === 'season' ? season.value : undefined,
      years: activeTab.value === 'bestSeason' ? yearsBack.value : undefined,
    },
  })
}

async function loadFacetLeaderboard(seasonValue) {
  loading.value = true
  errorMsg.value = ''
  scanInfo.value = null
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

async function loadComplete(seasonValue) {
  loading.value = true
  errorMsg.value = ''
  scanInfo.value = null
  try {
    const data = await getJWinsComplete({ season: seasonValue, limit: 50 })
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

async function loadBestSeason() {
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await getJWinsBestSingleSeason({ facet: facet.value, years: yearsBack.value, limit: 50 })
    scanInfo.value = {
      yearsScanned: data.yearsScanned,
      earliestSeason: data.earliestSeason,
      latestSeason: data.latestSeason,
    }
    rows.value = (data.rows || []).map((r, idx) => ({
      id: r.playerId,
      rank: idx + 1,
      playerName: r.playerName,
      teamName: r.teamName,
      season: r.season,
      jwins: r.jwins,
      // Only present when facet === 'complete' (see fetchCompleteSeasonRows on the
      // backend) — undefined otherwise, which the columns/table just won't render.
      batting: r.batting,
      pitching: r.pitching,
      fielding: r.fielding,
      jwinsComplete: r.jwins,
    }))
  } catch (err) {
    errorMsg.value = err.message || 'Could not load the best-season leaderboard.'
    rows.value = []
  } finally {
    loading.value = false
  }
}

function load() {
  syncUrl()
  if (activeTab.value === 'career') {
    facet.value === 'complete' ? loadComplete('career') : loadFacetLeaderboard('career')
  } else if (activeTab.value === 'season') {
    facet.value === 'complete' ? loadComplete(season.value) : loadFacetLeaderboard(season.value)
  } else {
    loadBestSeason()
  }
}

function setTab(tab) {
  activeTab.value = tab
  load()
}

function setFacet(f) {
  facet.value = f
  load()
}

const facetLabel = computed(() => {
  if (facet.value === 'pitching') return 'JWinsP (pitching)'
  if (facet.value === 'fielding') return 'JWinsF (fielding)'
  if (facet.value === 'complete') return 'JWins Complete'
  return 'JWinsB (batting)'
})

const columns = computed(() => {
  if (facet.value === 'complete') {
    const cols = [
      { key: 'rank', label: '#', isStat: false },
      { key: 'playerName', label: 'Player', isStat: false, link: (row) => `/players/${row.id}` },
      { key: 'teamName', label: 'Team', isStat: false },
    ]
    if (activeTab.value === 'bestSeason') cols.push({ key: 'season', label: 'Season', isStat: false })
    cols.push(
      { key: 'battingDisplay', label: 'JWinsB', isStat: false },
      { key: 'pitchingDisplay', label: 'JWinsP', isStat: false },
      { key: 'fieldingDisplay', label: 'JWinsF', isStat: false },
      { key: 'completeDisplay', label: 'JWins Complete', isStat: false },
    )
    return cols
  }
  const cols = [
    { key: 'rank', label: '#', isStat: false },
    { key: 'playerName', label: 'Player', isStat: false, link: (row) => `/players/${row.id}` },
    { key: 'teamName', label: 'Team', isStat: false },
  ]
  if (activeTab.value === 'bestSeason') cols.push({ key: 'season', label: 'Season', isStat: false })
  cols.push({ key: 'jwinsDisplay', label: facetLabel.value, isStat: false })
  return cols
})

// Pre-formatted for display rather than routed through StatTable's dictionary-driven
// formatting — Complete's three component columns aren't real statDictionary entries on
// their own (they're the same war/war_pitching/war_fielding values, just relabeled per
// column here), so this keeps that formatting decision local to this page.
const displayRows = computed(() =>
  rows.value.map((r) => {
    if (facet.value === 'complete') {
      return {
        ...r,
        battingDisplay: formatStatValue('war', r.batting),
        pitchingDisplay: formatStatValue('war_pitching', r.pitching),
        fieldingDisplay: formatStatValue('war_fielding', r.fielding),
        completeDisplay: formatStatValue('war', r.jwinsComplete),
      }
    }
    const statKey = facet.value === 'pitching' ? 'war_pitching' : facet.value === 'fielding' ? 'war_fielding' : 'war'
    return { ...r, jwinsDisplay: formatStatValue(statKey, r.jwins) }
  }),
)

const leader = computed(() => (rows.value.length > 0 ? rows.value[0] : null))

onMounted(load)
</script>

<template>
  <h1>JWins</h1>

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
      <input type="radio" value="bestSeason" :checked="activeTab === 'bestSeason'" @change="setTab('bestSeason')" />
      Best Single Season Ever
    </label>
  </div>

  <div class="section" style="display: flex; gap: 16px; flex-wrap: wrap;">
    <div>
      <strong class="muted" style="font-size: 12px;">Facet:</strong>
      <label class="checkbox-row" style="display: inline; margin-right: 10px;">
        <input type="radio" value="batting" :checked="facet === 'batting'" @change="setFacet('batting')" />
        Batting
      </label>
      <label class="checkbox-row" style="display: inline; margin-right: 10px;">
        <input type="radio" value="pitching" :checked="facet === 'pitching'" @change="setFacet('pitching')" />
        Pitching
      </label>
      <label class="checkbox-row" style="display: inline; margin-right: 10px;">
        <input type="radio" value="fielding" :checked="facet === 'fielding'" @change="setFacet('fielding')" />
        Fielding
      </label>
      <label class="checkbox-row" style="display: inline;">
        <input type="radio" value="complete" :checked="facet === 'complete'" @change="setFacet('complete')" />
        Complete
      </label>
    </div>
  </div>

  <form v-if="activeTab === 'season'" class="plain-form" @submit.prevent="load">
    <label for="jwins-season">Season</label>
    <input id="jwins-season" v-model="season" type="number" min="1900" max="2100" />
    <button type="submit" style="margin-left: 8px;">Go</button>
  </form>

  <form v-if="activeTab === 'bestSeason'" class="plain-form" @submit.prevent="load">
    <label for="jwins-years">How many years back to search</label>
    <input id="jwins-years" v-model="yearsBack" type="number" min="1" max="60" />
    <button type="submit" style="margin-left: 8px;">Go</button>
    <p class="muted" style="margin: 6px 0 0 0;">Capped at 60 years — searching every MLB season ever would mean well over a hundred requests to MLB's API for one page load.</p>
  </form>

  <div class="section">
    <p v-if="loading" class="muted">Loading&hellip;</p>
    <p v-else-if="errorMsg" class="error-text">{{ errorMsg }}</p>
    <template v-else>
      <p v-if="scanInfo" class="muted">
        Searched {{ scanInfo.earliestSeason }}&ndash;{{ scanInfo.latestSeason }} ({{ scanInfo.yearsScanned }} seasons).
      </p>
      <p v-if="leader" class="muted">
        Leader: <strong>{{ leader.playerName }}</strong>
        <template v-if="activeTab === 'bestSeason'"> — {{ leader.season }}, </template>
        <template v-else> — </template>
        <template v-if="facet === 'complete'">{{ formatStatValue('war', leader.jwinsComplete) }} JWins Complete</template>
        <template v-else>{{ formatStatValue(facet === 'pitching' ? 'war_pitching' : facet === 'fielding' ? 'war_fielding' : 'war', leader.jwins) }} {{ facetLabel }}</template>
      </p>
      <StatTable :columns="columns" :rows="displayRows" :on-header-click="() => {}" />
    </template>
  </div>
</template>
