<script setup>
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <header class="site-header">
    <div class="page-wrap">
      <RouterLink to="/" class="site-title">PlainStats</RouterLink>
      <nav class="site-nav">
        <RouterLink to="/">Home</RouterLink>
        <span class="nav-sep">|</span>
        <RouterLink to="/leaderboards/custom">Leaderboards</RouterLink>
        <span class="nav-sep">|</span>
        <RouterLink to="/pitchers">Following</RouterLink>
        <span class="nav-sep">|</span>
        <RouterLink to="/players/search">Players</RouterLink>
        <span class="nav-sep">|</span>
        <RouterLink to="/live">Live</RouterLink>
        <span class="nav-sep">|</span>
        <RouterLink to="/standings">Standings</RouterLink>
        <span class="nav-sep">|</span>
        <RouterLink to="/about">About</RouterLink>
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
