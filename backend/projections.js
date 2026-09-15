// Season-pace projections — "if this player kept up their current rate all season, where
// would their counting stats end up." This is the same idea as the "on pace for X" stat
// broadcasts and MLB.com itself show during a season, not a sophisticated model (no aging
// curves, no regression to a player's established true talent level, no accounting for
// batting order/role changes) — just a straightforward, transparent pace-based scale-up,
// which is honest about what it is and easy to explain in the UI ("projected: scaled to
// a full season's pace") rather than presenting a black-box number.
//
// COUNTING stats (hits, home runs, strikeouts, innings pitched, etc.) get scaled by
// (a realistic full-season TOTAL of the right kind of appearance / appearances so far).
// RATE stats (batting average, ERA, WHIP, OPS, etc.) are NOT scaled — a .300 hitter's
// projected average is still .300, not .300 multiplied by anything; scaling a rate stat
// by games played would be meaningless. Small-sample volatility is a REAL limitation of
// this method (a hot first two weeks projects to an absurd home run total) — this is
// flagged directly in the UI rather than hidden, since a simple pace projection can't fix
// that on its own without a fundamentally different (regression-based) approach.
//
// PITCHERS NEED THEIR OWN DENOMINATOR — this is the fix for a real bug: a starting
// pitcher's `gamesPlayed` was being scaled against a 162-game denominator (the number of
// games a full-time HITTER plays), which assumes a starter could theoretically appear in
// 162 games this season. He can't — a starter tops out around 32-33 starts a year, a
// reliever around 65-75 appearances. Scaling Jacob Misiorowski's strikeouts against 162
// games instead of ~32 realistic starts is exactly what produced an absurd 1400-strikeout
// projection. Pitchers are now scaled against FULL_SEASON_STARTS (starters) or
// FULL_SEASON_RELIEF_APPEARANCES (relievers) instead, detected from whether the pitcher
// has actually been starting games (see classifyPitcherRole below) — hitters still scale
// against FULL_SEASON_GAMES (162), which is the correct denominator for them.

const FULL_SEASON_GAMES = 162 // hitters — the real number of games in a season
const FULL_SEASON_STARTS = 32 // a realistic full season of starts for a starting pitcher
const FULL_SEASON_RELIEF_APPEARANCES = 65 // a realistic full season of appearances for a reliever

// Counting stats that make sense to scale by games-played pace. Deliberately NOT every
// field on a stat object — rate stats and percentages are excluded (see COUNTING_FIELDS
// vs RATE_FIELDS below), and a few fields (like `gamesPlayed` itself) don't get projected
// at all, they just get replaced with the full-season assumption.
const HITTING_COUNTING_FIELDS = [
  'atBats', 'hits', 'singles', 'doubles', 'triples', 'homeRuns', 'runs', 'rbi',
  'baseOnBalls', 'strikeOuts', 'stolenBases', 'caughtStealing', 'hitByPitch',
  'plateAppearances', 'sacBunts', 'sacFlies', 'groundOuts', 'airOuts', 'totalBases',
]

const PITCHING_COUNTING_FIELDS = [
  'wins', 'losses', 'saves', 'strikeOuts', 'baseOnBalls', 'hits', 'homeRuns',
  'earnedRuns', 'runs', 'battersFaced', 'hitByPitch', 'wildPitches', 'balks',
  'gamesStarted', 'completeGames', 'shutouts',
]

// Rate/percentage stats are recomputed FROM the projected counting stats afterward
// (see recomputeHittingRates/recomputePitchingRates) rather than scaled directly — e.g.
// projected AVG is projected hits / projected at-bats, not (current AVG * scale factor),
// since the latter can drift from what the projected counting stats actually imply.

// innings pitched needs its own scaling since MLB reports it as a "whole.thirds" string
// (e.g. "63.1" = 63 and 1/3 innings) rather than a plain decimal — scale the real decimal
// value, then convert back to that same display format so it still reads the way every
// other innings figure on this site does.
function inningsPitchedToDecimal(ip) {
  if (ip === null || ip === undefined || ip === '') return 0
  const [wholePart, thirdPart] = String(ip).split('.')
  const whole = Number(wholePart) || 0
  const thirds = Number(thirdPart) || 0
  return whole + thirds / 3
}

