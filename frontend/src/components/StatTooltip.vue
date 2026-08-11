<script setup>
import { computed, ref } from 'vue'
import { statDictionary } from '@/data/statDictionary.js'

const props = defineProps({
  statKey: { type: String, required: true },
  label: { type: String, default: '' },
})

const open = ref(false)
const def = statDictionary[props.statKey]
const labelText = computed(() => (def ? def.simpleName : props.label || props.statKey))

function toggle() {
  open.value = !open.value
}
</script>

<template>
  <span
    class="stat-tooltip-wrap"
    :class="{ 'tooltip-open': open }"
    tabindex="0"
    @click="toggle"
    @blur="open = false"
  >
    {{ labelText }}
    <span class="stat-tooltip-bubble" v-if="def">
      <strong>{{ def.fullName || def.realName }}</strong>
      <span v-if="def.fullName"> ({{ def.realName }})</span>
      <br />
      {{ def.shortExplain }}
      <template v-if="def.extraExplain">
        <br />
        <span class="muted">{{ def.extraExplain }}</span>
      </template>
    </span>
  </span>
</template>
