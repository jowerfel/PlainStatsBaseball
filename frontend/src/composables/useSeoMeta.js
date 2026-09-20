// useSeoMeta.js — plain-DOM per-route SEO tag management, no extra dependency (the site
// deliberately keeps its dependency list small — see package.json).
//
// WHY THIS EXISTS: this is a client-rendered Vue SPA with no server-side rendering (see
// README's "Not currently wired up" section), which means index.html is the ONLY html
// search engines can see without executing JavaScript, and it's a single static file
// shared by every route. Before this fix, that static file's <link rel="canonical">
// ALWAYS pointed at the homepage — https://plainstats.jwerfel.com/ — no matter what page
// was actually being viewed. That's not just "not helpful," it's actively harmful: a
// canonical tag pointing every player page at the homepage tells a search engine "these
// pages are duplicates of the homepage, don't index them separately," which would
// suppress player pages from search results entirely rather than merely fail to rank
// them. Google's crawler does generally execute JS (in a second rendering wave after
// initial crawl), so updating these tags from Vue Router still helps Google specifically,
// even without full SSR/prerendering.
//
// setSeoMeta({ title, description, canonicalPath }) is called from route components
// (see router/index.js for the route-level defaults, and PlayerRundownView.vue for a
// per-player override once the player's name loads) to set:
//   - document.title
//   - <meta name="description">
//   - <link rel="canonical"> — pointed at THIS route's own URL, not the homepage
//   - <meta property="og:title">, <meta property="og:description">, <meta property="og:url">
//   - <meta name="twitter:title">, <meta name="twitter:description">
// All by finding-or-creating the tag in <head>, so index.html's static tags act as
// sensible defaults for the homepage and for any crawler that never executes JS at all.

const SITE_ORIGIN = 'https://plainstats.jwerfel.com'

function setMetaByName(name, content) {
  let tag = document.querySelector(`meta[name="${name}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', name)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function setMetaByProperty(property, content) {
  let tag = document.querySelector(`meta[property="${property}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('property', property)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function setCanonical(path) {
  let tag = document.querySelector('link[rel="canonical"]')
  if (!tag) {
    tag = document.createElement('link')
    tag.setAttribute('rel', 'canonical')
    document.head.appendChild(tag)
  }
  const url = `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
  tag.setAttribute('href', url)
  return url
}

// title: full <title> text (already including " - PlainStats" if wanted).
// description: meta description text — keep this genuinely descriptive of the specific
// page (a player's name/team/position, a leaderboard's stat, etc.) rather than reusing
// the homepage's generic description, since a unique, on-topic description is one of the
// stronger signals search engines use to judge whether a page actually answers a given
// query (e.g. a search for a player's name).
// canonicalPath: the route's own path (e.g. `/players/12345`), NOT the homepage.
export function setSeoMeta({ title, description, canonicalPath }) {
  if (title) document.title = title
  if (description) setMetaByName('description', description)
  const canonicalUrl = canonicalPath ? setCanonical(canonicalPath) : null

  if (title) {
    setMetaByProperty('og:title', title)
    setMetaByName('twitter:title', title)
  }
  if (description) {
    setMetaByProperty('og:description', description)
    setMetaByName('twitter:description', description)
  }
  if (canonicalUrl) {
    setMetaByProperty('og:url', canonicalUrl)
  }
}
