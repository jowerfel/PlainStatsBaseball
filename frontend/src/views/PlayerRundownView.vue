<script setup>
import { ref, computed, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getPlayer, getPlayerGameLog, getPlayerYearByYear } from '@/services/mlbApi.js'
import { getStatsByGroup } from '@/data/statDictionary.js'
import { useFollowedPlayersStore } from '@/store/followedPlayers.js'
import StatBadge from '@/components/StatBadge.vue'
import StatTooltip from '@/components/StatTooltip.vue'
import StatTable from '@/components/StatTable.vue'

const props = defineProps({
  playerId: { type: String, required: true },
})

const route = useRoute()
const router = useRouter()
const player = ref(null)
const hittingStats = ref(null)
const pitchingStats = ref(null)
const gameLog = ref([])
const yearByYear = ref([])
const yearByYearLoading = ref(false)
const yearByYearError = ref('')
const loading = ref(true)
const errorMsg = ref('')
const followed = useFollowedPlayersStore()

// Position code '1' is a rough default guess, not a hard rule — two-way players (Ohtani)
// and anyone who pitched before the DH rule (routinely batting even as a primary pitcher)
// can have real stats in BOTH groups. The dropdown below always lets the person switch;
// this only decides which one loads first.
const defaultGroup = computed(() => (player.value?.primaryPosition?.code === '1' ? 'pitching' : 'hitting'))

// One control surface handles both which stat group AND which timeframe show —
// combining what used to be a separate "season stats" page, "career stats" page, and an
// implicit hitting-or-pitching split into one page with two toggles, so there's one place
// for all of a player's stats instead of scattered views.
const selectedGroup = ref(route.query.group === 'pitching' || route.query.group === 'hitting'
  ? route.query.group
  : null) // null = not yet decided, falls back to defaultGroup once the player loads
const selectedSeason = computed(() =>
  route.query.season ? String(route.query.season) : String(new Date().getFullYear()),
)
const isCareer = computed(() => selectedSeason.value === 'career')

const activeGroup = computed(() => selectedGroup.value || defaultGroup.value)
const activeStats = computed(() => (activeGroup.value === 'pitching' ? pitchingStats.value : hittingStats.value))

// Whether the player has any usable stats at all in a group, independent of which group
// is currently selected — drives the "try the other group" hint when one is empty.
const hasHitting = computed(() => !!hittingStats.value)
const hasPitching = computed(() => !!pitchingStats.value)

const glanceKeys = computed(() =>
  activeGroup.value === 'pitching'
    ? ['era', 'whip', 'inningsPitched', 'strikeOuts', 'war_pitching']
    : ['avg', 'obp', 'ops', 'homeRuns', 'war'],
)

const fullStatColumns = computed(() => getStatsByGroup(activeGroup.value))

const yearByYearColumns = computed(() => [
  { key: 'season', label: 'Year', isStat: false },
  { key: 'team', label: 'Team', isStat: false },
  ...fullStatColumns.value.map((col) => ({ ...col, isStat: true })),
])

function setGroup(group) {
  selectedGroup.value = group
  router.replace({ query: { ...route.query, group } })
  // activeGroup only affects the game-log/year-by-year fetch (the player object itself
  // already carries both hitting and pitching stats), and that read happens after an
  // `await` inside load() — outside watchEffect's synchronous tracking window — so the
  // switch needs to be re-triggered explicitly rather than relying on reactivity.
  loadYearByYear(group)
  if (!isCareer.value) loadGameLog(group)
}

function setSeasonMode(mode) {
  const query = { ...route.query }
  if (mode === 'career') {
    query.season = 'career'
  } else {
    delete query.season
  }
  router.replace({ query }).then(load)
}

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const seasonQuery = isCareer.value ? 'career' : selectedSeason.value
    const data = await getPlayer(props.playerId, seasonQuery)
    player.value = data.player
    hittingStats.value = data.hittingSeasonStats
    pitchingStats.value = data.pitchingSeasonStats

    const group = activeGroup.value

    if (!isCareer.value) {
      await loadGameLog(group)
    } else {
      gameLog.value = []
    }

    await loadYearByYear(group)
  } catch (err) {
    errorMsg.value = err.message || 'Could not load this player.'
  } finally {
    loading.value = false
  }
}

