/**
 * 波段均值（2026-10-12 使用者拍板）：以「最新一期開完的盤面」為基礎，算隔期、值、位置 y 的四種均值。
 *
 * - 隔期 0～19：每格的記錄（/draws 的 record，最左最新）。目前的值 = 第一個數字（這格已幾期沒開出，還在加）；
 *   均值 = 往前已結束的 5／10／15 個數字、歷史 = 第 101 期之後開始的已結束數字。
 * - 隔期（第 1～5 顆）、值：第 1～5 顆（號碼由小到大）各自一串，每期一個數字。目前的值 = 最新一期那顆；
 *   均值 = 最新一期之前的 5／10／15 期、歷史 = 第 101 期之後全部（不含最新一期）。
 * - 目前的值大於均值 → above。
 * - 位置 y 不用平均（看不出是 1 還是 3），改數最近 5／10／15 期與歷史 y=1、2、3、4 以上各幾次。
 * - 值盤面：同一格的號碼值一定相同，所以把盤面翻過來看「每種值有幾顆號碼帶著」。
 * - 前 100 期是盤面剛開始累積的期間，不算進歷史。
 *
 * 算法照定義直接逐期算（與 app/utils/analysis.ts processDraw 等價，但不維護越來越長的 record 字串，
 * 5,990 期 processDraw 要 5 秒多，這裡幾十毫秒）：
 *   隔期格 g = 上次開出在 g+1 期前的號碼（g < 60）；這格「開出」＝本期有號碼來自這格。
 *   值 = 來源格到上一期為止已連續幾期沒開出；y = 這顆在來源格剩餘號碼（由小到大）排第幾。
 * docs/wave/wave.json 由 processDraw 版產生、並經 Python 獨立重算核對，測試要求逐值一致。
 * scripts/wave-stats.ts 用這裡寫 docs/wave。
 */
import type { AnalysisDrawInput } from './analysis'

export const WAVE_WARM = 100
export const WAVE_GAP_SLOTS = 20
export const WAVE_BALLS = 5
export const WAVE_RECENT = 15
const LENGTHS = [5, 10, 15] as const
const SLOT_COUNT = 60

export interface WaveAvg {
  label: string
  avg: number
  above: boolean
}

export interface WaveRow {
  key: string
  current: number
  avgs: WaveAvg[]
  /** 往前已結束的數字（最新在前，最多 WAVE_RECENT 個），給人工驗證用 */
  recent: number[]
}

export interface WaveResult {
  issue: string
  date: string
  prizes: string
  gap: WaveRow[]
  /** 隔期：第 1～5 顆（號碼由小到大）各自一串 */
  gapBall: WaveRow[]
  value: WaveRow[]
  /** 位置 y：第 1～5 顆，最近 5／10／15 期與歷史裡 y=1、2、3、4 以上各幾次（平均看不出是 1 還是 3，改數次數） */
  yCounts: YCountRow[]
  /** 下一期盤面：每種值有哪幾格、幾顆號碼帶著（同一格的號碼值一定相同） */
  valueBoard: ValueGroup[]
}

/** y 分 4 類：1、2、3、4 以上 */
export const Y_BINS = ['1', '2', '3', '4+'] as const

export interface YWindow {
  label: string
  total: number
  /** y=1、2、3、4 以上各幾次 */
  counts: number[]
  /** 這一段的比例比歷史高 */
  above: boolean[]
}

export interface YCountRow {
  key: string
  /** 最新一期這顆的 y */
  latest: number
  windows: YWindow[]
}

export interface ValueGroup {
  value: number
  /** 帶這個值的隔期格（只列還有號碼的格） */
  slots: number[]
  numbers: number[]
}

const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0)

function average(label: string, current: number, part: number[]): WaveAvg {
  const total = sum(part)
  // 用整數乘法比大小，避免小數誤差
  return { label, avg: total / part.length, above: current * part.length > total }
}

/** current 與往前已結束的數字（最新在前）→ 5／10／15／歷史 四種均值 */
export function buildWaveRow(key: string, current: number, done: number[], history: number[]): WaveRow {
  return {
    key,
    current,
    avgs: [
      ...LENGTHS.map(n => average(String(n), current, done.slice(0, n))),
      average('歷史', current, history)
    ],
    recent: done.slice(0, WAVE_RECENT)
  }
}

/** 每期每顆（由小到大）的隔期、值與 y；找不到來源格（第一次出現或隔 60 期以上）為 null */
interface BallInfo {
  gap: number | null
  value: number | null
  y: number | null
}

interface Walk {
  /** 隔期格 0～19 每次開出的期序 */
  slotHits: number[][]
  balls: BallInfo[][]
  /** 號碼 → 最後開出的期序 */
  lastSeen: Map<number, number>
  /** 隔期格 → 最後一次有號碼開出的期序 */
  lastHit: Map<number, number>
}

