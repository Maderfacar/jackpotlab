/** /scan 頁共用的小格式工具（Nuxt 自動匯入） */
import type { Rate } from '~~/shared/lotto/scan/scan'

export const scanPad2 = (n: number): string => String(n).padStart(2, '0')

/** 比例：整數百分比；n = 0 回「—」 */
export const scanPct = (r: Rate): string => (r.n > 0 ? `${Math.round((r.hit / r.n) * 100)}%` : '—')

/** 期別只留後 3 碼（同一年內唯一，表格用） */
export const scanShortIssue = (issue: string): string => issue.slice(-3)

/** ScanBars 的一根柱子 */
export interface ScanBarItem {
  key: string
  label: string
  value: number
  color: string
  /** 橫線刻度（例：隔期和） */
  mark?: number | null
  /** 柱頂圓點（例：該期有單顆值 > 10） */
  dot?: boolean
  /** 柱下一個字（例：大 / 小） */
  below?: string
  belowColor?: string
  title: string
}
