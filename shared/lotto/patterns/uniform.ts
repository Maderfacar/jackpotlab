/**
 * 規律驗證 第一組：短期均勻現象（2026-10-08 使用者拍板）。
 *
 * 只用真實開獎資料本身，不引入任何機率模型或模擬：
 *   - 視窗 W 期（W = minSize..maxSize）滑過全部期數，統計視窗內每個號碼出現次數。
 *   - 「差距」= 視窗內出現最多的號碼次數 − 出現最少的號碼次數。
 *   - 「理想均勻」是純算術：球數 ÷ 號碼數，每號只差 0 或 1 次（整除時差距 0，否則 1）。
 *   - 每個 W 找出「實際資料中最均勻（差距最小）」的視窗，重疊的合併成一段，
 *     列出期數範圍與段與段之間隔了幾期 → 看是不是以固定間隔反覆出現。
 *   - 全號覆蓋：從每一期開始，要連續幾期才能讓 1～N 號全部至少出現一次。
 *
 * 只看主號（不含特別號 / 第二區，它們來自不同號碼池）。
 */

export interface UniformDrawInput {
  drawTerm: number
  drawDate: string
  numbers: number[]
}

export interface DrawSpan {
  startTerm: number
  startDate: string
  endTerm: number
  endDate: string
  /** 這段跨幾期 */
  draws: number
}

export interface UniformEpisode extends DrawSpan {
  /** 這段由幾個「達到最佳差距」的視窗重疊合併而成 */
  windows: number
}

export interface WindowSizeSummary {
  /** 視窗期數 W */
  size: number
  /** 視窗內總球數 */
  balls: number
  /** 理想均勻時每號出現次數下限 / 上限 */
  idealLow: number
  idealHigh: number
  /** 理想差距：整除 0，否則 1 */
  idealSpread: number
  /** 共掃過幾個視窗 */
  windowCount: number
  /** 達到理想差距的視窗數 */
  idealCount: number
  /** 實際資料中最小的差距 */
  bestSpread: number
  /** 達到最小差距的視窗數 */
  bestCount: number
  /** 差距 → 視窗數 */
  spreadHistogram: { spread: number, count: number }[]
  /** 最均勻的視窗（差距 = bestSpread），重疊者合併 */
  episodes: UniformEpisode[]
  /** 相鄰兩段的起始期相隔幾期 */
  episodeGaps: number[]
}

export interface CoverageSummary {
  numberMax: number
  /** 有完成全號覆蓋的起始期數（最後幾期來不及覆蓋的不算） */
  starts: number
  min: number
  median: number
  max: number
  /** 覆蓋所需期數 → 次數 */
  histogram: { draws: number, count: number }[]
  /** 覆蓋最快（= min）的區段 */
  fastest: DrawSpan[]
  /** 相鄰兩個最快區段的起始期相隔幾期 */
  fastestGaps: number[]
}

export interface UniformResult {
  numberMax: number
  ballsPerDraw: number
  drawCount: number
  firstTerm: number
  firstDate: string
  lastTerm: number
  lastDate: string
  sizes: WindowSizeSummary[]
  coverage: CoverageSummary
}

function span(draws: UniformDrawInput[], start: number, end: number): DrawSpan {
  return {
    startTerm: draws[start]!.drawTerm,
    startDate: draws[start]!.drawDate,
    endTerm: draws[end]!.drawTerm,
    endDate: draws[end]!.drawDate,
    draws: end - start + 1
  }
}

const diffs = (xs: number[]) => xs.slice(1).map((x, i) => x - xs[i]!)

