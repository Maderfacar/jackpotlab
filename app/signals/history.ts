/**
 * 把 AnalysisState.history 轉成訊號規則吃的 SignalRow[]。
 *
 * 重點：history 前 N 期表格尚未填滿（隔期值系統性偏小、甚至回溯不到），
 * 屬暖機資料，一律剔除 — 與先前 700 期驗證分析的樣本切法一致。
 */

import type { AnalysisState } from '~/utils/analysis'
import type { SignalRow } from './types'

/** 目前僅支援 539（五顆主號、無特別號） */
const PRIZE_COUNT = 5

export function toSignalRows(state: AnalysisState): SignalRow[] {
  return state.history
    .slice(state.n)
    .filter(h => h.periods !== undefined)
    .map((h) => {
      const prizes = h.prizes
        .split(',')
        .map(s => Number.parseInt(s, 10))
        .filter(Number.isFinite)
      const gapParts = (h.periods ?? '').split(',')
      const valParts = (h.values ?? '').split(',')
      const gaps: number[] = []
      const values: number[] = []
      let valid = prizes.length === PRIZE_COUNT
        && gapParts.length === PRIZE_COUNT
        && valParts.length === PRIZE_COUNT
      for (let k = 0; k < PRIZE_COUNT; k++) {
        const g = gapParts[k] ?? ''
        const v = valParts[k] ?? ''
        if (g === '' || v === '') {
          valid = false
          gaps.push(-1)
          values.push(-1)
          continue
        }
        const gn = Number.parseInt(g, 10)
        const vn = Number.parseInt(v, 10)
        if (!Number.isFinite(gn) || !Number.isFinite(vn)) {
          valid = false
          gaps.push(-1)
          values.push(-1)
          continue
        }
        gaps.push(gn)
        values.push(vn)
      }
      return {
        issue: h.issue,
        date: h.date,
        prizes,
        values,
        gaps,
        sum: typeof h.sum === 'number' ? h.sum : 0,
        valid
      }
    })
}
