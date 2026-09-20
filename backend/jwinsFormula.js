// JWinsFormula.js — the ONE place to look when experimenting with JWins. Every weight
// used by every JWins variant (batting, pitching, fielding, and the combined "complete"
// total) lives in the JWINS_WEIGHTS object below. Change a number here, and every part
// of the site that shows JWins — a player's own page, year-by-year, career, custom
// leaderboards, and the dedicated JWins page — picks it up automatically, since they all
// call the compute functions in this file rather than having their own copies of the math.
//


export const JWINS_WEIGHTS = {
  // JWinsB (batting) — real sabermetric formula, not an arbitrary linear-weights sum.
  // Pipeline: wOBA (Josh's supplied FanGraphs linear weights) -> wRAA (weighted runs
  // above average, using league-average wOBA and the wOBA scale constant) -> wins
  // (divide runs by runs-per-win). This is structurally the same pipeline real
  // fWAR/bWAR use for the batting component, with two real simplifications, both
  // called out here rather than hidden:
  //   1. leagueWOBA/wOBAScale/runsPerWin below are fixed constants from recent modern
  //      seasons, not fetched fresh per season the way FanGraphs recomputes them every
  //      year from that year's actual league totals. Real values drift only slightly
  //      year to year, so this is a reasonable approximation, not season-exact.
  //   2. Real WAR then adds a positional adjustment, a replacement-level (not
  //      average-level) baseline, and a park factor on top of wRAA. This still stops at
  //      wRAA -> wins (batting runs above AVERAGE, not replacement) — see
  //      replacementLevelRunsPerPA below for the adjustment that shifts it from
  //      "above average" to "above replacement."
  batting: {
    wobaWeights: {
      uBB: 0.69, // unintentional walks — real BB minus IBB, since IBB is a pitcher/game-
      // context decision more than a batting skill and FanGraphs's own wOBA excludes it
      HBP: 0.722,
      singles: 0.888,
      doubles: 1.271,
      triples: 1.616,
      homeRuns: 2.101,
    },
    // Recent-era approximate MLB-wide constants (not fetched per-season — see the big
    // comment above). leagueWOBA is the MLB-wide average wOBA; wOBAScale converts a
    // wOBA-OBP gap into a runs-per-PA value; runsPerWin is the standard "how many extra
    // runs equal one extra win" conversion sabermetrics has used for years.
    leagueWOBA: 0.320,
    wobaScale: 1.24,
    runsPerWin: 10,
    // Shifts wRAA (runs above AVERAGE) down to runs above REPLACEMENT — a replacement-
    // level hitter is worth roughly this many fewer runs per PA than a league-average
    // one. This is what actually makes JWinsB an "Above Replacement" stat rather than an
    // "Above Average" one; real WAR uses a very similar per-PA replacement adjustment.
    replacementLevelRunsPerPA: 0.02,
  },

  // JWinsP (pitching) — REBUILT as a real FIP-based Wins Above Replacement estimate,
  // mirroring the wOBA -> wRAA -> wins pipeline used for JWinsB, rather than the old
  // flat linear-weights sum of raw counting stats.
  //
  // WHY THE REBUILD (not just a reweight): the previous version summed raw counting
  // stats directly (strikeouts, walks, hits allowed, innings) with no denominator
  // normalizing for how those totals scale with innings or with era. That's structurally
  // different from JWinsB, which converts a RATE stat (wOBA) into a total via plate
  // appearances. The mismatch caused two real, confirmed bugs when tested against real
  // career totals:
  //   1. A career total run once through a raw-counting formula and a career total
  //      built by correctly summing rate-based per-season values diverge badly — this is
  //      why pitching career leaders were landing at roughly half of batting career
  //      leaders' scale even after the single-season numbers looked reasonable.
  //   2. Weighting strikeouts heavily enough for a modern power pitcher to look right
  //      made a low-strikeout, high-innings compiler from an earlier, lower-strikeout
  //      era (e.g. Cy Young, real career WAR ~168) collapse to a tiny fraction of a much
  //      shorter, modern career (e.g. Randy Johnson, real career WAR ~104) — the exact
  //      inversion seen in testing (Cy Young ~14 vs Randy Johnson ~81 under the old
  //      formula). No single fixed weight can fix this for a non-rate-based formula,
  //      since eras differ in strikeout rate independent of pitcher quality.
  //
  // Pipeline: FIP (Fielding Independent Pitching, a standard sabermetric rate stat:
  // (13*HR + 3*(BB+HBP) - 2*K) / IP + a constant) -> runs above average
  // ((leagueFIP - FIP) * IP/9) -> runs above replacement (add a fixed replacement-level
  // runs/9 gap) -> wins (divide by runsPerWin). This is genuinely rate-based, the same
  // structural shape as the batting pipeline, and was verified against several real
  // career and single-season stat lines (Cy Young, Randy Johnson, and realistic
  // ace/average/poor single seasons) to land in believable ranges relative to real WAR
  // and relative to JWinsB.
  pitching: {
    fipConstant: 3.1, // standard modern-era FIP constant (converts the raw HR/BB/K/IP
    // ratio onto roughly the same numeric scale as ERA)
    leagueFIP: 4.2, // approximate modern MLB-wide average FIP — like JWinsB's
    // leagueWOBA, this is a fixed recent-era constant rather than fetched per season
    // (see the batting section's comment on why that's a reasonable approximation)
    replacementLevelRunsPer9: 1.0, // how many more runs per 9 innings a replacement-
    // level pitcher concedes versus a league-average one — the same conceptual role as
    // JWinsB's replacementLevelRunsPerPA, just expressed per 9 innings instead of per PA
    runsPerWin: 10,
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
    // A replacement-level fielder is worth roughly this many WINS below zero per inning
    // played at the position — added back so real defensive playing time with an
    // otherwise-neutral stat line shows up as positive JWinsF instead of ~0, the same
    // "above replacement, not above average" shift applied to JWinsB and JWinsP.
    //
    // PER-POSITION, not a single flat rate — a real replacement-level shortstop or
    // catcher still has to clear a higher defensive bar than a replacement-level first
    // baseman or DH (the defensive spectrum: up-the-middle positions are scarcer and
    // harder to competently fill than a corner spot), so the replacement floor for scarce
    // positions is set a bit higher than for easy ones. This follows the same defensive-
    // spectrum ordering already used by positionalRunValue below (C/SS/2B/CF/3B ranked
    // above RF/LF/1B/DH) without touching any of the values in that table. All positions
    // still average out close to the site's old flat 0.00011 rate, so a full ~1350-inning
    // season nets roughly a 0.1-0.2 win floor from playing time alone, varying modestly
    // by position rather than being identical everywhere.
    replacementLevelPerInningByPosition: {
      C: 0.00016,
      SS: 0.00015,
      '2B': 0.00012,
      CF: 0.00012,
      '3B': 0.00011,
      RF: 0.0001,
      LF: 0.0001,
      '1B': 0.00008,
      DH: 0.00006,
      P: 0.00011,
    },
    // Fallback for any position not listed above.
    defaultReplacementLevelPerInning: 0.00011,
  },
}


