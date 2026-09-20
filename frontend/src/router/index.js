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
import { setSeoMeta } from '@/composables/useSeoMeta.js'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { title: 'PlainStats - Baseball Stats in Plain English', description: 'PlainStats explains real MLB stats in plain English — hitting, pitching, and fielding leaderboards, player pages, and custom stats like JWins, with every stat name explained in a hover tooltip.' } },
    { path: '/leaderboards/custom', name: 'leaderboard-builder', component: LeaderboardBuilderView, meta: { title: 'Custom Leaderboards - PlainStats', description: 'Build a custom MLB leaderboard from any hitting, pitching, or fielding stat — every stat explained in plain English.' } },
    // These three static routes MUST come before the dynamic /leaderboards/:statKey route
    // below — Vue Router matches routes in registration order, and a static path like
    // /leaderboards/batting would otherwise get swallowed by :statKey (treating "batting"
    // as a stat key to look up) if the dynamic route were registered first.
    { path: '/leaderboards/batting', name: 'batting-leaderboard', component: BattingLeaderboardView, meta: { title: 'Batting Leaderboards - PlainStats', description: 'MLB batting leaderboards — home runs, batting average, OBP, JWinsB, and more, every stat explained in plain English.' } },
    { path: '/leaderboards/fielding', name: 'fielding-leaderboard', component: FieldingLeaderboardView, meta: { title: 'Fielding Leaderboards - PlainStats', description: 'MLB fielding leaderboards — putouts, assists, errors, JWinsF, and more, every stat explained in plain English.' } },
    { path: '/leaderboards/pitching', name: 'pitching-leaderboard', component: PitchingLeaderboardView, meta: { title: 'Pitching Leaderboards - PlainStats', description: 'MLB pitching leaderboards — ERA, strikeouts, WHIP, JWinsP, and more, every stat explained in plain English.' } },
    { path: '/leaderboards/:statKey', name: 'single-stat-leaderboard', component: SingleStatLeaderboardView, props: true, meta: { title: 'Leaderboard - PlainStats', description: 'MLB stat leaderboard, explained in plain English.' } },
    { path: '/pitchers', name: 'pitcher-list', component: PitcherListView, meta: { title: 'Followed Pitchers - PlainStats', description: 'Track the pitchers you follow and see who is starting today.' } },
    { path: '/pitchers/:playerId', name: 'pitcher-tracker', component: PitcherTrackerView, props: true, meta: { title: 'Pitcher Tracker - PlainStats', description: 'Live pitch-by-pitch tracking and next-start estimates for an MLB pitcher.' } },
    { path: '/players/search', name: 'player-search', component: PlayerSearchView, meta: { title: 'Player Search - PlainStats', description: 'Search for any current or former MLB player and see their hitting, pitching, and fielding stats explained in plain English.' } },
    { path: '/players/:playerId', name: 'player-rundown', component: PlayerRundownView, props: true, meta: { title: 'Player - PlainStats', description: 'MLB player stats — hitting, pitching, and fielding — explained in plain English.' } },
    { path: '/compare', name: 'compare-players', component: ComparePlayersView, meta: { title: 'Compare Players - PlainStats', description: 'Compare up to 4 MLB players side by side across hitting, pitching, and fielding stats.' } },
    { path: '/live', name: 'live-games', component: LiveGamesView, meta: { title: 'Live Games - PlainStats', description: 'Live MLB scores and games in progress today.' } },
    { path: '/live/:gamePk', name: 'live-game-detail', component: LiveGameDetailView, props: true, meta: { title: 'Live Game - PlainStats', description: 'Live MLB pitch-by-pitch tracking and box score.' } },
    { path: '/standings', name: 'standings', component: StandingsView, meta: { title: 'Standings - PlainStats', description: 'MLB standings and wild card race, with projected final records.' } },
    { path: '/about', name: 'about', component: AboutView, meta: { title: 'About - PlainStats', description: 'About PlainStats — a baseball stats site that explains every stat in plain English.' } },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { title: 'Settings - PlainStats', description: 'PlainStats settings.' } },
    { path: '/articles', name: 'articles', component: ArticlesView, meta: { title: 'Articles - PlainStats', description: 'Baseball articles and analysis from PlainStats.' } },
    { path: '/jwins', name: 'jwins', component: JWinsView, meta: { title: 'JWins - PlainStats', description: 'JWins — a custom MLB Wins Above Replacement stat family for batting, pitching, and fielding.' } },
  ],
})

// SEO: sets document.title, the meta description, the canonical URL, and Open Graph/
// Twitter tags from each route's own meta.title/meta.description after every navigation.
// This is a real, if modest, improvement for a client-rendered app with no SSR (see
// useSeoMeta.js for the full explanation, including the canonical-URL bug this replaces —
// previously the canonical tag was hardcoded to the homepage on every route). Routes that
// need something more specific than their static meta (most importantly a player's own
// name and team, not just the word "Player") override these again after their own data
// loads — see PlayerRundownView.vue.
router.afterEach((to) => {
  setSeoMeta({
    title: to.meta?.title || 'PlainStats - Baseball Stats in Plain English',
    description: to.meta?.description,
    canonicalPath: to.fullPath,
  })
})

export default router
