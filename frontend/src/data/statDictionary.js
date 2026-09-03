// Every stat shown anywhere on the site is driven by this file, never hardcoded inline.
// statKey should match the MLB Stats API field name where one exists (see services/mlbApi.js
// STAT_FIELD_MAP) so leaderboard/rundown code can look a raw API value up directly.
//
// format values: 'avg' (.000, no leading zero), 'decimal2' (0.00), 'decimal3' (0.000),
// 'percent' (0.0%), 'mph', 'rpm', 'integer'
// goodDirection: 'high' means bigger numbers are better, 'low' means smaller is better

export const statDictionary = {
  avg: {
    realName: 'AVG',
    simpleName: 'AVG',
    fullName: 'Batting Average',
    shortExplain: 'How often a player gets a hit per at-bat.',
    extraExplain: 'A .300 AVG means 30 hits for every 100 official at-bats. It does not count walks.',
    goodDirection: 'high',
    scale: { poor: 0.230, average: 0.260, great: 0.300 },
    format: 'avg',
    group: 'hitting',
  },
  obp: {
    realName: 'OBP',
    simpleName: 'OBP',
    fullName: 'On-Base Percentage',
    shortExplain: 'How often a player reaches base, by hit, walk, or getting hit by a pitch.',
    extraExplain: 'OBP is usually a better quick read than AVG because walks have real value.',
    goodDirection: 'high',
    scale: { poor: 0.300, average: 0.320, great: 0.370 },
    format: 'avg',
    group: 'hitting',
  },
  slg: {
    realName: 'SLG',
    simpleName: 'SLG',
    fullName: 'Slugging Percentage',
    shortExplain: 'Total bases per at-bat; rewards extra-base hits, not just any hit.',
    extraExplain: 'A double counts twice as much as a single, a triple three times, and a homer four times.',
    goodDirection: 'high',
    scale: { poor: 0.370, average: 0.420, great: 0.500 },
    format: 'avg',
    group: 'hitting',
  },
  ops: {
    realName: 'OPS',
    simpleName: 'OPS',
    fullName: 'On-base Plus Slugging',
    shortExplain: "Combines a hitter's ability to get on base and hit for power.",
    extraExplain: 'It is not perfect, but it is one of the fastest ways to judge overall hitting value.',
    goodDirection: 'high',
    scale: { poor: 0.680, average: 0.750, great: 0.850 },
    format: 'decimal3',
    group: 'hitting',
  },
  plateAppearances: {
    realName: 'PA',
    simpleName: 'PA',
    fullName: 'Plate Appearances',
    shortExplain: 'Every completed trip to the plate, including walks, hit-by-pitches, and sacrifices.',
    extraExplain: 'Use PA to tell whether a rate stat comes from a full workload or a tiny sample.',
    goodDirection: 'high',
    scale: { poor: 100, average: 300, great: 550 },
    format: 'integer',
    group: 'hitting',
  },
  hits: {
    realName: 'H',
    simpleName: 'H',
    fullName: 'Hits',
    shortExplain: 'Total times the batter safely reached base on a batted ball.',
    extraExplain: 'Hits are useful volume, but they need AVG, OBP, and SLG for context.',
    goodDirection: 'high',
    scale: { poor: 50, average: 110, great: 160 },
    format: 'integer',
    group: 'hitting',
  },
  singles: {
    realName: '1B',
    simpleName: '1B',
    fullName: 'Singles',
    shortExplain: 'Hits that were only good for first base.',
    extraExplain: 'Singles = Hits minus doubles, triples, and home runs.',
    goodDirection: 'high',
    scale: { poor: 35, average: 75, great: 110 },
    format: 'integer',
    group: 'hitting',
  },
  doubles: {
    realName: '2B',
    simpleName: '2B',
    fullName: 'Doubles',
    shortExplain: 'Hits where the batter reached second base.',
    extraExplain: 'Doubles are a solid sign of gap power and bat speed.',
    goodDirection: 'high',
    scale: { poor: 8, average: 22, great: 35 },
    format: 'integer',
    group: 'hitting',
  },
  triples: {
    realName: '3B',
    simpleName: '3B',
    fullName: 'Triples',
    shortExplain: 'Hits where the batter reached third base.',
    extraExplain: 'Triples are rare — they usually mix hard contact with real speed.',
    goodDirection: 'high',
    scale: { poor: 0, average: 2, great: 6 },
    format: 'integer',
    group: 'hitting',
  },
  atBats: {
    realName: 'AB',
    simpleName: 'AB',
    fullName: 'At Bats',
    shortExplain: 'Official at-bats, not counting walks, HBP, or sacrifices.',
    extraExplain: 'AB is the denominator behind AVG and SLG.',
    goodDirection: 'high',
    scale: { poor: 100, average: 300, great: 550 },
    format: 'integer',
    group: 'hitting',
  },
  homeRuns: {
    realName: 'HR',
    simpleName: 'HR',
    fullName: 'Home Runs',
    shortExplain: 'Total home runs hit this season.',
    extraExplain: 'HR captures top-end power, but SLG and Barrel% show whether the power is broader than homers.',
    goodDirection: 'high',
    scale: { poor: 8, average: 18, great: 30 },
    format: 'integer',
    group: 'hitting',
  },
  rbi: {
    realName: 'RBI',
    simpleName: 'RBI',
    fullName: 'Runs Batted In',
    shortExplain: 'Runs that scored because of this hitter’s plate appearance.',
    extraExplain: 'RBI depends partly on teammates reaching base, so it is context-heavy.',
    goodDirection: 'high',
    scale: { poor: 35, average: 70, great: 100 },
    format: 'integer',
    group: 'hitting',
  },
  runs: {
    realName: 'R',
    simpleName: 'R',
    fullName: 'Runs',
    shortExplain: 'Times the player crossed home plate.',
    extraExplain: 'Runs mix getting on base, speed, lineup spot, and the hitters batting behind him.',
    goodDirection: 'high',
    scale: { poor: 35, average: 70, great: 100 },
    format: 'integer',
    group: 'hitting',
  },
  baseOnBalls: {
    realName: 'BB',
    simpleName: 'BB',
    fullName: 'Walks',
    shortExplain: 'Times the hitter reached base by taking four balls.',
    extraExplain: 'Walks are a quick sign of plate discipline and pitchers respecting a hitter.',
    goodDirection: 'high',
    scale: { poor: 20, average: 45, great: 80 },
    format: 'integer',
    group: 'hitting',
  },
  stolenBases: {
    realName: 'SB',
    simpleName: 'SB',
    fullName: 'Stolen Bases',
    shortExplain: 'Total bases stolen this season.',
    extraExplain: 'SB shows speed and aggression, but caught stealing matters too.',
    goodDirection: 'high',
    scale: { poor: 3, average: 10, great: 25 },
    format: 'integer',
    group: 'hitting',
  },
  war: {
    realName: 'JWinsB',
    simpleName: 'JWinsB',
    fullName: 'JWinsB (custom batting Wins Above Replacement)',
    shortExplain: 'A site-specific batting WAR estimate',
    extraExplain: "This is PlainStats' own formula, not a published sabermetric source (MLB's own API doesn't publish WAR at all) — treat it as this site's house stat, not an official number.",
    goodDirection: 'high',
    scale: { poor: 0.5, average: 2.0, great: 5.0 },
    format: 'decimal1',
    group: 'hitting',
  },
  splat: {
    realName: 'SPLAT',
    simpleName: 'SPLAT',
    fullName: 'Swing Produces Lazy Air Trajectory',
    shortExplain: 'How often a batter hits a weak pop-up per at-bat — lower is better.',
    extraExplain: "This is PlainStats' own stat, and it's an approximation: the MLB Stats API doesn't report a pop-up count directly, so this uses air outs ÷ AB (air outs cover every fly ball, line drive, and pop-up out together) as the closest available substitute.",
    goodDirection: 'low',
    scale: { poor: 0.14, average: 0.10, great: 0.06 },
    format: 'avg',
    group: 'hitting',
  },
  era: {
    realName: 'ERA',
    simpleName: 'ERA',
    fullName: 'Earned Run Average',
    shortExplain: 'How many earned runs a pitcher gives up per 9 innings; lower is better.',
    extraExplain: 'ERA is results-based, so defense, park, and sequencing can tug it around.',
    goodDirection: 'low',
    scale: { poor: 5.00, average: 4.00, great: 3.00 },
    format: 'decimal2',
    group: 'pitching',
  },
  whip: {
    realName: 'WHIP',
    simpleName: 'WHIP',
    fullName: 'Walks plus Hits per Inning Pitched',
    shortExplain: 'Walks plus hits allowed per inning; how many people a pitcher lets on base.',
    extraExplain: 'WHIP is a clean control-and-traffic stat, especially useful beside ERA.',
    goodDirection: 'low',
    scale: { poor: 1.40, average: 1.25, great: 1.05 },
    format: 'decimal2',
    group: 'pitching',
  },
  inningsPitched: {
    realName: 'IP',
    simpleName: 'IP',
    fullName: 'Innings Pitched',
    shortExplain: 'How many innings a pitcher has recorded.',
    extraExplain: 'IP tells you workload. A rate stat from 180 IP means more than the same rate from 20 IP.',
    goodDirection: 'high',
    scale: { poor: 40, average: 100, great: 170 },
    format: 'innings',
    group: 'pitching',
  },
  wins: {
    realName: 'W',
    simpleName: 'W',
    fullName: 'Wins',
    shortExplain: "Games credited as a win to this pitcher this season.",
    extraExplain: 'Wins are team-dependent, so pair them with IP, ERA, WHIP, and strikeout stats.',
    goodDirection: 'high',
    scale: { poor: 4, average: 9, great: 15 },
    format: 'integer',
    group: 'pitching',
  },
  losses: {
    realName: 'L',
    simpleName: 'L',
    fullName: 'Losses',
    shortExplain: 'Games credited as a loss to this pitcher this season.',
    extraExplain: 'Losses are context-heavy, because run support and bullpen timing matter.',
    goodDirection: 'low',
    scale: { poor: 12, average: 8, great: 3 },
    format: 'integer',
    group: 'pitching',
  },
  gamesStarted: {
    realName: 'GS',
    simpleName: 'GS',
    fullName: 'Games Started',
    shortExplain: 'How many games the pitcher began on the mound.',
    extraExplain: 'GS helps separate starters from relievers before comparing innings or rate stats.',
    goodDirection: 'high',
    scale: { poor: 5, average: 18, great: 30 },
    format: 'integer',
    group: 'pitching',
  },
  strikeOuts: {
    realName: 'K',
    simpleName: 'K',
    fullName: 'Strikeouts',
    shortExplain: 'Total batters struck out this season.',
    extraExplain: 'Strikeouts remove defense from the play, which is why they are so valuable for pitchers.',
    goodDirection: 'high',
    scale: { poor: 60, average: 130, great: 200 },
    format: 'integer',
    group: 'pitching',
  },
  strikeoutsPer9Inn: {
    realName: 'K/9',
    simpleName: 'K/9',
    fullName: 'Strikeouts per 9 Innings',
    shortExplain: 'How many strikeouts a pitcher records per 9 innings.',
    extraExplain: 'K/9 is a rate version of strikeout volume, useful when pitchers have different workloads.',
    goodDirection: 'high',
    scale: { poor: 7, average: 8.5, great: 10.5 },
    format: 'decimal2',
    group: 'pitching',
  },
  baseOnBallsPitching: {
    realName: 'BB',
    simpleName: 'BB',
    fullName: 'Walks Allowed',
    shortExplain: 'Total batters walked by the pitcher.',
    extraExplain: 'Walks allowed create free baserunners and often explain why WHIP rises.',
    goodDirection: 'low',
    scale: { poor: 60, average: 40, great: 20 },
    format: 'integer',
    group: 'pitching',
    sourceKey: 'baseOnBalls',
  },
  hitsAllowed: {
    realName: 'H',
    simpleName: 'H',
    fullName: 'Hits Allowed',
    shortExplain: 'Total hits allowed in a game.',
    extraExplain: 'Hits allowed are a primary driver of how many runs a pitcher yields.',
    goodDirection: 'low',
    scale: { poor: 12, average: 8, great: 4 },
    format: 'integer',
    group: 'pitching',
  },
  homeRunsAllowed: {
    realName: 'HR',
    simpleName: 'HR',
    fullName: 'Home Runs Allowed',
    shortExplain: 'Total home runs surrendered by the pitcher.',
    extraExplain: 'Home runs are the easiest way for a pitcher to give up damage, especially late in counts.',
    goodDirection: 'low',
    scale: { poor: 4, average: 2, great: 1 },
    format: 'integer',
    group: 'pitching',
  },
  hitByPitch: {
    realName: 'HBP',
    simpleName: 'HBP',
    fullName: 'Hit Batters',
    shortExplain: 'Times the pitcher hit a batter with a pitch.',
    extraExplain: 'Hit batters add free baserunners and may indicate control issues or a pitcher with heavy sink.',
    goodDirection: 'low',
    scale: { poor: 5, average: 2, great: 0 },
    format: 'integer',
    group: 'pitching',
  },
  earnedRuns: {
    realName: 'ER',
    simpleName: 'ER',
    fullName: 'Earned Runs',
    shortExplain: 'Runs charged to the pitcher that scored without fielding errors.',
    extraExplain: 'ER is the standard measure of a pitcher’s own run prevention. It excludes unearned runs from errors.',
    goodDirection: 'low',
    scale: { poor: 5, average: 3, great: 2 },
    format: 'integer',
    group: 'pitching',
  },
  runsAllowed: {
    realName: 'R',
    simpleName: 'R',
    fullName: 'Runs Allowed',
    shortExplain: 'Total runs given up by the pitcher in a start.',
    extraExplain: 'Runs allowed includes both earned and unearned runs and reflects game impact directly.',
    goodDirection: 'low',
    scale: { poor: 6, average: 3, great: 1 },
    format: 'integer',
    group: 'pitching',
  },
  winLoss: {
    realName: 'W-L',
    simpleName: 'W-L',
    fullName: 'Win-Loss Record',
    shortExplain: 'The team’s wins and losses in the current standings.',
    extraExplain: 'This record shows how many games the team has won and lost so far this season.',
    goodDirection: 'high',
    scale: { poor: 0, average: 0, great: 0 },
    format: 'string',
    group: 'team',
  },
  winPct: {
    realName: 'Win %',
    simpleName: 'Win %',
    fullName: 'Winning Percentage',
    shortExplain: 'The team’s win percentage for the season.',
    extraExplain: 'Win percentage is the most direct rate stat for comparing team performance across schedules.',
    goodDirection: 'high',
    scale: { poor: 0.420, average: 0.500, great: 0.600 },
    format: 'percent',
    group: 'team',
  },
  gamesBack: {
    realName: 'GB',
    simpleName: 'GB',
    fullName: 'Games Back',
    shortExplain: 'How many games a team trails the division leader.',
    extraExplain: 'GB shows how far away a team is from first place in the division race.',
    goodDirection: 'low',
    scale: { poor: 10, average: 5, great: 0 },
    format: 'decimal1',
    group: 'team',
  },
  streak: {
    realName: 'Streak',
    simpleName: 'Streak',
    fullName: 'Current Streak',
    shortExplain: 'The team’s current win/loss streak.',
    extraExplain: 'Streaks are a quick way to see whether a team is hot or cooling off.',
    goodDirection: 'high',
    scale: { poor: -6, average: 0, great: 6 },
    format: 'string',
    group: 'team',
  },
  lastTen: {
    realName: 'Last 10',
    simpleName: 'Last 10',
    fullName: 'Last 10 Games',
    shortExplain: 'The team’s record in its most recent 10 games.',
    extraExplain: 'Last 10 gives a short-term snapshot of how a team is trending.',
    goodDirection: 'high',
    scale: { poor: 2, average: 5, great: 8 },
    format: 'string',
    group: 'team',
  },
  runsScored: {
    realName: 'RS',
    simpleName: 'RS',
    fullName: 'Runs Scored',
    shortExplain: 'Total runs scored by the team.',
    extraExplain: 'Runs scored gauges a team’s offensive strength over the season.',
    goodDirection: 'high',
    scale: { poor: 450, average: 600, great: 700 },
    format: 'integer',
    group: 'team',
  },
  k_pct: {
    realName: 'K%',
    simpleName: 'K%',
    fullName: 'Strikeout Rate',
    shortExplain: 'How often a pitcher strikes batters out, as a share of all plate appearances.',
    extraExplain: 'K% is cleaner than K/9 because it is based on batters faced instead of innings.',
    goodDirection: 'high',
    scale: { poor: 18, average: 22, great: 28 },
    format: 'percent',
    group: 'pitching',
  },
  bb_pct: {
    realName: 'BB%',
    simpleName: 'BB%',
    fullName: 'Walk Rate',
    shortExplain: 'How often a pitcher walks batters; lower usually means better control.',
    extraExplain: 'A low BB% lets pitchers survive even when contact quality is not perfect.',
    goodDirection: 'low',
    scale: { poor: 10, average: 8, great: 5 },
    format: 'percent',
    group: 'pitching',
  },
  war_pitching: {
    realName: 'JWinsP',
    simpleName: 'JWinsP',
    fullName: 'JWinsP (custom pitching Wins Above Replacement)',
    shortExplain: 'A site-specific pitching stat that attempts to quantify a pitcher’s value in wins added to the team.',
    extraExplain: "This is PlainStats' own formula, not a published sabermetric source (MLB's own API doesn't publish WAR at all) — treat it as this site's house stat, not an official number.",
    goodDirection: 'high',
    scale: { poor: 0.5, average: 2.0, great: 4.5 },
    format: 'decimal1',
    group: 'pitching',
  },

  // --- fielding ------------------------------------------------------------------
  // Every field below except rangeFactor comes straight from the MLB Stats API's
  // fielding stat object — nothing derived, nothing approximated. (rangeFactor is the
  // one exception: see derivedStats.js's deriveRangeFactor.) Two fields —
  // fieldingCaughtStealing/fieldingStolenBases — get distinct keys from the hitting
  // group's own caughtStealing/stolenBases, since those mean something different here
  // (a catcher's caught-stealing defense against opposing runners, not the fielder's own
  // base-stealing) and statDictionary is one flat key space shared by every group.
  putOuts: {
    realName: 'PO',
    simpleName: 'PO',
    fullName: 'Putouts',
    shortExplain: 'Times a fielder directly recorded an out — catching a fly ball, tagging a base, or tagging a runner.',
    extraExplain: 'First basemen and catchers naturally rack up far more putouts than other positions just from routine plays, so PO is best compared within the same position.',
    goodDirection: 'high',
    scale: { poor: 50, average: 150, great: 300 },
    format: 'integer',
    group: 'fielding',
  },
  assists: {
    realName: 'A',
    simpleName: 'A',
    fullName: 'Assists',
    shortExplain: 'Times a fielder touched the ball before a teammate recorded the out, most often by throwing to another base.',
    extraExplain: 'Infielders (especially shortstops and third basemen) accumulate far more assists than outfielders or first basemen just from the nature of the position.',
    goodDirection: 'high',
    scale: { poor: 20, average: 100, great: 250 },
    format: 'integer',
    group: 'fielding',
  },
  errors: {
    realName: 'E',
    simpleName: 'E',
    fullName: 'Errors',
    shortExplain: 'Misplays that let a batter reach base or a runner advance when an average fielder would have made the play.',
    extraExplain: 'Errors are judgment calls made by an official scorer, so they can vary slightly by park and scorer.',
    goodDirection: 'low',
    scale: { poor: 15, average: 8, great: 3 },
    format: 'integer',
    group: 'fielding',
  },
  chances: {
    realName: 'TC',
    simpleName: 'TC',
    fullName: 'Total Chances',
    shortExplain: 'Every play a fielder had a chance to make: putouts plus assists plus errors.',
    extraExplain: 'TC is the denominator behind fielding percentage — more chances usually means more time on the field, not worse defense.',
    goodDirection: 'high',
    scale: { poor: 100, average: 300, great: 550 },
    format: 'integer',
    group: 'fielding',
  },
  fielding: {
    realName: 'FLD%',
    simpleName: 'FLD%',
    fullName: 'Fielding Percentage',
    shortExplain: 'The share of fielding chances handled cleanly, without an error.',
    extraExplain: "Fielding percentage rewards not messing up a play, but says nothing about a player's range — a fielder who can't reach a ball never gets charged an error for missing it.",
    goodDirection: 'high',
    scale: { poor: 0.960, average: 0.975, great: 0.990 },
    format: 'avg',
    group: 'fielding',
  },
  rangeFactor: {
    realName: 'RF/9',
    simpleName: 'RF/9',
    fullName: 'Range Factor per 9 Innings',
    shortExplain: "A site-computed rate stat: (putouts + assists) per 9 innings at the position — a rough read on how much ground a fielder covers.",
    extraExplain: "The MLB Stats API doesn't provide range factor directly, so this is derived from putouts, assists, and innings played. Like fielding percentage, it's most meaningful compared within the same position, since some positions naturally get more chances than others.",
    goodDirection: 'high',
    scale: { poor: 2.0, average: 4.0, great: 5.5 },
    format: 'decimal2',
    group: 'fielding',
  },
  innings: {
    realName: 'INN',
    simpleName: 'INN',
    fullName: 'Innings (fielding)',
    shortExplain: 'Innings played at this position, reported the same "whole.thirds" way as pitching innings (e.g. 100.1 means 100 and 1/3 innings).',
    extraExplain: 'Use INN to judge whether a fielding rate stat comes from a full season of work or a small sample.',
    goodDirection: 'high',
    scale: { poor: 200, average: 600, great: 1200 },
    format: 'decimal1',
    group: 'fielding',
  },
  fieldingCaughtStealing: {
    realName: 'CS',
    simpleName: 'CS',
    fullName: 'Caught Stealing (fielding)',
    shortExplain: 'Runners this player threw out while attempting to steal a base — almost always a catcher stat.',
    extraExplain: 'This is caught stealing on defense (throwing runners out), not the batter\'s own stolen bases.',
    goodDirection: 'high',
    scale: { poor: 5, average: 20, great: 40 },
    format: 'integer',
    group: 'fielding',
  },
  fieldingStolenBases: {
    realName: 'SB (allowed)',
    simpleName: 'SB (allowed)',
    fullName: 'Stolen Bases Allowed (fielding)',
    shortExplain: "Bases stolen against this player, almost always a catcher's caught-stealing counterpart stat.",
    extraExplain: 'Pair with Caught Stealing to judge a catcher\'s ability to control the running game — this alone can be misleading since pitchers hold runners too.',
    goodDirection: 'low',
    scale: { poor: 60, average: 30, great: 10 },
    format: 'integer',
    group: 'fielding',
  },
  passedBall: {
    realName: 'PB',
    simpleName: 'PB',
    fullName: 'Passed Balls',
    shortExplain: "A catchable pitch a catcher failed to control, letting a runner advance — a catcher-specific stat.",
    extraExplain: 'Passed balls are charged to the catcher; a similar missed pitch charged to the pitcher instead is a wild pitch.',
    goodDirection: 'low',
    scale: { poor: 8, average: 4, great: 1 },
    format: 'integer',
    group: 'fielding',
  },
  war_fielding: {
    realName: 'JWinsF',
    simpleName: 'JWinsF',
    fullName: 'JWinsF (custom fielding Wins Above Replacement)',
    shortExplain: 'A site-specific fielding WAR estimate',
    extraExplain: "This is PlainStats' own formula, not a published sabermetric source, redesigned to stop overrating first basemen and catchers — a known issue with raw putouts at those two positions (see e.g. SABR's writeup on Fielding Runs). ",
    goodDirection: 'high',
    scale: { poor: -0.5, average: 0.5, great: 2.0 },
    format: 'decimal1',
    group: 'fielding',
  },
}

