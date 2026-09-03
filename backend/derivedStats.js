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

// Custom JWins formulas
// The actual math and every tunable weight lives in jwinsFormula.js —
// this file just adapts the MLB API's stat-object shape into what those formulas expect
// and attaches the result under the field name each view reads. Both players.js and
// leaderboards.js call attachJWins so a player's JWins reads the same on their own page,
// in year-by-year/career, and on leaderboards.
import {
  computeJWinsBatting,
  computeJWinsPitching,
  computeJWinsFielding,
  computeJWinsFieldingForSeason,
  computeJWinsComplete,
} from './jwinsFormula.js'

export { computeJWinsFieldingForSeason, computeJWinsComplete }



// SPLAT ("Swing Produces Lazy Air Trajectory") = pop ups / AB, per Joshua's spec.
//
// IMPORTANT CAVEAT: the MLB Stats API's hitting stat object has no "pop ups" or "pop
// flies" field at all — it only splits batted-ball outs into two buckets, `groundOuts`
// and `airOuts` (every fly ball, line drive, and pop-up out together). Per-batted-ball-type
// breakdowns (pop up vs. regular fly ball vs. line drive) are a Statcast/Baseball Savant
// metric, a separate, much heavier API this site doesn't currently integrate with, and even
// there it's tracked per pitch/launch angle rather than as a simple season total field.
//
// Until/unless that's wired in, SPLAT is computed here as airOuts / AB — the closest real
// substitute available (pop-ups are a subset of air outs), not a like-for-like pop-up
// count. This is flagged clearly in the stat's own description on the site (see
// statDictionary.js) so it's never presented as more precise than it is.
export function deriveSplat(stat) {
  const airOuts = Number(stat.airOuts || 0)
  const atBats = Number(stat.atBats || 0)
  if (atBats === 0) return null
  return airOuts / atBats
}

// Fielding derived stats. The MLB Stats API's fielding stat object already reports
// putOuts, assists, errors, chances, and fielding% (as `fielding`, a string like ".987")
// directly — nothing to derive there. rangeFactor (a classic sabermetric fielding stat,
// (putouts + assists) per 9 innings) isn't provided by the API, so it's derived here for
// anyone who wants a rate stat instead of raw counts; `innings` on a fielding stat object
// is reported the same "whole.thirds" way as pitching IP, so it reuses that conversion.
export function deriveRangeFactor(stat) {
  const putOuts = Number(stat.putOuts || 0)
  const assists = Number(stat.assists || 0)
  const innings = inningsPitchedToDecimal(stat.innings)
  if (innings === 0) return null
  return ((putOuts + assists) / innings) * 9
}

// Fielding is fundamentally different from hitting/pitching in one important way: a
// player who appeared at more than one position in a season (or in one leaderboard
// query) gets ONE SPLIT PER POSITION from the MLB Stats API, not a single combined row —
// e.g. someone who played mostly right field but filled in at first base a few times gets
// a split for RF and a separate split for 1B, each with only that position's own
// counting stats. (Confirmed against real career fielding logs — a season with multiple
// positions genuinely shows multiple rows, e.g. Barry Bonds's 1987 season broken into
// RF/CF/LF splits, verified against real historical totals.) Hitting and pitching splits
// are reliably a single row per season/team-stint, so grabbing the first split is safe
// for them — but for fielding, blindly taking the first split (or, on a leaderboard,
// treating every split as a separate player row) would silently show just one position's
// partial stats, or duplicate a multi-position player across several leaderboard rows,
// instead of one real combined total. Used by both routes/players.js (a single player's
// season/year-by-year fielding) and routes/leaderboards.js (every player's fielding row
// on a leaderboard), so the combining logic can't drift between the two.
//
// Sums the counting stats across every split into one combined total. Counting stats add
// up directly; innings (reported "whole.thirds" like pitching IP, e.g. "63.1" = 63 and
// 1/3) are summed via the same thirds-aware conversion used elsewhere in this file, then
// converted back to that same "whole.thirds" display string so it still reads the way
// every other innings figure on this site does; fielding % is recomputed from summed
// putouts+assists+chances rather than averaged, since averaging percentages from unequal
// sample sizes (e.g. 300 chances at one position, 5 at another) would misrepresent the
// real combined rate.
export function sumFieldingStats(statObjects) {
  const sum = (key) => statObjects.reduce((total, s) => total + Number(s?.[key] || 0), 0)

  const putOuts = sum('putOuts')
  const assists = sum('assists')
  const errors = sum('errors')
  const chances = sum('chances') || putOuts + assists + errors
  const games = sum('games')
  const gamesStarted = sum('gamesStarted')
  const doublePlays = sum('doublePlays')
  const caughtStealing = sum('caughtStealing')
  const stolenBases = sum('stolenBases')
  const passedBall = sum('passedBall')

  const totalInningsDecimal = statObjects.reduce(
    (total, s) => total + inningsPitchedToDecimal(s?.innings),
    0,
  )

  const fieldingPct = chances > 0 ? (putOuts + assists) / chances : null

  return {
    putOuts,
    assists,
    errors,
    chances,
    games,
    gamesStarted,
    doublePlays,
    caughtStealing,
    stolenBases,
    passedBall,
    innings: decimalToInningsWholeThirds(totalInningsDecimal),
    // Matches the MLB API's own string format for fielding % (e.g. ".987", no leading
    // zero) so downstream formatting (which treats this as a string, same as the raw API
    // response) doesn't need a separate code path for the summed case vs. the single-
    // split case.
    fielding: fieldingPct === null ? null : fieldingPct.toFixed(3).replace(/^0\./, '.'),
  }
}

