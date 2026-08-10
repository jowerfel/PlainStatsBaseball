// Followed pitchers, persisted to localStorage. Per spec section 9: "start with
// localStorage" — no account system for MVP.

import { defineStore } from 'pinia'

const STORAGE_KEY = 'plainstats.followedPitchers'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveToStorage(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // localStorage unavailable (private browsing, etc) — fail silently, nothing to persist to
  }
}

export const useFollowedPitchersStore = defineStore('followedPitchers', {
  state: () => ({
    pitchers: loadFromStorage(), // [{ playerId, fullName, teamId, teamName }]
  }),
  getters: {
    isFollowing: (state) => (playerId) =>
      state.pitchers.some((p) => String(p.playerId) === String(playerId)),
  },
  actions: {
    follow(pitcher) {
      if (this.isFollowing(pitcher.playerId)) return
      this.pitchers.push(pitcher)
      saveToStorage(this.pitchers)
    },
    unfollow(playerId) {
      this.pitchers = this.pitchers.filter((p) => String(p.playerId) !== String(playerId))
      saveToStorage(this.pitchers)
    },
  },
})
