<script setup>
import { ref, onMounted } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { getArticles, getArticle, likeArticle, unlikeArticle, recordArticleView } from '@/services/mlbApi.js'

const articles = ref([])
const loading = ref(true)
const errorMsg = ref('')

// Which article (by filename) is currently expanded/open for reading, or null if the
// list is showing. Only one at a time, kept simple to match the rest of this site.
const openFilename = ref(null)
const openArticleBody = ref('') // sanitized HTML, ready to render
const openLoading = ref(false)
const openError = ref('')

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    // The backend reads the visitor id header (see services/mlbApi.js/visitorId.js) and
    // returns each article's real likes/views AND whether THIS visitor already liked it
    // (article.likedByVisitor) — no separate per-article check needed.
    const data = await getArticles()
    articles.value = data.articles || []
  } catch (err) {
    errorMsg.value = err.message || 'Could not load articles.'
  } finally {
    loading.value = false
  }
}

// Like/unlike toggle. The backend enforces one like per visitor and supports removing it
// (see backend/articlesStore.js's addLike/removeLike) — this just calls whichever
// direction matches the article's current likedByVisitor state.
async function toggleLike(article) {
  try {
    const data = article.likedByVisitor
      ? await unlikeArticle(article.filename)
      : await likeArticle(article.filename)
    article.likes = data.likes
    article.likedByVisitor = data.likedByVisitor
  } catch {
    // A failed like/unlike isn't worth a page-level error banner — the button just won't
    // visibly change, and the person can try again.
  }
}

async function openArticle(article) {
  openFilename.value = article.filename
  openArticleBody.value = ''
  openError.value = ''
  openLoading.value = true
  try {
    // recordArticleView is idempotent per visitor on the backend — opening the same
    // article again later (or reloading) does not add a second view for the same person.
    const [contentData] = await Promise.all([
      getArticle(article.filename),
      recordArticleView(article.filename).then((data) => {
        article.views = data.views
      }),
    ])
    // marked() turns the article's markdown into HTML; DOMPurify strips anything unsafe
    // (script tags, event handler attributes, javascript: links, etc.) before it's ever
    // rendered with v-html below. Only Joshua can add articles (dropping a .md file
    // directly on the server), so the realistic risk here is low, but sanitizing on the
    // way to v-html costs nothing and is standard practice any time raw HTML is rendered.
    const rawHtml = marked.parse(contentData.article.body || '')
    openArticleBody.value = DOMPurify.sanitize(rawHtml)
  } catch (err) {
    openError.value = err.message || 'Could not load this article.'
  } finally {
    openLoading.value = false
  }
}

function closeArticle() {
  openFilename.value = null
  openArticleBody.value = ''
  openError.value = ''
}

onMounted(load)
</script>

<template>
  <h1>News Articles</h1>
  <p class="subtitle">Baseball articles and analysis.</p>

  <div v-if="openFilename" class="section">
    <p><a href="#" @click.prevent="closeArticle">&larr; Back to all articles</a></p>
    <p v-if="openLoading" class="muted">Loading&hellip;</p>
    <p v-else-if="openError" class="error-text">{{ openError }}</p>
    <div v-else class="markdown-article" v-html="openArticleBody"></div>
  </div>

  <div v-else class="section">
    <p v-if="loading" class="muted">Loading articles&hellip;</p>
    <p v-else-if="errorMsg" class="error-text">{{ errorMsg }}</p>
    <p v-else-if="articles.length === 0" class="muted">No articles yet — check back soon.</p>

    <ul v-else class="text-links-list">
      <li v-for="article in articles" :key="article.filename" style="margin-bottom: 12px;">
        <a href="#" @click.prevent="openArticle(article)">{{ article.title }}</a>
        <span class="muted"> — {{ article.views }} view{{ article.views === 1 ? '' : 's' }}</span>
        <button style="margin-left: 8px;" @click="toggleLike(article)">
          {{ article.likedByVisitor ? '💙' : '👍' }} {{ article.likes }}
        </button>
      </li>
    </ul>
  </div>
</template>
