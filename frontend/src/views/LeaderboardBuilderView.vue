<script setup>
// This page used to BE the leaderboard builder (one page with a Hitting/Pitching/
// Fielding radio group). Per Joshua's request, that's now three separate individual
// pages instead — see BattingLeaderboardView.vue, FieldingLeaderboardView.vue,
// PitchingLeaderboardView.vue. This route (/leaderboards/custom) is kept alive as a
// simple hub linking to the three, rather than removed outright, since the site's own
// nav (App.vue) and homepage (HomeView.vue) both link here directly — changing or
// removing this route would break those existing links.
</script>

<template>
  <h1>Custom Leaderboards</h1>
  <p class="subtitle">Pick the stats you care about and filter by playing time.</p>

  <div class="section">
    <ul class="text-links-list">
      <li><RouterLink to="/leaderboards/batting">Batting leaderboards &rarr;</RouterLink></li>
      <li><RouterLink to="/leaderboards/pitching">Pitching leaderboards &rarr;</RouterLink></li>
      <li><RouterLink to="/leaderboards/fielding">Fielding leaderboards &rarr;</RouterLink></li>
    </ul>
  </div>
</template>
