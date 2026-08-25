<script setup>
import { ref, onMounted } from 'vue'
import { getArticles, uploadArticle, likeArticle, recordArticleView, resolveArticlePdfUrl } from '@/services/mlbApi.js'

const articles = ref([])
const loading = ref(true)
const errorMsg = ref('')

const title = ref('')
const selectedFile = ref(null)
const uploading = ref(false)
const uploadError = ref('')
const fileInputEl = ref(null)

// Tracks which article ids this browser has already liked THIS SESSION, purely to stop
// obvious repeat-clicking of the same button in one visit — not a real vote lock (this
// site has no accounts, same trust level as the rest of its local-storage-based features),
// so it resets on reload and doesn't try to prevent someone liking again from a fresh tab.
const likedThisSession = ref(new Set())

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await getArticles()
    articles.value = data.articles || []
  } catch (err) {
    errorMsg.value = err.message || 'Could not load articles.'
  } finally {
    loading.value = false
  }
}

function onFileChange(event) {
  selectedFile.value = event.target.files?.[0] || null
}

async function submitUpload() {
  uploadError.value = ''
  if (!title.value.trim()) {
    uploadError.value = 'Give the article a title.'
    return
  }
  if (!selectedFile.value) {
    uploadError.value = 'Choose a PDF file to upload.'
    return
  }
  if (selectedFile.value.type !== 'application/pdf') {
    uploadError.value = 'Only PDF files are accepted.'
    return
  }

  uploading.value = true
  try {
    const data = await uploadArticle({ title: title.value.trim(), file: selectedFile.value })
    articles.value = [data.article, ...articles.value]
    title.value = ''
    selectedFile.value = null
    if (fileInputEl.value) fileInputEl.value.value = ''
  } catch (err) {
    uploadError.value = err.message || 'Upload failed.'
  } finally {
    uploading.value = false
  }
}

async function toggleLike(article) {
  // Not a real per-user toggle (no accounts on this site) — clicking always adds a like;
  // likedThisSession just dims the button after one click per visit so it doesn't look
  // like nothing happened, and to discourage rapid repeat-clicking.
  if (likedThisSession.value.has(article.id)) return
  try {
    const data = await likeArticle(article.id)
    article.likes = data.article.likes
    likedThisSession.value.add(article.id)
  } catch {
    // A failed like isn't worth a page-level error banner — the count just won't move.
  }
}

async function openArticle(article) {
  try {
    const data = await recordArticleView(article.id)
    article.views = data.article.views
  } catch {
    // Same reasoning as toggleLike — don't block opening the PDF over a failed view-count tick.
  }
  window.open(resolveArticlePdfUrl(article.pdfUrl), '_blank', 'noopener')
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
}

function formatSize(bytes) {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

onMounted(load)
</script>

<template>
  <h1>News Articles</h1>
  <p class="subtitle">Upload a PDF article for others to read, like, and track views.</p>

  <div class="section">
    <h2>Upload an article</h2>
    <form class="plain-form" @submit.prevent="submitUpload">
      <label for="article-title">Title</label>
      <input id="article-title" v-model="title" type="text" placeholder="e.g. Trade Deadline Preview" />

      <label for="article-file">PDF file</label>
      <input id="article-file" ref="fileInputEl" type="file" accept="application/pdf" @change="onFileChange" />

      <p v-if="uploadError" class="error-text">{{ uploadError }}</p>

      <button type="submit" :disabled="uploading">{{ uploading ? 'Uploading…' : 'Upload' }}</button>
    </form>
  </div>

  <div class="section">
    <h2>All articles</h2>
    <p v-if="loading" class="muted">Loading articles&hellip;</p>
    <p v-else-if="errorMsg" class="error-text">{{ errorMsg }}</p>
    <p v-else-if="articles.length === 0" class="muted">No articles uploaded yet — be the first.</p>

    <ul v-else class="text-links-list">
      <li v-for="article in articles" :key="article.id" style="margin-bottom: 12px;">
        <a href="#" @click.prevent="openArticle(article)">{{ article.title }}</a>
        <span class="muted">
          — uploaded {{ formatDate(article.uploadedAt) }}<template v-if="article.fileSizeBytes"> · {{ formatSize(article.fileSizeBytes) }}</template>
          · {{ article.views }} view{{ article.views === 1 ? '' : 's' }}
        </span>
        <button
          style="margin-left: 8px;"
          :disabled="likedThisSession.has(article.id)"
          @click="toggleLike(article)"
        >
          👍 {{ article.likes }}
        </button>
      </li>
    </ul>
  </div>
</template>
