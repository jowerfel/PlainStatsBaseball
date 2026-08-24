// Shared stat-derivation logic used by both backend/routes/players.js (single player,
// year-by-year, game log) and backend/routes/leaderboards.js (leaderboard rows) — kept in
// one place so the two routes can never drift out of sync on how a derived field is
// computed. Everything here is computed from raw MLB Stats API fields, never fetched.

// Not a real MLB API field — the API only gives total hits plus 2B/3B/HR — but it's the
// natural base unit for custom hitting formulas (a weighted slugging, WAR below, etc.), so
// it's derived once here and passed straight through everywhere hitting stats flow.
export function deriveSingles(stat) {
  const doubles = Number(stat.doubles || 0)
  const triples = Number(stat.triples || 0)
  const homeRuns = Number(stat.homeRuns || 0)
  const hits = Number(stat.hits || 0)
  return hits - doubles - triples - homeRuns
}

// MLB reports innings pitched as e.g. "6.1" meaning 6 and 1/3 innings, not 6.1 decimal
// innings — the ".1"/".2" are thirds of an inning, not tenths. Converts to a true decimal
// (6.1 -> 6.333...) so formulas that divide by or multiply by IP come out correct. Same
// logic as the frontend's copy in data/customStats.js (kept in sync manually since the two
// run in different JS environments and don't share a module).
export function inningsPitchedToDecimal(ip) {
  if (ip === null || ip === undefined || ip === '') return 0
  const str = String(ip)
  const [wholePart, thirdPart] = str.split('.')
  const whole = Number(wholePart) || 0
  const thirds = Number(thirdPart) || 0
  return whole + thirds / 3
}

// Custom WAR formulas (Joshua's own, not a published sabermetric source — the MLB Stats
// API doesn't publish WAR at all, which is why the site's WAR column was always blank
// before this). Defined once here; both players.js and leaderboards.js call these so a
// player's WAR reads the same on their own page, in year-by-year/career, and on
// leaderboards.
//
// Hitters: WAR = 1B*0.44 + 2B*0.74 + 3B*1.04 + HR*1.4 + SO*(-0.3) + BB*0.29 + SB*0.2 + HBP*0.31
export function computeHitterWar(stat) {
  const singles = stat.singles !== undefined ? Number(stat.singles) : deriveSingles(stat)
  const doubles = Number(stat.doubles || 0)
  const triples = Number(stat.triples || 0)
  const homeRuns = Number(stat.homeRuns || 0)
  const strikeOuts = Number(stat.strikeOuts || 0)
  const baseOnBalls = Number(stat.baseOnBalls || 0)
  const stolenBases = Number(stat.stolenBases || 0)
  const hitByPitch = Number(stat.hitByPitch || 0)

  return (
    singles * 0.44 +
    doubles * 0.74 +
    triples * 1.04 +
    homeRuns * 1.4 +
    strikeOuts * -0.3 +
    baseOnBalls * 0.29 +
    stolenBases * 0.2 +
    hitByPitch * 0.31
  )
}

// Pitchers: WAR = (nonHRHitsAllowed)*(-0.55) + HRAllowed*(-1.4) + SO*0.3 + BB*(-0.29) + IP*0.6
// "Hits allowed" and "home runs allowed" are the raw `hits`/`homeRuns` fields on a
// pitching-split stat object (the MLB API's pitching stat rows report what the pitcher
// gave up under those same field names — this is the same raw data leaderboards.js
// separately aliases to hitsAllowed/homeRunsAllowed for display).
export function computePitcherWar(stat) {
  const hitsAllowed = Number(stat.hits || 0)
  const homeRunsAllowed = Number(stat.homeRuns || 0)
  const nonHrHitsAllowed = hitsAllowed - homeRunsAllowed
  const strikeOuts = Number(stat.strikeOuts || 0)
  const baseOnBalls = Number(stat.baseOnBalls || 0)
  const inningsPitched = inningsPitchedToDecimal(stat.inningsPitched)

  return (
    nonHrHitsAllowed * -0.55 +
    homeRunsAllowed * -1.4 +
    strikeOuts * 0.3 +
    baseOnBalls * -0.29 +
    inningsPitched * 0.6
  )
}

// Computes and attaches WAR to a stat object in place. Hitting stats get `war` (matching
// statDictionary.js's `war` entry). Pitching stats get `war_pitching` (matching
// statDictionary.js's `war_pitching` entry) — every view reads stats by looking up
// `row[col.key]` directly against the stat object, so the field has to exist under the
// exact key the dictionary entry uses; the dictionary's `sourceKey: 'war'` metadata on
// war_pitching is not actually read anywhere, so it can't do that aliasing on its own.
// Returns null (not 0) when the underlying counting stats are all missing, e.g. an empty/
// partial stat line, rather than reporting a fabricated 0.0 WAR for a player with no data.
export function attachWar(stat, group) {
  if (!stat) return stat
  const hasAnyInput =
    group === 'pitching'
      ? stat.strikeOuts !== undefined || stat.baseOnBalls !== undefined || stat.inningsPitched !== undefined
      : stat.hits !== undefined || stat.strikeOuts !== undefined || stat.baseOnBalls !== undefined

  if (group === 'pitching') {
    stat.war_pitching = hasAnyInput ? computePitcherWar(stat) : null
  } else {
    stat.war = hasAnyInput ? computeHitterWar(stat) : null
  }
  return stat
}
