//Probably not used anymore


<script setup>
import { computed } from 'vue'


const props = defineProps({
  rows: { type: Array, required: true }, // [{ playerName, batting, pitching }]
})

const WIDTH = 640
const HEIGHT = 420
const PADDING = 56

const bounds = computed(() => {
  const battingValues = props.rows.map((r) => r.batting ?? 0)
  const pitchingValues = props.rows.map((r) => r.pitching ?? 0)
  // Always include 0 in the range so the axes have a meaningful origin even if every
  // plotted player happens to have all-positive (or all-negative) values.
  const xMin = Math.min(0, ...battingValues)
  const xMax = Math.max(0, ...battingValues)
  const yMin = Math.min(0, ...pitchingValues)
  const yMax = Math.max(0, ...pitchingValues)
  // A little breathing room so points at the extreme edges aren't drawn right on the
  // border of the chart.
  const xPad = (xMax - xMin) * 0.08 || 1
  const yPad = (yMax - yMin) * 0.08 || 1
  return { xMin: xMin - xPad, xMax: xMax + xPad, yMin: yMin - yPad, yMax: yMax + yPad }
})

function toSvgX(value) {
  const { xMin, xMax } = bounds.value
  const ratio = xMax === xMin ? 0.5 : (value - xMin) / (xMax - xMin)
  return PADDING + ratio * (WIDTH - PADDING * 2)
}

function toSvgY(value) {
  const { yMin, yMax } = bounds.value
  const ratio = yMax === yMin ? 0.5 : (value - yMin) / (yMax - yMin)
  // SVG y grows downward, so flip: a higher pitching value should plot higher on screen.
  return HEIGHT - PADDING - ratio * (HEIGHT - PADDING * 2)
}

const points = computed(() =>
  props.rows
    .filter((r) => r.batting !== null && r.batting !== undefined && r.pitching !== null && r.pitching !== undefined)
    .map((r) => ({
      name: r.playerName,
      x: toSvgX(r.batting),
      y: toSvgY(r.pitching),
      batting: r.batting,
      pitching: r.pitching,
      // A two-way player is anyone with a meaningfully non-zero amount of BOTH — colored
      // differently so they visually stand out from players who only really have one.
      isTwoWay: Math.abs(r.batting) > 0.5 && Math.abs(r.pitching) > 0.5,
    })),
)

const zeroX = computed(() => toSvgX(0))
const zeroY = computed(() => toSvgY(0))
</script>

<template>
  <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" style="width: 100%; height: auto; max-width: 640px;">
    <line :x1="PADDING" :y1="zeroY" :x2="WIDTH - PADDING" :y2="zeroY" stroke="#999" stroke-width="1" />
    <line :x1="zeroX" :y1="PADDING" :x2="zeroX" :y2="HEIGHT - PADDING" stroke="#999" stroke-width="1" />
    <rect :x="PADDING" :y="PADDING" :width="WIDTH - PADDING * 2" :height="HEIGHT - PADDING * 2" fill="none" stroke="#ccc" stroke-width="1" />
    <text :x="WIDTH / 2" :y="HEIGHT - 12" text-anchor="middle" font-size="13" fill="#333">JWinsB (batting) &rarr;</text>
    <text :x="16" :y="HEIGHT / 2" text-anchor="middle" font-size="13" fill="#333" :transform="`rotate(-90, 16, ${HEIGHT / 2})`">JWinsP (pitching) &rarr;</text>
    <g v-for="p in points" :key="p.name">
      <circle :cx="p.x" :cy="p.y" r="5" :fill="p.isTwoWay ? '#cc0000' : '#0000ee'" stroke="#fff" stroke-width="1">
        <title>{{ p.name }} — JWinsB {{ p.batting.toFixed(1) }}, JWinsP {{ p.pitching.toFixed(1) }}</title>
      </circle>
    </g>
  </svg>
  <p class="muted" style="font-size: 12px;">
    <span style="color: #0000ee;">&#9679;</span> mostly one facet
    &nbsp;&nbsp;
    <span style="color: #cc0000;">&#9679;</span> meaningful JWins in both batting and pitching (two-way)
    &nbsp;&nbsp; Hover a point for exact values.
  </p>
</template>
