// Season-pace projections — "if this player kept up their current rate all season, where
// would their counting stats end up." This is the same idea as the "on pace for X" stat
// broadcasts and MLB.com itself show during a season, not a sophisticated model (no aging
// curves, no regression to a player's established true talent level, no accounting for
// batting order/role changes) — just a straightforward, transparent pace-based scale-up,
// which is honest about what it is and easy to explain in the UI ("projected: scaled to
// a full season's pace") rather than presenting a black-box number.

import * as mlb from './mlbClient.js'

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
// projection. Hitters still scale against FULL_SEASON_GAMES (162), which is the correct
// denominator for them.
//
// PITCHERS ALSO NEED TO KNOW WHERE WE ARE IN THE SEASON — this is the fix for a second,
// related bug: scaling a pitcher's starts-so-far against a FIXED assumed season total
// (e.g. 32 starts) ignores the calendar entirely. A pitcher with 15 starts in a 32-start
// season always projected to "32 total, 17 more to go" whether it was May or September,
// because the math was purely (fixed total / starts so far) with no notion of how many
// scheduled days were actually left to make more starts in. Real projection instead:
// take the days actually remaining in the season and divide by a standard rotation
// cadence (5 days for a starter) to get REMAINING starts directly — not a cadence
// inferred from the pitcher's own year-to-date average (which drifts from a real 5-man
// rotation due to IL stints, skipped starts, doubleheaders, etc. and was producing
// wrong "days per start" figures even after we tried it). Days remaining ÷ 5 IS the
// remaining-starts count; it isn't scaled by anything else. See computePitcherScaleFactor
// below.

const FULL_SEASON_GAMES = 162 // hitters — the real number of games in a season
// Fallback full-season appearance ceilings — only used when real season boundary dates
// can't be fetched (see estimateSeasonProgress's catch below) and the date-aware path has
// to fall back to the old fixed-total method. Kept as a safety net, not the primary path.
const FULL_SEASON_STARTS = 32 // a realistic full season of starts for a starting pitcher
const FULL_SEASON_RELIEF_APPEARANCES = 65 // a realistic full season of appearances for a reliever
// Standard rotation cadence: a starter goes every 5th day. This is a FIXED assumption
// applied directly to days remaining (days remaining / 5 = remaining starts) — not a
// cadence derived from the pitcher's own starts-so-far, since a real pitcher's
// season-to-date average is skewed by IL time, spot starts, and skipped turns in a way
// that doesn't reflect how often they'll actually take the ball the rest of the way.
const DAYS_PER_START = 5
// Relievers don't follow a rotation slot, so there's no single equivalent "standard
// cadence" the way there is for a starter — this approximates how often a given reliever
// tends to appear relative to his team's remaining games (a modest workhorse rate),
// applied to games remaining rather than days remaining.
const RELIEF_APPEARANCES_PER_TEAM_GAME = FULL_SEASON_RELIEF_APPEARANCES / FULL_SEASON_GAMES

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

// Computes the pace scale factor for a HITTER using the player's TEAM's actual games
// remaining this season (162 minus the team's real games played, from standings) — not
// (162 / games played so far), which was the bug: that formula assumes the player has
//162 total chances no matter how far into the season it is, so a hitter with 4 HR in 16
// games got scaled by 162/16 ≈ 10x regardless of only 10 team games being left. Correct
// version: full season total = games played so far + team's games remaining, and THAT is
// what the player's counting stats get scaled against.
async function computeHitterScaleFactor(gamesPlayed, teamId, season) {
  const games = Number(gamesPlayed) || 0
  if (games <= 0) return null

  const gamesRemaining = await getTeamGamesRemaining(teamId, season)
  const fullSeasonGames = gamesRemaining !== null ? games + gamesRemaining : FULL_SEASON_GAMES
  const raw = fullSeasonGames / games
  return { scaleFactor: Math.min(raw, MAX_SCALE_FACTOR), fullSeasonGames }
}

