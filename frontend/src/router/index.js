import { createRouter, createWebHistory } from 'vue-router'

import HomeView from '@/views/HomeView.vue'
import LeaderboardBuilderView from '@/views/LeaderboardBuilderView.vue'
import BattingLeaderboardView from '@/views/BattingLeaderboardView.vue'
import FieldingLeaderboardView from '@/views/FieldingLeaderboardView.vue'
import PitchingLeaderboardView from '@/views/PitchingLeaderboardView.vue'
import SingleStatLeaderboardView from '@/views/SingleStatLeaderboardView.vue'
import PitcherListView from '@/views/PitcherListView.vue'
import PitcherTrackerView from '@/views/PitcherTrackerView.vue'
import PlayerSearchView from '@/views/PlayerSearchView.vue'
import PlayerRundownView from '@/views/PlayerRundownView.vue'
import ComparePlayersView from '@/views/ComparePlayersView.vue'
import LiveGamesView from '@/views/LiveGamesView.vue'
import LiveGameDetailView from '@/views/LiveGameDetailView.vue'
import StandingsView from '@/views/StandingsView.vue'
import AboutView from '@/views/AboutView.vue'
import SettingsView from '@/views/SettingsView.vue'
import ArticlesView from '@/views/ArticlesView.vue'
import JWinsView from '@/views/JWinsView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { title: 'PlainStats - Baseball Stats in Plain English' } },
    { path: '/leaderboards/custom', name: 'leaderboard-builder', component: LeaderboardBuilderView, meta: { title: 'Custom Leaderboards - PlainStats' } },
    // These three static routes MUST come before the dynamic /leaderboards/:statKey route
    // below — Vue Router matches routes in registration order, and a static path like
    // /leaderboards/batting would otherwise get swallowed by :statKey (treating "batting"
    // as a stat key to look up) if the dynamic route were registered first.
    { path: '/leaderboards/batting', name: 'batting-leaderboard', component: BattingLeaderboardView, meta: { title: 'Batting Leaderboards - PlainStats' } },
    { path: '/leaderboards/fielding', name: 'fielding-leaderboard', component: FieldingLeaderboardView, meta: { title: 'Fielding Leaderboards - PlainStats' } },
    { path: '/leaderboards/pitching', name: 'pitching-leaderboard', component: PitchingLeaderboardView, meta: { title: 'Pitching Leaderboards - PlainStats' } },
    { path: '/leaderboards/:statKey', name: 'single-stat-leaderboard', component: SingleStatLeaderboardView, props: true, meta: { title: 'Leaderboard - PlainStats' } },
    { path: '/pitchers', name: 'pitcher-list', component: PitcherListView, meta: { title: 'Followed Pitchers - PlainStats' } },
    { path: '/pitchers/:playerId', name: 'pitcher-tracker', component: PitcherTrackerView, props: true, meta: { title: 'Pitcher Tracker - PlainStats' } },
    { path: '/players/search', name: 'player-search', component: PlayerSearchView, meta: { title: 'Player Search - PlainStats' } },
    { path: '/players/:playerId', name: 'player-rundown', component: PlayerRundownView, props: true, meta: { title: 'Player - PlainStats' } },
    { path: '/compare', name: 'compare-players', component: ComparePlayersView, meta: { title: 'Compare Players - PlainStats' } },
    { path: '/live', name: 'live-games', component: LiveGamesView, meta: { title: 'Live Games - PlainStats' } },
    { path: '/live/:gamePk', name: 'live-game-detail', component: LiveGameDetailView, props: true, meta: { title: 'Live Game - PlainStats' } },
    { path: '/standings', name: 'standings', component: StandingsView, meta: { title: 'Standings - PlainStats' } },
    { path: '/about', name: 'about', component: AboutView, meta: { title: 'About - PlainStats' } },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { title: 'Settings - PlainStats' } },
    { path: '/articles', name: 'articles', component: ArticlesView, meta: { title: 'Articles - PlainStats' } },
    { path: '/jwins', name: 'jwins', component: JWinsView, meta: { title: 'JWins - PlainStats' } },
  ],
})

// SEO/UX: a single-page app otherwise leaves the browser tab (and search engine result
// snippets, to whatever extent a crawler executes this JS) showing the same generic
// "PlainStats" title no matter which page is open. This sets document.title from each
// route's own meta.title after every navigation — a real, if modest, SEO improvement for
// a client-rendered app that doesn't have server-side rendering to generate per-page
// <title> tags at request time.
router.afterEach((to) => {
  document.title = to.meta?.title || 'PlainStats - Baseball Stats in Plain English'
})

export default router
