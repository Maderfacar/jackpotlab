/**
 * 選出來的號碼全部立柱、平均每期是正數的下注策略（2026-11-02 使用者）：
 *   二星 70、三星 800、四星 12,500 倍，每碰 1 元、中獎另退本金。
 *   立柱：同一個隔期格的號碼放同一柱（同柱不互碰），不同柱各取一顆組成一碰。
 *
 * 號碼來源＝blind-test.ts 每期各條件挑出的球（scripts/lib/strategy-sets.ts，每期只用開完上一期為止的資料）。
 *   單一策略：該策略挑出的球全部立柱。
 *   組合：好幾個策略挑出的球合在一起（聯集）全部立柱。從 2007～2020 平均每期最好的單一策略開始，
 *     每次加進「讓 2007～2020 平均每期增加最多」的策略，直到再加都不會增加為止（只看找的那段）。
 * 找：2007～2020；驗：2021 起原封不動照下。平均每期＝淨結果 ÷ 該段全部期數（沒下注的期算 0）。
 *
 * 用法：node --import tsx scripts/positive-columns.ts  → docs/positive-columns.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, next, rows, type Decision } from './blind-test'
import { setsOf } from './lib/strategy-sets'

const OUT = 'docs/positive-columns.md'
const SPLIT = '2021-01-01'
const ODDS: Record<number, number> = { 2: 70, 3: 800, 4: 12500 }
const KS = [2, 3, 4]
const MIN_BET_DRAWS = 100
const MAX_STEPS = 20
const SHOW = 12
const SLOT_N = 62

/** 立柱碰數：各柱顆數的基本對稱多項式 */
const esym = (sizes: number[], k: number): number => {
  const e = new Array<number>(k + 1).fill(0)
  e[0] = 1
  for (const x of sizes) for (let j = k; j >= 1; j--) e[j]! += e[j - 1]! * x
  return e[k]!
}
const slotIdx = (d: Decision, x: number): number => d.slotOf[x]! + 1
const columns = (d: Decision, balls: number[]): Map<number, number[]> => {
  const g = new Map<number, number[]>()
  for (const x of [...balls].sort((a, b) => a - b)) g.set(d.slotOf[x]!, [...(g.get(d.slotOf[x]!) ?? []), x])
  return g
}

type Period = '找' | '驗'
interface DrawCtx { d: Decision, period: Period, year: string, actual: Set<number>, sets: Map<string, number[]> }
const ctx: DrawCtx[] = allDecisions.map((d) => {
  const date = rows[d.t]![1]
  return { d, period: date < SPLIT ? '找' : '驗', year: date.slice(0, 4), actual: new Set(draws[d.t]!), sets: setsOf(d) }
})
const nDraws: Record<Period, number> = { 找: ctx.filter(c => c.period === '找').length, 驗: ctx.filter(c => c.period === '驗').length }
const names = [...new Set(ctx.flatMap(c => [...c.sets.keys()]))]

interface Tally { cost: number, back: number, bets: number, won: number, balls: number, cols: number }
const emptyTally = (): Tally => ({ cost: 0, back: 0, bets: 0, won: 0, balls: 0, cols: 0 })
interface Eval { 找: Tally, 驗: Tally, years: Map<string, number> }

/** 一期把 balls 全部立柱，下 k 星的投入、拿回 */
function settle(c: DrawCtx, balls: number[], k: number): { cost: number, back: number, cols: number } {
  const g = columns(c.d, balls)
  const sizes = [...g.values()].map(v => v.length)
  const hits = [...g.values()].map(v => v.filter(x => c.actual.has(x)).length)
  return { cost: esym(sizes, k), back: esym(hits, k) * (ODDS[k]! + 1), cols: g.size }
}

function evaluate(pick: (c: DrawCtx) => number[] | undefined, k: number): Eval {
  const r: Eval = { 找: emptyTally(), 驗: emptyTally(), years: new Map() }
  for (const c of ctx) {
    const balls = pick(c)
    if (!balls) continue
    const s = settle(c, balls, k)
    if (s.cost === 0) continue
    const t = r[c.period]
    t.cost += s.cost
    t.back += s.back
    t.bets++
    t.balls += balls.length
    t.cols += s.cols
    if (s.back > 0) t.won++
    if (c.period === '驗') r.years.set(c.year, (r.years.get(c.year) ?? 0) + s.back - s.cost)
  }
  return r
}
const per = (t: Tally, p: Period): number => (t.back - t.cost) / nDraws[p]

