
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getLeaderboard } from '@/services/mlbApi.js'
import { getStatsByGroup, statDictionary } from '@/data/statDictionary.js'
import { isCustomStatKey, computeCustomStat, getCustomStat } from '@/data/customStats.js'

const DEFAULT_STATS_BY_GROUP = {
  hitting: ['avg', 'ops'],
  pitching: ['era', 'whip'],
  fielding: ['fielding', 'rangeFactor'],
}

export function useLeaderboardBuilder(group) {
  const route = useRoute()
  const router = useRouter()

  const selectedStats = ref(
    route.query.stats ? String(route.query.stats).split(',') : [...DEFAULT_STATS_BY_GROUP[group]],
  )
  const minPA = ref(route.query.minPA || '')
  const minIP = ref(route.query.minIP || '')
  const minInnings = ref(route.query.minInnings || '')
  const seasonType = ref(route.query.season === 'career' ? 'career' : 'season')
  const season = ref(
    route.query.season && String(route.query.season) !== 'career'
      ? String(route.query.season)
      : String(new Date().getFullYear()),
  )

  // includeCustom: true blends custom stats (data/customStats.js) into this same list —
  // they show up as ordinary checkboxes right alongside AVG/OPS/etc., with their formula
  // as the hover description via StatTooltip (see registerCustomStats in
  // statDictionary.js). No separate "custom stats" section — they're just stats.
  const availableStats = computed(() => getStatsByGroup(group, { includeCustom: true }))

  const rows = ref([])
  const loading = ref(false)
  const errorMsg = ref('')
  const hasSearched = ref(false)
  const copyMsg = ref('')
  const activeSortStat = ref(selectedStats.value[0] || null)
  const activeSortDir = ref('desc')

  function toggleStat(key) {
    const idx = selectedStats.value.indexOf(key)
    if (idx === -1) {
      selectedStats.value.push(key)
    } else {
      selectedStats.value.splice(idx, 1)
    }
  }

  // Every selected stat is a normal isStat: true column now — custom stats are
  // registered into statDictionary (see registerCustomStats), so StatTable's usual
  // formatting and StatTooltip lookup work on them exactly like any real stat, no
  // special-casing needed here.
  const columns = computed(() => [
    { key: 'playerName', label: 'Player', isStat: false, link: (row) => `/players/${row.id}` },
    { key: 'teamName', label: 'Team', isStat: false },
    ...selectedStats.value.map((key) => ({ key, isStat: true })),
  ])

  // Custom stats aren't returned by the backend (it doesn't know the formulas) — they're
  // computed here, client-side, from the same raw `stat` object the backend already
  // sends for every row (which includes the base fields like AB/H/2B/3B/HR/etc. formulas
  // need). The numeric value is stored under the stat's own key so StatTable's normal
  // formatting path (formatStatValue, keyed off statDictionary) handles display — no
  // pre-formatting or separate raw/display fields required now that custom stats are
  // registered stats.
  const tableRows = computed(() =>
    rows.value.map((r) => {
      const row = { id: r.playerId, playerName: r.playerName, teamName: r.teamName }
      for (const key of selectedStats.value) {
        row[key] = isCustomStatKey(key) ? computeCustomStat(getCustomStat(key), r.stat) : r.stat?.[key]
      }
      return row
    }),
  )

  // A custom stat's value only exists client-side, so the backend can't sort by it. When
  // the active sort is a custom stat, sort the already-fetched rows here instead of
  // re-querying.
  const displayRows = computed(() => {
    if (!activeSortStat.value || !isCustomStatKey(activeSortStat.value)) return tableRows.value
    const key = activeSortStat.value
    const dir = activeSortDir.value === 'asc' ? 1 : -1
    return [...tableRows.value].sort((a, b) => {
      const av = a[key]
      const bv = b[key]
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      return (av - bv) * dir
    })
  })

  // StatTable's own header click normally does a purely client-side re-sort, which is
  // only correct if the rows it's holding are the full/true population for whatever
  // column got clicked. Here they're NOT — `rows` is a server-side top-N slice already
  // sorted by one particular stat, so re-sorting a different stat column client-side
  // would just reorder that same incomplete slice instead of showing the actual leaders
  // for that stat. Re-running the search against the backend with the newly clicked stat
  // as sortStat gets the real top-N for that stat instead — UNLESS the clicked stat is a
  // custom one, which the backend doesn't know how to sort by; that case just re-sorts
  // the rows already on screen (see displayRows above).
  function onSortRequested(col) {
    if (activeSortStat.value === col.key) {
      activeSortDir.value = activeSortDir.value === 'desc' ? 'asc' : 'desc'
    } else {
      activeSortStat.value = col.key
      // Default sort direction follows the stat's own goodDirection (e.g. Errors
      // defaults to ascending — fewest first — instead of every stat defaulting to
      // descending regardless of what "better" means for it).
      const def = isCustomStatKey(col.key) ? getCustomStat(col.key) : statDictionary[col.key]
      activeSortDir.value = def?.goodDirection === 'low' ? 'asc' : 'desc'
    }
    if (isCustomStatKey(col.key)) return // displayRows handles it reactively, no refetch needed
    runSearch()
  }

  async function runSearch() {
    loading.value = true
    errorMsg.value = ''
    hasSearched.value = true

    // Keep the active sort stat valid — if it was deselected, fall back to the first
    // checked stat.
    if (!selectedStats.value.includes(activeSortStat.value)) {
      activeSortStat.value = selectedStats.value[0] || null
      activeSortDir.value = 'desc'
    }

    // Reflect filters in the URL so the leaderboard is shareable — group is NOT included
    // here (unlike the old combined page), since it's fixed per-page now, not a filter
    // choice someone picks and shares.
    const seasonValue = seasonType.value === 'career' ? 'career' : season.value
    router.replace({
      query: {
        stats: selectedStats.value.join(','),
        sortStat: activeSortStat.value || undefined,
        minPA: minPA.value || undefined,
        minIP: minIP.value || undefined,
        minInnings: minInnings.value || undefined,
        season: seasonValue,
      },
    })

    // The backend can only sort by stats it recognizes. If the active sort is a custom
    // stat, ask it to sort by the first real (non-custom) selected stat instead, then
    // displayRows re-sorts the fetched pool by the custom stat client-side.
    const backendSortStat = isCustomStatKey(activeSortStat.value)
      ? selectedStats.value.find((k) => !isCustomStatKey(k)) || undefined
      : activeSortStat.value

    try {
      const data = await getLeaderboard({
        group,
        stats: selectedStats.value.filter((k) => !isCustomStatKey(k)),
        sortStat: backendSortStat,
        season: seasonValue,
        minPA: group === 'hitting' ? minPA.value || undefined : undefined,
        minIP: group === 'pitching' ? minIP.value || undefined : undefined,
        minInnings: group === 'fielding' ? minInnings.value || undefined : undefined,
        limit: 100,
      })
      rows.value = data.rows || []
      if (!isCustomStatKey(activeSortStat.value) && activeSortDir.value === 'asc') {
        rows.value = [...rows.value].reverse()
      }
    } catch (err) {
      errorMsg.value = err.message || 'Could not build the leaderboard.'
    } finally {
      loading.value = false
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      copyMsg.value = 'Link copied.'
      setTimeout(() => (copyMsg.value = ''), 2000)
    })
  }

  // If the URL arrived with query params (someone followed a shared link), run the
  // search immediately.
  if (route.query.stats) {
    runSearch()
  }

  return {
    selectedStats,
    minPA,
    minIP,
    minInnings,
    seasonType,
    season,
    availableStats,
    rows,
    loading,
    errorMsg,
    hasSearched,
    copyMsg,
    activeSortStat,
    activeSortDir,
    columns,
    displayRows,
    toggleStat,
    onSortRequested,
    runSearch,
    copyLink,
  }
}
