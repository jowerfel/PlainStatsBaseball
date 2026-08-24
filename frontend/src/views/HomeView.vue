<script setup>
import { getStatsByGroup } from '@/data/statDictionary.js'

const popularHitting = getStatsByGroup('hitting').slice(0, 5)
const popularPitching = getStatsByGroup('pitching').slice(0, 5)
</script>

<template>
  <h1>PlainStats</h1>
  <p class="subtitle">
    Baseball stats, explained in plain English. No clutter — just what a number
    means and whether it's good.
  </p>

  <div class="section">
    <h2>Look up a player</h2>
    <p><RouterLink to="/players/search" data-umami-event="Search">Search for a player &rarr;</RouterLink></p>
  </div>

  <div class="section layout-two-col">
    <div class="layout-main">
      <h2>Popular hitting stats</h2>
      <ul class="text-links-list">
        <li v-for="s in popularHitting" :key="s.key">
          <RouterLink :to="`/leaderboards/${s.key}`" data-umami-event="Leaderboards">{{ s.simpleName }}</RouterLink>
          — {{ s.shortExplain }}
        </li>
      </ul>

      <h2>Popular pitching stats</h2>
      <ul class="text-links-list">
        <li v-for="s in popularPitching" :key="s.key">
          <RouterLink :to="`/leaderboards/${s.key}`" data-umami-event="Leaderboards">{{ s.simpleName }}</RouterLink>
          — {{ s.shortExplain }}
        </li>
      </ul>
    </div>

    <div class="layout-sidebar">
      <h3>More</h3>
      <ul class="text-links-list">
        <li><RouterLink to="/leaderboards/custom"> data-umami-event="Leaderboards"Build a custom leaderboard</RouterLink></li>
        <li><RouterLink to="/pitchers" data-umami-event="Following">Following</RouterLink></li>
        <li><RouterLink to="/live" data-umami-event="Live">Live games</RouterLink></li>
        <li><RouterLink to="/about" data-umami-event="About">About this site</RouterLink></li>
      </ul>
    </div>
  </div>
</template>