/**
 * 加一個策略進聯集時只動到幾柱，用「拿掉舊柱、放進新柱」更新基本對稱多項式，不必每期重算。
 * e 是 [e0..e4]；拿掉一柱 a：e'_j = e_j − a·e'_{j−1}；放進一柱 a：e_j += a·e_{j−1}（j 由大到小）。
 */
const removeCol = (e: number[], a: number): number[] => {
  const o = [1, 0, 0, 0, 0]
  for (let j = 1; j <= 4; j++) o[j] = e[j]! - a * o[j - 1]!
  return o
}
const addCol = (e: number[], a: number): number[] => {
  const o = [...e]
  for (let j = 4; j >= 1; j--) o[j]! += a * o[j - 1]!
  return o
}
interface UnionState { inSet: Uint8Array[], size: Int16Array[], hit: Int16Array[], eS: number[][], eH: number[][] }
const newState = (): UnionState => ({
  inSet: ctx.map(() => new Uint8Array(40)),
  size: ctx.map(() => new Int16Array(SLOT_N)),
  hit: ctx.map(() => new Int16Array(SLOT_N)),
  eS: ctx.map(() => [1, 0, 0, 0, 0]),
  eH: ctx.map(() => [1, 0, 0, 0, 0]),
})
/** 第 i 期把策略 name 的球加進聯集後的 (eS, eH)；apply=true 時寫回 state */
function withSet(st: UnionState, i: number, name: string, apply: boolean): { eS: number[], eH: number[] } {
  const c = ctx[i]!
  let eS = st.eS[i]!
  let eH = st.eH[i]!
  const balls = c.sets.get(name)
  if (!balls) return { eS, eH }
  const dSize = new Map<number, number>()
  const dHit = new Map<number, number>()
  for (const x of balls) {
    if (st.inSet[i]![x]) continue
    const s = slotIdx(c.d, x)
    dSize.set(s, (dSize.get(s) ?? 0) + 1)
    if (c.actual.has(x)) dHit.set(s, (dHit.get(s) ?? 0) + 1)
    if (apply) st.inSet[i]![x] = 1
  }
  for (const [s, ds] of dSize) {
    const a = st.size[i]![s]!
    const h = st.hit[i]![s]!
    const dh = dHit.get(s) ?? 0
    eS = addCol(a ? removeCol(eS, a) : eS, a + ds)
    if (dh) eH = addCol(h ? removeCol(eH, h) : eH, h + dh)
    if (apply) {
      st.size[i]![s] = a + ds
      st.hit[i]![s] = h + dh
    }
  }
  if (apply) {
    st.eS[i] = eS
    st.eH[i] = eH
  }
  return { eS, eH }
}
function netFind(st: UnionState, k: number, name: string): { net: number, bets: number } {
  let net = 0
  let bets = 0
  ctx.forEach((c, i) => {
    if (c.period !== '找') return
    const { eS, eH } = withSet(st, i, name, false)
    if (eS[k]! > 0) {
      bets++
      net += eH[k]! * (ODDS[k]! + 1) - eS[k]!
    }
  })
  return { net, bets }
}

const out: string[] = []
const fmt = (x: number): string => (x >= 0 ? '+' : '') + x.toFixed(2)
const pct = (a: number, b: number): string => (b ? (100 * a / b).toFixed(1) : '—')
const yearsText = (e: Eval): string => [...e.years.entries()].map(([y, x]) => `${y} ${x >= 0 ? '+' : ''}${Math.round(x)}`).join('、')
const posYears = (e: Eval): number => [...e.years.values()].filter(x => x > 0).length
const avg = (a: number, b: number): number => a / (b || 1)
const row = (name: string, e: Eval): string =>
  `| ${name} | ${e.找.bets} | ${avg(e.找.balls, e.找.bets).toFixed(1)} | ${avg(e.找.cols, e.找.bets).toFixed(1)} | ${avg(e.找.cost, e.找.bets).toFixed(0)} | ${pct(e.找.back, e.找.cost)}% | ${fmt(per(e.找, '找'))} | ${e.驗.bets} | ${avg(e.驗.cost, e.驗.bets).toFixed(0)} | ${e.驗.won} | ${pct(e.驗.back, e.驗.cost)}% | ${fmt(per(e.驗, '驗'))} | ${posYears(e)}/${e.years.size} | ${yearsText(e)} |`
