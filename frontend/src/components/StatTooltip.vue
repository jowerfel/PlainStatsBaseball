<script setup>
import { ref } from 'vue'
import { statDictionary } from '@/data/statDictionary.js'

const props = defineProps({
  statKey: { type: String, required: true },
})

const open = ref(false)
const def = statDictionary[props.statKey]

function toggle() {
  open.value = !open.value
}
</script>

<template>
  <span
    v-if="def"
    class="stat-tooltip-wrap"
    :class="{ 'tooltip-open': open }"
    tabindex="0"
    @click="toggle"
    @blur="open = false"
  >
    {{ def.simpleName }}
    <span class="stat-tooltip-bubble">
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
  <span v-else>{{ statKey }}</span>
</template>
