<script setup>
import { computed } from 'vue'
import { statDictionary, formatStatValue, getStatQuality } from '@/data/statDictionary.js'
import StatTooltip from './StatTooltip.vue'

const props = defineProps({
  statKey: { type: String, required: true },
  value: { type: [Number, String, null], default: null },
  // If true, shows the small colored dot instead of a bordered badge — used inline in tables.
  dot: { type: Boolean, default: false },
})

const def = computed(() => statDictionary[props.statKey])
const quality = computed(() => getStatQuality(props.statKey, props.value))
const formatted = computed(() => formatStatValue(props.statKey, props.value))
const qualityClass = computed(() => `quality-${quality.value || 'none'}`)
</script>

<template>
  <span v-if="dot" class="stat-dot" :class="qualityClass" :title="def ? def.simpleName : statKey"></span>
  <span v-else class="stat-badge-block">
    <div class="muted" style="font-size: 11px;">
      <StatTooltip :stat-key="statKey" />
    </div>
    <span class="stat-badge" :class="qualityClass">{{ formatted }}</span>
  </span>
</template>