function walk(draws: AnalysisDrawInput[]): Walk {
  const lastSeen = new Map<number, number>()
  const lastHit = new Map<number, number>()
  /** 期序 → 那期開出、到現在還沒再開的號碼 */
  const remaining = new Map<number, Set<number>>()
  const slotHits: number[][] = Array.from({ length: WAVE_GAP_SLOTS }, () => [])
  const balls: BallInfo[][] = []

  draws.forEach((d, i) => {
    const prizes = [...new Set(d.prizes)].sort((a, b) => a - b)
    const hitSlots = new Set<number>()
    balls.push(prizes.map((p) => {
      const seen = lastSeen.get(p)
      if (seen === undefined || i - seen - 1 >= SLOT_COUNT) return { gap: null, value: null, y: null }
      const g = i - seen - 1
      hitSlots.add(g)
      const box = [...remaining.get(seen)!].sort((a, b) => a - b)
      return { gap: g, value: i - 1 - (lastHit.get(g) ?? 0), y: box.indexOf(p) + 1 }
    }))
    for (const g of hitSlots) {
      lastHit.set(g, i)
      if (g < WAVE_GAP_SLOTS) slotHits[g]!.push(i)
    }
    for (const p of prizes) {
      const seen = lastSeen.get(p)
      if (seen !== undefined) remaining.get(seen)!.delete(p)
      lastSeen.set(p, i)
    }
    remaining.set(i, new Set(prizes))
  })
  return { slotHits, balls, lastSeen, lastHit }
}

function gapRows(slotHits: number[][], lastIndex: number): WaveRow[] {
  return slotHits.map((hits, k) => {
    const waits: number[] = []
    const history: number[] = []
    for (let j = hits.length - 1; j >= 1; j--) {
      const w = hits[j]! - hits[j - 1]! - 1
      waits.push(w)
      if (hits[j - 1]! >= WAVE_WARM) history.push(w)
    }
    return buildWaveRow(String(k), lastIndex - hits.at(-1)!, waits, history)
  })
}

/** 第 b 顆的每期數字（最新在前；找不到來源格的略過），fromWarm = 其中屬於第 101 期之後的個數 */
function ballSeries(balls: BallInfo[][], b: number, pick: (x: BallInfo) => number | null) {
  const newest: number[] = []
  let fromWarm = 0
  for (let i = balls.length - 1; i >= 0; i--) {
    const v = pick(balls[i]![b] ?? { gap: null, value: null, y: null })
    if (v === null) continue
    newest.push(v)
    if (i >= WAVE_WARM) fromWarm = newest.length
  }
  return { newest, fromWarm }
}

const ballKey = (b: number) => `第 ${b + 1} 顆`

function ballRows(balls: BallInfo[][], pick: (b: BallInfo) => number | null): WaveRow[] {
  return Array.from({ length: WAVE_BALLS }, (_, b) => {
    const { newest, fromWarm } = ballSeries(balls, b, pick)
    const done = newest.slice(1)
    return buildWaveRow(ballKey(b), newest[0]!, done, done.slice(0, fromWarm - 1))
  })
}

function countY(ys: number[]): number[] {
  const counts = Y_BINS.map(() => 0)
  for (const y of ys) counts[Math.min(y, Y_BINS.length) - 1]!++
  return counts
}

/** 最近 5／10／15 期（含最新一期）與歷史（第 101 期之後，含最新一期）的 y 次數；比例比歷史高 → above */
function yCountRows(balls: BallInfo[][]): YCountRow[] {
  return Array.from({ length: WAVE_BALLS }, (_, b) => {
    const { newest, fromWarm } = ballSeries(balls, b, x => x.y)
    const hist = countY(newest.slice(0, fromWarm))
    const histTotal = fromWarm
    const window = (label: string, ys: number[]): YWindow => {
      const counts = countY(ys)
      // 用整數乘法比比例，避免小數誤差
      return { label, total: ys.length, counts, above: counts.map((c, k) => c * histTotal > hist[k]! * ys.length) }
    }
    return {
      key: ballKey(b),
      latest: newest[0]!,
      windows: [
        ...LENGTHS.map(n => window(String(n), newest.slice(0, n))),
        { label: '歷史', total: histTotal, counts: hist, above: hist.map(() => false) }
      ]
    }
  })
}

/** 最新一期開完的盤面：號碼 p 下一期若開出，來自隔期 g = 下一期序 − 最後開出 − 1，值 = 那格到現在已幾期沒開出 */
function valueBoardOf(lastSeen: Map<number, number>, lastHit: Map<number, number>, nextIndex: number): ValueGroup[] {
  const groups = new Map<number, { slots: Set<number>, numbers: number[] }>()
  for (const [p, seen] of [...lastSeen.entries()].sort((a, b) => a[0] - b[0])) {
    const g = nextIndex - seen - 1
    if (g >= SLOT_COUNT) continue
    const value = nextIndex - 1 - (lastHit.get(g) ?? 0)
    const group = groups.get(value) ?? { slots: new Set<number>(), numbers: [] }
    group.slots.add(g)
    group.numbers.push(p)
    groups.set(value, group)
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([value, g]) => ({ value, slots: [...g.slots].sort((a, b) => a - b), numbers: g.numbers }))
}

/** draws 由舊到新。期數不夠（暖機 100 期 + 至少 16 期）回 null。 */
export function computeWave(draws: AnalysisDrawInput[]): WaveResult | null {
  if (draws.length < WAVE_WARM + WAVE_RECENT + 1) return null
  const { slotHits, balls, lastSeen, lastHit } = walk(draws)
  if (slotHits.some(h => h.length === 0)) return null
  const latest = draws.at(-1)!
  return {
    issue: String(latest.drawTerm),
    date: latest.drawDate,
    prizes: [...latest.prizes].sort((a, b) => a - b).join(','),
    gap: gapRows(slotHits, draws.length - 1),
    gapBall: ballRows(balls, b => b.gap),
    value: ballRows(balls, b => b.value),
    yCounts: yCountRows(balls),
    valueBoard: valueBoardOf(lastSeen, lastHit, draws.length)
  }
}
