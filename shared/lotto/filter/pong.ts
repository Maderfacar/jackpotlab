/**
 * 碰數 / 投入 / 收益（2026-10-10 使用者拍板，地下算法）：
 *   - 二星 / 三星 / 四星各自設每碰金額（最低 1 元，0 = 不買），賠率可改（預設 70 / 800 / 12,500 倍）。
 *   - 中一碰拿回「賠率 × 每碰金額」，勾「另退本金」再加回該碰本金。
 *   - 連碰 = 每顆號碼各自一柱；立柱 = 同柱不互碰，只跟其他柱配。
 * 碰數 = 各柱顆數的基本對稱多項式 e_s；開獎後中幾碰 = 各柱開出顆數的 e_s。
 */

export type PongMode = 'chain' | 'column'

export interface PongSettings {
  mode: PongMode
  /** 連碰選的號碼 */
  nums: number[]
  /** 立柱：每柱的號碼 */
  columns: number[][]
  /** 二 / 三 / 四星每碰金額 */
  stake: number[]
  /** 二 / 三 / 四星賠率（倍） */
  odds: number[]
  /** 中獎另退本金 */
  returnStake: boolean
}

export const STARS = [2, 3, 4] as const

export const DEFAULT_PONG: PongSettings = {
  mode: 'chain',
  nums: [],
  columns: [[], []],
  stake: [1, 1, 1],
  odds: [70, 800, 12500],
  returnStake: true
}

const TOTAL = 39
const DRAWN = 5

export function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return Math.round(r)
}

/** 基本對稱多項式 e_s(xs)：從不同柱各挑一顆、湊 s 顆的方法數 */
function elementary(xs: number[], s: number): number {
  const e = new Array<number>(s + 1).fill(0)
  e[0] = 1
  for (const x of xs) {
    for (let j = s; j >= 1; j--) e[j]! += e[j - 1]! * x
  }
  return e[s]!
}

/** 設定 → 柱（連碰每顆一柱；號碼去重、空柱拿掉） */
export function toColumns(st: PongSettings): number[][] {
  if (st.mode === 'chain') return [...new Set(st.nums)].sort((a, b) => a - b).map(n => [n])
  return st.columns.map(c => [...new Set(c)].sort((a, b) => a - b)).filter(c => c.length > 0)
}

export const pongCount = (cols: number[][], s: number): number => elementary(cols.map(c => c.length), s)

/** 中一碰拿回多少（每碰 1 元時） */
const perHit = (i: number, st: PongSettings): number => (st.odds[i] ?? 0) + (st.returnStake ? 1 : 0)

export interface StarResult {
  star: number
  pong: number
  cost: number
  hits: number
  payout: number
  net: number
}

export interface Settlement {
  /** 開出的號碼有幾顆在選號裡 */
  drawnIn: number
  stars: StarResult[]
  total: { cost: number, payout: number, net: number }
}

/** 照實際開出的號碼結算 */
export function settle(cols: number[][], drawn: number[], st: PongSettings): Settlement {
  const hitPerCol = cols.map(c => c.filter(n => drawn.includes(n)).length)
  const stars = STARS.map((s, i) => {
    const stake = Math.max(0, st.stake[i] ?? 0)
    const pong = pongCount(cols, s)
    const hits = elementary(hitPerCol, s)
    const cost = pong * stake
    const payout = hits * stake * perHit(i, st)
    return { star: s, pong, cost, hits, payout, net: payout - cost }
  })
  const cost = stars.reduce((a, x) => a + x.cost, 0)
  const payout = stars.reduce((a, x) => a + x.payout, 0)
  return { drawnIn: hitPerCol.reduce((a, b) => a + b, 0), stars, total: { cost, payout, net: payout - cost } }
}

/** 選了 m 顆時，5 顆裡剛好 k 顆落在選號裡的機率（隨機開獎） */
export const hitsProb = (m: number, k: number): number => comb(m, k) * comb(TOTAL - m, DRAWN - k) / comb(TOTAL, DRAWN)

/** k 拆成幾份（由大到小），例：3 → [3] [2,1] [1,1,1] */
function partitions(k: number, max = k): number[][] {
  if (k === 0) return [[]]
  const out: number[][] = []
  for (let first = Math.min(k, max); first >= 1; first--) {
    for (const rest of partitions(k - first, first)) out.push([first, ...rest])
  }
  return out
}

/** 開出 k 顆在選號裡的所有可能落法（每柱幾顆，由大到小）；放不下回 [] */
function layouts(cols: number[][], k: number): number[][] {
  const sizes = cols.map(c => c.length).sort((a, b) => b - a)
  // 拆法由大到小對上柱子由大到小，每份都放得下才可行
  return partitions(k).filter(p => p.length <= sizes.length && p.every((x, i) => x <= sizes[i]!))
}

/** 開出 k 顆時 s 星中幾碰的最少～最多（立柱看落在哪幾柱；連碰固定）。放不下 k 顆回 null */
export function hitRange(cols: number[][], k: number, s: number): { min: number, max: number } | null {
  const vals = layouts(cols, k).map(p => elementary(p, s))
  return vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : null
}

export interface Scenario {
  k: number
  prob: number
  stars: { hitsMin: number, hitsMax: number, netMin: number, netMax: number }[]
  totalMin: number
  totalMax: number
}

/** 開出 0～5 顆在選號裡時，各星中幾碰、淨賺賠（最少～最多） */
export function scenarios(cols: number[][], st: PongSettings): Scenario[] {
  const m = cols.reduce((a, c) => a + c.length, 0)
  const out: Scenario[] = []
  for (let k = 0; k <= Math.min(DRAWN, m); k++) {
    const ls = layouts(cols, k)
    if (ls.length === 0) continue
    const perLayout = ls.map(p => STARS.map((s, i) => {
      const stake = Math.max(0, st.stake[i] ?? 0)
      const hits = elementary(p, s)
      return { hits, net: hits * stake * perHit(i, st) - pongCount(cols, s) * stake }
    }))
    const totals = perLayout.map(r => r.reduce((a, x) => a + x.net, 0))
    out.push({
      k,
      prob: hitsProb(m, k),
      stars: STARS.map((_, i) => {
        const col = perLayout.map(r => r[i]!)
        return {
          hitsMin: Math.min(...col.map(x => x.hits)),
          hitsMax: Math.max(...col.map(x => x.hits)),
          netMin: Math.min(...col.map(x => x.net)),
          netMax: Math.max(...col.map(x => x.net))
        }
      }),
      totalMin: Math.min(...totals),
      totalMax: Math.max(...totals)
    })
  }
  return out
}

/** 長期平均拿回率（隨機開獎時，每投 1 元平均拿回多少；和選幾顆、怎麼分柱無關） */
export const returnRate = (s: number, st: PongSettings): number =>
  perHit(STARS.indexOf(s as 2 | 3 | 4), st) * comb(DRAWN, s) / comb(TOTAL, s)