// How many games a player's TEAM has left this season — the real answer to "how many
// more chances does this player have to add to his counting stats," used for hitters and
// (combined with a rotation-slot constraint) for starting pitchers. Fetched from MLB's
// standings data for the player's team, which reports actual wins+losses so far — far
// more precise than approximating "games remaining" from a fraction of calendar days,
// since off days and doubleheaders make calendar time a poor proxy for games played.
// Returns null if the team can't be found or the season is over (nothing left to play).
async function getTeamGamesRemaining(teamId, season) {
  if (!teamId) return null
  try {
    const data = await mlb.getStandings(season)
    for (const record of data.records || []) {
      for (const teamRecord of record.teamRecords || []) {
        if (teamRecord.team?.id === Number(teamId)) {
          const wins = Number(teamRecord.wins || 0)
          const losses = Number(teamRecord.losses || 0)
          const gamesPlayed = wins + losses
          if (gamesPlayed <= 0) return null
          return Math.max(FULL_SEASON_GAMES - gamesPlayed, 0)
        }
      }
    }
    return null
  } catch (err) {
    console.error(`getTeamGamesRemaining(${teamId}, ${season}) failed:`, err.message)
    return null
  }
}

// How far through the season we are, in real days — fetched from MLB's own season
// boundary dates so this works correctly no matter the year (lockout-shortened seasons,
// schedule shifts, etc.) rather than hardcoding "the season runs April to October." Used
// only as a fallback for pitchers when a team's actual games-remaining count isn't
// available (see computePitcherScaleFactor), since team games-remaining is the more
// precise number when we have it.
// Returns null if the dates can't be determined (network issue, unexpected response
// shape, or a season with no regularSeasonStartDate/EndDate) — callers fall back to the
// old fixed-total method in that case rather than guessing at a date range.
async function estimateSeasonProgress(season) {
  try {
    const data = await mlb.getSeasonDates(season)
    const seasonInfo = data?.seasons?.[0]
    const startDate = seasonInfo?.regularSeasonStartDate
    const endDate = seasonInfo?.regularSeasonEndDate
    if (!startDate || !endDate) return null

    const start = new Date(`${startDate}T00:00:00Z`)
    const end = new Date(`${endDate}T00:00:00Z`)
    const today = new Date()
    const MS_PER_DAY = 24 * 60 * 60 * 1000

    const totalDays = (end - start) / MS_PER_DAY
    if (!Number.isFinite(totalDays) || totalDays <= 0) return null

    // Clamp "today" into the season window — if the season hasn't started yet, or has
    // already ended, treat elapsed/remaining as the boundary rather than a negative or
    // over-100% figure.
    const clampedToday = new Date(Math.min(Math.max(today, start), end))
    const daysElapsed = Math.max((clampedToday - start) / MS_PER_DAY, 0)
    const daysRemaining = Math.max(totalDays - daysElapsed, 0)

    return { daysElapsed, daysRemaining, totalDays }
  } catch (err) {
    console.error(`estimateSeasonProgress(${season}) failed, falling back to fixed-total pitcher projection:`, err.message)
    return null
  }
}

