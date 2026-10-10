/**
 * 碰數回測：歷史上每一期開完的盤面套目前的條件，把橘色號碼（還在剩下組合裡的號碼）當作連碰的選號，
 * 用下一期實際開出的號碼結算，累計投入 / 拿回，並和「隨機選同樣顆數」的期望比較中幾顆。
 * 一期一期累加（不可變），頁面可以分批跑、不卡畫面。
 */
import type { BoardState } from '../scan/board-states'
import { failedConditions, numberInfo, runFilter, type Condition, type NumInfo } from './conditions'
import { hitsProb, settle, STARS, type PongSettings } from './pong'

export interface BacktestAcc {
  periods: number
  /** 橘色號碼顆數加總（算平均用） */
  poolSum: number
  /** 實際：下一期有 k 顆在橘色號碼裡的期數 */
  kDist: number[]
  /** 隨機選同樣顆數時，k 顆的期望期數 */
  kExpected: number[]
  cost: number[]
  payout: number[]
}

export const emptyAcc = (): BacktestAcc => ({
  periods: 0,
  poolSum: 0,
  kDist: [0, 0, 0, 0, 0, 0],
  kExpected: [0, 0, 0, 0, 0, 0],
  cost: STARS.map(() => 0),
  payout: STARS.map(() => 0)
})

/** 把一期加進累計：state = 這期開完的盤面、prevNums = 這期開出、nextDraw = 下一期開出 */
export function addPeriod(acc: BacktestAcc, conds: Condition[], state: BoardState, prevNums: number[], nextDraw: number[], st: PongSettings): BacktestAcc {
  const { counts } = runFilter(conds, numberInfo(state), prevNums, 0)
  const pool = counts.flatMap((c, n) => (c > 0 ? [n] : []))
  const r = settle(pool.map(n => [n]), nextDraw, st)
  return {
    periods: acc.periods + 1,
    poolSum: acc.poolSum + pool.length,
    kDist: acc.kDist.map((v, k) => v + (k === r.drawnIn ? 1 : 0)),
    kExpected: acc.kExpected.map((v, k) => v + hitsProb(pool.length, k)),
    cost: acc.cost.map((v, i) => v + r.stars[i]!.cost),
    payout: acc.payout.map((v, i) => v + r.stars[i]!.payout)
  }
}

/**
 * 歷史上「下一期實際開出的 5 顆」有幾期全部條件都通過（不用列舉組合，很快）。
 * hitAt = 通過的那幾期（下一期）的索引。下一期有號碼不在盤面上（超過 60 期沒開）的期別不算。
 */
export function passHistory(conds: Condition[], states: BoardState[], draws: number[][], from: number): { n: number, hit: number, hitAt: number[] } {
  let n = 0
  const hitAt: number[] = []
  for (let s = from; s < draws.length - 1; s++) {
    const info = numberInfo(states[s]!)
    const combo = draws[s + 1]!.map(x => info.get(x)).filter((x): x is NumInfo => !!x)
    if (combo.length !== 5) continue
    n++
    if (failedConditions(conds, combo, draws[s]!).length === 0) hitAt.push(s + 1)
  }
  return { n, hit: hitAt.length, hitAt }
}
