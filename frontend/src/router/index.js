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
import StandingsView from '@/views/StandingsView.vue'
import AboutView from '@/views/AboutView.vue'
import SettingsView from '@/views/SettingsView.vue'
import ArticlesView from '@/views/ArticlesView.vue'
import JWinsView from '@/views/JWinsView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/leaderboards/custom', name: 'leaderboard-builder', component: LeaderboardBuilderView },
    // These three static routes MUST come before the dynamic /leaderboards/:statKey route
    // below — Vue Router matches routes in registration order, and a static path like
    // /leaderboards/batting would otherwise get swallowed by :statKey (treating "batting"
    // as a stat key to look up) if the dynamic route were registered first.
    { path: '/leaderboards/batting', name: 'batting-leaderboard', component: BattingLeaderboardView },
    { path: '/leaderboards/fielding', name: 'fielding-leaderboard', component: FieldingLeaderboardView },
    { path: '/leaderboards/pitching', name: 'pitching-leaderboard', component: PitchingLeaderboardView },
    { path: '/leaderboards/:statKey', name: 'single-stat-leaderboard', component: SingleStatLeaderboardView, props: true },
    { path: '/pitchers', name: 'pitcher-list', component: PitcherListView },
    { path: '/pitchers/:playerId', name: 'pitcher-tracker', component: PitcherTrackerView, props: true },
    { path: '/players/search', name: 'player-search', component: PlayerSearchView },
    { path: '/players/:playerId', name: 'player-rundown', component: PlayerRundownView, props: true },
    { path: '/compare', name: 'compare-players', component: ComparePlayersView },
    { path: '/live', name: 'live-games', component: LiveGamesView },
    { path: '/standings', name: 'standings', component: StandingsView },
    { path: '/about', name: 'about', component: AboutView },
    { path: '/settings', name: 'settings', component: SettingsView },
    { path: '/articles', name: 'articles', component: ArticlesView },
    { path: '/jwins', name: 'jwins', component: JWinsView },
  ],
})

export default router