// Given a season response's raw `splits` array for a fielding stat request, returns
// { stat, positionSplits } — `stat` is one combined display object for the season (the
// real fix for extractSeasonSplit's old splits[0]-only behavior when a player had
// multiple positions), and `positionSplits` is the raw per-position pieces (each
// { stat, position }), needed separately because JWinsF's positional run value has to be
// computed per-position, not against the combined total (see computeJWinsFieldingForSeason
// in jwinsFormula.js). If there's only one split (the common case), positionSplits has
// just that one entry and stat is returned as-is with no summing needed.
export function extractFieldingSeasonTotal(seasonResponse) {
  if (!seasonResponse) return null
  const splits = seasonResponse.stats?.[0]?.splits
  if (!splits || splits.length === 0) return null

  // Position is reported at the SPLIT level (a sibling of `stat`, not nested inside it)
  // on the MLB Stats API's fielding splits — falls back to checking inside `stat` too in
  // case that assumption is ever wrong for some endpoint variant, rather than silently
  // treating every split as position-less (which would zero out every positional run
  // value in JWinsF instead of just leaving it uncomputed/flagged).
  const positionSplits = splits.map((s) => ({
    stat: s.stat,
    position: s.position?.abbreviation || s.stat?.position?.abbreviation || null,
  }))

  const stat = splits.length === 1 ? splits[0].stat : sumFieldingStats(splits.map((s) => s.stat))
  return { stat, positionSplits }
}

// Reverses inningsPitchedToDecimal: 63.333... -> "63.1". Whole thirds only (0, 1, 2) are
// valid in this format, so the fractional part is rounded to the nearest third rather
// than carrying any floating-point remainder into the output string.
function decimalToInningsWholeThirds(decimal) {
  const whole = Math.floor(decimal)
  const remainder = decimal - whole
  const thirds = Math.round(remainder * 3)
  // A rounded-up remainder of 3 thirds means it's actually a full extra inning.
  if (thirds === 3) return `${whole + 1}.0`
  return `${whole}.${thirds}`
}


// Computes and attaches JWins to a stat object in place. Hitting stats get `war`
// (matching statDictionary.js's `war` entry — kept as the field name `war` internally for
// backward compatibility even though the site displays it as "JWins"). Pitching stats get
// `war_pitching`. Fielding stats get `war_fielding`. Every view reads stats by looking up
// `row[col.key]` directly against the stat object, so the field has to exist under the
// exact key the dictionary entry uses. Returns null (not 0) when the underlying counting
// stats are all missing, e.g. an empty/partial stat line, rather than reporting a
// fabricated 0.0 JWins for a player with no data.
//
// `position` is only used for group === 'fielding' — the position abbreviation (e.g.
// "SS") this fielding stat line represents, needed for JWinsF's positional run value. For
// a single-position season this is the whole story; for a multi-position season, use
// computeJWinsFieldingForSeason directly with each position's own split instead of
// calling attachJWins once on a pre-summed total (see routes/players.js).
export function attachWar(stat, group, position) {
  if (!stat) return stat
  const hasAnyInput =
    group === 'pitching'
      ? stat.strikeOuts !== undefined || stat.baseOnBalls !== undefined || stat.inningsPitched !== undefined
      : group === 'fielding'
        ? stat.putOuts !== undefined || stat.assists !== undefined || stat.errors !== undefined
        : stat.hits !== undefined || stat.strikeOuts !== undefined || stat.baseOnBalls !== undefined

  if (group === 'pitching') {
    stat.war_pitching = hasAnyInput ? computeJWinsPitching(stat) : null
  } else if (group === 'fielding') {
    stat.war_fielding = hasAnyInput ? computeJWinsFielding(stat, position) : null
  } else {
    stat.war = hasAnyInput ? computeJWinsBatting(stat) : null
  }
  return stat
}
