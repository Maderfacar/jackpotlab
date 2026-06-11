/**
 * 賓果時段推算工具：每天 07:05 起每 5 分鐘 1 期、drawTerm 跨日遞增。
 *
 * 同日內最小 drawTerm = 該日 07:05 那期，後續用偏移量推算時分。
 * 範圍超過 0..230 視為跨日異常、回空字串（呼叫端會 fallback 不顯示時間）。
 */

export const BINGO_START_MIN = 7 * 60 + 5 // 07:05
export const BINGO_INTERVAL_MIN = 5

interface DrawLike {
  drawDate: string
  drawTerm: number
}

/** 從 draws 集合建立「每天最小 drawTerm」map，給 bingoTimeFromMap 用。 */
export function buildBingoMinTermByDate(draws: readonly DrawLike[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const d of draws) {
    const cur = m.get(d.drawDate)
    if (cur === undefined || d.drawTerm < cur) m.set(d.drawDate, d.drawTerm)
  }
  return m
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

/**
 * 推算某期的時分（HH:MM）。
 * @returns 'HH:MM' 字串；該日無基準期或 offset 超出 0..230 → 回空字串。
 */
export function bingoTimeFromMap(
  minTermByDate: Map<string, number>,
  drawDate: string,
  drawTerm: number
): string {
  const base = minTermByDate.get(drawDate)
  if (base === undefined) return ''
  const offset = drawTerm - base
  if (offset < 0 || offset > 230) return ''
  const totalMin = BINGO_START_MIN + offset * BINGO_INTERVAL_MIN
  const h = Math.floor(totalMin / 60) % 24
  const mm = totalMin % 60
  return `${pad2(h)}:${pad2(mm)}`
}
