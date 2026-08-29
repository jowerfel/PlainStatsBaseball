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

// Complete isn't available on the Best Single Season tab — finding the single best season
// combining batting+pitching+fielding across many years would mean merging three separate
// pools for EVERY year scanned (dozens of upstream calls per request) for a number that,
// realistically, almost nobody will have all three components for in the same year at a
// meaningful level. Simpler and honest to just not offer that combination.
const completeDisabledOnBestSeason = computed(() => activeTab.value === 'bestSeason')

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
    }))
  } catch (err) {
    errorMsg.value = err.message || 'Could not load the best-season leaderboard.'
    rows.value = []
  } finally {
    loading.value = false
  }
}

function load() {
  // Complete isn't offered on Best Single Season — fall back to Batting rather than
  // silently trying to load something that isn't there.
  if (activeTab.value === 'bestSeason' && facet.value === 'complete') {
    facet.value = 'batting'
  }
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
      <label class="checkbox-row" style="display: inline;" :style="completeDisabledOnBestSeason ? 'opacity: 0.5;' : ''">
        <input
          type="radio"
          value="complete"
          :checked="facet === 'complete'"
          :disabled="completeDisabledOnBestSeason"
          @change="setFacet('complete')"
        />
        Complete
      </label>
      <p v-if="completeDisabledOnBestSeason" class="muted" style="margin: 4px 0 0 0;">
        Complete isn't available for Best Single Season Ever — finding one year with
        great batting, pitching, AND fielding all at once, across many years, is a much
        bigger search than this page does for the other two tabs.
      </p>
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
      <StatTable :columns="columns" :rows="displayRows" />
    </template>
  </div>
</template>