// --- formatting & scoring helpers -------------------------------------------------

export function formatStatValue(statKey, value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const def = statDictionary[statKey]
  const format = def ? def.format : 'decimal2'
  const num = Number(value)

  switch (format) {
    case 'avg':
      // .000 style, no leading zero
      return num.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.')
    case 'decimal2':
      return num.toFixed(2)
    case 'decimal1':
      return num.toFixed(1)
    case 'decimal3':
      return num.toFixed(3)
    case 'percent':
      return `${num.toFixed(1)}%`
    case 'mph':
      return `${num.toFixed(1)} mph`
    case 'rpm':
      return `${Math.round(num)} rpm`
    case 'integer':
      return `${Math.round(num)}`
    case 'innings':
      return `${value}`
    case 'string':
      return `${value}`
    default:
      return `${num}`
  }
}

// Returns 'poor' | 'average' | 'great' (or null if we can't judge it / no def exists)
export function getStatQuality(statKey, value) {
  const def = statDictionary[statKey]
  if (!def || !def.scale || value === null || value === undefined || Number.isNaN(value)) return null
  const { poor, average, great } = def.scale
  const num = Number(value)

  if (def.goodDirection === 'high') {
    if (num >= great) return 'great'
    if (num >= average) return 'average'
    return 'poor'
  } else {
    if (num <= great) return 'great'
    if (num <= average) return 'average'
    return 'poor'
  }
}

