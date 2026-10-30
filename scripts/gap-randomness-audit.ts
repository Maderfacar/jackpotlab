/**
 * 隔期容器亂數檢定（2026-10-29 使用者：用 2007 至今的開獎紀錄驗證隔期、隔期值、位置有沒有規律，結果要能被驗證、不能掰）。
 *
 * 方向照使用者的「容器」觀念（算法同 shared/lotto/patterns/features.ts，腳本會逐期比對確認一致）：
 * - 隔期：每個隔期格是一個容器，裝著隔了那麼多期還沒再開出的號碼；一顆獎號的隔期 = 它從第幾格出來。
 * - 值：這個容器位置連續幾期沒開出獎號（打中歸 0，沒打中 +1，值留在位置上不跟號碼走）。
 * - 位置：x = 來源容器當時剩幾顆，y = 這顆在那個容器裡由小到大排第幾。
 * 所有統計都在容器、隔期配置、隔期和、值、位置上算，不看號碼本身。
 *
 * 怎麼判斷「有沒有規律」：用同樣的開獎日跑 SIMS 次公平開獎（每期 39 取 5、跟過去無關），
 * 用同一套容器算法算出同樣的統計；p = 模擬裡跟實際一樣偏或更偏的比例。種子固定，重跑結果一模一樣。
 * 另外跑三組對照（一組公平、兩組故意埋規律），確認這些檢定真的抓得到規律。
 *
 * 用法：node --import tsx scripts/gap-randomness-audit.ts
 * 輸出：docs/gap-randomness-audit.md
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { computeFeatures } from '../shared/lotto/patterns/features'
import type { HistoryFile } from '../shared/lotto/history-file'
import { BALLS, FAIR, PICK, SLOTS, firstBoard, mulberry32, nextBoard, simulate, slotOf } from './lib/container-sim'
import type { Board, Rule } from './lib/container-sim'

const SRC = 'public/data/lotto539-history.json'
const OUT = 'docs/gap-randomness-audit.md'
/** 前 60 期容器還沒裝滿，不算 */
const BURN_IN = SLOTS
const SIMS = 200
const SEED = 20261029
const SPLIT_YEAR = '2024'
const VALUE_BUCKETS = [
  { label: '0', max: 0 },
  { label: '1～2', max: 2 },
  { label: '3～5', max: 5 },
  { label: '6～9', max: 9 },
  { label: '10+', max: Number.POSITIVE_INFINITY }
] as const
/** 埋規律 A：容器值 ≥ 6 的號碼，被抽中的權重 */
const PLANT_VALUE = { min: 6, weight: 1.3 }
/** 埋規律 B：這段時間內，隔期 0～5 容器裡的號碼權重 */
const PLANT_SEG = { from: '2015-01-01', to: '2016-12-31', weight: 1.25 }

const RULE_VALUE: Rule = (slot, value) => (slot >= 0 && value >= PLANT_VALUE.min ? PLANT_VALUE.weight : 1)
const RULE_SEGMENT: Rule = (slot, _v, date) => (slot >= 0 && slot <= 5 && date >= PLANT_SEG.from && date <= PLANT_SEG.to ? PLANT_SEG.weight : 1)

// ── 從一段紀錄算出每期的隔期、值、位置 ─────────────────────────

interface DrawObs {
  date: string
  /** 五顆（升序）各自來自第幾格；有一顆不在 60 格內則四項都是 null */
  gaps: number[] | null
  values: number[] | null
  xs: number[] | null
  ys: number[] | null
}

interface SlotCell {
  /** 這種容器出現幾次（每期每格算一次） */
  n: number
  /** 實際被打中幾次 */
  hits: number
  /** 照剩幾顆算，公平開獎應該被打中幾次 */
  exp: number
}

interface Observed {
  obs: DrawObs[]
  /** [剩幾顆 1～5][值分組] */
  cells: SlotCell[][]
  /** [x 1～5][y 1～5] 開出的顆數 */
  yCounts: number[][]
}

const choose = (n: number, k: number): number => {
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return r
}
/** 裝 c 顆的容器，這期至少被打中一顆的機率（公平開獎） */
const hitProb = (c: number): number => 1 - choose(BALLS - c, PICK) / choose(BALLS, PICK)
const valueBucket = (v: number): number => VALUE_BUCKETS.findIndex(b => v <= b.max)