async function loadGameLog(group) {
  try {
    const logData = await getPlayerGameLog(props.playerId, {
      season: selectedSeason.value,
      group,
    })
    gameLog.value = logData.games || []
  } catch (err) {
    gameLog.value = []
  }
}

async function loadYearByYear(group) {
  yearByYearLoading.value = true
  yearByYearError.value = ''
  try {
    const data = await getPlayerYearByYear(props.playerId, { group })
    yearByYear.value = data.seasons || []
  } catch (err) {
    // Surface the real failure instead of silently showing "no data" — a request that
    // fails (network error, 502 from our backend, etc.) looks identical to a genuinely
    // empty result otherwise, which made this bug impossible to diagnose from the UI.
    yearByYear.value = []
    yearByYearError.value = err.message || 'Could not load season-by-season stats.'
  } finally {
    yearByYearLoading.value = false
  }
}

watchEffect(() => {
  if (props.playerId) load()
})

function toggleFollow() {
  if (followed.isFollowing(props.playerId)) {
    followed.unfollow(props.playerId)
  } else {
    followed.follow({
      playerId: props.playerId,
      fullName: player.value?.fullName,
      teamId: player.value?.currentTeam?.id,
      teamName: player.value?.currentTeam?.name,
      position: player.value?.primaryPosition?.abbreviation,
      role: activeGroup.value,
    })
  }
}

function formatOpponent(opponent) {
  if (!opponent) return '—'
  if (typeof opponent === 'object') {
    return opponent.name || opponent.teamName || opponent.triCode || String(opponent)
  }
  if (typeof opponent === 'string') {
    try {
      const parsed = JSON.parse(opponent)
      return parsed?.name || parsed?.teamName || parsed?.triCode || opponent
    } catch {
      return opponent
    }
  }
  return String(opponent)
}
</script>

