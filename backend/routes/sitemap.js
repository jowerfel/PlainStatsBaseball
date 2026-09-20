// sitemap.js — generates /sitemap.xml, listing every URL PlainStats wants search engines
// to crawl and index: the site's static pages, plus one URL per player it has a page for.
//
// WHY THIS EXISTS: individual player pages were never enumerated anywhere a search
// engine could discover them (see the README's "Not currently wired up" note) — there
// are far too many to hardcode, and this is a client-rendered SPA with no server-side
// route list to derive them from automatically. A sitemap is the standard, direct way to
// tell a search engine "these specific URLs exist, please crawl them" rather than relying
// entirely on the crawler finding them by following links (which mostly happens through
// leaderboards and search results, and can easily miss a huge fraction of players who
// aren't currently near the top of anything).
//
// SOURCES OF PLAYER IDS: this combines two MLB Stats API calls (both already used
// elsewhere in this codebase — see mlbClient.js) rather than inventing a new one:
//   1. getAllActivePlayers(currentSeason) — every player on an active roster right now.
//      Covers the players people are most likely searching for today.
//   2. getCareerLeaders({ group }) for hitting AND pitching — the top career leaders by
//      MLB's own career leaderboard, which naturally surfaces historically notable
//      retired players (the ones people search for by name long after they've retired)
//      without trying to enumerate literally every player who ever played, which would
//      make an enormous, mostly-useless sitemap.
// The two sources are deduplicated by player ID before being written out.
//
// CACHING: this data barely changes hour to hour (rosters update occasionally, career
// leaders essentially never mid-day), so it's cached for a full day — a sitemap doesn't
// need to be real-time, and this avoids hammering MLB's API on every crawler visit.

import { getAllActivePlayers, getCareerLeaders } from '../mlbClient.js'
import { cached } from '../cache.js'

const SITE_ORIGIN = 'https://plainstats.jwerfel.com'
const SITEMAP_CACHE_TTL = 24 * 60 * 60 * 1000 // 1 day

// Static, hand-maintained pages worth listing explicitly — the ones with real, distinct
// content (not settings/search-form pages, which have nothing for a search engine to
// index and aren't things people search for by name).
const STATIC_PATHS = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/leaderboards/batting', priority: '0.8', changefreq: 'daily' },
  { path: '/leaderboards/fielding', priority: '0.8', changefreq: 'daily' },
  { path: '/leaderboards/pitching', priority: '0.8', changefreq: 'daily' },
  { path: '/jwins', priority: '0.7', changefreq: 'daily' },
  { path: '/standings', priority: '0.7', changefreq: 'daily' },
  { path: '/live', priority: '0.6', changefreq: 'hourly' },
  { path: '/articles', priority: '0.6', changefreq: 'weekly' },
  { path: '/compare', priority: '0.4', changefreq: 'monthly' },
  { path: '/about', priority: '0.3', changefreq: 'monthly' },
]

async function collectPlayerIds() {
  const ids = new Set()

  const currentSeason = new Date().getFullYear()
  try {
    const activeData = await getAllActivePlayers(currentSeason)
    for (const person of activeData.people || []) {
      if (person.id) ids.add(person.id)
    }
  } catch (err) {
    console.error('sitemap: getAllActivePlayers failed:', err.message)
  }

  for (const group of ['hitting', 'pitching']) {
    try {
      const leadersData = await getCareerLeaders({ group })
      for (const split of leadersData.stats?.[0]?.splits || []) {
        const playerId = split.player?.id
        if (playerId) ids.add(playerId)
      }
    } catch (err) {
      console.error(`sitemap: getCareerLeaders(${group}) failed:`, err.message)
    }
  }

  return [...ids]
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '&': return '&amp;'
      case "'": return '&apos;'
      case '"': return '&quot;'
      default: return char
    }
  })
}

async function buildSitemapXml() {
  const playerIds = await collectPlayerIds()

  const urlEntries = [
    ...STATIC_PATHS.map(({ path, priority, changefreq }) =>
      `  <url>\n    <loc>${escapeXml(SITE_ORIGIN + path)}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`,
    ),
    ...playerIds.map(
      (id) =>
        `  <url>\n    <loc>${escapeXml(`${SITE_ORIGIN}/players/${id}`)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`,
    ),
  ]

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries.join('\n')}\n</urlset>\n`
}

// Mounted directly at GET /sitemap.xml (not under /api) in index.js, since a sitemap is
// expected at the site root by convention (search engines and robots.txt both look for
// it there, not under an API prefix).
export async function sitemapHandler(req, res) {
  try {
    const xml = await cached('sitemap.xml', SITEMAP_CACHE_TTL, buildSitemapXml)
    res.set('Content-Type', 'application/xml')
    res.send(xml)
  } catch (err) {
    console.error('sitemap: failed to build sitemap.xml:', err.message)
    res.status(500).set('Content-Type', 'application/xml').send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n')
  }
}
