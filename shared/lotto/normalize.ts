import { GAMES, type GameId } from './games'
import type { DrawResult } from './types'

const SCHEMA_VERSION = 1
const SOURCE = 'taiwanlottery.com'

/**
 * 把 lotteryDate "2026-05-30T00:00:00" 切成 "2026-05-30"。
 * 台彩 API 統一回 ISO 8601 with T00:00:00 — 時區是台北但 API 沒標 Z，所以直接切前 10 碼最穩。
 */
function isoDate(input: string): string {
  return input.slice(0, 10)
}

/**
 * 539: drawNumberSize 已是升冪排序 5 個號碼。沒有特別號。
 */
export function normalize539(raw: Record<string, unknown>): DrawResult {
  const period = raw.period as number
  const lotteryDate = raw.lotteryDate as string
  const drawNumberSize = raw.drawNumberSize as number[]
  const drawNumberAppear = raw.drawNumberAppear as number[]

  validateNumbers('lotto539', drawNumberSize, 5)

  const { period: _p, lotteryDate: _l, drawNumberSize: _s, drawNumberAppear: _a, ...extras } = raw

  return {
    gameId: 'lotto539',
    drawTerm: period,
    drawDate: isoDate(lotteryDate),
    numbers: [...drawNumberSize].sort((a, b) => a - b),
    drawOrder: drawNumberAppear,
    special: null,
    extras,
    source: SOURCE,
    fetchedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION
  }
}

/**
 * 大樂透: drawNumberSize 7 個 — 前 6 個是主號（已升冪），第 7 個是特別號。
 */
export function normalize649(raw: Record<string, unknown>): DrawResult {
  const period = raw.period as number
  const lotteryDate = raw.lotteryDate as string
  const drawNumberSize = raw.drawNumberSize as number[]
  const drawNumberAppear = raw.drawNumberAppear as number[]

  if (drawNumberSize.length !== 7) {
    throw new Error(`lotto649 drawNumberSize length expected 7, got ${drawNumberSize.length}`)
  }
  const mains = drawNumberSize.slice(0, 6)
  const special = drawNumberSize[6]!
  validateNumbers('lotto649', mains, 6)
  validateSpecial('lotto649', special)

  const { period: _p, lotteryDate: _l, drawNumberSize: _s, drawNumberAppear: _a, ...extras } = raw

  return {
    gameId: 'lotto649',
    drawTerm: period,
    drawDate: isoDate(lotteryDate),
    numbers: [...mains].sort((a, b) => a - b),
    drawOrder: drawNumberAppear.slice(0, 6),
    special,
    extras,
    source: SOURCE,
    fetchedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION
  }
}

/**
 * 威力彩: 同 649 結構，但前 6 個 1–38，第 7 個（第二區）1–8。
 */
export function normalizeSuperLotto(raw: Record<string, unknown>): DrawResult {
  const period = raw.period as number
  const lotteryDate = raw.lotteryDate as string
  const drawNumberSize = raw.drawNumberSize as number[]
  const drawNumberAppear = raw.drawNumberAppear as number[]

  if (drawNumberSize.length !== 7) {
    throw new Error(`super_lotto638 drawNumberSize length expected 7, got ${drawNumberSize.length}`)
  }
  const mains = drawNumberSize.slice(0, 6)
  const special = drawNumberSize[6]!
  validateNumbers('super_lotto638', mains, 6)
  validateSpecial('super_lotto638', special)

  const { period: _p, lotteryDate: _l, drawNumberSize: _s, drawNumberAppear: _a, ...extras } = raw

  return {
    gameId: 'super_lotto638',
    drawTerm: period,
    drawDate: isoDate(lotteryDate),
    numbers: [...mains].sort((a, b) => a - b),
    drawOrder: drawNumberAppear.slice(0, 6),
    special,
    extras,
    source: SOURCE,
    fetchedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION
  }
}

/**
 * 賓果賓果: bigShowOrder 20 個字串、bullEyeTop 中央彩球。
 * dDate 是垃圾值，drawDate 必須從查詢日期帶進來。
 */
export function normalizeBingo(raw: Record<string, unknown>, queryDate: string): DrawResult {
  const drawTerm = raw.drawTerm as number
  const bigShowOrder = (raw.bigShowOrder as string[]).map(Number)
  const openShowOrder = (raw.openShowOrder as string[]).map(Number)
  const bullEyeTopStr = raw.bullEyeTop as string | null | undefined
  const bullEye = bullEyeTopStr != null && bullEyeTopStr !== '' && bullEyeTopStr !== '－'
    ? Number(bullEyeTopStr)
    : null

  validateNumbers('bingo_bingo', bigShowOrder, 20)

  const { drawTerm: _t, bigShowOrder: _b, openShowOrder: _o, bullEyeTop: _be, dDate: _d, ...extras } = raw

  return {
    gameId: 'bingo_bingo',
    drawTerm,
    drawDate: queryDate,
    numbers: [...bigShowOrder].sort((a, b) => a - b),
    drawOrder: openShowOrder,
    special: bullEye,
    extras,
    source: SOURCE,
    fetchedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION
  }
}

function validateNumbers(gameId: GameId, mains: number[], expectedCount: number): void {
  const g = GAMES[gameId]
  if (mains.length !== expectedCount) {
    throw new Error(`${gameId} expected ${expectedCount} numbers, got ${mains.length}`)
  }
  for (const n of mains) {
    if (n < g.numberMin || n > g.numberMax) {
      throw new Error(`${gameId} number ${n} out of range [${g.numberMin}, ${g.numberMax}]`)
    }
  }
  const unique = new Set(mains)
  if (unique.size !== mains.length) {
    throw new Error(`${gameId} numbers contain duplicates: ${mains.join(',')}`)
  }
}

function validateSpecial(gameId: GameId, special: number): void {
  const g = GAMES[gameId]
  if (!g.hasSpecial || g.specialMin == null || g.specialMax == null) return
  if (special < g.specialMin || special > g.specialMax) {
    throw new Error(`${gameId} special ${special} out of range [${g.specialMin}, ${g.specialMax}]`)
  }
}
