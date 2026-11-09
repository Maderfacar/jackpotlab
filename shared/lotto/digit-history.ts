/**
 * 三星彩、四星彩歷史存檔（public/data/lotto3d-history.json、lotto4d-history.json）的格式。
 * 比照 539（shared/lotto/history-file.ts）：過去的期數存成靜態檔，只有檔案之後的新期數才讀 /api/digit/{id}/since。
 * 檔案由 scripts/export-digit-history.ts 產生／補新。
 */
import { DIGIT_GAMES, type DigitGameId } from './digit-games'

export const digitHistoryPath = (id: DigitGameId): string => `/data/${id}-history.json`

/** 一期：[期號, 開獎日 YYYY-MM-DD, 數字（開出順序，四星是千百十個）] */
export type DigitHistoryRow = [number, string, number[]]

export interface DigitHistoryFile {
  game: DigitGameId
  lastTerm: number
  lastDate: string
  count: number
  rows: DigitHistoryRow[]
}

export interface DigitPlainDraw {
  issue: string
  date: string
  /** 開出順序，不排序 */
  digits: number[]
}

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

/** 檢查格式並轉成由舊到新的期數；格式不對直接丟錯，不默默略過 */
export function parseDigitHistory(id: DigitGameId, json: unknown): DigitPlainDraw[] {
  const f = json as Partial<DigitHistoryFile> | null
  if (!f || f.game !== id || !Array.isArray(f.rows)) throw new Error(`${DIGIT_GAMES[id].name}歷史檔格式不對`)
  const n = DIGIT_GAMES[id].digits
  let prev = 0
  return f.rows.map((row, i) => {
    const [term, date, digits] = row
    const ok = Array.isArray(digits) && digits.length === n && digits.every(d => Number.isInteger(d) && d >= 0 && d <= 9)
    if (!Number.isInteger(term) || term <= prev || !isDate(date) || !ok) throw new Error(`${DIGIT_GAMES[id].name}歷史檔第 ${i + 1} 筆不對`)
    prev = term
    return { issue: String(term), date, digits: [...digits] }
  })
}

/** 歷史檔 + 檔案之後的新期數合併（以期號去重、由舊到新） */
export function mergeDigitDraws(history: DigitPlainDraw[], newer: DigitPlainDraw[]): DigitPlainDraw[] {
  const last = history.length ? Number(history.at(-1)!.issue) : 0
  const extra = newer
    .filter(d => Number(d.issue) > last)
    .sort((a, b) => Number(a.issue) - Number(b.issue))
    .filter((d, i, arr) => i === 0 || d.issue !== arr[i - 1]!.issue)
  return [...history, ...extra]
}

/** 檔案內容（每期一行，方便 diff） */
export function formatDigitHistory(id: DigitGameId, rows: DigitHistoryRow[]): string {
  const last = rows.at(-1)!
  const body = rows.map(r => JSON.stringify(r)).join(',\n')
  return `{"game":"${id}","lastTerm":${last[0]},"lastDate":"${last[1]}","count":${rows.length},"rows":[\n${body}\n]}\n`
}
