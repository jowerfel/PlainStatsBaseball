<script setup>
import { useLeaderboardBuilder } from '@/composables/useLeaderboardBuilder.js'
import StatTable from '@/components/StatTable.vue'

const {
  selectedStats,
  minInnings,
  seasonType,
  season,
  availableStats,
  loading,
  errorMsg,
  hasSearched,
  copyMsg,
  activeSortStat,
  activeSortDir,
  columns,
  displayRows,
  toggleStat,
  onSortRequested,
  runSearch,
  copyLink,
} = useLeaderboardBuilder('fielding')
</script>

<template>
  <h1>Fielding Leaderboards</h1>
  <p class="subtitle">Pick the fielding stats you care about and filter by playing time.</p>

  <form class="plain-form" @submit.prevent="runSearch">
    <fieldset>
      <legend>Stats to show</legend>
      <p class="muted" style="margin: 0 0 6px 0;">Hover any stat's name to see what it means.</p>
      <label v-for="s in availableStats" :key="s.key" class="checkbox-row">
        <input type="checkbox" :checked="selectedStats.includes(s.key)" @change="toggleStat(s.key)" />
        {{ s.simpleName }}
      </label>
    </fieldset>

    <fieldset>
      <legend>Filters</legend>
      <label class="checkbox-row">
        <input type="radio" value="season" v-model="seasonType" />
        Season
      </label>
      <label class="checkbox-row">
        <input type="radio" value="career" v-model="seasonType" />
        Career
      </label>
      <div v-if="seasonType === 'season'">
        <label for="season-input">Season</label>
        <input id="season-input" v-model.number="season" type="number" min="1900" max="2100" />
      </div>

      <label for="mininnings-input">Minimum innings played</label>
      <input id="mininnings-input" v-model="minInnings" type="number" min="0" placeholder="e.g. 200" />
    </fieldset>

    <button type="submit">Build leaderboard</button>
  </form>

  <div class="section" v-if="hasSearched">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <h2 style="border: none; margin: 0;">Results</h2>
      <span>
        <a href="#" @click.prevent="copyLink">Copy link to this leaderboard</a>
        <span v-if="copyMsg" class="muted"> — {{ copyMsg }}</span>
      </span>
    </div>

    <p v-if="loading" class="muted">Loading&hellip;</p>
    <p v-else-if="errorMsg" class="error-text">{{ errorMsg }}</p>
    <p v-else-if="selectedStats.length === 0" class="muted">Pick at least one stat above.</p>
    <StatTable
      v-else
      :columns="columns"
      :rows="displayRows"
      :on-header-click="onSortRequested"
      :active-sort-key="activeSortStat"
      :active-sort-dir="activeSortDir"
    />
  </div>
</template>