<template>
  <p v-if="loading" class="muted">Loading player&hellip;</p>
  <p v-else-if="errorMsg" class="error-text">{{ errorMsg }}</p>

  <template v-else-if="player">
    <h1>{{ player.fullName }}</h1>
    <p class="subtitle">
      {{ player.currentTeam?.name || 'Free agent' }}
      &middot; {{ player.primaryPosition?.abbreviation }}
      <span v-if="player.batSide || player.pitchHand">
        &middot; Bats {{ player.batSide?.code }} / Throws {{ player.pitchHand?.code }}
      </span>
      <span v-if="player.currentAge"> &middot; Age {{ player.currentAge }}</span>
      <button style="margin-left: 10px;" @click="toggleFollow">
        {{ followed.isFollowing(playerId) ? 'Unfollow' : `Follow ${activeGroup === 'pitching' ? 'pitcher' : 'hitter'}` }}
      </button>
    </p>

    <!-- One control surface for both "which stats" and "which timeframe", instead of
         separate season/career pages and a hardcoded hitting-or-pitching split. Any player
         with data in both groups (two-way players, pre-DH pitchers who batted) can freely
         switch — this is the actual fix for not being able to see Ohtani's pitching stats
         or an old pitcher's hitting stats. -->
    <div class="section" style="display: flex; gap: 24px; flex-wrap: wrap;">
      <div v-if="hasHitting || hasPitching">
        <strong class="muted" style="font-size: 12px;">Stats:</strong>
        <label class="checkbox-row" style="display: inline; margin-right: 10px;">
          <input
            type="radio"
            value="hitting"
            :checked="activeGroup === 'hitting'"
            @change="setGroup('hitting')"
          />
          Hitting
        </label>
        <label class="checkbox-row" style="display: inline;">
          <input
            type="radio"
            value="pitching"
            :checked="activeGroup === 'pitching'"
            @change="setGroup('pitching')"
          />
          Pitching
        </label>
      </div>
      <div>
        <strong class="muted" style="font-size: 12px;">Timeframe:</strong>
        <label class="checkbox-row" style="display: inline; margin-right: 10px;">
          <input type="radio" value="season" :checked="!isCareer" @change="setSeasonMode('season')" />
          {{ selectedSeason === 'career' ? new Date().getFullYear() : selectedSeason }} Season
        </label>
        <label class="checkbox-row" style="display: inline;">
          <input type="radio" value="career" :checked="isCareer" @change="setSeasonMode('career')" />
          Career
        </label>
      </div>
    </div>

    <div class="section">
      <h2>{{ isCareer ? 'Career' : 'This season' }} At A Glance ({{ activeGroup }})</h2>
      <p v-if="!activeStats" class="muted">
        No {{ activeGroup }} stats available for this timeframe.
        <template v-if="activeGroup === 'hitting' && hasPitching">
          Try <a href="#" @click.prevent="setGroup('pitching')">pitching stats</a> instead.
        </template>
        <template v-else-if="activeGroup === 'pitching' && hasHitting">
          Try <a href="#" @click.prevent="setGroup('hitting')">hitting stats</a> instead.
        </template>
      </p>
      <div v-else style="display: flex; gap: 20px; flex-wrap: wrap;">
        <StatBadge
          v-for="key in glanceKeys"
          :key="key"
          :stat-key="key"
          :value="activeStats[key]"
        />
      </div>
    </div>

    <div v-if="activeGroup === 'pitching'" class="section">
      <p class="muted">
        Pitch-by-pitch tracking, recent starts, and the next-start estimate live on the
        <RouterLink :to="`/pitchers/${playerId}`">Pitcher Tracker</RouterLink>.
      </p>
    </div>

    <div class="section">
      <h2>Full Stat Line ({{ activeGroup }})</h2>
      <p v-if="!activeStats" class="muted">No {{ activeGroup }} stats available for this timeframe.</p>
      <table v-else class="plain-table">
        <thead>
          <tr>
            <th v-for="col in fullStatColumns" :key="col.key">
              <StatTooltip :stat-key="col.key" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td v-for="col in fullStatColumns" :key="col.key">
              <StatBadge :stat-key="col.key" :value="activeStats[col.key]" dot />
              <span>{{ activeStats[col.key] !== undefined ? activeStats[col.key] : '—' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2>Year by Year ({{ activeGroup }})</h2>
      <p class="muted">
        Every season on record for this stat group — the same view whether you got here
        from "season" or "career" above, since career is just every year added up.
      </p>
      <p v-if="yearByYearLoading" class="muted">Loading season history&hellip;</p>
      <p v-else-if="yearByYearError" class="error-text">{{ yearByYearError }}</p>
      <p v-else-if="yearByYear.length === 0" class="muted">
        No season-by-season data available.
      </p>
      <StatTable
        v-else
        :columns="yearByYearColumns"
        :rows="yearByYear"
        :caption="`${player.fullName} — season by season (${activeGroup})`"
      />
    </div>

    <div class="section" v-if="!isCareer">
      <h2>Game Log (last {{ gameLog.length }})</h2>
      <p v-if="gameLog.length === 0" class="muted">No recent games found.</p>
      <div v-else class="table-scroll">
        <table class="plain-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Opponent</th>
              <template v-if="activeGroup === 'pitching'">
                <th><StatTooltip stat-key="inningsPitched" label="IP" /></th>
                <th><StatTooltip stat-key="hitsAllowed" label="H" /></th>
                <th><StatTooltip stat-key="runsAllowed" label="R" /></th>
                <th><StatTooltip stat-key="baseOnBallsPitching" label="BB" /></th>
                <th><StatTooltip stat-key="strikeOuts" label="K" /></th>
              </template>
              <template v-else>
                <th v-for="col in fullStatColumns.slice(0, 6)" :key="col.key">
                  <StatTooltip :stat-key="col.key" />
                </th>
              </template>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(g, idx) in gameLog" :key="idx">
              <td>{{ g.date }}</td>
              <td>{{ formatOpponent(g.opponent) }}</td>
              <template v-if="activeGroup === 'pitching'">
                <td>{{ g.stat?.inningsPitched ?? '—' }}</td>
                <td>{{ g.stat?.hits ?? '—' }}</td>
                <td>{{ g.stat?.runs ?? '—' }}</td>
                <td>{{ g.stat?.baseOnBalls ?? '—' }}</td>
                <td>{{ g.stat?.strikeOuts ?? '—' }}</td>
              </template>
              <template v-else>
                <td v-for="col in fullStatColumns.slice(0, 6)" :key="col.key">
                  {{ g.stat?.[col.key] ?? '—' }}
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </template>
</template>