const HEAD = '| 策略 | 找：下注期數 | 平均顆數 | 平均柱數 | 每期碰數 | 找：拿回率 | 找：平均每期 | 驗：下注期數 | 每期碰數 | 驗：中獎期數 | 驗：拿回率 | 驗：平均每期 | 驗：正的年數 | 驗：各年淨結果 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'

out.push('# 選出來的號碼全部立柱：平均每期是正數的下注策略')
out.push('')
out.push(`> 由 \`scripts/positive-columns.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期。每碰 1 元、中獎另退本金；二星 70、三星 800、四星 12,500 倍。`)
out.push(`> 立柱＝同一個隔期格的號碼放同一柱（同柱不互碰）。找：2007～2020 年 ${nDraws.找} 期；驗：2021 年起 ${nDraws.驗} 期（原封不動照下）。`)
out.push('> 平均每期＝淨結果 ÷ 該段全部期數（沒下注的期算 0）。每期挑號只用開完上一期為止的資料。')
out.push('')

const nextSets = setsOf(next)
const ticket = (balls: number[], k: number): string => {
  const g = columns(next, balls)
  const cols = [...g.entries()].sort((a, b) => a[0] - b[0]).map(([s, v]) => `隔期${s}［${v.join(' ')}］`).join(' ')
  return `${cols}（${g.size} 柱 ${balls.length} 顆，${k} 星 ${esym([...g.values()].map(v => v.length), k)} 碰）`
}
const summary: string[] = []
const sheetSummary: string[] = []

