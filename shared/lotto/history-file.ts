/**
 * 539 歷史開獎存檔（public/data/lotto539-history.json）的格式。
 *
 * 2026-10-11 使用者拍板：分析要用資料庫裡全部歷史（2007-01-01 起），
 * 但每次都從 Firestore 一期一筆讀會吃讀取額度 → 過去的期數存成專案裡的靜態檔，
 * 只有檔案最後一期之後的新期數才讀資料庫（/api/draws/lotto539/since）。
 * 檔案由 scripts/export-539-history.ts 產生／補新。
 */

export const HISTORY_FILE_PATH = '/data/lotto539-history.json'

/** 一期：[期號, 開獎日 YYYY-MM-DD, 五顆主號（升序）] */
export type HistoryRow = [number, string, number[]]

export interface HistoryFile {
  game: 'lotto539'
  /** 檔案內最後一期的期號 */
  lastTerm: number
  lastDate: string
  count: number
  rows: HistoryRow[]
}

export interface PlainDraw {
  issue: string
  date: string
  /** 五顆主號（升序） */
  nums: number[]
}

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

/** 檢查格式並轉成 PlainDraw[]（期號由舊到新）；格式不對直接丟錯，不默默略過。 */
export function parseHistoryFile(json: unknown): PlainDraw[] {
  const f = json as Partial<HistoryFile> | null
  if (!f || f.game !== 'lotto539' || !Array.isArray(f.rows)) throw new Error('歷史檔格式不對')
  let prev = 0
  return f.rows.map((row, i) => {
    const [term, date, nums] = row
    const okNums = Array.isArray(nums) && nums.length === 5 && nums.every(n => Number.isInteger(n) && n >= 1 && n <= 39)
    if (!Number.isInteger(term) || term <= prev || !isDate(date) || !okNums) throw new Error(`歷史檔第 ${i + 1} 筆不對`)
    prev = term
    return { issue: String(term), date, nums: [...nums].sort((a, b) => a - b) }
  })
}

/** 歷史檔 + 檔案之後的新期數合併（以期號去重、由舊到新）。 */
export function mergeDraws(history: PlainDraw[], newer: PlainDraw[]): PlainDraw[] {
  const last = history.length ? Number(history.at(-1)!.issue) : 0
  const extra = newer
    .filter(d => Number(d.issue) > last)
    .sort((a, b) => Number(a.issue) - Number(b.issue))
    .filter((d, i, arr) => i === 0 || d.issue !== arr[i - 1]!.issue)
  return [...history, ...extra]
}