function observe(dates: string[], draws: number[][]): Observed {
  const obs: DrawObs[] = []
  const cells = Array.from({ length: PICK + 1 }, () => VALUE_BUCKETS.map((): SlotCell => ({ n: 0, hits: 0, exp: 0 })))
  const yCounts = Array.from({ length: PICK + 1 }, () => new Array<number>(PICK + 1).fill(0))
  let board: Board | null = null
  draws.forEach((nums, t) => {
    const b = board
    if (!b) {
      obs.push({ date: dates[t]!, gaps: null, values: null, xs: null, ys: null })
      board = firstBoard(nums)
      return
    }
    const at = slotOf(b)
    const gaps = nums.map(x => at[x]!)
    const ok = gaps.every(g => g >= 0)
    obs.push(ok
      ? { date: dates[t]!, gaps, values: gaps.map(g => b.values[g]!), xs: gaps.map(g => b.slots[g]!.length), ys: nums.map((x, k) => b.slots[gaps[k]!]!.indexOf(x) + 1) }
      : { date: dates[t]!, gaps: null, values: null, xs: null, ys: null })
    if (t >= BURN_IN) tally(b, nums, cells)
    const cur = obs.at(-1)!
    if (t >= BURN_IN && isFull(cur)) {
      cur.xs.forEach((x, k) => {
        yCounts[x]![cur.ys[k]!]! += 1
      })
    }
    board = nextBoard(b, nums)
  })
  return { obs, cells, yCounts }
}

function tally(b: Board, nums: number[], cells: SlotCell[][]): void {
  const drawn = new Set(nums)
  b.slots.forEach((s, i) => {
    if (!s.length) return
    const cell = cells[Math.min(s.length, PICK)]![valueBucket(b.values[i]!)]!
    cell.n += 1
    cell.hits += s.some(x => drawn.has(x)) ? 1 : 0
    cell.exp += hitProb(s.length)
  })
}

// ── 統計 ─────────────────────────────────────────────────

const seg = (g: number): 0 | 1 | 2 => (g <= 5 ? 0 : g <= 9 ? 1 : 2)
function shapeOf(gaps: number[]): [number, number, number] {
  const s: [number, number, number] = [0, 0, 0]
  for (const g of gaps) s[seg(g)] += 1
  return s
}
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
const sumOf = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)

/** 各組平均跟整體平均差多少（加權平方和 ÷ 整體變異）；組間沒差時約等於組數 − 1 */
function groupSpread(pairs: [string, number][]): number {
  const all = pairs.map(p => p[1])
  const m = mean(all)
  const v = mean(all.map(x => (x - m) ** 2))
  const groups = new Map<string, number[]>()
  for (const [k, x] of pairs) groups.set(k, [...(groups.get(k) ?? []), x])
  let s = 0
  for (const xs of groups.values()) s += xs.length * (mean(xs) - m) ** 2
  return s / v
}

/** 列聯表卡方：上一期分類 × 下一期分類 */
function contingency(pairs: [number, number][], size: number): number {
  const t = Array.from({ length: size }, () => new Array<number>(size).fill(0))
  for (const [a, b] of pairs) t[a]![b]! += 1
  const rows = t.map(sumOf)
  const cols = t[0]!.map((_, j) => sumOf(t.map(r => r[j]!)))
  let chi = 0
  t.forEach((r, i) => r.forEach((o, j) => {
    const e = (rows[i]! * cols[j]!) / pairs.length
    if (e > 0) chi += (o - e) ** 2 / e
  }))
  return chi
}

/** 容器的值有沒有影響被打中：每種（剩幾顆 × 值分組）實際打中 vs 照剩幾顆算的應該，差的平方和 */
function slotChi(cells: SlotCell[][]): number {
  let chi = 0
  for (const c of cells.flat()) {
    if (c.exp < 5) continue
    const p = c.exp / c.n
    chi += (c.hits - c.exp) ** 2 / (c.n * p * (1 - p))
  }
  return chi
}

/** 位置 y 在同一個 x 底下是不是平均：x = 2～5 各自跟 1/x 比 */
function yChi(yCounts: number[][]): number {
  let chi = 0
  for (let x = 2; x <= PICK; x++) {
    const total = sumOf(yCounts[x]!)
    if (!total) continue
    for (let y = 1; y <= x; y++) chi += (yCounts[x]![y]! - total / x) ** 2 / (total / x)
  }
  return chi
}

type FullObs = DrawObs & { gaps: number[], values: number[], xs: number[], ys: number[] }
const isFull = (o: DrawObs | undefined): o is FullObs => o?.gaps != null

