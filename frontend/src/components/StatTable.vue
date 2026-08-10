<script setup>
import { ref, computed } from 'vue'
import { formatStatValue, getStatQuality, statDictionary } from '@/data/statDictionary.js'
import StatTooltip from './StatTooltip.vue'

// columns: [{ key: 'playerName', label: 'Player', isStat: false, link: (row) => '/players/1' }, ...]
// rows: array of plain objects with flat keys matching column.key
const props = defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, required: true },
  caption: { type: String, default: '' },
  maxRows: { type: Number, default: null },
})

const sortKey = ref(null)
const sortDir = ref('desc')

function onHeaderClick(col) {
  if (sortKey.value === col.key) {
    sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'
  } else {
    sortKey.value = col.key
    sortDir.value = col.isStat ? 'desc' : 'asc'
  }
}

const sortedRows = computed(() => {
  if (!sortKey.value) return props.rows
  const key = sortKey.value
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...props.rows].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    if (typeof av === 'number' && typeof bv === 'number') {
      return (av - bv) * dir
    }
    return String(av ?? '').localeCompare(String(bv ?? '')) * dir
  })
})

const visibleRows = computed(() => {
  if (props.maxRows && sortedRows.value.length > props.maxRows) {
    return sortedRows.value.slice(0, props.maxRows)
  }
  return sortedRows.value
})

function cellValue(row, col) {
  const raw = row[col.key]
  return col.isStat ? formatStatValue(col.key, raw) : raw
}

function cellQualityClass(row, col) {
  if (!col.isStat) return ''
  const q = getStatQuality(col.key, row[col.key])
  return q ? `quality-${q}` : ''
}
</script>

<template>
  <div class="table-scroll">
    <table class="plain-table">
      <caption v-if="caption">{{ caption }}</caption>
      <thead>
        <tr>
          <th
            v-for="col in columns"
            :key="col.key"
            class="sortable"
            @click="onHeaderClick(col)"
          >
            <StatTooltip v-if="col.isStat && statDictionary[col.key]" :stat-key="col.key" />
            <span v-else>{{ col.label }}</span>
            <span v-if="sortKey === col.key">{{ sortDir === 'asc' ? ' \u25B2' : ' \u25BC' }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, idx) in visibleRows" :key="row.id ?? idx">
          <td v-for="col in columns" :key="col.key" :class="cellQualityClass(row, col)">
            <RouterLink v-if="col.link" :to="col.link(row)">{{ cellValue(row, col) }}</RouterLink>
            <template v-else>{{ cellValue(row, col) }}</template>
          </td>
        </tr>
        <tr v-if="sortedRows.length === 0">
          <td :colspan="columns.length" class="muted">No results.</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
