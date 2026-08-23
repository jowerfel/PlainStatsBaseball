// Custom stats — the "make your own stat like a Google Sheets formula" feature.
//
// HOW TO ADD A NEW STAT
// ----------------------
// Add one entry to the CUSTOM_STATS array below. That's it — nothing else in the app
// needs to change. Each entry needs:
//
//   key         - a short unique id, letters/numbers/underscore only, e.g. 'myWeightedSlg'
//   name        - what shows up in the leaderboard builder and headers, e.g. "wSLG"
//   group       - 'hitting' or 'pitching' — which leaderboard tab it shows up on
//   formula     - a spreadsheet-style formula string, using the variable names listed
//                 below (case-insensitive). Basic math only: + - * / ( ) and numbers.
//   goodDirection - 'high' (bigger is better, default) or 'low' (smaller is better,
//                 e.g. an ERA-like stat) — this sets the DEFAULT sort direction on the
//                 leaderboard.
//   format      - (optional) how to display it: 'avg', 'decimal1', 'decimal2', 'decimal3',
//                 'percent', 'integer'. Defaults to 'decimal3'.
//
// EXAMPLE — a custom weighted slugging stat, exactly like you'd type into Google Sheets:
//
//   {
//     key: 'wSlug',
//     name: 'wSLG',
//     group: 'hitting',
//     formula: '(1B*0.44 + 2B*0.72 + 3B*1.02 + HR*1.38) / AB',
//     goodDirection: 'high',
//     format: 'decimal3',
//   },
//
// AVAILABLE VARIABLES
// --------------------
// Hitting: AB (at-bats), H (hits), 1B (singles), 2B (doubles), 3B (triples), HR (home
//   runs), R (runs), RBI, BB (walks), SO (strikeouts), SB (stolen bases), HBP, PA
//   (plate appearances), AVG, OBP, SLG, OPS
// Pitching: IP (innings pitched, as a decimal e.g. 6.1 innings = 6.33), ER (earned
//   runs), H_ALLOWED (hits allowed), BB_ALLOWED (walks allowed), K (strikeouts), HR_ALLOWED,
//   W (wins), L (losses), GS (games started), ERA, WHIP
//
// Custom stats show up in the Custom Leaderboard Builder ("Leaderboards" tab) for anyone
// using the site, for both season and career leaderboards. Per the design of this feature,
// they are NOT shown on individual player profile pages — leaderboards only.

export const CUSTOM_STATS = [
  {
    key: 'wSlug',
    name: 'wSLG',
    group: 'hitting',
    formula: '(1B*0.44 + 2B*0.72 + 3B*1.02 + HR*1.38) / AB',
    goodDirection: 'high',
    format: 'decimal3',
    shortExplain: 'A custom weighted slugging stat — an example custom stat. Edit frontend/src/data/customStats.js to change or add more.',
  },
  {
    key: 'wSlug w/ BB',
    name: 'wSlug w/ BB',
    group: 'hitting',
    formula: '(1B*0.44 + 2B*0.72 + 3B*1.02 + HR*1.38 + BB*0.29 + HBP*0.32) / PA',
    goodDirection: 'high',
    format: 'decimal3',
    shortExplain: 'A custom weighted slugging stat — an example custom stat. Edit frontend/src/data/customStats.js to change or add more.',
  },
]

// --- variable maps: formula variable name -> raw stat field returned by the backend -----
// Hitting rows come from /api/leaderboard and /api/players/:id (both merge in `singles`
// alongside the raw MLB fields), so the same variable map works for either source.
const HITTING_VARS = {
  AB: 'atBats',
  H: 'hits',
  '1B': 'singles',
  '2B': 'doubles',
  '3B': 'triples',
  HR: 'homeRuns',
  R: 'runs',
  RBI: 'rbi',
  BB: 'baseOnBalls',
  SO: 'strikeOuts',
  SB: 'stolenBases',
  HBP: 'hitByPitch',
  PA: 'plateAppearances',
  AVG: 'avg',
  OBP: 'obp',
  SLG: 'slg',
  OPS: 'ops',
}

const PITCHING_VARS = {
  IP: 'inningsPitchedDecimal',
  ER: 'earnedRuns',
  H_ALLOWED: 'hitsAllowed',
  BB_ALLOWED: 'baseOnBallsPitching',
  K: 'strikeOuts',
  HR_ALLOWED: 'homeRunsAllowed',
  W: 'wins',
  L: 'losses',
  GS: 'gamesStarted',
  ERA: 'era',
  WHIP: 'whip',
}

export function getVarMap(group) {
  return group === 'pitching' ? PITCHING_VARS : HITTING_VARS
}

export function getCustomStatsByGroup(group) {
  return CUSTOM_STATS.filter((s) => s.group === group)
}

export function getCustomStat(key) {
  return CUSTOM_STATS.find((s) => s.key === key) || null
}

export function isCustomStatKey(key) {
  return CUSTOM_STATS.some((s) => s.key === key)
}

// MLB reports innings pitched as e.g. "6.1" meaning 6 and 1/3 innings, not 6.1 decimal
// innings — the ".1"/".2" are thirds of an inning, not tenths. Converts to a true decimal
// (6.1 -> 6.333...) so formulas that divide by IP come out correct.
function inningsPitchedToDecimal(ip) {
  if (ip === null || ip === undefined || ip === '') return 0
  const str = String(ip)
  const [wholePart, thirdPart] = str.split('.')
  const whole = Number(wholePart) || 0
  const thirds = Number(thirdPart) || 0
  return whole + thirds / 3
}

