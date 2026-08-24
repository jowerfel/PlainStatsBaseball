<script setup>
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <header class="site-header">
    <div class="page-wrap">
      <RouterLink to="/" class="site-title">PlainStats</RouterLink>
      <nav class="site-nav">
        <RouterLink to="/" data-umami-event="Went Home">Home</RouterLink>
        <span class="nav-sep">|</span>
        <RouterLink to="/leaderboards/custom" data-umami-event="Leaderboards">Leaderboards</RouterLink>
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
