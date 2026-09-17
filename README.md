# PlainStats

Baseball stats in plain English. A Vue 3 + Express site (plainstats.jwerfel.com) built
around the official MLB Stats API, with a deliberately flat, no-frills design — no
gradients, shadows, or animation — and hover tooltips that explain every stat in plain
language.

## Running it

```
cd backend && npm install && npm start      # http://localhost:3001
cd frontend && npm install && npm run dev   # http://localhost:5173, proxies /api to backend
```

In production, the frontend is built (`npm run build` in `frontend/`) and the contents of
`frontend/dist/` are copied into `backend/public/`. The same Express server then serves
both the built frontend and the `/api/*` routes, run under PM2 behind Nginx.

## Architecture

- **Backend**: Node/Express (ES modules — `"type": "module"` in `package.json`, so use
  `import`, not `require()`). Proxies and caches the official MLB Stats API
  (`statsapi.mlb.com`); the frontend never calls MLB directly.
- **Frontend**: Vue 3 (Composition API, `<script setup>`), Vue Router, Pinia, plain CSS
  (no Tailwind or component library), built with Vite.
- **Storage**: no database. Article metadata (likes/views) lives in flat JSON files under
  `backend/db/`; articles themselves are markdown files in `backend/articles/`. The
  browser-side state (follows, theme, a generated visitor ID) lives in `localStorage`, not
  cookies — a deliberate choice, disclosed on the About page.
- **Analytics**: Umami, via `data-umami-event` attributes on nav links and other key
  actions throughout the frontend.

### Where the math lives

- `backend/derivedStats.js` and `backend/jwinsFormula.js` are the shared "math layer" —
  any derived or custom stat is computed here, not duplicated in route files.
- `backend/routes/players.js`, `leaderboards.js`, and `jwins.js` each call into those
  shared functions rather than reimplementing stat logic themselves.
- `frontend/src/data/statDictionary.js` is the single source of truth for a stat's display
  name, formatting, and tooltip text — including custom stats like JWins, so they look
  identical to real MLB stats everywhere they appear.

## Features

- **Player pages** — hitting/pitching/fielding stats, season/career toggle, and a
  projected-stats toggle.
- **Compare players** — up to 4 players at once, any mix of hitting/pitching/fielding.
- **Leaderboards** — separate Batting, Fielding, and Pitching pages sharing one composable
  (`useLeaderboardBuilder.js`) so behavior stays consistent across all three.
- **Standings** — full division standings plus a wild card race section, with a
  projected-record toggle.
- **Live games** — a live games list plus a full pitch-by-pitch/boxscore detail page per
  game.
- **Articles** — plain markdown files dropped into `backend/articles/`, parsed and
  rendered server-side (no CMS or database). Each visitor gets a generated ID stored in
  `localStorage`, allowing one like and one view per visitor per article (likes can be
  undone).
- **JWins** — a custom "Wins Above Replacement" stat family: JWinsB (batting), JWinsP
  (pitching), JWinsF (fielding), and JWins Complete (the sum of whichever of those a
  player has). All tunable weights live in one config object in `backend/jwinsFormula.js`.
  Has its own `/jwins` page with Career Leaders, Single Season Leaders, and Best Single
  Season Ever tabs, each with a Batting/Pitching/Fielding/Complete selector.
- **Projected stats** — simple pace-based projections that scale current-season stats to
  a full season. No aging curves or regression — just transparent pace scaling, and the
  UI says so. Pitchers are scaled against a starter or reliever workload depending on
  their role, not a hitter's 162-game pace.

## Notes on MLB's data

- Innings pitched are reported like `"63.1"`, meaning 63 and *1/3* innings — not 63.1 as a
  decimal. Anything that does math with innings pitched must convert through the
  whole-thirds-aware helper (`inningsPitchedToDecimal`), not a plain `Number()` parse.
- MLB's career+fielding leaderboard endpoint omits many players who haven't played
  recently. Career fielding leaderboards are instead built by summing each player's
  JWinsF across individual season leaderboards.
- A fielding leaderboard split can return one row per position for a player who played
  multiple positions in a season; these are grouped and summed by player before any
  fielding stat is computed.
- JWinsF excludes putouts entirely for first basemen and catchers, since a routine putout
  at those positions mostly reflects "received a throw" rather than fielding skill — an
  established issue in sabermetrics, not a novel finding. Catchers use caught-stealing,
  double plays, and passed balls instead.
- MLB's combined live-feed ("GUMBO") endpoint is meant for in-progress games and 404s for
  many completed ones; anything that needs to work on historical games uses the dedicated
  `/boxscore`, `/playByPlay`, and `/linescore` endpoints instead.

## Not currently wired up

- `backend/etl/` is a Statcast-pulling Python pipeline and `backend/db/schema.sql` is a
  matching SQLite schema for it — neither is connected to the live Node server or read by
  any route. Left in place intentionally for possible future use.
- No server-side rendering — this is a client-rendered Vue SPA, which limits the SEO
  impact of any meta-tag work.
- Individual player pages aren't listed in `sitemap.xml` (there are too many to enumerate
  statically).

## Troubleshooting

- Backend logs its mounted API routes on startup — check that output to confirm the
  running process actually has the route you expect.
- Test API routes directly, e.g. `http://localhost:3001/api/live` and
  `http://localhost:3001/api/standings`.
- If a page 404s only on a hard reload (not on in-app navigation), it's almost always the
  Express static/SPA-fallback ordering in `backend/index.js` — see the comments there.