function decimalToInningsPitched(decimal) {
  const whole = Math.floor(decimal)
  const remainder = decimal - whole
  const thirds = Math.round(remainder * 3)
  if (thirds === 3) return `${whole + 1}.0`
  return `${whole}.${thirds}`
}

// A pitcher is treated as a STARTER if most of their appearances have actually been
// starts (gamesStarted close to gamesPlayed) — a true starter's gamesStarted should
// roughly equal their gamesPlayed, since starters essentially never come out of the
// bullpen. Anyone else (a reliever, a swingman who's mostly relieved) is scaled against
// the relief-appearance denominator instead. A 50% threshold comfortably separates real
// starters from relief pitchers who've made an occasional spot start.
function classifyPitcherRole(stat) {
  const gamesPlayed = Number(stat.gamesPlayed || 0)
  const gamesStarted = Number(stat.gamesStarted || 0)
  if (gamesPlayed === 0) return 'reliever'
  return gamesStarted / gamesPlayed >= 0.5 ? 'starter' : 'reliever'
}

// Computes the pace scale factor for a HITTER: (162 games) / (games played so far).
// Capped at a reasonable maximum (see MAX_SCALE_FACTOR) so a player with, say, 3 games
// played doesn't project to a mathematically absurd scale-up — early-season samples are
// still flagged as low-confidence in the API response (see isLowSample below) even after
// capping, since capping the scale factor doesn't fix the underlying small-sample
// volatility, it just keeps the displayed number from being a nonsense outlier.
const MAX_SCALE_FACTOR = 8
const MIN_GAMES_FOR_CONFIDENT_PROJECTION = 20
const MIN_PITCHER_APPEARANCES_FOR_CONFIDENT_PROJECTION = 8

function computeHitterScaleFactor(gamesPlayed) {
  const games = Number(gamesPlayed) || 0
  if (games <= 0) return null
  const raw = FULL_SEASON_GAMES / games
  return Math.min(raw, MAX_SCALE_FACTOR)
}

// Computes the pace scale factor for a PITCHER against the RIGHT denominator for their
// role — a starter's appearances-so-far against a realistic full season of STARTS
// (~32), a reliever's against a realistic full season of relief APPEARANCES (~65). This
// is the actual fix: previously both were scaled against 162 (a hitter's full season),
// which is why a pitcher a few starts into the year could project to an impossible
// strikeout total — the denominator was simply wrong for what a pitcher's role can
// realistically produce in a season, capping alone couldn't fix a wrong denominator.
function computePitcherScaleFactor(stat) {
  const role = classifyPitcherRole(stat)
  const appearancesSoFar = role === 'starter' ? Number(stat.gamesStarted || 0) : Number(stat.gamesPlayed || 0)
  if (appearancesSoFar <= 0) return null
  const fullSeasonAppearances = role === 'starter' ? FULL_SEASON_STARTS : FULL_SEASON_RELIEF_APPEARANCES
  const raw = fullSeasonAppearances / appearancesSoFar
  return { scaleFactor: Math.min(raw, MAX_SCALE_FACTOR), role, appearancesSoFar, fullSeasonAppearances }
}

function scaleFields(stat, fields, scaleFactor) {
  const projected = { ...stat }
  for (const field of fields) {
    if (stat[field] === undefined || stat[field] === null) continue
    projected[field] = Math.round(Number(stat[field]) * scaleFactor)
  }
  return projected
}

// Recomputes hitting rate stats from the newly-scaled counting stats, rather than scaling
// the original rate stats directly — keeps AVG/OBP/SLG/OPS internally consistent with the
// projected hits/at-bats/etc. actually shown alongside them.
function recomputeHittingRates(projected) {
  const ab = Number(projected.atBats || 0)
  const hits = Number(projected.hits || 0)
  const bb = Number(projected.baseOnBalls || 0)
  const hbp = Number(projected.hitByPitch || 0)
  const sf = Number(projected.sacFlies || 0)
  const totalBases = Number(projected.totalBases || 0)

  if (ab > 0) {
    projected.avg = (hits / ab).toFixed(3).replace(/^0\./, '.')
    projected.slg = (totalBases / ab).toFixed(3).replace(/^0\./, '.')
  }
  const obpDenominator = ab + bb + hbp + sf
  if (obpDenominator > 0) {
    projected.obp = ((hits + bb + hbp) / obpDenominator).toFixed(3).replace(/^0\./, '.')
  }
  if (projected.obp && projected.slg) {
    projected.ops = (Number(projected.obp) + Number(projected.slg)).toFixed(3).replace(/^0\./, '.')
  }
  return projected
}