// Computes the pace scale factor for a PITCHER.
// STARTERS: days remaining in the season / 5 (a standard rotation cadence) = remaining
// starts, directly. This is NOT derived from the pitcher's own days-elapsed/starts-so-far
// average — early tries at that produced wrong cadences (a pitcher's year-to-date pace
// drifts from a true 5-day rotation due to IL time, spot starts, and skipped turns), so a
// pitcher with 15 starts and 10 days left in the season correctly projects to 2 more
// starts (10/5), not a number derived from how his 15 starts happened to space out over
// the season so far.
// RELIEVERS: no fixed rotation slot to divide days by, so this uses the same
// team-games-remaining figure as hitters (from getTeamGamesRemaining), scaled by a
// fixed appearances-per-team-game rate — more precise than approximating games remaining
// from calendar days, for the same reason it's more precise for hitters.
//
// Falls back to calendar days (estimateSeasonProgress) if the team's games-remaining
// figure isn't available, and to the old fixed-full-season-total method
// (FULL_SEASON_STARTS / FULL_SEASON_RELIEF_APPEARANCES) only if NEITHER real data source
// can be fetched, so an API hiccup degrades gracefully rather than failing the whole
// projection.
async function computePitcherScaleFactor(stat, teamId, season) {
  const role = classifyPitcherRole(stat)
  const appearancesSoFar = role === 'starter' ? Number(stat.gamesStarted || 0) : Number(stat.gamesPlayed || 0)
  if (appearancesSoFar <= 0) return null

  const [gamesRemaining, progress] = await Promise.all([
    getTeamGamesRemaining(teamId, season),
    estimateSeasonProgress(season),
  ])

  if (role === 'starter') {
    // Starters need DAYS remaining (a rotation is a calendar cadence, not a
    // games-played cadence), so this path always prefers estimateSeasonProgress.
    if (progress) {
      const remainingAppearances = progress.daysRemaining / DAYS_PER_START
      const fullSeasonAppearances = appearancesSoFar + remainingAppearances
      const raw = fullSeasonAppearances / appearancesSoFar
      return {
        scaleFactor: Math.min(raw, MAX_SCALE_FACTOR),
        role, appearancesSoFar, fullSeasonAppearances, method: 'dateAware',
      }
    }
  } else if (gamesRemaining !== null) {
    // Relievers scale off the team's actual remaining games, which is the more precise
    // figure when we have it.
    const remainingAppearances = gamesRemaining * RELIEF_APPEARANCES_PER_TEAM_GAME
    const fullSeasonAppearances = appearancesSoFar + remainingAppearances
    const raw = fullSeasonAppearances / appearancesSoFar
    return {
      scaleFactor: Math.min(raw, MAX_SCALE_FACTOR),
      role, appearancesSoFar, fullSeasonAppearances, method: 'teamGamesRemaining',
    }
  } else if (progress) {
    const remainingAppearances = progress.daysRemaining * RELIEF_APPEARANCES_PER_TEAM_GAME
    const fullSeasonAppearances = appearancesSoFar + remainingAppearances
    const raw = fullSeasonAppearances / appearancesSoFar
    return {
      scaleFactor: Math.min(raw, MAX_SCALE_FACTOR),
      role, appearancesSoFar, fullSeasonAppearances, method: 'dateAware',
    }
  }

  // Fallback: neither real data source available — use the old fixed-total approach.
  const fullSeasonAppearances = role === 'starter' ? FULL_SEASON_STARTS : FULL_SEASON_RELIEF_APPEARANCES
  const raw = fullSeasonAppearances / appearancesSoFar
  return {
    scaleFactor: Math.min(raw, MAX_SCALE_FACTOR),
    role,
    appearancesSoFar,
    fullSeasonAppearances,
    method: 'fixedTotalFallback',
  }
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
//
// `teamId` and `season` are used to look up the player's team's actual games remaining
// this season (see getTeamGamesRemaining/estimateSeasonProgress) so both hitting and
// pitching projections scale against a REALISTIC remaining schedule rather than assuming
// a player always has a full 162-game (or 32-start) season ahead of them regardless of
// today's date. This function is async because of those lookups; callers must await it.
export async function projectSeasonStats(stat, group, teamId, season) {
  if (!stat) return null

  if (group === 'pitching') {
    const scaling = await computePitcherScaleFactor(stat, teamId, season)
    if (scaling === null) return null
    const { scaleFactor, role, appearancesSoFar, fullSeasonAppearances, method } = scaling

    let projected = scaleFields(stat, PITCHING_COUNTING_FIELDS, scaleFactor)
    // gamesPlayed/gamesStarted are capped at the realistic full-season appearance total
    // computed above — never at 162, which is the exact wrong assumption (that a pitcher
    // could appear in as many games as an everyday hitter) that caused the original bug.
    const projectedAppearances = Math.min(Math.round(appearancesSoFar * scaleFactor), Math.round(fullSeasonAppearances))
    projected.gamesPlayed = projectedAppearances
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
      method, // 'dateAware' / 'teamGamesRemaining' (normal) or 'fixedTotalFallback' (both real data sources failed)
    }
  }

  const gamesPlayed = stat.gamesPlayed
  const hitterScaling = await computeHitterScaleFactor(gamesPlayed, teamId, season)
  if (hitterScaling === null) return null
  const { scaleFactor, fullSeasonGames } = hitterScaling

  let projected = scaleFields(stat, HITTING_COUNTING_FIELDS, scaleFactor)
  projected.gamesPlayed = Math.min(Math.round(Number(gamesPlayed) * scaleFactor), Math.round(fullSeasonGames))
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
