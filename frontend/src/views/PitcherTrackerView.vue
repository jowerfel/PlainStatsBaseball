<script setup>
import { ref, watchEffect } from 'vue'
import { getPlayer, getPitcherNextStart, getPitcherRecentStarts } from '@/services/mlbApi.js'
import { useFollowedPlayersStore } from '@/store/followedPlayers.js'
import { formatStatValue } from '@/data/statDictionary.js'
import StatTooltip from '@/components/StatTooltip.vue'

const props = defineProps({
  playerId: { type: String, required: true },
})

const followed = useFollowedPlayersStore()

const player = ref(null)
const nextGame = ref(null)
const nextStartEstimate = ref(null)
const recentStarts = ref([])
const loading = ref(true)
const errorMsg = ref('')
const recentStartsMessage = ref('')

async function load() {
  loading.value = true
  errorMsg.value = ''
  recentStartsMessage.value = ''
  recentStarts.value = []
  try {
    const data = await getPlayer(props.playerId)
    player.value = data.player

    const teamId = data.player?.currentTeam?.id
    if (teamId) {
      const scheduleData = await getPitcherNextStart(props.playerId, teamId)
      nextGame.value = scheduleData.nextGame
      nextStartEstimate.value = scheduleData.estimate
    }

    const startsData = await getPitcherRecentStarts(props.playerId)
    recentStarts.value = startsData.starts || []
    recentStartsMessage.value = startsData.message || ''
  } catch (err) {
    errorMsg.value = err.message || 'Could not load this pitcher.'
  } finally {
    loading.value = false
  }
}

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
      role: 'pitching',
    })
  }
}

function formatDateTime(value) {
  if (!value) return 'TBD'
  return new Date(value).toLocaleString()
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

watchEffect(() => {
  if (props.playerId) load()
})
</script>

<template>
  <p v-if="loading" class="muted">Loading&hellip;</p>
  <p v-else-if="errorMsg" class="error-text">{{ errorMsg }}</p>

  <template v-else-if="player">
    <h1>{{ player.fullName }} — Pitcher Tracker</h1>
    <p class="subtitle">
      {{ player.currentTeam?.name || 'Free agent' }}
      <button style="margin-left: 10px;" @click="toggleFollow">
        {{ followed.isFollowing(playerId) ? 'Unfollow' : 'Follow' }}
      </button>
    </p>

    <div class="section">
      <h2>Next Start</h2>
      <p v-if="!nextGame" class="muted">No upcoming game found in the next two weeks.</p>
      <p v-else>
        {{ formatDateTime(nextGame.gameDate) }}
        &mdash;
        {{ nextGame.teams?.away?.team?.name }} @ {{ nextGame.teams?.home?.team?.name }}
      </p>
      <p v-if="nextStartEstimate" class="muted" style="font-size: 12px;">
        {{ nextStartEstimate.type === 'probable' ? 'Probable start' : 'Estimated next start' }}:
        {{ formatDateTime(nextStartEstimate.estimatedStartDate) }}
        ({{ nextStartEstimate.confidence }} confidence). {{ nextStartEstimate.reason }}
      </p>
      <p class="muted" style="font-size: 12px;">
        Probable starters come from the live schedule when MLB has posted them; otherwise this
        estimates from the most recent start.
      </p>
    </div>

    <div class="section">
      <h2>Recent Appearances</h2>
      <p v-if="recentStartsMessage" class="muted">{{ recentStartsMessage }}</p>
      <p v-if="recentStarts.length === 0" class="muted">No recent appearances found.</p>
      <table v-else class="plain-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Opp</th>
            <th><StatTooltip stat-key="inningsPitched" label="IP" /></th>
            <th><StatTooltip stat-key="runsAllowed" label="R" /></th>
            <th><StatTooltip stat-key="earnedRuns" label="ER" /></th>
            <th><StatTooltip stat-key="hitsAllowed" label="H" /></th>
            <th><StatTooltip stat-key="homeRunsAllowed" label="HR" /></th>
            <th><StatTooltip stat-key="baseOnBallsPitching" label="BB" /></th>
            <th><StatTooltip stat-key="hitByPitch" label="HBP" /></th>
            <th><StatTooltip stat-key="strikeOuts" label="K" /></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="start in recentStarts" :key="start.gameDate">
            <td>{{ start.gameDate }}</td>
            <td>{{ formatOpponent(start.opponent) }}</td>
            <td>{{ start.inningsPitched || '—' }}</td>
            <td>{{ start.runsAllowed ?? '—' }}</td>
            <td>{{ start.earnedRuns ?? '—' }}</td>
            <td>{{ start.hitsAllowed ?? '—' }}</td>
            <td>{{ start.homeRunsAllowed ?? '—' }}</td>
            <td>{{ start.walks ?? '—' }}</td>
            <td>{{ start.hitByPitch ?? '—' }}</td>
            <td>{{ start.strikeouts ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p><RouterLink :to="`/players/${playerId}`">View full player rundown &rarr;</RouterLink></p>
  </template>
</template>
