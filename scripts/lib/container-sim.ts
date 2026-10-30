/**
 * 檢定腳本共用：固定種子亂數、照權重抽號、容器盤面、產生公平／埋規律的開獎紀錄。
 * 盤面步驟跟 shared/lotto/patterns/features.ts 的 computeFeatures 同一套（值留在格子位置、號碼往舊的方向移一格）。
 */

export const BALLS = 39
export const PICK = 5
/** 容器格數，跟 computeFeatures 預設一樣 */
export const SLOTS = 60

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** weights[x] = 號碼 x 的權重（1～39），不放回抽 5 顆 */
export function pick(weights: number[], rng: () => number): number[] {
  const w = weights.slice()
  const out: number[] = []
  for (let k = 0; k < PICK; k++) {
    let r = rng() * w.reduce((a, b) => a + b, 0)
    let x = 1
    while (x < BALLS && (w[x] === 0 || r >= w[x]!)) r -= w[x++]!
    // 浮點誤差可能停在已抽過的最後一顆，往回找還沒抽的
    while (w[x] === 0) x -= 1
    out.push(x)
    w[x] = 0
  }
  return out.sort((a, b) => a - b)
}

export interface Board {
  slots: number[][]
  values: number[]
}

/** 第一期：computeFeatures 只把號碼放進最舊的格子、不更新值 */
export function firstBoard(nums: number[]): Board {
  const slots = Array.from({ length: SLOTS }, (): number[] => [])
  slots[SLOTS - 1] = [...nums]
  return { slots, values: new Array<number>(SLOTS).fill(0) }
}

export function nextBoard(b: Board, nums: number[]): Board {
  const drawn = new Set(nums)
  const values = b.slots.map((s, i) => (s.some(x => drawn.has(x)) ? 0 : b.values[i]! + 1))
  const kept = b.slots.map(s => s.filter(x => !drawn.has(x)))
  return { slots: [[...nums], ...kept.slice(0, SLOTS - 1)], values }
}

/** 每個號碼目前在哪一格（-1 = 不在任何格） */
export function slotOf(b: Board): number[] {
  const at = new Array<number>(BALLS + 1).fill(-1)
  b.slots.forEach((s, i) => {
    for (const x of s) at[x] = i
  })
  return at
}

/**
 * 號碼在第 slot 格（-1 = 不在盤面）、那格值 value、開獎日 date、第 t 期、
 * 那格剩 x 顆、這顆在那格由小到大排第 y 時，被抽中的權重
 */
export type Rule = (slot: number, value: number, date: string, t: number, x: number, y: number) => number

export const FAIR: Rule = () => 1

export function simulate(dates: string[], rng: () => number, rule: Rule): number[][] {
  const out: number[][] = []
  let board: Board | null = null
  dates.forEach((date, t) => {
    const b = board
    const at = b ? slotOf(b) : null
    const weights = [0, ...Array.from({ length: BALLS }, (_, i) => {
      const s = at ? at[i + 1]! : -1
      const box = b && s >= 0 ? b.slots[s]! : []
      return rule(s, b && s >= 0 ? b.values[s]! : 0, date, t, box.length, box.indexOf(i + 1) + 1)
    })]
    const nums = pick(weights, rng)
    out.push(nums)
    board = b ? nextBoard(b, nums) : firstBoard(nums)
  })
  return out
}
