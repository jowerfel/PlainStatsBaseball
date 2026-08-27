<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { searchPlayers, getPlayer } from '@/services/mlbApi.js'
import { getStatsByGroup, formatStatValue } from '@/data/statDictionary.js'

const MAX_PLAYERS = 4

const route = useRoute()
const router = useRouter()

// slots: array of { playerId, fullName, player, hittingSeasonStats, pitchingSeasonStats, fieldingSeasonStats, loading, error }
const slots = ref([])
const group = ref(['pitching', 'fielding'].includes(route.query.group) ? route.query.group : 'hitting')
const seasonType = ref(route.query.season === 'career' ? 'career' : 'season')
const season = ref(
  route.query.season && String(route.query.season) !== 'career'
    ? String(route.query.season)
    : String(new Date().getFullYear()),
)

// Search state for the "add a player" box
const query = ref('')
const searchResults = ref([])
const searching = ref(false)
let debounceTimer = null

watch(query, (val) => {
  clearTimeout(debounceTimer)
  if (val.trim().length < 2) {
    searchResults.value = []
    return
  }
  debounceTimer = setTimeout(async () => {
    searching.value = true
    try {
      const data = await searchPlayers(val.trim())
      searchResults.value = data.people || []
    } catch {
      searchResults.value = []
    } finally {
      searching.value = false
    }
  }, 300)
})

const statColumns = computed(() => getStatsByGroup(group.value))

async function loadSlot(playerId) {
  const seasonQuery = seasonType.value === 'career' ? 'career' : season.value
  const idx = slots.value.findIndex((s) => String(s.playerId) === String(playerId))
  if (idx === -1) return
  slots.value[idx].loading = true
  slots.value[idx].error = ''
  try {
    const data = await getPlayer(playerId, seasonQuery)
    slots.value[idx].player = data.player
    slots.value[idx].hittingSeasonStats = data.hittingSeasonStats
    slots.value[idx].pitchingSeasonStats = data.pitchingSeasonStats
    slots.value[idx].fieldingSeasonStats = data.fieldingSeasonStats
    slots.value[idx].fullName = data.player?.fullName || slots.value[idx].fullName
  } catch (err) {
    slots.value[idx].error = err.message || 'Could not load this player.'
  } finally {
    slots.value[idx].loading = false
  }
}

function addPlayer(person) {
  if (slots.value.length >= MAX_PLAYERS) return
  if (slots.value.some((s) => String(s.playerId) === String(person.id))) return
  slots.value.push({
    playerId: person.id,
    fullName: person.fullName,
    player: null,
    hittingSeasonStats: null,
    pitchingSeasonStats: null,
    fieldingSeasonStats: null,
    loading: true,
    error: '',
  })
  query.value = ''
  searchResults.value = []
  loadSlot(person.id)
  syncUrl()
}

function removePlayer(playerId) {
  slots.value = slots.value.filter((s) => String(s.playerId) !== String(playerId))
  syncUrl()
}

function reloadAll() {
  for (const s of slots.value) loadSlot(s.playerId)
  syncUrl()
}

function syncUrl() {
  router.replace({
    query: {
      ids: slots.value.map((s) => s.playerId).join(',') || undefined,
      group: group.value,
      season: seasonType.value === 'career' ? 'career' : season.value,
    },
  })
}

function statsFor(slot) {
  if (group.value === 'pitching') return slot.pitchingSeasonStats
  if (group.value === 'fielding') return slot.fieldingSeasonStats
  return slot.hittingSeasonStats
}

// For each stat row, figures out which slot(s) currently hold the best value, so the
// comparison table can highlight the league-leader-in-the-room per stat.
function bestSlotIds(statKey, goodDirection) {
  const values = slots.value
    .map((s) => ({ id: s.playerId, value: statsFor(s)?.[statKey] }))
    .filter((v) => v.value !== undefined && v.value !== null && !Number.isNaN(Number(v.value)))
  if (values.length < 2) return []
  const nums = values.map((v) => Number(v.value))
  const best = goodDirection === 'low' ? Math.min(...nums) : Math.max(...nums)
  return values.filter((v) => Number(v.value) === best).map((v) => v.id)
}

