import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useThemeStore } from './store/theme.js'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// Applies the visitor's saved background/text/font (see store/theme.js) before mount, so
// there's no flash of the default look before their choice kicks in.
useThemeStore().init()

app.mount('#app')
