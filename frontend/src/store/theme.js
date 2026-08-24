import { defineStore } from 'pinia'

const STORAGE_KEY = 'plainstats.theme'

// Curated, not free-text — every option here is a normal web-safe font stack or a plain
// hex color, so there's no way to end up with an unreadable or broken combination (e.g. a
// typo'd font name silently falling back to nothing, or an invalid color crashing the
// color-swatch preview). Editing this list is the easy way to add more choices later.
export const FONT_OPTIONS = [
  { key: 'verdana', label: 'Verdana (default)', value: 'Verdana, Arial, Helvetica, sans-serif' },
  { key: 'arial', label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { key: 'georgia', label: 'Georgia (serif)', value: 'Georgia, "Times New Roman", Times, serif' },
  { key: 'times', label: 'Times New Roman (serif)', value: '"Times New Roman", Times, serif' },
  { key: 'courier', label: 'Courier New (monospace)', value: '"Courier New", Courier, monospace' },
  { key: 'trebuchet', label: 'Trebuchet MS', value: '"Trebuchet MS", Verdana, sans-serif' },
  { key: 'system', label: "Your device's default font", value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
]

export const DEFAULT_THEME = {
  background: '#ffffff',
  text: '#000000',
  fontKey: 'verdana',
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_THEME }
    const parsed = JSON.parse(raw)
    return {
      background: typeof parsed.background === 'string' ? parsed.background : DEFAULT_THEME.background,
      text: typeof parsed.text === 'string' ? parsed.text : DEFAULT_THEME.text,
      fontKey: FONT_OPTIONS.some((f) => f.key === parsed.fontKey) ? parsed.fontKey : DEFAULT_THEME.fontKey,
    }
  } catch {
    return { ...DEFAULT_THEME }
  }
}

function saveToStorage(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme))
  } catch {
    // localStorage unavailable (private browsing, storage disabled, etc.) — the chosen
    // theme still applies for this session, it just won't be remembered on the next visit.
  }
}

// Pushes the current theme onto :root as CSS custom properties. main.css reads --user-bg /
// --user-text / --user-font everywhere the old hardcoded values used to be, so this one
// call is all it takes to re-skin the whole site.
function applyToDocument(theme) {
  const font = FONT_OPTIONS.find((f) => f.key === theme.fontKey) || FONT_OPTIONS[0]
  const root = document.documentElement
  root.style.setProperty('--user-bg', theme.background)
  root.style.setProperty('--user-text', theme.text)
  root.style.setProperty('--user-font', font.value)
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    theme: loadFromStorage(),
  }),
  getters: {
    fontOption: (state) => FONT_OPTIONS.find((f) => f.key === state.theme.fontKey) || FONT_OPTIONS[0],
    isDefault: (state) =>
      state.theme.background === DEFAULT_THEME.background &&
      state.theme.text === DEFAULT_THEME.text &&
      state.theme.fontKey === DEFAULT_THEME.fontKey,
  },
  actions: {
    // Applies + persists on app startup (see App.vue) and again any time a setting changes.
    init() {
      applyToDocument(this.theme)
    },
    setBackground(hex) {
      this.theme.background = hex
      applyToDocument(this.theme)
      saveToStorage(this.theme)
    },
    setText(hex) {
      this.theme.text = hex
      applyToDocument(this.theme)
      saveToStorage(this.theme)
    },
    setFont(fontKey) {
      if (!FONT_OPTIONS.some((f) => f.key === fontKey)) return
      this.theme.fontKey = fontKey
      applyToDocument(this.theme)
      saveToStorage(this.theme)
    },
    reset() {
      this.theme = { ...DEFAULT_THEME }
      applyToDocument(this.theme)
      saveToStorage(this.theme)
    },
  },
})