/** 條件成立的下一期 → 比例，減掉所有下一期的比例 */
function ruleDiff(obs: DrawObs[], cond: (i: number) => boolean | null, hit: (next: FullObs) => number[]): number {
  let onN = 0
  let onHit = 0
  let allN = 0
  let allHit = 0
  for (let i = BURN_IN + 1; i < obs.length - 1; i++) {
    const next = obs[i + 1]
    const c = cond(i)
    if (!isFull(next) || c == null) continue
    const hits = hit(next)
    allN += hits.length
    allHit += sumOf(hits)
    if (c) {
      onN += hits.length
      onHit += sumOf(hits)
    }
  }
  return onN ? onHit / onN - allHit / allN : 0
}

const hotCat = (h: number): number => Math.min(3, Math.max(0, h - 1))
const y1Cat = (c: number): number => Math.min(3, Math.max(0, c - 2))
const sum5Key = (s: number): string => String(Math.min(17, Math.max(12, s)))

function sequenceStats(obs: DrawObs[]): Record<string, number> {
  const serial: [number, number][] = []
  const ySerial: [number, number][] = []
  const sum5Mid: [string, number][] = []
  const sum5Far: [string, number][] = []
  for (let i = BURN_IN + 4; i < obs.length - 1; i++) {
    const last5 = [0, 1, 2, 3, 4].map(k => obs[i - k])
    const next = obs[i + 1]
    if (!isFull(next) || !last5.every(isFull)) continue
    const sh = shapeOf(next.gaps)
    const nowHot = shapeOf(last5[0]!.gaps)[0]
    serial.push([hotCat(nowHot), hotCat(sh[0])])
    ySerial.push([y1Cat(last5[0]!.ys.filter(y => y === 1).length), y1Cat(next.ys.filter(y => y === 1).length)])
    const key = sum5Key(sumOf(last5.map(o => shapeOf(o.gaps)[0])))
    sum5Mid.push([key, sh[1]])
    sum5Far.push([key, sh[2]])
  }
  return { serial: contingency(serial, 4), ySerial: contingency(ySerial, 4), sum5Mid: groupSpread(sum5Mid), sum5Far: groupSpread(sum5Far) }
}

function altRate(obs: DrawObs[]): number {
  const sums = obs.map(o => (o.gaps ? sumOf(o.gaps) : null))
  let alt = 0
  let n = 0
  for (let i = BURN_IN + 2; i < obs.length; i++) {
    const [a, b, c] = [sums[i - 2], sums[i - 1], sums[i]]
    if (a == null || b == null || c == null || a === b || b === c) continue
    n += 1
    alt += (b > a) !== (c > b) ? 1 : 0
  }
  return alt / n
}

function computeStats(dates: string[], draws: number[][]): Record<string, number> {
  const { obs, cells, yCounts } = observe(dates, draws)
  const live = obs.slice(BURN_IN).filter(isFull)
  const valueLow = (i: number): boolean | null => (isFull(obs[i]) ? sumOf(obs[i]!.values!) < 10 : null)
  // 同一球位連 2 期隔期 > 5：逐球位看，用 hit 回傳該球位下一期是否落在 0～5
  const posPairs = (i: number): boolean[] | null => {
    const a = obs[i - 1]
    const b = obs[i]
    return isFull(a) && isFull(b) ? a.gaps.map((g, k) => g > 5 && b.gaps[k]! > 5) : null
  }
  return {
    slot: slotChi(cells),
    hot: mean(live.map(o => shapeOf(o.gaps)[0])),
    ...sequenceStats(obs),
    alt: altRate(obs),
    valueRule: ruleDiff(obs, valueLow, next => [next.values.some(v => v > 10) ? 1 : 0]),
    posRule: posRuleDiff(obs, posPairs),
    y: yChi(yCounts),
    monthHot: groupSpread(live.map(o => [o.date.slice(0, 7), shapeOf(o.gaps)[0]])),
    monthGapSum: groupSpread(live.map(o => [o.date.slice(0, 7), sumOf(o.gaps)])),
    monthY1: groupSpread(live.map(o => [o.date.slice(0, 7), o.ys.filter(y => y === 1).length]))
  }
}

