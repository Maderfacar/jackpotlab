/**
 * 波段均值（2026-10-12 使用者拍板）：以「最新一期開完的盤面」為基礎，算隔期、值、位置 y 的四種均值。
 *
 * - 隔期 0～19：每格的記錄（/draws 的 record，最左最新）。目前的值 = 第一個數字（這格已幾期沒開出，還在加）；
 *   均值 = 往前已結束的 5／10／15 個數字、歷史 = 第 101 期之後開始的已結束數字。
 * - 值、位置 y：第 1～5 顆（號碼由小到大）各自一串，每期一個數字。目前的值 = 最新一期那顆；
 *   均值 = 最新一期之前的 5／10／15 期、歷史 = 第 101 期之後全部（不含最新一期）。
 * - 目前的值大於均值 → above。
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
  value: WaveRow[]
  y: WaveRow[]
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

/** 每期每顆（由小到大）的值與 y；找不到來源格（第一次出現或隔 60 期以上）為 null */
interface BallInfo {
  value: number | null
  y: number | null
}

interface Walk {
  /** 隔期格 0～19 每次開出的期序 */
  slotHits: number[][]
  balls: BallInfo[][]
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
      if (seen === undefined || i - seen - 1 >= SLOT_COUNT) return { value: null, y: null }
      const g = i - seen - 1
      hitSlots.add(g)
      const box = [...remaining.get(seen)!].sort((a, b) => a - b)
      return { value: i - 1 - (lastHit.get(g) ?? 0), y: box.indexOf(p) + 1 }
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
  return { slotHits, balls }
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

function ballRows(balls: BallInfo[][], pick: (b: BallInfo) => number | null): WaveRow[] {
  return Array.from({ length: WAVE_BALLS }, (_, b) => {
    const newest: number[] = []
    let fromWarm = 0
    for (let i = balls.length - 1; i >= 0; i--) {
      const v = pick(balls[i]![b] ?? { value: null, y: null })
      if (v === null) continue
      newest.push(v)
      if (i >= WAVE_WARM) fromWarm = newest.length
    }
    const done = newest.slice(1)
    return buildWaveRow(`第 ${b + 1} 顆`, newest[0]!, done, done.slice(0, fromWarm - 1))
  })
}

/** draws 由舊到新。期數不夠（暖機 100 期 + 至少 16 期）回 null。 */
export function computeWave(draws: AnalysisDrawInput[]): WaveResult | null {
  if (draws.length < WAVE_WARM + WAVE_RECENT + 1) return null
  const { slotHits, balls } = walk(draws)
  if (slotHits.some(h => h.length === 0)) return null
  const latest = draws.at(-1)!
  return {
    issue: String(latest.drawTerm),
    date: latest.drawDate,
    prizes: [...latest.prizes].sort((a, b) => a - b).join(','),
    gap: gapRows(slotHits, draws.length - 1),
    value: ballRows(balls, b => b.value),
    y: ballRows(balls, b => b.y)
  }
}