// Load players from ?ids= on first visit (shareable comparison links)
if (route.query.ids) {
  const ids = String(route.query.ids).split(',').filter(Boolean).slice(0, MAX_PLAYERS)
  for (const id of ids) {
    slots.value.push({
      playerId: id,
      fullName: '',
      player: null,
      hittingSeasonStats: null,
      pitchingSeasonStats: null,
      fieldingSeasonStats: null,
      loading: true,
      error: '',
    })
  }
  for (const id of ids) loadSlot(id)
}
</script>

<template>
  <h1>Compare Players</h1>
  <p class="subtitle">Put up to {{ MAX_PLAYERS }} players side by side, hitting, pitching, or fielding, season or career.</p>

  <form class="plain-form" @submit.prevent>
    <fieldset>
      <legend>Stat group</legend>
      <label class="checkbox-row">
        <input type="radio" value="hitting" v-model="group" @change="syncUrl" />
        Hitting
      </label>
      <label class="checkbox-row">
        <input type="radio" value="pitching" v-model="group" @change="syncUrl" />
        Pitching
      </label>
      <label class="checkbox-row">
        <input type="radio" value="fielding" v-model="group" @change="syncUrl" />
        Fielding
      </label>
    </fieldset>

    <fieldset>
      <legend>Timeframe</legend>
      <label class="checkbox-row">
        <input type="radio" value="season" v-model="seasonType" @change="reloadAll" />
        Season
      </label>
      <label class="checkbox-row">
        <input type="radio" value="career" v-model="seasonType" @change="reloadAll" />
        Career
      </label>
      <div v-if="seasonType === 'season'">
        <label for="compare-season">Season</label>
        <input
          id="compare-season"
          v-model.number="season"
          type="number"
          min="1900"
          max="2100"
          @change="reloadAll"
        />
      </div>
    </fieldset>
  </form>

  <div class="section">
    <h2>Players ({{ slots.length }}/{{ MAX_PLAYERS }})</h2>
    <p v-if="slots.length === 0" class="muted">Add a player below to start comparing.</p>
    <ul v-else class="text-links-list">
      <li v-for="s in slots" :key="s.playerId">
        {{ s.fullName || `Player ${s.playerId}` }}
        <a href="#" @click.prevent="removePlayer(s.playerId)">Remove</a>
        <span v-if="s.error" class="error-text"> — {{ s.error }}</span>
      </li>
    </ul>

    <form v-if="slots.length < MAX_PLAYERS" class="plain-form" @submit.prevent>
      <label for="compare-search-input">Add a player</label>
      <input
        id="compare-search-input"
        v-model="query"
        type="text"
        placeholder="e.g. Ohtani, Judge, Skenes"
        autocomplete="off"
      />
      <p v-if="searching" class="muted">Searching&hellip;</p>
      <ul v-if="searchResults.length" class="text-links-list">
        <li v-for="p in searchResults" :key="p.id">
          <a href="#" @click.prevent="addPlayer(p)">{{ p.fullName }}</a>
          <span v-if="p.currentTeam?.name" class="muted"> — {{ p.currentTeam.name }}</span>
        </li>
      </ul>
      <p v-else-if="query.trim().length >= 2 && !searching" class="muted">
        No players found for "{{ query }}".
      </p>
    </form>
  </div>

  <div class="section" v-if="slots.length >= 2">
    <h2>{{ seasonType === 'career' ? 'Career' : `${season} Season` }} Comparison ({{ group }})</h2>
    <div class="table-scroll">
      <table class="plain-table">
        <thead>
          <tr>
            <th>Stat</th>
            <th v-for="s in slots" :key="s.playerId">
              <RouterLink :to="`/players/${s.playerId}`">{{ s.fullName || s.playerId }}</RouterLink>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="col in statColumns" :key="col.key">
            <td>{{ col.simpleName }}</td>
            <td
              v-for="s in slots"
              :key="s.playerId"
              :class="{ 'compare-best': bestSlotIds(col.key, col.goodDirection).includes(s.playerId) }"
            >
              <template v-if="s.loading">&hellip;</template>
              <template v-else-if="!statsFor(s)">No {{ group }} stats</template>
              <template v-else>{{ formatStatValue(col.key, statsFor(s)[col.key]) }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="muted">Highlighted cells show whichever player here leads that stat.</p>
  </div>
  <p v-else-if="slots.length === 1" class="muted">Add at least one more player to compare.</p>
</template>
