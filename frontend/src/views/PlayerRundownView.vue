<script setup>
import { ref, computed, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { getPlayer, getPlayerGameLog } from '@/services/mlbApi.js'
import { getStatsByGroup, statDictionary } from '@/data/statDictionary.js'
import { useFollowedPlayersStore } from '@/store/followedPlayers.js'
import StatBadge from '@/components/StatBadge.vue'
import StatTooltip from '@/components/StatTooltip.vue'

const props = defineProps({
  playerId: { type: String, required: true },
})

const route = useRoute()
const player = ref(null)
const hittingStats = ref(null)
const pitchingStats = ref(null)
const gameLog = ref([])
const loading = ref(true)
const errorMsg = ref('')
const followed = useFollowedPlayersStore()

const isPitcher = computed(() => {
  const code = player.value?.primaryPosition?.code
  return code === '1'
})

const selectedSeason = computed(() =>
  route.query.season ? String(route.query.season) : String(new Date().getFullYear()),
)
const isCareer = computed(() => selectedSeason.value === 'career')

const primaryGroup = computed(() => (isPitcher.value ? 'pitching' : 'hitting'))
const primaryStats = computed(() => (isPitcher.value ? pitchingStats.value : hittingStats.value))

// "At a glance" headline stats — a curated subset, per spec 5.4 (4-6 badges)
const glanceKeys = computed(() =>
  isPitcher.value
    ? ['era', 'whip', 'inningsPitched', 'strikeOuts', 'war_pitching']
    : ['avg', 'obp', 'ops', 'homeRuns', 'war'],
)

const fullStatColumns = computed(() => getStatsByGroup(primaryGroup.value))

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const seasonQuery = isCareer.value ? 'career' : selectedSeason.value
    const data = await getPlayer(props.playerId, seasonQuery)
    player.value = data.player
    hittingStats.value = data.hittingSeasonStats
    pitchingStats.value = data.pitchingSeasonStats

    if (!isCareer.value) {
      const group = data.player?.primaryPosition?.code === '1' ? 'pitching' : 'hitting'
      const logData = await getPlayerGameLog(props.playerId, {
        season: selectedSeason.value,
        group,
      })
      gameLog.value = logData.games || []
    } else {
      gameLog.value = []
    }
  } catch (err) {
    errorMsg.value = err.message || 'Could not load this player.'
  } finally {
    loading.value = false
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
      role: isPitcher.value ? 'pitching' : 'hitting',
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
        {{ followed.isFollowing(playerId) ? 'Unfollow' : `Follow ${isPitcher ? 'pitcher' : 'hitter'}` }}
      </button>
    </p>
    <p class="muted">
      <RouterLink
        v-if="!isCareer"
        :to="{ path: route.path, query: { ...route.query, season: 'career' } }"
      >
        View career stats
      </RouterLink>
      <RouterLink v-else :to="{ path: route.path, query: {} }">
        View this season's stats
      </RouterLink>
    </p>

    <div class="section">
      <h2>{{ isCareer ? 'Career' : 'This season' }} At A Glance</h2>
      <p v-if="!primaryStats" class="muted">No season stats available yet.</p>
      <div v-else style="display: flex; gap: 20px; flex-wrap: wrap;">
        <StatBadge
          v-for="key in glanceKeys"
          :key="key"
          :stat-key="key"
          :value="primaryStats[key]"
        />
      </div>
    </div>

    <div v-if="isPitcher" class="section">
      <p class="muted">
        Pitch-by-pitch tracking, recent starts, and the next-start estimate live on the
        <RouterLink :to="`/pitchers/${playerId}`">Pitcher Tracker</RouterLink>.
      </p>
    </div>

    <div class="section">
      <h2>Full Stat Line ({{ primaryGroup }})</h2>
      <p v-if="!primaryStats" class="muted">No season stats available yet.</p>
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
              <StatBadge :stat-key="col.key" :value="primaryStats[col.key]" dot />
              <span>{{ primaryStats[col.key] !== undefined ? primaryStats[col.key] : '—' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
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
              <template v-if="isPitcher">
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
              <template v-if="isPitcher">
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
