/**
 * 三星彩、四星彩（2026-11-09 使用者要求抓回來放資料庫，先不做頁面）。
 *
 * 官方 API（2026-11-09 實測）：
 *   - 依月份：3DResult?month=YYYY-MM&pageNum=1&pageSize=50 → content.lotto3DRes；4D 同理（4DResult、lotto4DRes）。
 *   - 依期號：3DResult?period=115000270。
 *   - 最新一期：LatestResult 的 lotto3DResult、lotto4DResult。
 *   - 最早 2007-01-01（第 96000001 期）；期號、開獎日跟 539 同一套（週一～六）。
 * 每期是 3 或 4 個 0～9 的數字，順序有意義、可重複 → numbers 照開出順序存，不排序。
 *
 * 複本：functions/src/digit-games.ts 的解析與這裡同義（functions 必須自包），改動要同步。
 */

export const DIGIT_GAMES = {
  lotto3d: { id: 'lotto3d', name: '三星彩', endpoint: '3DResult', listField: 'lotto3DRes', latestField: 'lotto3DResult', digits: 3 },
  lotto4d: { id: 'lotto4d', name: '四星彩', endpoint: '4DResult', listField: 'lotto4DRes', latestField: 'lotto4DResult', digits: 4 }
} as const

export type DigitGameId = keyof typeof DIGIT_GAMES
export const DIGIT_GAME_IDS = Object.keys(DIGIT_GAMES) as DigitGameId[]

export interface DigitDraw {
  gameId: DigitGameId
  drawTerm: number
  drawDate: string
  /** 開出順序，不排序 */
  numbers: number[]
  drawOrder: number[]
  special: null
  /** 官方其他欄位（銷售額、各獎中獎注數與獎金、兌獎截止日） */
  extras: Record<string, unknown>
  source: 'taiwanlottery.com'
  schemaVersion: 1
}

/** 官方一筆 → 資料庫格式；格式不對直接丟錯 */
export function normalizeDigitDraw(gameId: DigitGameId, raw: Record<string, unknown>): DigitDraw {
  const { digits } = DIGIT_GAMES[gameId]
  const { period, lotteryDate, drawNumberAppear, ...extras } = raw
  if (typeof period !== 'number' || !Number.isInteger(period)) throw new Error(`${gameId} 期號不對：${String(period)}`)
  if (typeof lotteryDate !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(lotteryDate)) throw new Error(`${gameId} ${period} 日期不對：${String(lotteryDate)}`)
  if (!Array.isArray(drawNumberAppear) || drawNumberAppear.length !== digits) throw new Error(`${gameId} ${period} 要 ${digits} 個數字`)
  const nums = drawNumberAppear.map(Number)
  if (nums.some(n => !Number.isInteger(n) || n < 0 || n > 9)) throw new Error(`${gameId} ${period} 數字要 0～9：${nums.join(',')}`)
  return {
    gameId,
    drawTerm: period,
    drawDate: lotteryDate.slice(0, 10),
    numbers: nums,
    drawOrder: [...nums],
    special: null,
    extras,
    source: 'taiwanlottery.com',
    schemaVersion: 1
  }
}
