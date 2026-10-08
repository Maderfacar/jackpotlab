/**
 * 逐期特徵（隔期 / 現值 / 位置 x-y）的快速版。
 *
 * 與 app/utils/analysis.ts 的 processDraw 逐步等價（含第一期放進最舊 slot 的原始行為），
 * 只是全部用整數陣列、不產生字串，讓「打亂順序對照」可以跑上百次。
 * 對同一份資料，輸出必須和 hydrateFromDraws 的 history（periods / values / positions）一致。
 */

export interface DrawFeatures {
  /** 每顆號碼（升序）的隔期；找不到（超過 n 期或暖機中）為 null */
  gaps: (number | null)[]
  /** 來源 slot 當時的紀錄現值 */
  values: (number | null)[]
  /** 位置 x：來源 slot 當時剩餘號碼數 */
  xs: (number | null)[]
  /** 位置 y：該號在剩餘號碼（小到大）中的排位 */
  ys: (number | null)[]
}

/** draws：每期主號（任意順序），由舊到新。回傳每期特徵；第一期全為 null。 */
export function computeFeatures(draws: number[][], n = 60): DrawFeatures[] {
  let slots: number[][] = Array.from({ length: n }, () => [])
  const hasIssue: boolean[] = new Array<boolean>(n).fill(false)
  const leftValues: number[] = new Array<number>(n).fill(0)
  const out: DrawFeatures[] = []

  for (const raw of draws) {
    const prizes = [...new Set(raw)].sort((a, b) => a - b)
    const k = prizes.length

    if (!hasIssue.some(Boolean)) {
      // 539.htm：第一期只放進最舊的 slot，不計特徵
      slots[n - 1] = prizes
      hasIssue[n - 1] = true
      out.push({ gaps: new Array(k).fill(null), values: new Array(k).fill(null), xs: new Array(k).fill(null), ys: new Array(k).fill(null) })
      continue
    }

    const f: DrawFeatures = { gaps: [], values: [], xs: [], ys: [] }
    const temp = slots.map(s => s.slice())
    for (const p of prizes) {
      let found = -1
      for (let i = n - 1; i >= 0; i--) {
        if (temp[i]!.includes(p)) {
          found = i
          break
        }
      }
      if (found === -1) {
        f.gaps.push(null)
        f.values.push(null)
        f.xs.push(null)
        f.ys.push(null)
        continue
      }
      const orig = slots[found]!
      f.gaps.push(found)
      f.values.push(leftValues[found]!)
      f.xs.push(orig.length)
      f.ys.push(orig.indexOf(p) + 1)
      temp[found] = temp[found]!.filter(x => x !== p)
    }
    out.push(f)

    // step b：每個 slot 位置更新紀錄現值、扣掉本期開出的號碼
    const drawn = new Set(prizes)
    const nextSlots: number[][] = new Array(n)
    for (let i = 0; i < n; i++) {
      const s = slots[i]!
      const hit = s.length > 0 && s.some(x => drawn.has(x))
      leftValues[i] = hit ? 0 : leftValues[i]! + 1
      nextSlots[i] = hit ? s.filter(x => !drawn.has(x)) : s
    }
    // step c/d：號碼往舊的方向移一格（紀錄現值留在原位置），新一期放 slot 0
    for (let i = n - 1; i >= 1; i--) {
      slots[i] = nextSlots[i - 1]!
      hasIssue[i] = hasIssue[i - 1]!
    }
    slots[0] = prizes
    hasIssue[0] = true
    slots = slots.slice()
  }
  return out
}