// Builds the variable -> number lookup a formula needs from a raw stat row.
function buildScope(statRow, group) {
  const varMap = getVarMap(group)
  const scope = {}
  for (const [varName, sourceKey] of Object.entries(varMap)) {
    if (sourceKey === 'inningsPitchedDecimal') {
      scope[varName] = inningsPitchedToDecimal(statRow?.inningsPitched)
    } else {
      const raw = statRow?.[sourceKey]
      scope[varName] = raw === undefined || raw === null || raw === '' ? 0 : Number(raw)
    }
  }
  return scope
}

// --- tiny, safe formula parser/evaluator --------------------------------------------
// Deliberately NOT eval()/new Function() — this only ever understands numbers, the
// variable names above, +, -, *, /, parentheses, and unary minus. Anything else
// (letters that aren't a known variable, semicolons, function calls, etc.) is a parse
// error, not code that could run.

function tokenize(formula) {
  const tokens = []
  let i = 0
  const src = formula.trim()
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if ('+-*/()'.includes(ch)) {
      tokens.push({ type: ch })
      i++
      continue
    }
    if (/[0-9.]/.test(ch)) {
      // Special case: "1B", "2B", "3B" (singles/doubles/triples) look like a number
      // immediately followed by a letter — that's a variable name, not a number token
      // butted against a variable token. Detected by scanning digits first, then checking
      // whether a letter follows with no operator/space between.
      let j = i
      while (j < src.length && /[0-9.]/.test(src[j])) j++
      if (j < src.length && /[A-Za-z_]/.test(src[j])) {
        let k = j
        while (k < src.length && /[A-Za-z0-9_]/.test(src[k])) k++
        tokens.push({ type: 'var', name: src.slice(i, k).toUpperCase() })
        i = k
        continue
      }
      tokens.push({ type: 'number', value: Number(src.slice(i, j)) })
      i = j
      continue
    }
    // Variable name: letters, digits, underscore (digits allowed so "1B"/"2B"/"3B" work)
    if (/[A-Za-z0-9_]/.test(ch)) {
      let j = i
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++
      tokens.push({ type: 'var', name: src.slice(i, j).toUpperCase() })
      i = j
      continue
    }
    throw new Error(`Unexpected character "${ch}" in formula.`)
  }
  return tokens
}

// Recursive-descent parser: expr -> term (('+'|'-') term)*, term -> factor (('*'|'/') factor)*,
// factor -> number | var | '(' expr ')' | '-' factor
function parseFormula(tokens) {
  let pos = 0
  const peek = () => tokens[pos]
  const consume = (type) => {
    const t = tokens[pos]
    if (!t || t.type !== type) {
      throw new Error(`Expected "${type}" in formula.`)
    }
    pos++
    return t
  }

  function parseFactor() {
    const t = peek()
    if (!t) throw new Error('Unexpected end of formula.')
    if (t.type === 'number') {
      pos++
      return { type: 'number', value: t.value }
    }
    if (t.type === 'var') {
      pos++
      return { type: 'var', name: t.name }
    }
    if (t.type === '(') {
      consume('(')
      const node = parseExpr()
      consume(')')
      return node
    }
    if (t.type === '-') {
      pos++
      return { type: 'negate', node: parseFactor() }
    }
    throw new Error('Formula has a syntax error.')
  }

  function parseTerm() {
    let node = parseFactor()
    while (peek() && (peek().type === '*' || peek().type === '/')) {
      const op = tokens[pos].type
      pos++
      node = { type: 'binary', op, left: node, right: parseFactor() }
    }
    return node
  }

  function parseExpr() {
    let node = parseTerm()
    while (peek() && (peek().type === '+' || peek().type === '-')) {
      const op = tokens[pos].type
      pos++
      node = { type: 'binary', op, left: node, right: parseTerm() }
    }
    return node
  }

  const result = parseExpr()
  if (pos !== tokens.length) throw new Error('Formula has a syntax error.')
  return result
}

function evalNode(node, scope) {
  switch (node.type) {
    case 'number':
      return node.value
    case 'var': {
      if (!(node.name in scope)) {
        throw new Error(`Unknown variable "${node.name}" in formula.`)
      }
      return scope[node.name]
    }
    case 'negate':
      return -evalNode(node.node, scope)
    case 'binary': {
      const l = evalNode(node.left, scope)
      const r = evalNode(node.right, scope)
      switch (node.op) {
        case '+':
          return l + r
        case '-':
          return l - r
        case '*':
          return l * r
        case '/':
          return r === 0 ? null : l / r
        default:
          throw new Error('Unknown operator in formula.')
      }
    }
    default:
      throw new Error('Malformed formula.')
  }
}

// Parses a formula string once. Throws with a readable message if the formula is invalid —
// call this eagerly (e.g. when building the stat list) so a bad formula in customStats.js
// fails loudly instead of silently returning wrong numbers everywhere it's used.
export function compileFormula(formula) {
  const tokens = tokenize(formula)
  const ast = parseFormula(tokens)
  return ast
}

// Computes a custom stat's value for one row of raw stats (a leaderboard row's `stat`
// object, or a player's season/career stat object). Returns null if the underlying data
// is missing/undefined (e.g. dividing by zero AB) rather than NaN/Infinity.
export function computeCustomStat(customStat, statRow) {
  try {
    const scope = buildScope(statRow, customStat.group)
    const ast = compileFormula(customStat.formula)
    const value = evalNode(ast, scope)
    if (value === null || Number.isNaN(value) || !Number.isFinite(value)) return null
    return value
  } catch {
    return null
  }
}
