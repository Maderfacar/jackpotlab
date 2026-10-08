/**
 * 「我的查找」盤面重建：每期開完後的隔期狀態（= 下一期開獎前看到的盤面）。
 *
 * 與 shared/lotto/patterns/features.ts 的 computeFeatures 同一套步驟（含第一期只放進最舊 slot），
 * 差別只在這裡把每期開完後的 slots / 值存成快照，讓頁面可以回看任何一期當時的盤面。
 * 一致性由 __tests__/board-states.test.ts 對 computeFeatures 逐顆驗證。
 */

export interface BoardState {
  /** slot i（隔 i 期）還沒被之後任何一期開走的號碼（升序） */
  slots: number[][]
  /** slot i 的紀錄現值（值）：這個隔期位置已連續幾期沒有號碼被開走 */
  values: number[]
}

/** draws：每期主號，由舊到新。回傳每期開完後的盤面快照。 */
export function computeBoardStates(draws: number[][], n = 60): BoardState[] {
  let slots: number[][] = Array.from({ length: n }, () => [])
  let values: number[] = new Array<number>(n).fill(0)
  let started = false
  const out: BoardState[] = []

  for (const raw of draws) {
    const prizes = [...new Set(raw)].sort((a, b) => a - b)

    if (!started) {
      // 539.htm：第一期只放進最舊的 slot，不更新值
      slots = slots.map((s, i) => (i === n - 1 ? prizes : s))
      started = true
      out.push({ slots, values })
      continue
    }

    const drawn = new Set(prizes)
    const hits = slots.map(s => s.length > 0 && s.some(x => drawn.has(x)))
    const nextValues = values.map((v, i) => (hits[i] ? 0 : v + 1))
    const remaining = slots.map((s, i) => (hits[i] ? s.filter(x => !drawn.has(x)) : s))
    // 號碼往舊的方向移一格（值留在原位置），新一期放 slot 0
    slots = [prizes, ...remaining.slice(0, n - 1)]
    values = nextValues
    out.push({ slots, values })
  }
  return out
}
