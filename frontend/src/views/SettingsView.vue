<script setup>
import { useThemeStore, FONT_OPTIONS } from '@/store/theme.js'

const themeStore = useThemeStore()
</script>

<template>
  <h1>Settings</h1>
  <p class="subtitle">
    Change how PlainStats looks on this device. These are saved in your browser, so
    they'll still be set the next time you visit.
  </p>

  <div class="section">
    <h2>Background color</h2>
    <p class="muted">Applies to the whole page background.</p>
    <label class="checkbox-row">
      <input
        type="color"
        :value="themeStore.theme.background"
        @input="themeStore.setBackground($event.target.value)"
      />
      {{ themeStore.theme.background }}
    </label>
  </div>

  <div class="section">
    <h2>Text color</h2>
    <p class="muted">
      Applies to the site title, headings, and body text. Error text, muted notes, and
      links keep their own colors so they stay readable and easy to tell apart.
    </p>
    <label class="checkbox-row">
      <input
        type="color"
        :value="themeStore.theme.text"
        @input="themeStore.setText($event.target.value)"
      />
      {{ themeStore.theme.text }}
    </label>
  </div>

  <div class="section">
    <h2>Font</h2>
    <label v-for="f in FONT_OPTIONS" :key="f.key" class="checkbox-row">
      <input
        type="radio"
        :value="f.key"
        :checked="themeStore.theme.fontKey === f.key"
        @change="themeStore.setFont(f.key)"
      />
      <span :style="{ fontFamily: f.value }">{{ f.label }}</span>
    </label>
  </div>

  <div class="section">
    <h2>Preview</h2>
    <div class="table-scroll">
      <table class="plain-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>AVG</th>
            <th>HR</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Example Player</td>
            <td>.301</td>
            <td>38</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <button v-if="!themeStore.isDefault" @click="themeStore.reset">Reset to default look</button>
</template>
