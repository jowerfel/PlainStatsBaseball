<script setup>
import { ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

// Not a cookie banner — PlainStats doesn't use cookies (see the About page) — but the
// site does save data in the browser's local storage (followed players, Settings
// choices), so this says so plainly on first visit rather than staying silent about it.
const NOTICE_KEY = 'plainstats.storageNoticeSeen'
const showNotice = ref(!localStorage.getItem(NOTICE_KEY))

function dismissNotice() {
  showNotice.value = false
  try {
    localStorage.setItem(NOTICE_KEY, '1')
  } catch {
    // localStorage unavailable — notice will just show again next visit, which is fine.
  }
}
</script>

<template>
  <div v-if="showNotice" class="storage-notice">
    <div class="page-wrap">
      <span>
        This site saves followed players and Settings choices in your browser's local
        storage (not cookies) — see <RouterLink to="/about">About</RouterLink> for details.
      </span>
      <button @click="dismissNotice">Got it</button>
    </div>
  </div>

  <header class="site-header">
    <div class="page-wrap">
      <RouterLink to="/" class="site-title">PlainStats</RouterLink>
      <nav class="site-nav">
        <RouterLink to="/" data-umami-event="Went Home">Home</RouterLink>
        <span class="nav-sep">|</span>
        <RouterLink to="/leaderboards/custom" data-umami-event="Leaderboards">Leaderboards</RouterLink>
        <span class="nav-sep">|</span>
        <RouterLink to="/jwins" data-umami-event="JWins">JWins</RouterLink>
        <span class="nav-sep">|</span>
        <RouterLink to="/pitchers" data-umami-event="Following">Following</RouterLink>
        <span class="nav-sep">|</span>
        <RouterLink to="/players/search" data-umami-event="Search" >Players</RouterLink>
        <span class="nav-sep">|</span>
        <RouterLink to="/compare" data-umami-event="Compare">Compare</RouterLink>
        <span class="nav-sep">|</span>
        <RouterLink to="/live" data-umami-event="Live">Live</RouterLink>
        <span class="nav-sep">|</span>
        <RouterLink to="/standings" data-umami-event="Standings">Standings</RouterLink>
        <span class="nav-sep">|</span>
        <RouterLink to="/about" data-umami-event="About">About</RouterLink>
        <span class="nav-sep">|</span>
        <RouterLink to="/articles">Articles</RouterLink>
      </nav>
    </div>
  </header>

  <div class="page-wrap">
    <RouterView />
  </div>

  <footer class="site-footer">
    <div class="page-wrap">
      Copyright 2026 Joshua Werfel All rights Reserved. Data comes from the official MLB Stats API. This site is not affiliated with, endorsed by,
    or sponsored by MLB.
    </div>
  </footer>
</template>