/** 同一球位連 2 期隔期 > 5 → 下一期那個球位落在 0～5 的比例 − 所有球位平常落在 0～5 的比例 */
function posRuleDiff(obs: DrawObs[], pairs: (i: number) => boolean[] | null): number {
  let onN = 0
  let onHit = 0
  let allN = 0
  let allHit = 0
  for (let i = BURN_IN + 1; i < obs.length - 1; i++) {
    const p = pairs(i)
    const next = obs[i + 1]
    if (!p || !isFull(next)) continue
    next.gaps.forEach((g, k) => {
      const hot = g <= 5 ? 1 : 0
      allN += 1
      allHit += hot
      if (p[k]) {
        onN += 1
        onHit += hot
      }
    })
  }
  return onN ? onHit / onN - allHit / allN : 0
}

interface StatDef {
  id: string
  group: '隔期' | '值' | '位置' | '按時間切'
  name: string
  /** 'upper' = 越大越有規律；'two' = 偏高偏低都算 */
  side: 'upper' | 'two'
  fmt: (x: number) => string
}

const f1 = (x: number): string => x.toFixed(1)
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`
const pts = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)} 點`

const STATS: StatDef[] = [
  { id: 'hot', group: '隔期', name: '每期幾顆來自 0～5（整體平均）', side: 'two', fmt: x => x.toFixed(3) },
  { id: 'serial', group: '隔期', name: '這期 0～5 幾顆 → 下期 0～5 幾顆', side: 'upper', fmt: f1 },
  { id: 'sum5Mid', group: '隔期', name: '過去 5 期 0～5 合計 → 下期 6～9 幾顆', side: 'upper', fmt: f1 },
  { id: 'sum5Far', group: '隔期', name: '過去 5 期 0～5 合計 → 下期 10+ 幾顆', side: 'upper', fmt: f1 },
  { id: 'alt', group: '隔期', name: '隔期和大小交替的比例', side: 'two', fmt: pct },
  { id: 'posRule', group: '隔期', name: '同一球位連 2 期隔期 > 5 → 下期該球位 0～5', side: 'two', fmt: pts },
  { id: 'slot', group: '值', name: '容器的值 → 會不會被打中（同樣剩幾顆比）', side: 'upper', fmt: f1 },
  { id: 'valueRule', group: '值', name: '值和 < 10 → 下期有單顆值 > 10', side: 'two', fmt: pts },
  { id: 'y', group: '位置', name: '同一個 x 底下，y 是不是平均', side: 'upper', fmt: f1 },
  { id: 'ySerial', group: '位置', name: '這期 y=1 幾顆 → 下期 y=1 幾顆', side: 'upper', fmt: f1 },
  { id: 'monthHot', group: '按時間切', name: '按月：0～5 顆數', side: 'upper', fmt: x => x.toFixed(0) },
  { id: 'monthGapSum', group: '按時間切', name: '按月：隔期和', side: 'upper', fmt: x => x.toFixed(0) },
  { id: 'monthY1', group: '按時間切', name: '按月：y=1 顆數', side: 'upper', fmt: x => x.toFixed(0) }
]

function pValue(def: StatDef, x: number, sims: number[]): number {
  const m = mean(sims)
  const extreme = def.side === 'upper' ? sims.filter(s => s >= x).length : sims.filter(s => Math.abs(s - m) >= Math.abs(x - m) - 1e-12).length
  return (1 + extreme) / (sims.length + 1)
}

function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!
}

// ── 主程式 ────────────────────────────────────────────────

const raw = readFileSync(SRC)
const file = JSON.parse(raw.toString('utf8')) as HistoryFile
const sha = createHash('sha256').update(raw).digest('hex')
const dates = file.rows.map(r => r[1])
const draws = file.rows.map(r => [...r[2]].sort((a, b) => a - b))

/** 逐期比對：這支腳本的容器算法 vs 頁面用的 computeFeatures */
function engineCheck(): { same: number, total: number } {
  const ref = computeFeatures(draws)
  const mine = observe(dates, draws).obs
  let same = 0
  ref.forEach((f, t) => {
    const o = mine[t]!
    const eq = (a: (number | null)[], b: number[] | null): boolean => (b ? a.every((x, k) => x === b[k]) : a.every(x => x == null) || a.some(x => x == null))
    if (eq(f.gaps, o.gaps) && eq(f.values, o.values) && eq(f.xs, o.xs) && eq(f.ys, o.ys)) same += 1
  })
  return { same, total: ref.length }
}