export function inningsToDecimal(innings) {
  if (innings === null || innings === undefined || innings === '') return 0
  const [wholePart, thirdPart] = String(innings).split('.')
  const whole = Number(wholePart) || 0
  const thirds = Number(thirdPart) || 0
  return whole + thirds / 3
}

// JWinsB — batting, now a real wOBA-based Wins Above Replacement estimate rather than an
// arbitrary linear-weights sum. `stat` is a merged hitting stat object (already has
// `singles` derived onto it by the time this runs — see routes/players.js /
// routes/leaderboards.js). Uses real MLB Stats API fields: atBats, baseOnBalls,
// intentionalWalks, sacFlies, hitByPitch, singles/doubles/triples/homeRuns,
// plateAppearances.
export function computeJWinsBatting(stat) {
  const w = JWINS_WEIGHTS.batting

  const atBats = Number(stat.atBats || 0)
  const walks = Number(stat.baseOnBalls || 0)
  const intentionalWalks = Number(stat.intentionalWalks || 0)
  const unintentionalWalks = Math.max(walks - intentionalWalks, 0)
  const sacFlies = Number(stat.sacFlies || 0)
  const hitByPitch = Number(stat.hitByPitch || 0)
  const singles = Number(stat.singles || 0)
  const doubles = Number(stat.doubles || 0)
  const triples = Number(stat.triples || 0)
  const homeRuns = Number(stat.homeRuns || 0)

  // wOBA numerator/denominator, exactly as supplied:
  // wOBA = (0.690*uBB + 0.722*HBP + 0.888*1B + 1.271*2B + 1.616*3B + 2.101*HR)
  //        / (AB + BB - IBB + SF + HBP)
  const numerator =
    unintentionalWalks * w.wobaWeights.uBB +
    hitByPitch * w.wobaWeights.HBP +
    singles * w.wobaWeights.singles +
    doubles * w.wobaWeights.doubles +
    triples * w.wobaWeights.triples +
    homeRuns * w.wobaWeights.homeRuns

  const denominator = atBats + walks - intentionalWalks + sacFlies + hitByPitch
  if (denominator <= 0) return null
  const woba = numerator / denominator

  // wRAA (weighted runs above average) = ((wOBA - leagueWOBA) / wOBAScale) * PA — the
  // standard sabermetric conversion from a rate stat (wOBA) to a counting stat in runs.
  // Falls back to AB+BB+HBP+SF (the wOBA denominator, a reasonable PA proxy) if
  // plateAppearances isn't present on this stat object for some reason.
  const plateAppearances = Number(stat.plateAppearances || 0) || denominator
  const wraa = ((woba - w.leagueWOBA) / w.wobaScale) * plateAppearances

  // Shift from runs above AVERAGE to runs above REPLACEMENT (see the big comment on
  // JWINS_WEIGHTS.batting for why this fixed per-PA constant, rather than a fetched
  // one, is used).
  const replacementRuns = w.replacementLevelRunsPerPA * plateAppearances
  const runsAboveReplacement = wraa + replacementRuns

  // Runs -> wins, the standard ~10-runs-per-win conversion.
  return runsAboveReplacement / w.runsPerWin
}