function recomputePitchingRates(projected) {
  const ip = inningsPitchedToDecimal(projected.inningsPitched)
  const earnedRuns = Number(projected.earnedRuns || 0)
  const hits = Number(projected.hits || 0)
  const baseOnBalls = Number(projected.baseOnBalls || 0)

  if (ip > 0) {
    projected.era = ((earnedRuns * 9) / ip).toFixed(2)
    projected.whip = ((hits + baseOnBalls) / ip).toFixed(2)
  }
  return projected
}

// Projects a hitting or pitching season stat object to a full-season pace. Returns null
// if there isn't enough real data to project from (no games/appearances at all) — a
// projection of nothing is not a projection, it's a guess dressed up as one.
// `isLowSample` flags an early, small-sample projection so the frontend can show an
// explicit "small sample, treat with caution" note rather than presenting an early hot
// streak's full-season pace as if it were reliable.
export function projectSeasonStats(stat, group) {
  if (!stat) return null

  if (group === 'pitching') {
    const scaling = computePitcherScaleFactor(stat)
    if (scaling === null) return null
    const { scaleFactor, role, appearancesSoFar, fullSeasonAppearances } = scaling

    let projected = scaleFields(stat, PITCHING_COUNTING_FIELDS, scaleFactor)
    // gamesPlayed/gamesStarted are capped at the SAME realistic full-season total used as
    // the scaling denominator (32 starts, 65 relief appearances) — not 162, which is the
    // exact wrong assumption (that a pitcher could appear in as many games as an everyday
    // hitter) that caused the original bug.
    const projectedAppearances = Math.min(Math.round(appearancesSoFar * scaleFactor), fullSeasonAppearances)
    projected.gamesPlayed = role === 'starter' ? projectedAppearances : projectedAppearances
    if (role === 'starter') projected.gamesStarted = projectedAppearances

    const projectedInnings = inningsPitchedToDecimal(stat.inningsPitched) * scaleFactor
    projected.inningsPitched = decimalToInningsPitched(projectedInnings)
    projected = recomputePitchingRates(projected)

    return {
      stat: projected,
      isLowSample: appearancesSoFar < MIN_PITCHER_APPEARANCES_FOR_CONFIDENT_PROJECTION,
      gamesPlayedSoFar: appearancesSoFar,
      scaleFactor,
      role, // 'starter' or 'reliever' — surfaced so the UI can label the projection basis
    }
  }

  const gamesPlayed = stat.gamesPlayed
  const scaleFactor = computeHitterScaleFactor(gamesPlayed)
  if (scaleFactor === null) return null

  let projected = scaleFields(stat, HITTING_COUNTING_FIELDS, scaleFactor)
  projected.gamesPlayed = Math.min(Math.round(Number(gamesPlayed) * scaleFactor), FULL_SEASON_GAMES)
  projected = recomputeHittingRates(projected)

  return {
    stat: projected,
    isLowSample: Number(gamesPlayed) < MIN_GAMES_FOR_CONFIDENT_PROJECTION,
    gamesPlayedSoFar: Number(gamesPlayed),
    scaleFactor,
  }
}

// Projects a TEAM's win/loss record to a full 162-game season, based on their winning
// percentage in games played so far — the standard "on X-win pace" calculation shown on
// broadcasts and standings pages during a season. Returns null once the team has already
// played all 162 games (nothing left to project) or if the record is missing/malformed.
export function projectTeamRecord(wins, losses) {
  const w = Number(wins)
  const l = Number(losses)
  if (!Number.isFinite(w) || !Number.isFinite(l)) return null
  const gamesPlayed = w + l
  if (gamesPlayed <= 0 || gamesPlayed >= FULL_SEASON_GAMES) return null

  const winPct = w / gamesPlayed
  const projectedWins = Math.round(winPct * FULL_SEASON_GAMES)
  const projectedLosses = FULL_SEASON_GAMES - projectedWins

  return {
    wins: projectedWins,
    losses: projectedLosses,
    gamesPlayedSoFar: gamesPlayed,
    isLowSample: gamesPlayed < MIN_GAMES_FOR_CONFIDENT_PROJECTION,
  }
}