const started = Date.now()
const check = engineCheck()
const real = computeStats(dates, draws)
const rng = mulberry32(SEED)
const nullRuns = Array.from({ length: SIMS }, () => computeStats(dates, simulate(dates, rng, FAIR)))
const controls = [
  { name: '對照：公平', stats: computeStats(dates, simulate(dates, rng, FAIR)) },
  { name: `對照：埋值（值 ≥ ${PLANT_VALUE.min} 的容器 ×${PLANT_VALUE.weight}）`, stats: computeStats(dates, simulate(dates, rng, RULE_VALUE)) },
  { name: `對照：埋時段（${PLANT_SEG.from.slice(0, 4)}～${PLANT_SEG.to.slice(0, 4)} 隔期 0～5 ×${PLANT_SEG.weight}）`, stats: computeStats(dates, simulate(dates, rng, RULE_SEGMENT)) }
]
const simsOf = (id: string): number[] => nullRuns.map(r => r[id]!)
const fmtP = (p: number): string => (p <= 1 / (SIMS + 1) + 1e-9 ? `< ${(2 / (SIMS + 1)).toFixed(3)}` : p.toFixed(3))
const mark = (p: number): string => (p < 0.01 ? `**${fmtP(p)}**` : fmtP(p))

// ── 報告 ─────────────────────────────────────────────────

function summaryTable(): string[] {
  const head = `| 方向 | 項目 | 實際 | 公平開獎 95% 範圍 | 實際的 p | ${controls.map(c => c.name).join(' | ')} |`
  const sep = `|${'---|'.repeat(5 + controls.length)}`
  const rows = STATS.map((d) => {
    const s = simsOf(d.id)
    const range = `${d.fmt(quantile(s, 0.025))} ～ ${d.fmt(quantile(s, 0.975))}`
    const ctrl = controls.map(c => mark(pValue(d, c.stats[d.id]!, s))).join(' | ')
    return `| ${d.group} | ${d.name} | ${d.fmt(real[d.id]!)} | ${range} | ${mark(pValue(d, real[d.id]!, s))} | ${ctrl} |`
  })
  return [head, sep, ...rows]
}

function slotTable(cells: SlotCell[][]): string[] {
  const rows = VALUE_BUCKETS.map((b, vb) => {
    const c = cells.slice(1).map(r => r[vb]!)
    const n = sumOf(c.map(x => x.n))
    const hits = sumOf(c.map(x => x.hits))
    const exp = sumOf(c.map(x => x.exp))
    return `| ${b.label} | ${n.toLocaleString()} | ${hits.toLocaleString()} | ${exp.toFixed(0)} | ${(hits / exp).toFixed(3)} |`
  })
  return ['| 容器的值 | 這種容器出現幾次 | 實際被打中 | 照剩幾顆算應該 | 實際 ÷ 應該 |', '|---|---|---|---|---|', ...rows]
}

function yTable(yCounts: number[][]): string[] {
  const rows: string[] = []
  for (let x = 2; x <= PICK; x++) {
    const total = sumOf(yCounts[x]!)
    const cells = Array.from({ length: PICK }, (_, k) => (k < x ? `${yCounts[x]![k + 1]}（${(total / x).toFixed(0)}）` : '—'))
    rows.push(`| x=${x} | ${total.toLocaleString()} | ${cells.join(' | ')} |`)
  }
  return ['| 來源容器剩幾顆 | 開出幾顆 | y=1 | y=2 | y=3 | y=4 | y=5 |', '|---|---|---|---|---|---|---|', ...rows]
}

function sum15Table(obs: DrawObs[]): string[] {
  const groups = { before: { label: `2007～${Number(SPLIT_YEAR) - 1}`, on: [] as number[][], all: [] as number[][] }, after: { label: `${SPLIT_YEAR} 以來`, on: [] as number[][], all: [] as number[][] } }
  for (let i = BURN_IN + 4; i < obs.length - 1; i++) {
    const last5 = [0, 1, 2, 3, 4].map(k => obs[i - k])
    const next = obs[i + 1]
    if (!isFull(next) || !last5.every(isFull)) continue
    const g = next.date >= SPLIT_YEAR ? groups.after : groups.before
    const sh = shapeOf(next.gaps)
    g.all.push(sh)
    if (sumOf(last5.map(o => shapeOf(o.gaps)[0])) === 15) g.on.push(sh)
  }
  const avg = (xs: number[][], k: number): string => mean(xs.map(s => s[k]!)).toFixed(2)
  const rows = Object.values(groups).flatMap(g => [
    `| ${g.label} | 合計 = 15 之後（${g.on.length} 次） | ${avg(g.on, 0)} | ${avg(g.on, 1)} | ${avg(g.on, 2)} |`,
    `| ${g.label} | 平常（${g.all.length} 期） | ${avg(g.all, 0)} | ${avg(g.all, 1)} | ${avg(g.all, 2)} |`
  ])
  return ['| 期間 | 情況 | 下期 0～5 | 下期 6～9 | 下期 10+ |', '|---|---|---|---|---|', ...rows]
}

