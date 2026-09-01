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

  // JWinsF (fielding) — REDESIGNED. The original formula ((PO + A - E) * weight +
  // positionalRunValue) badly overrated first basemen and catchers, and the reason is
  // well-documented, not a tuning problem: putouts (PO) are not a meaningful skill signal
  // at those two positions. A first baseman's putouts are ~75-80% just receiving routine
  // throws from other infielders (confirmed against Statcast's own first-base-receiving
  // breakdown), and a catcher's putouts are mostly just being the fielder of record on a
  // strikeout — neither requires the range/hands that make PO a real signal at, say,
  // shortstop. This is exactly the fix sabermetricians already made decades ago: Pete
  // Palmer's Fielding Runs explicitly excludes 1B putouts as "not meaningful in most
  // cases" (SABR: "Measuring Defense"), and Bill James noted the same for catchers.
  //
  // So JWinsF now uses a PER-POSITION counting-stat formula instead of one universal one:
  //   - Most positions (SS, 2B, 3B, OF, P): (PO + A - E) * countingStats — unchanged,
  //     putouts ARE a real signal here (a fly out caught, a tag applied, a grounder
  //     fielded and stepped on the bag oneself).
  //   - 1B: putouts are EXCLUDED. Only assists count as the counting-stat term (a 1B
  //     fielding a bunt or slow roller and making the play himself is real range/skill).
  //     Double plays are deliberately NOT bonused for 1B — a first baseman's DP total is
  //     overwhelmingly him just being the receiver who steps on the bag to complete a play
  //     someone else started (see "the pivot" being credited to the middle infielders,
  //     not 1B, in standard baseball instruction sources), so it has the same "mostly
  //     receiving, not skill" problem as PO did — bonusing it would just reintroduce the
  //     inflation under a different stat name.
  //   - C: putouts are EXCLUDED too, for the strikeout-credit reason above. Catchers DO
  //     get a double-play bonus (a catcher-involved DP, e.g. off a strikeout-throw-out, is
  //     a genuinely active defensive play, unlike a 1B simply catching the relay), plus
  //     caughtStealing as a bonus (controlling the running game is a real catching skill)
  //     and passedBall as a penalty (squarely the catcher's own mistake). See
  //     computeJWinsFielding below for the exact formula per position.
  //
  // Divisor: 75 (Joshua's value) — much larger than batting/pitching's 10, since with
  // putouts now excluded at 1B/C, the raw counting-stat term across all positions is
  // smaller in magnitude and needed a bigger divisor to land on a comparable JWins scale
  // to batting/pitching (rather than dwarfing them). The countingStats weight (0.2) and
  // positional run values are also kept as Joshua's own starting point — PO exclusion for
  // 1B/C is the structural fix; these numbers are still the easiest knobs to keep
  // experimenting with from here.
  //
  // Formula shape: positionalRunValue is added AFTER dividing the counting-stat term by
  // the divisor, not before — i.e. ((PO + A - E) * countingStats / divisor) +
  // positionalRunValue, not ((PO + A - E) * countingStats + positionalRunValue) /
  // divisor. This matters: the run-value adjustment represents a flat, position-level
  // judgment (catchers are worth +9, first basemen -9.5) that should land on the JWins
  // scale directly, not get compressed by the same divisor that's scaling down the raw
  // counting stats.
  fielding: {
    // Per-position weights for putouts, assists, and errors — an outfield assist (a
    // runner thrown out at home from the gap) reflects a much rarer, harder throw than a
    // routine 6-4-3 assist, so they shouldn't be worth the same amount. Every position
    // gets its own {putOuts, assists, errors} entry below instead of one flat
    // countingStats number for everyone; positionalCounting(position, statName) looks
    // these up, falling back to defaultCounting for any position without its own entry
    // (so an unrecognized/rare position code still computes something reasonable instead
    // of breaking). 1B and C don't use putOuts here at all regardless of what's set below
    // — see putoutExcludedPositions and computeJWinsFielding for why.
    defaultCounting: { putOuts: 0.2, assists: 0.2, errors: -0.2 },
    countingByPosition: {
      C: { putOuts: 0.2, assists: 0.2, errors: -0.4 },
      '1B': { putOuts: 0.2, assists: 0.2, errors: -0.4 },
      '2B': { putOuts: 0.2, assists: 0.1, errors: -0.4 },
      SS: { putOuts: 0.2, assists: 0.1, errors: -0.6 },
      '3B': { putOuts: 0.2, assists: 0.1, errors: -0.4 },
      LF: { putOuts: 0.2, assists: 0.35, errors: -0.4 },
      CF: { putOuts: 0.2, assists: 0.35, errors: -0.4 },
      RF: { putOuts: 0.2, assists: 0.35, errors: -0.4 },
      DH: { putOuts: 0.2, assists: 0.2, errors: -0.4 },
      P: { putOuts: 0.2, assists: 0.2, errors: -0.4 },
    },
    // Bonus weights for catcher-specific plays that stand in for excluded putouts — new,
    // deliberately modest starting values (turning a DP or throwing out a runner is rarer
    // than racking up 100+ routine putouts, so the per-play weight is higher to
    // compensate) rather than anything derived from a published source. Tune freely.
    catcherDoublePlayBonus: 1.5,
    caughtStealingBonus: 1.0,
    passedBallPenalty: -0.7,
    divisor: 200,
    // A full defensive season, in innings (150 games * 9 innings — the standard
    // sabermetric full-season baseline, matching how a "150 game season" full-time
    // player is usually described). positionalRunValue below is PRORATED against this:
    // a catcher who only caught 450 innings (a third of a season) gets a third of the +9
    // adjustment, not the full +9 a 150-game everyday catcher gets. Without this, a
    // September call-up who caught 10 games got exactly the same flat +9 as a full-time
    // starting catcher, which overstated a small sample's positional value enormously.
    fullSeasonInnings: 1350,
    // Positions where putouts are excluded from the counting-stat term (see the big
    // comment above) — not just C/1B by pure coincidence; these are exactly the two
    // positions where PO is dominated by routine throw-receiving or strikeout credit
    // rather than the fielder's own range/hands.
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

// Looks up this position's {putOuts, assists, errors} weights, falling back to
// defaultCounting for any position not explicitly listed in countingByPosition.
function positionalCounting(positionAbbreviation) {
  const w = JWINS_WEIGHTS.fielding
  if (!positionAbbreviation) return w.defaultCounting
  const key = String(positionAbbreviation).toUpperCase()
  return w.countingByPosition[key] || w.defaultCounting
}

// Looks up the positional run value for one position abbreviation, PRORATED by how many
// innings the player actually played there relative to a full season (see
// fullSeasonInnings above) — a player who only played a third of a season at the
// position gets a third of that position's flat run-value adjustment, not the full
// amount. Capped at 1.0 (a player who somehow logged MORE than a full season's innings
// at one position, e.g. extra-inning games padding the total, still gets at most the
// full positional value, not a bonus beyond it). Falls back to 0 (a neutral, no-
// adjustment value — same as Pitcher's own listed value) for any position abbreviation
// not in the table, rather than throwing or silently guessing, so an unrecognized/
// unexpected position code from the API degrades gracefully instead of breaking JWinsF
// entirely for that player.
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

// JWinsF — fielding. `stat` is a merged fielding stat object. `position` is the position
// abbreviation this stat line represents (e.g. "SS", "1B") — for a player who split time
// across multiple positions in a season, computeJWinsFieldingForSeason below handles
// combining the per-position pieces correctly; this function computes JWinsF for ONE
// position's worth of stats, which is also exactly right for the (much more common)
// single-position case.
//
// See the big comment on JWINS_WEIGHTS.fielding for why this isn't one universal formula:
// at most positions it's (PO + A - E) * countingStats + positionalRunValue, same shape as
// before. At 1B and C — where putouts are mostly not a skill signal — PO is dropped
// entirely and replaced with doublePlays (a real skill signal at any position, and the
// stand-in for what PO used to represent at 1B), plus, for catchers specifically,
// caughtStealing as a bonus and passedBall as a penalty (both genuine catching-specific
// skills the old formula ignored entirely).
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

  // Positional run value is added AFTER dividing the counting-stat term, not before —
  // see the "Formula shape" note on JWINS_WEIGHTS.fielding for why. It's also prorated
  // by innings played at this position (see positionalRunValue) — `stat.innings` is
  // reported the same "whole.thirds" way as pitching IP (e.g. "63.1" = 63 and 1/3), so
  // it goes through the same conversion used everywhere else on this site.
  const innings = inningsToDecimal(stat.innings)
  return countingRaw / w.divisor + positionalRunValue(position, innings)
}

// For a season where a player appeared at multiple positions, JWinsF can't just be
// computed once against combined counting stats — the positional run value (and, now,
// whether putouts count at all — see computeJWinsFielding) has to apply PER POSITION (a
// season split between catcher and first base should get catcher's formula for the
// catching innings and first base's formula for the first base innings, not one or the
// other applied to the whole season, and not double-counted). Delegates to
// computeJWinsFielding for each position split and sums the results — this keeps the
// "divide by divisor, THEN add positional run value" order (see the "Formula shape" note
// on JWINS_WEIGHTS.fielding) correct per-position automatically, rather than duplicating
// that logic a second time and risking the two drifting out of sync.
export function computeJWinsFieldingForSeason(positionSplits) {
  if (!positionSplits || positionSplits.length === 0) return null
  let total = 0
  for (const { stat, position } of positionSplits) {
    total += computeJWinsFielding(stat, position)
  }
  return total
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
