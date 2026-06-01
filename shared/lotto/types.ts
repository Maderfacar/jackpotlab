import type { GameId } from './games'

/**
 * 正規化後的開獎紀錄。
 * 4 個彩種 + 未來新增彩種都用這個結構存 Firestore。
 * 彩種特有的資料（如獎金分配）放在 extras。
 */
export interface DrawResult {
  gameId: GameId
  /** 期別主鍵 — 在同彩種內唯一 */
  drawTerm: number
  /** ISO 8601 日期字串 (YYYY-MM-DD)，存 Firestore 比 Timestamp 更跨平台 */
  drawDate: string
  /** 主號碼，升冪排序 */
  numbers: number[]
  /** 開出順序的主號碼 */
  drawOrder: number[]
  /** 特別號 / 第二區 / 中央彩球，沒有則為 null */
  special: number | null
  /** 彩種特有資料（獎金分配等），用於 admin、debug、未來分析 */
  extras: Record<string, unknown>
  source: string
  fetchedAt: string
  schemaVersion: number
}

export interface DrawQueryResponse {
  gameId: GameId
  results: DrawResult[]
  /** 這次回傳是直接從 Firestore 拿（true）還是現抓 taiwanlottery（false） */
  fromCache: boolean
}
