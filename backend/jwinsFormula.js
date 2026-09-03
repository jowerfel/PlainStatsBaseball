// JWinsFormula.js — the ONE place to look when experimenting with JWins. Every weight
// used by every JWins variant (batting, pitching, fielding, and the combined "complete"
// total) lives in the JWINS_WEIGHTS object below. Change a number here, and every part
// of the site that shows JWins — a player's own page, year-by-year, career, custom
// leaderboards, and the dedicated JWins page — picks it up automatically, since they all
// call the compute functions in this file rather than having their own copies of the math.
//


export const JWINS_WEIGHTS = {
  // JWinsB (batting): (1B*w + 2B*w + 3B*w + HR*w + SO*w + BB*w + SB*w + HBP*w) / divisor
  batting: {
    singles: 0.44,
    doubles: 0.74,
    triples: 1.04,
    homeRuns: 1.6,
    strikeOuts: -0, // set to 0 — a swinging/called strikeout no longer costs JWinsB
    walks: 0.29,
    stolenBases: 0.2,
    hitByPitch: 0.31,
    divisor: 10,
  },

  // JWinsP (pitching): (nonHRHitsAllowed*w + HRAllowed*w + SO*w + BB*w + IP*w) / divisor
  pitching: {
    nonHomeRunHitsAllowed: -0.2,
    homeRunsAllowed: -0.6,
    strikeOuts: 0.3,
    walksAllowed: -0.4,
    inningsPitched: 0.6,
    divisor: 10,
  },


  fielding: {
    
    defaultCounting: { putOuts: 0.2, assists: 0.2, errors: -0.2 },
    countingByPosition: {
      C: { putOuts: 0.2, assists: 0.2, errors: -0.6 },
      '1B': { putOuts: 0.2, assists: 0.2, errors: -0.6 },
      '2B': { putOuts: 0.2, assists: 0.1, errors: -0.6 },
      SS: { putOuts: 0.2, assists: 0.1, errors: -0.8 },
      '3B': { putOuts: 0.2, assists: 0.1, errors: -0.6 },
      LF: { putOuts: 0.2, assists: 0.35, errors: -0.6 },
      CF: { putOuts: 0.2, assists: 0.35, errors: -0.6 },
      RF: { putOuts: 0.2, assists: 0.35, errors: -0.6 },
      DH: { putOuts: 0.2, assists: 0.2, errors: -0.6 },
      P: { putOuts: 0.2, assists: 0.2, errors: -0.6 },
    },
    
    catcherDoublePlayBonus: 1.5,
    caughtStealingBonus: 1.0,
    passedBallPenalty: -0.7,
    divisor: 20,
    
    finalDivisor: 4,
    
    fullSeasonInnings: 1350,
    
    putoutExcludedPositions: ['1B', 'C'],
    positionalRunValue: {
      C: 6,
      SS: 4.6,
      '2B': 2,
      CF: 2,
      '3B': 2,
      RF: -4.6,
      LF: -4.6,
      '1B': -6.5,
      DH: -10,
      P: 0,
    },
  },
}


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

// Looks up this position's {putOuts, assists, errors} weights, falling back to
// defaultCounting for any position not explicitly listed in countingByPosition.
function positionalCounting(positionAbbreviation) {
  const w = JWINS_WEIGHTS.fielding
  if (!positionAbbreviation) return w.defaultCounting
  const key = String(positionAbbreviation).toUpperCase()
  return w.countingByPosition[key] || w.defaultCounting
}


function positionalRunValue(positionAbbreviation, inningsAtPosition) {
  const table = JWINS_WEIGHTS.fielding.positionalRunValue
  if (!positionAbbreviation) return 0
  const key = String(positionAbbreviation).toUpperCase()
  if (!(key in table)) return 0

  const fullValue = table[key]
  const innings = Number(inningsAtPosition) || 0
  const fullSeasonInnings = JWINS_WEIGHTS.fielding.fullSeasonInnings
  const proration = Math.min(innings / fullSeasonInnings, 1)
  return fullValue * proration
}


export function computeJWinsFielding(stat, position) {
  const w = JWINS_WEIGHTS.fielding
  const counting = positionalCounting(position)
  const assists = Number(stat.assists || 0)
  const errors = Number(stat.errors || 0)
  const normalizedPosition = position ? String(position).toUpperCase() : null
  const excludePutouts = normalizedPosition && w.putoutExcludedPositions.includes(normalizedPosition)

  let countingRaw
  if (excludePutouts) {
    // 1B: assists only (no DP bonus — see the big comment on JWINS_WEIGHTS.fielding for
    // why a first baseman's double plays are mostly receiving, same problem as PO).
    countingRaw = assists * counting.assists + errors * counting.errors
    if (normalizedPosition === 'C') {
      const doublePlays = Number(stat.doublePlays || 0)
      const caughtStealing = Number(stat.caughtStealing || 0)
      const passedBall = Number(stat.passedBall || 0)
      countingRaw +=
        doublePlays * w.catcherDoublePlayBonus +
        caughtStealing * w.caughtStealingBonus +
        passedBall * w.passedBallPenalty
    }
  } else {
    const putOuts = Number(stat.putOuts || 0)
    countingRaw = putOuts * counting.putOuts + assists * counting.assists + errors * counting.errors
  }

  
  const innings = inningsToDecimal(stat.innings)
  const beforeFinalDivisor = countingRaw / w.divisor + positionalRunValue(position, innings)
  return beforeFinalDivisor / w.finalDivisor
}


export function computeJWinsFieldingForSeason(positionSplits) {
  if (!positionSplits || positionSplits.length === 0) return null
  let total = 0
  for (const { stat, position } of positionSplits) {
    total += computeJWinsFielding(stat, position)
  }
  return total
}


export function computeJWinsComplete({ batting, pitching, fielding }) {
  const parts = [batting, pitching, fielding].filter((v) => v !== null && v !== undefined)
  if (parts.length === 0) return null
  return parts.reduce((sum, v) => sum + v, 0)
}
