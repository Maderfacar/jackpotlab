/**
 * 賓果版：把 AnalysisState.history 轉成 SignalRow[]（每期 20 顆）。
 * 與 app/signals/history.ts（539、5 顆）平行；539 引擎不動（jordan 快照安全）。
 * warmup 前 n 期表格未填滿，一律剔除。
 */

import type { AnalysisState } from '../utils/analysis'
import type { SignalRow } from '../signals/types'

const PRIZE_COUNT = 20

export function toBingoSignalRows(state: AnalysisState): SignalRow[] {
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
