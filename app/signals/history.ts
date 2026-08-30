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
      const posParts = (h.positions ?? '').split(',')
      const gaps: number[] = []
      const values: number[] = []
      const xs: number[] = []
      const ys: number[] = []
      let valid = prizes.length === PRIZE_COUNT
        && gapParts.length === PRIZE_COUNT
        && valParts.length === PRIZE_COUNT
        && posParts.length === PRIZE_COUNT
      for (let k = 0; k < PRIZE_COUNT; k++) {
        const g = gapParts[k] ?? ''
        const v = valParts[k] ?? ''
        const p = posParts[k] ?? ''
        const [xRaw, yRaw] = p.includes('-') ? p.split('-') : ['', '']
        const gn = Number.parseInt(g, 10)
        const vn = Number.parseInt(v, 10)
        const xn = Number.parseInt(xRaw ?? '', 10)
        const yn = Number.parseInt(yRaw ?? '', 10)
        if (!Number.isFinite(gn) || !Number.isFinite(vn) || !Number.isFinite(xn) || !Number.isFinite(yn)) {
          valid = false
          gaps.push(-1)
          values.push(-1)
          xs.push(-1)
          ys.push(-1)
          continue
        }
        gaps.push(gn)
        values.push(vn)
        xs.push(xn)
        ys.push(yn)
      }
      return {
        issue: h.issue,
        date: h.date,
        prizes,
        values,
        gaps,
        xs,
        ys,
        sum: typeof h.sum === 'number' ? h.sum : 0,
        valid
      }
    })
}
