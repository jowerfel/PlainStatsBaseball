<script setup>
import { computed } from 'vue'
import { useFollowedPlayersStore } from '@/store/followedPlayers.js'

const followed = useFollowedPlayersStore()
const pitchers = computed(() => followed.byRole('pitching'))
const hitters = computed(() => followed.byRole('hitting'))
</script>

<template>
  <h1>Following</h1>
  <p class="subtitle">Players you're following, saved on this device.</p>

  <p v-if="followed.players.length === 0" class="muted">
    You're not following anyone yet. Visit a player page and click Follow to add them here.
  </p>

  <template v-else>
    <h2>Pitchers</h2>
    <p v-if="pitchers.length === 0" class="muted">No followed pitchers yet.</p>
    <table v-else class="plain-table">
      <thead>
        <tr>
          <th>Pitcher</th>
          <th>Team</th>
          <th>Next</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in pitchers" :key="p.playerId">
          <td><RouterLink :to="`/pitchers/${p.playerId}`">{{ p.fullName }}</RouterLink></td>
          <td>{{ p.teamName || '—' }}</td>
          <td><RouterLink :to="`/pitchers/${p.playerId}`">Tracker</RouterLink></td>
          <td><a href="#" @click.prevent="followed.unfollow(p.playerId)">Unfollow</a></td>
        </tr>
      </tbody>
    </table>

    <h2>Hitters</h2>
    <p v-if="hitters.length === 0" class="muted">No followed hitters yet.</p>
    <table v-else class="plain-table">
      <thead>
        <tr>
          <th>Hitter</th>
          <th>Team</th>
          <th>Position</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in hitters" :key="p.playerId">
          <td><RouterLink :to="`/players/${p.playerId}`">{{ p.fullName }}</RouterLink></td>
          <td>{{ p.teamName || '—' }}</td>
          <td>{{ p.position || '—' }}</td>
          <td><a href="#" @click.prevent="followed.unfollow(p.playerId)">Unfollow</a></td>
        </tr>
      </tbody>
    </table>
  </template>

  <p><RouterLink to="/players/search">Search for a player to follow &rarr;</RouterLink></p>
</template>