for (const k of KS) {
  out.push(`## ${k} 星（${ODDS[k]} 倍）`)
  out.push('')
  const singles = names.map(n => [n, evaluate(c => c.sets.get(n), k)] as const)
  const found = singles.filter(([, e]) => e.找.bets >= MIN_BET_DRAWS && per(e.找, '找') > 0)
  const held = found.filter(([, e]) => per(e.驗, '驗') > 0)
  out.push('### 單一策略挑出的號碼全部立柱')
  out.push('')
  out.push(`試了 ${singles.length} 種；2007～2020 平均每期正數 ${found.length} 種；2021 起也正數 ${held.length} 種。`)
  out.push('')
  out.push(HEAD)
  const rank = [...found].sort((a, b) => per(b[1].驗, '驗') - per(a[1].驗, '驗'))
  for (const [n, e] of rank.slice(0, Math.max(SHOW, held.length))) out.push(row(held.some(h => h[0] === n) ? `**${n}**` : n, e))
  out.push('')

  const st = newState()
  const chosen: string[] = []
  let cur = 0
  const steps: string[] = []
  for (let step = 0; step < MAX_STEPS; step++) {
    let best: { name: string, net: number, bets: number } | null = null
    for (const n of names) {
      if (chosen.includes(n)) continue
      const r = netFind(st, k, n)
      if (r.bets < MIN_BET_DRAWS) continue
      if (!best || r.net > best.net) best = { name: n, ...r }
    }
    if (!best || best.net <= cur) break
    const pickName = best.name
    chosen.push(pickName)
    cur = best.net
    ctx.forEach((_, i) => withSet(st, i, pickName, true))
    steps.push(`${step + 1}. 加 ${pickName} → 找：平均每期 ${fmt(cur / nDraws.找)}`)
  }
  const unionOf = (list: string[]) => (c: DrawCtx): number[] | undefined => {
    const b = [...new Set(list.flatMap(n => c.sets.get(n) ?? []))]
    return b.length ? b : undefined
  }
  const combo = evaluate(unionOf(chosen), k)
  const allPos = found.map(([n]) => n)
  const unionAll = evaluate(unionOf(allPos), k)
  out.push('### 組合：幾個策略的號碼合在一起全部立柱')
  out.push('')
  out.push('只用 2007～2020 一步一步加：')
  out.push('')
  out.push(steps.length ? steps.join('\n') : '（沒有任何組合在 2007～2020 是正數）')
  out.push('')
  out.push(HEAD)
  out.push(row(`組合（${chosen.length} 個策略）`, combo))
  out.push(row(`找的那段正數的 ${allPos.length} 個全部合在一起`, unionAll))
  out.push('')
  const nb = [...new Set(chosen.flatMap(n => nextSets.get(n) ?? []))]
  out.push(`下一期組合立柱：${nb.length >= k ? ticket(nb, k) : '這期不下'}`)
  out.push('')

  // 每個在 2007～2020 正數的策略各自一張立柱單（不合併號碼），每期把成立的單都下
  const sheets = { 找: emptyTally(), 驗: emptyTally() }
  const sheetYears = new Map<string, number>()
  for (const [, e] of found) {
    for (const p of ['找', '驗'] as const) {
      sheets[p].cost += e[p].cost
      sheets[p].back += e[p].back
    }
    for (const [y, x] of e.years) sheetYears.set(y, (sheetYears.get(y) ?? 0) + x)
  }
  const sheetEval: Eval = { ...sheets, years: sheetYears }
  out.push(`### 各自一張立柱單：2007～2020 正數的 ${found.length} 種，每期成立的都各下一張`)
  out.push('')
  out.push('| 合計 | 找：投入 | 找：拿回率 | 找：平均每期 | 驗：投入 | 驗：拿回率 | 驗：平均每期 | 驗：正的年數 | 驗：各年淨結果 |')
  out.push('|---|---|---|---|---|---|---|---|---|')
  out.push(`| ${found.length} 張單 | ${sheets.找.cost} | ${pct(sheets.找.back, sheets.找.cost)}% | ${fmt(per(sheets.找, '找'))} | ${sheets.驗.cost} | ${pct(sheets.驗.back, sheets.驗.cost)}% | ${fmt(per(sheets.驗, '驗'))} | ${posYears(sheetEval)}/${sheetEval.years.size} | ${yearsText(sheetEval)} |`)
  out.push('')
  out.push('下一期要下的單（這期條件成立的）：')
  out.push('')
  let nextCost = 0
  for (const [n, e] of [...found].sort((a, b) => per(b[1].找, '找') - per(a[1].找, '找'))) {
    const b = nextSets.get(n)
    if (!b || b.length < k) continue
    const g = columns(next, b)
    if (g.size < k) continue
    nextCost += esym([...g.values()].map(v => v.length), k)
    out.push(`- ${n}（找 ${fmt(per(e.找, '找'))}／驗 ${fmt(per(e.驗, '驗'))}）：${ticket(b, k)}`)
  }
  out.push(`- 這期 ${k} 星合計 ${nextCost} 碰`)
  out.push('')
  sheetSummary.push(`| ${k} 星 | ${found.length} 張單各自下 | ${fmt(per(sheets.找, '找'))} | ${pct(sheets.驗.back, sheets.驗.cost)}% | ${fmt(per(sheets.驗, '驗'))} | ${posYears(sheetEval)}/${sheetEval.years.size} | ${nextCost} 碰 |`)
  summary.push(`| ${k} 星 | 組合：${chosen.join('＋')} | ${fmt(per(combo.找, '找'))} | ${pct(combo.驗.back, combo.驗.cost)}% | ${fmt(per(combo.驗, '驗'))} | ${posYears(combo)}/${combo.years.size} | ${nb.length >= k ? ticket(nb, k) : '這期不下'} |`)
  for (const [n, e] of [...held].sort((a, b) => per(b[1].驗, '驗') - per(a[1].驗, '驗')).slice(0, 3)) {
    const b = nextSets.get(n)
    summary.push(`| ${k} 星 | ${n} | ${fmt(per(e.找, '找'))} | ${pct(e.驗.back, e.驗.cost)}% | ${fmt(per(e.驗, '驗'))} | ${posYears(e)}/${e.years.size} | ${b && b.length >= k ? ticket(b, k) : '這期不下'} |`)
  }
}

out.push(`## 總表與下一期（${rows[rows.length - 1]![0]} 開完後）的立柱`)
out.push('')
out.push('| 玩法 | 策略 | 找：平均每期 | 驗：拿回率 | 驗：平均每期 | 驗：正的年數 | 下一期立柱 |')
out.push('|---|---|---|---|---|---|---|')
out.push(...summary)
out.push('')
out.push('## 各自一張立柱單的合計')
out.push('')
out.push('| 玩法 | 做法 | 找：平均每期 | 驗：拿回率 | 驗：平均每期 | 驗：正的年數 | 下一期 |')
out.push('|---|---|---|---|---|---|---|')
out.push(...sheetSummary)
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