function spotCheck(obs: DrawObs[]): string[] {
  const t = obs.length - 1
  const o = obs[t]!
  const nums = draws[t]!
  const rows = nums.map((x, k) => {
    let prev = t - 1
    while (prev >= 0 && !draws[prev]!.includes(x)) prev -= 1
    const where = prev >= 0 ? `${file.rows[prev]![0]}（${file.rows[prev]![1]}）` : '—'
    return `| ${String(x).padStart(2, '0')} | ${o.gaps?.[k] ?? '—'} | ${o.values?.[k] ?? '—'} | ${o.xs?.[k] ?? '—'} | ${o.ys?.[k] ?? '—'} | ${where} |`
  })
  return [
    `最後一期 ${file.rows[t]![0]}（${file.rows[t]![1]}）開出 ${nums.map(x => String(x).padStart(2, '0')).join(' ')}。`,
    '「隔期」應該等於「這期跟上次開出之間隔了幾期」，可以拿台彩官網的開獎紀錄對。',
    '',
    '| 號碼 | 隔期 | 值 | x | y | 上次開出 |',
    '|---|---|---|---|---|---|',
    ...rows
  ]
}

const detail = observe(dates, draws)
const seconds = ((Date.now() - started) / 1000).toFixed(0)
const report = [
  '# 隔期、值、位置的亂數檢定',
  '',
  '由 `scripts/gap-randomness-audit.ts` 產生，任何人重跑都會得到一模一樣的數字。',
  '',
  '## 資料與重跑',
  '',
  `- 資料：\`${SRC}\`，${file.count} 期，${file.rows[0]![0]}（${file.rows[0]![1]}）～ ${file.lastTerm}（${file.lastDate}）`,
  `- 檔案 SHA-256：\`${sha}\`（檔案內容變了這串就會變）`,
  `- 重跑：\`node --import tsx scripts/gap-randomness-audit.ts\`（亂數種子 ${SEED}、公平模擬 ${SIMS} 次，約 ${seconds} 秒）`,
  `- 算法核對：腳本的容器算法跟頁面用的 \`computeFeatures\` 逐期比對隔期、值、x、y，**${check.same} / ${check.total} 期一致**`,
  `- 前 ${BURN_IN} 期容器還沒裝滿，不算。`,
  '',
  '## 怎麼讀',
  '',
  `- 「公平開獎」＝每期 39 取 5、跟過去完全無關。用同樣的開獎日跑 ${SIMS} 次，每次都用同一套容器算法算出同樣的項目。`,
  '- **p** ＝ 這些公平模擬裡，跟實際一樣偏、或更偏的比例。p 很小（< 0.01，粗體）＝ 公平開獎很難做出這麼偏的結果，代表那一項真的有規律。',
  '- 右邊三欄是對照組：同樣的檢定拿去跑一段公平模擬、兩段故意埋了規律的模擬。埋了規律的那欄 p 變很小，代表這項檢定抓得到那種規律。',
  '',
  '## 總表',
  '',
  ...summaryTable(),
  '',
  '## 值：同樣剩幾顆的容器，值高值低被打中的次數',
  '',
  '公平開獎下，一個容器會不會被打中只跟它剩幾顆有關（剩 c 顆 → 1 − C(39−c,5)/C(39,5)）。「應該」就是照這個公式加起來。',
  '',
  ...slotTable(detail.cells),
  '',
  '## 位置：同一個 x 底下，y 落在哪',
  '',
  '公平開獎下，容器被打中時裡面每顆的機會一樣，所以 y 平均分。括號裡是平均分的話應該幾顆。',
  '',
  ...yTable(detail.yCounts),
  '',
  '## 過去 5 期 0～5 合計 = 15 之後，分兩段看',
  '',
  ...sum15Table(detail.obs),
  '',
  '## 自己抽查',
  '',
  ...spotCheck(detail.obs),
  ''
].join('\n')

writeFileSync(OUT, report)
process.stdout.write(`${OUT} 已寫入（${seconds} 秒）\n`)