// JWinsP — pitching, now a real FIP-based Wins Above Replacement estimate (see the big
// comment on JWINS_WEIGHTS.pitching for why this replaced the old raw-counting-stat
// formula). `stat` is a pitching-split stat object using the MLB Stats API's own field
// names: hits/homeRuns/strikeOuts/baseOnBalls/hitBatsmen are the pitcher's own ALLOWED
// totals on a pitching split, not the batting-side fields of the same names.
export function computeJWinsPitching(stat) {
  const w = JWINS_WEIGHTS.pitching
  const homeRunsAllowed = Number(stat.homeRuns || 0)
  const walksAllowed = Number(stat.baseOnBalls || 0)
  const hitBatsmen = Number(stat.hitBatsmen || 0)
  const strikeOuts = Number(stat.strikeOuts || 0)
  const inningsPitched = inningsToDecimal(stat.inningsPitched)
  if (inningsPitched <= 0) return null

  // FIP = (13*HR + 3*(BB+HBP) - 2*K) / IP + constant — a standard sabermetric rate stat
  // that estimates run prevention using only the outcomes a pitcher directly controls
  // (removing balls in play, which are heavily influenced by the defense behind him).
  const fip = (13 * homeRunsAllowed + 3 * (walksAllowed + hitBatsmen) - 2 * strikeOuts) / inningsPitched + w.fipConstant

  // Runs above average, converted through innings the same way wRAA is converted
  // through plate appearances: a lower FIP than league average is GOOD, hence
  // (leagueFIP - fip), scaled by innings/9 (FIP is already expressed as a per-9-innings
  // rate, so this converts the rate difference into a total runs figure for the season
  // or career at hand).
  const runsAboveAverage = (w.leagueFIP - fip) * (inningsPitched / 9)

  // Shift from runs above AVERAGE to runs above REPLACEMENT, the same conceptual move
  // as JWinsB's replacementLevelRunsPerPA — a replacement-level pitcher concedes more
  // runs per 9 than a league-average one, so this adds that gap back in as a bonus.
  const replacementRuns = w.replacementLevelRunsPer9 * (inningsPitched / 9)
  const runsAboveReplacement = runsAboveAverage + replacementRuns

  // Runs -> wins, the standard ~10-runs-per-win conversion (same constant as JWinsB).
  return runsAboveReplacement / w.runsPerWin
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


// Looks up this position's replacement-level-per-inning rate, falling back to the
// default rate for any position not explicitly listed (see
// JWINS_WEIGHTS.fielding.replacementLevelPerInningByPosition).
function replacementLevelPerInning(positionAbbreviation) {
  const w = JWINS_WEIGHTS.fielding
  if (!positionAbbreviation) return w.defaultReplacementLevelPerInning
  const key = String(positionAbbreviation).toUpperCase()
  return w.replacementLevelPerInningByPosition[key] ?? w.defaultReplacementLevelPerInning
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

  // Replacement-level offset, scaled by real innings played at this position AND by
  // this position's own replacement-level rate (see
  // JWINS_WEIGHTS.fielding.replacementLevelPerInningByPosition) — shifts the baseline
  // from "zero counting-stat differential" to "replacement level" without touching any
  // of the counting or positional weights above. Added before finalDivisor so it scales
  // down consistently with the rest of the formula, same as positionalRunValue.
  const replacementOffset = innings * replacementLevelPerInning(position)

  return (beforeFinalDivisor + replacementOffset) / w.finalDivisor
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
