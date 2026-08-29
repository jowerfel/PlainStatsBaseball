// JWinsFormula.js — the ONE place to look when experimenting with JWins. Every weight
// used by every JWins variant (batting, pitching, fielding, and the combined "complete"
// total) lives in the JWINS_WEIGHTS object below. Change a number here, and every part
// of the site that shows JWins — a player's own page, year-by-year, career, custom
// leaderboards, and the dedicated JWins page — picks it up automatically, since they all
// call the compute functions in this file rather than having their own copies of the math.
//
// JWins is Joshua's own custom stat, not a published sabermetric formula — there's no
// "correct" answer to look up, which is exactly why every weight is broken out here
// instead of buried inline in a formula expression, so trying a new value is a one-line
// edit instead of a hunt through the codebase.

export const JWINS_WEIGHTS = {
  // JWinsB (batting): (1B*w + 2B*w + 3B*w + HR*w + SO*w + BB*w + SB*w + HBP*w) / divisor
  batting: {
    singles: 0.44,
    doubles: 0.74,
    triples: 1.04,
    homeRuns: 1.4,
    strikeOuts: -0,
    walks: 0.29,
    stolenBases: 0.2,
    hitByPitch: 0.31,
    divisor: 10,
  },

  // JWinsP (pitching): (nonHRHitsAllowed*w + HRAllowed*w + SO*w + BB*w + IP*w) / divisor
  pitching: {
    nonHomeRunHitsAllowed: -0.55,
    homeRunsAllowed: -1.4,
    strikeOuts: 0.3,
    walksAllowed: -0.29,
    inningsPitched: 0.6,
    divisor: 10,
  },

  // JWinsF (fielding): (((PO + A - E) * countingWeight) + positionalRunValue) / divisor
  //
  // positionalRunValue is a flat run-value adjustment by primary position (a season
  // spent at catcher is inherently more defensively valuable than the same counting
  // stats at first base, since the defensive bar is higher) — Joshua's own values below,
  // not derived from anything published. Position codes match the MLB Stats API's own
  // position abbreviations (see backend/mlbClient.js) so a fielding split's position can
  // be looked up directly with no translation step.
  fielding: {
    countingStats: 0.2,
    divisor: 75,
    positionalRunValue: {
      C: 9,
      SS: 7,
      '2B': 30,
      CF: 2.5,
      '3B': 2,
      RF: -7,
      LF: -7,
      '1B': -9.5,
      DH: -15,
      P: 0,
    },
  },
}

// MLB reports innings pitched (and fielding innings) as e.g. "6.1" meaning 6 and 1/3
// innings, not 6.1 decimal innings — the ".1"/".2" are thirds of an inning, not tenths.
// Converts to a true decimal (6.1 -> 6.333...) so formulas that divide by or multiply by
// innings come out correct.
export function inningsToDecimal(innings) {
  if (innings === null || innings === undefined || innings === '') return 0
  const [wholePart, thirdPart] = String(innings).split('.')
  const whole = Number(wholePart) || 0
  const thirds = Number(thirdPart) || 0
  return whole + thirds / 3
}

// JWinsB — batting. `stat` is a merged hitting stat object (already has `singles` derived
// onto it by the time this runs — see routes/players.js / routes/leaderboards.js).
export function computeJWinsBatting(stat) {
  const w = JWINS_WEIGHTS.batting
  const singles = Number(stat.singles || 0)
  const doubles = Number(stat.doubles || 0)
  const triples = Number(stat.triples || 0)
  const homeRuns = Number(stat.homeRuns || 0)
  const strikeOuts = Number(stat.strikeOuts || 0)
  const baseOnBalls = Number(stat.baseOnBalls || 0)
  const stolenBases = Number(stat.stolenBases || 0)
  const hitByPitch = Number(stat.hitByPitch || 0)

  const raw =
    singles * w.singles +
    doubles * w.doubles +
    triples * w.triples +
    homeRuns * w.homeRuns +
    strikeOuts * w.strikeOuts +
    baseOnBalls * w.walks +
    stolenBases * w.stolenBases +
    hitByPitch * w.hitByPitch

  return raw / w.divisor
}

