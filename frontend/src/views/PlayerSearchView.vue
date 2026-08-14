<script setup>
import { ref, watch } from 'vue'
import { searchPlayers } from '@/services/mlbApi.js'

const query = ref('')
const results = ref([])
const loading = ref(false)
const errorMsg = ref('')
let debounceTimer = null

watch(query, (val) => {
  clearTimeout(debounceTimer)
  errorMsg.value = ''
  if (val.trim().length < 2) {
    results.value = []
    return
  }
  debounceTimer = setTimeout(runSearch, 300)
})

async function runSearch() {
  loading.value = true
  try {
    const data = await searchPlayers(query.value.trim())
    results.value = data.people || []
  } catch (err) {
    errorMsg.value = err.message || 'Search failed.'
    results.value = []
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <h1>Player Search</h1>
  <p class="subtitle">Find any MLB player, past or present, to see their full rundown.</p>

  <form class="plain-form" @submit.prevent>
    <label for="player-search-input">Player name</label>
    <input
      id="player-search-input"
      v-model="query"
      type="text"
      placeholder="e.g. Judge, Ruth, Mays"
      autocomplete="off"
    />
  </form>

  <p v-if="loading" class="muted">Searching&hellip;</p>
  <p v-if="errorMsg" class="error-text">{{ errorMsg }}</p>

  <ul v-if="results.length" class="text-links-list">
    <li v-for="p in results" :key="p.id">
      <RouterLink :to="`/players/${p.id}`">{{ p.fullName }}</RouterLink>
      <span v-if="p.currentTeam?.name" class="muted"> — {{ p.currentTeam.name }}</span>
      <span v-else-if="p.primaryPosition?.abbreviation" class="muted">
        — {{ p.primaryPosition.abbreviation }}
      </span>
      <span v-if="p.primaryPosition?.code === '1'" class="muted">
        —
        <RouterLink :to="`/pitchers/${p.id}`">Tracker</RouterLink>
      </span>
    </li>
  </ul>
  <p v-else-if="query.trim().length >= 2 && !loading && !errorMsg" class="muted">
    No players found for "{{ query }}".
  </p>
</template>