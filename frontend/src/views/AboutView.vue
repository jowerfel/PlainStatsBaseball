<script setup>
import { CUSTOM_STATS } from '@/data/customStats.js'
import { statDictionary } from '@/data/statDictionary.js'

// Pulled live from the same data files the rest of the site reads from, rather than
// hand-copied text, so this list can't drift out of sync when a stat's formula changes or
// a new custom stat gets added to customStats.js.
const jwarHitting = statDictionary.war
const jwarPitching = statDictionary.war_pitching
</script>

<template>
  <h1>About PlainStats</h1>
  <p>
    PlainStats keeps the real baseball stat names on the page, then explains each one in
    plain English. Hover or tap a stat label to see the full name, a short explanation, and
    one extra note about how to read it.
  </p>

  <div class="section">
    <h2>Settings</h2>
    <p>
      Want to change how the site looks? Background color, text color, and font are all
      adjustable on the <RouterLink to="/settings">Settings page</RouterLink>.
    </p>
  </div>

  <div class="section">
    <h2>Custom stats</h2>
    <p class="muted">
      These aren't official MLB stats — they're formulas built specifically for this site.
      They're editable in the codebase (<code>frontend/src/data/customStats.js</code> for
      formula-style stats, <code>backend/derivedStats.js</code> for JWins).
    </p>

    <h3>{{ jwarHitting.simpleName }} (hitters)</h3>
    <p>{{ jwarHitting.shortExplain }}</p>
    <p class="muted">{{ jwarHitting.extraExplain }}</p>

    <h3>{{ jwarPitching.simpleName }} (pitchers)</h3>
    <p>{{ jwarPitching.shortExplain }}</p>
    <p class="muted">{{ jwarPitching.extraExplain }}</p>

    <template v-for="stat in CUSTOM_STATS" :key="stat.key">
      <h3>{{ stat.name }}</h3>
      <p>{{ stat.shortExplain }}</p>
      <p class="muted">Formula: <code>{{ stat.formula }}</code></p>
      <p class="muted">
        Shows up in the <RouterLink to="/leaderboards/custom">Custom Leaderboard Builder</RouterLink>,
        not on individual player pages.
      </p>
    </template>
  </div>

  <div class="section">
    <h2>What this site stores about you</h2>
    <p>
      PlainStats does not use cookies. Followed players/pitchers and your Settings choices
      (background, text color, font) are saved using your browser's
      <strong>local storage</strong> instead — a similar idea to a cookie, but the data
      stays only in your own browser on this device. It is never sent to our server, never
      shared with anyone else, and isn't used for tracking or advertising. Clearing your
      browser's site data (or using a different browser/device) will reset it.
    </p>
  </div>

  <p>
    Copyright 2026 Joshua Werfel All rights Reserved. Data comes from the official MLB Stats API. This site is not affiliated with, endorsed by,
    or sponsored by MLB.
  </p>
</template>