function summarizeSize(draws: UniformDrawInput[], numberMax: number, ballsPerDraw: number, size: number): WindowSizeSummary {
  const balls = size * ballsPerDraw
  const idealLow = Math.floor(balls / numberMax)
  const idealSpread = balls % numberMax === 0 ? 0 : 1
  const counts = new Array<number>(numberMax + 1).fill(0)
  const spreads: number[] = []

  for (let i = 0; i < draws.length; i++) {
    for (const n of draws[i]!.numbers) counts[n]!++
    if (i >= size) {
      for (const n of draws[i - size]!.numbers) counts[n]!--
    }
    if (i >= size - 1) {
      let max = -Infinity
      let min = Infinity
      for (let n = 1; n <= numberMax; n++) {
        const c = counts[n]!
        if (c > max) max = c
        if (c < min) min = c
      }
      spreads.push(max - min)
    }
  }

  const bestSpread = spreads.length > 0 ? Math.min(...spreads) : 0
  const histogram = new Map<number, number>()
  for (const s of spreads) histogram.set(s, (histogram.get(s) ?? 0) + 1)

  // 最均勻的視窗：重疊的合併成一段
  const merged: { start: number, end: number, windows: number }[] = []
  spreads.forEach((s, start) => {
    if (s !== bestSpread) return
    const end = start + size - 1
    const last = merged.at(-1)
    if (last && start <= last.end) {
      last.end = end
      last.windows++
    } else {
      merged.push({ start, end, windows: 1 })
    }
  })

  return {
    size,
    balls,
    idealLow,
    idealHigh: idealLow + idealSpread,
    idealSpread,
    windowCount: spreads.length,
    idealCount: spreads.filter(s => s <= idealSpread).length,
    bestSpread,
    bestCount: spreads.filter(s => s === bestSpread).length,
    spreadHistogram: [...histogram.entries()].sort((a, b) => a[0] - b[0]).map(([spread, count]) => ({ spread, count })),
    episodes: merged.map(m => ({ ...span(draws, m.start, m.end), windows: m.windows })),
    episodeGaps: diffs(merged.map(m => m.start))
  }
}

function summarizeCoverage(draws: UniformDrawInput[], numberMax: number): CoverageSummary {
  const need: { start: number, draws: number }[] = []
  for (let start = 0; start < draws.length; start++) {
    const seen = new Set<number>()
    let end = start
    for (; end < draws.length && seen.size < numberMax; end++) {
      for (const n of draws[end]!.numbers) seen.add(n)
    }
    if (seen.size < numberMax) break
    need.push({ start, draws: end - start })
  }

  const values = need.map(x => x.draws).sort((a, b) => a - b)
  const min = values[0] ?? 0
  const histogram = new Map<number, number>()
  for (const v of values) histogram.set(v, (histogram.get(v) ?? 0) + 1)
  const fastest = need.filter(x => x.draws === min)

  return {
    numberMax,
    starts: need.length,
    min,
    median: values.length > 0 ? values[Math.floor(values.length / 2)]! : 0,
    max: values.at(-1) ?? 0,
    histogram: [...histogram.entries()].sort((a, b) => a[0] - b[0]).map(([d, count]) => ({ draws: d, count })),
    fastest: fastest.map(x => span(draws, x.start, x.start + x.draws - 1)),
    fastestGaps: diffs(fastest.map(x => x.start))
  }
}

/** draws 必須由舊到新排序。 */
export function analyzeUniform(
  draws: UniformDrawInput[],
  numberMax: number,
  minSize = 5,
  maxSize = 40
): UniformResult {
  const ballsPerDraw = draws[0]?.numbers.length ?? 0
  const sizes: WindowSizeSummary[] = []
  for (let size = minSize; size <= Math.min(maxSize, draws.length); size++) {
    sizes.push(summarizeSize(draws, numberMax, ballsPerDraw, size))
  }
  return {
    numberMax,
    ballsPerDraw,
    drawCount: draws.length,
    firstTerm: draws[0]?.drawTerm ?? 0,
    firstDate: draws[0]?.drawDate ?? '',
    lastTerm: draws.at(-1)?.drawTerm ?? 0,
    lastDate: draws.at(-1)?.drawDate ?? '',
    sizes,
    coverage: summarizeCoverage(draws, numberMax)
  }
}