// JWinsP — pitching. `hits`/`homeRuns` on a pitching-split stat object are the pitcher's
// own allowed totals (the MLB API's own field names for a pitching split).
export function computeJWinsPitching(stat) {
  const w = JWINS_WEIGHTS.pitching
  const hitsAllowed = Number(stat.hits || 0)
  const homeRunsAllowed = Number(stat.homeRuns || 0)
  const nonHomeRunHitsAllowed = hitsAllowed - homeRunsAllowed
  const strikeOuts = Number(stat.strikeOuts || 0)
  const baseOnBalls = Number(stat.baseOnBalls || 0)
  const inningsPitched = inningsToDecimal(stat.inningsPitched)

  const raw =
    nonHomeRunHitsAllowed * w.nonHomeRunHitsAllowed +
    homeRunsAllowed * w.homeRunsAllowed +
    strikeOuts * w.strikeOuts +
    baseOnBalls * w.walksAllowed +
    inningsPitched * w.inningsPitched

  return raw / w.divisor
}

// Looks up the positional run value for one position abbreviation. Falls back to 0 (a
// neutral, no-adjustment value — same as Pitcher's own listed value) for any position
// abbreviation not in the table, rather than throwing or silently guessing, so an
// unrecognized/unexpected position code from the API degrades gracefully instead of
// breaking JWinsF entirely for that player.
function positionalRunValue(positionAbbreviation) {
  const table = JWINS_WEIGHTS.fielding.positionalRunValue
  if (!positionAbbreviation) return 0
  const key = String(positionAbbreviation).toUpperCase()
  return key in table ? table[key] : 0
}

// JWinsF — fielding: (((PO + A - E) * countingWeight) + positionalRunValue) / divisor.
//
// `stat` is a merged fielding stat object. `position` is the position abbreviation this
// stat line represents (e.g. "SS", "1B") — for a player who split time across multiple
// positions in a season, computeJWinsFieldingForSeason below handles combining the
// per-position pieces correctly; this function computes JWinsF for ONE position's worth
// of counting stats, which is also exactly right for the (much more common) single-
// position case.
export function computeJWinsFielding(stat, position) {
  const w = JWINS_WEIGHTS.fielding
  const putOuts = Number(stat.putOuts || 0)
  const assists = Number(stat.assists || 0)
  const errors = Number(stat.errors || 0)

  const raw = (putOuts + assists - errors) * w.countingStats + positionalRunValue(position)
  return raw / w.divisor
}

// For a season where a player appeared at multiple positions, JWinsF can't just be
// computed once against combined counting stats — the positional run value has to apply
// PER POSITION (a season split between catcher and first base should get catcher's run
// value for the catching innings and first base's for the first base innings, not one or
// the other applied to the whole season, and not double-counted). Takes the raw
// per-position split stat objects (each with its own position + putOuts/assists/errors)
// and sums each position's own JWinsF contribution — the counting-stats portion of each
// position's formula gets summed AND its own positional run value gets added once per
// position played, matching how a real multi-position season should be valued (more
// distinct position stints, more distinct positional adjustments).
export function computeJWinsFieldingForSeason(positionSplits) {
  if (!positionSplits || positionSplits.length === 0) return null
  const w = JWINS_WEIGHTS.fielding

  let totalRaw = 0
  for (const { stat, position } of positionSplits) {
    const putOuts = Number(stat.putOuts || 0)
    const assists = Number(stat.assists || 0)
    const errors = Number(stat.errors || 0)
    totalRaw += (putOuts + assists - errors) * w.countingStats + positionalRunValue(position)
  }
  return totalRaw / w.divisor
}

// JWins Complete — the combined total across every facet of play this player has data
// for. A pure hitter's Complete is just their JWinsB; a pure pitcher's is JWinsP (+
// JWinsF if they have fielding innings, e.g. a pitcher who's also fielded bunts/comebackers
// — most won't have meaningful fielding value, but the formula doesn't need to special-
// case that away); a two-way player or a position player with real innings at multiple
// spots gets all applicable components summed. Returns null only if NONE of the
// components could be computed (no data at all), rather than treating a missing
// component as a zero that could misleadingly drag down a real total — a batting-only
// player's Complete is exactly their JWinsB, not JWinsB + 0 (fielding) that happens to
// equal the same number but implies fielding was actually evaluated and came out neutral.
export function computeJWinsComplete({ batting, pitching, fielding }) {
  const parts = [batting, pitching, fielding].filter((v) => v !== null && v !== undefined)
  if (parts.length === 0) return null
  return parts.reduce((sum, v) => sum + v, 0)
}