// By default, excludes custom stats (see registerCustomStats below) — player profile
// pages, the comparison view, and the homepage should only ever show real, fetched stats.
// Pass includeCustom: true (only the Custom Leaderboard Builder does) to get custom stats
// blended in alongside the real ones, indistinguishable except for their `custom: true` flag.
export function getStatsByGroup(group, { includeCustom = false } = {}) {
  return Object.entries(statDictionary)
    .filter(([, def]) => def.group === group && (includeCustom || !def.custom))
    .map(([key, def]) => ({ key, ...def }))
}

// Registers custom stats (see data/customStats.js) into this dictionary so they behave
// like any other stat everywhere in the app — same checkbox list, same StatTooltip hover
// description, same header, same cell formatting — with zero special-casing needed in
// StatTable, StatTooltip, or anywhere else that already reads from statDictionary. Takes
// customStats as a param (rather than importing data/customStats.js directly) to avoid a
// circular import between the two data files; called once, from customStats.js itself,
// when that module loads.
export function registerCustomStats(customStats) {
  for (const s of customStats) {
    statDictionary[s.key] = {
      realName: s.name,
      simpleName: s.name,
      fullName: s.name,
      shortExplain: `Custom stat: ${s.formula}`,
      extraExplain: 'Defined in frontend/src/data/customStats.js — edit that file to change or add more.',
      goodDirection: s.goodDirection || 'high',
      // No `scale` — custom stats don't get a poor/average/great quality dot, since we
      // have no basis for those thresholds on a formula the site didn't design.
      format: s.format || 'decimal3',
      group: s.group,
      custom: true,
    }
  }
}

// Formats a value using an explicit format string, for callers (like custom stats) that
// don't have a statDictionary entry to look the format up from.
export function formatValueAs(format, value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const num = Number(value)
  switch (format) {
    case 'avg':
      return num.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.')
    case 'decimal2':
      return num.toFixed(2)
    case 'decimal1':
      return num.toFixed(1)
    case 'decimal3':
      return num.toFixed(3)
    case 'percent':
      return `${num.toFixed(1)}%`
    case 'integer':
      return `${Math.round(num)}`
    default:
      return `${num}`
  }
}
