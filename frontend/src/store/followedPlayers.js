import { defineStore } from 'pinia'

const STORAGE_KEY = 'plainstats.followedPlayers'
const LEGACY_PITCHERS_KEY = 'plainstats.followedPitchers'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)

    const legacy = localStorage.getItem(LEGACY_PITCHERS_KEY)
    if (!legacy) return []
    return JSON.parse(legacy).map((p) => ({
      ...p,
      role: 'pitching',
    }))
  } catch {
    return []
  }
}

function saveToStorage(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // localStorage unavailable; follows remain in memory for this session only.
  }
}

export const useFollowedPlayersStore = defineStore('followedPlayers', {
  state: () => ({
    players: loadFromStorage(),
  }),
  getters: {
    isFollowing: (state) => (playerId) =>
      state.players.some((p) => String(p.playerId) === String(playerId)),
    byRole: (state) => (role) => state.players.filter((p) => p.role === role),
  },
  actions: {
    follow(player) {
      const item = {
        playerId: player.playerId,
        fullName: player.fullName,
        teamId: player.teamId,
        teamName: player.teamName,
        position: player.position,
        role: player.role || 'hitting',
      }
      const existing = this.players.find((p) => String(p.playerId) === String(item.playerId))
      if (existing) Object.assign(existing, item)
      else this.players.push(item)
      saveToStorage(this.players)
    },
    unfollow(playerId) {
      this.players = this.players.filter((p) => String(p.playerId) !== String(playerId))
      saveToStorage(this.players)
    },
  },
})
