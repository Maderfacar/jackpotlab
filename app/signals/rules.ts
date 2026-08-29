/**
 * 首發七條「條件燈」規則。
 *
 * 命名對齊 2026-08-29 的 700 期驗證分析（成熟樣本 640 期）：
 *   B0 / B1 / B2 = 數值欄，C / C1 / C2 + 交替性 = 總和欄。
 * 卡片上的命中率／基準率一律由 engine 對「當前載入視窗」即時回測，
 * 不寫死歷史數字 — 資料更新後數字自動跟著動。
 *
 * 新增規則：加一個 LightRule 物件、掛進 SIGNAL_RULES 即可。
 */

import type { ConditionResult, LightRule, RelatedNumber, SignalRow } from './types'

function valueSum(r: SignalRow): number {
  return r.values.reduce((a, b) => a + b, 0)
}

function valueRelated(r: SignalRow): RelatedNumber[] {
  return r.prizes.map((num, k) => ({ num, note: `數值${r.values[k]}` }))
}

function gapRelated(r: SignalRow): RelatedNumber[] {
  return r.prizes.map((num, k) => ({ num, note: `隔${r.gaps[k]}期` }))
}

function notMet(detail: string): ConditionResult {
  return { met: false, detail, related: [] }
}

/** 本期 vs 前期總和的方向：1 升 / -1 降 / 0 平 */
function sumDir(rows: SignalRow[], i: number): number {
  const d = rows[i]!.sum - rows[i - 1]!.sum
  return d > 0 ? 1 : d < 0 ? -1 : 0
}

const VALUES_LOW_THRESHOLD = 10
const VALUES_HIGH_THRESHOLD = 40
const SUM_HIGH_THRESHOLD = 60
const SUM_LOW_THRESHOLD = 15
const SINGLE_VALUE_SPIKE = 10

export const SIGNAL_RULES: LightRule[] = [
  {
    id: 'b0-values-low-single-spike',
    name: 'B0 數值低谷 → 下期單顆爆值（對照組）',
    description: `本期五顆數值加總 ≤${VALUES_LOW_THRESHOLD} 時亮燈。原始觀察假設下期會出現單顆數值 >${SINGLE_VALUE_SPIKE}；700 期驗證命中率僅略高於基準，保留在此做對照、持續累積樣本。`,
    expectation: `下期至少一顆獎號的數值 >${SINGLE_VALUE_SPIKE}`,
    lookback: 0,
    condition(rows, i) {
      const r = rows[i]!
      const s = valueSum(r)
      if (s > VALUES_LOW_THRESHOLD) {
        return notMet(`本期數值加總 ${s} > ${VALUES_LOW_THRESHOLD}，未達低谷`)
      }
      return {
        met: true,
        detail: `本期數值加總 ${s} ≤ ${VALUES_LOW_THRESHOLD}`,
        related: valueRelated(r)
      }
    },
    outcome(rows, i) {
      return Math.max(...rows[i + 1]!.values) > SINGLE_VALUE_SPIKE
    }
  },
  {
    id: 'b1-values-low-rebound',
    name: 'B1 數值低谷 → 下期加總反彈',
    description: `本期五顆數值加總 ≤${VALUES_LOW_THRESHOLD} 時亮燈，預期下期「加總」高於本期。700 期驗證 86.9%（基準 49.1%）。`,
    expectation: '下期數值加總 > 本期',
    lookback: 0,
    condition(rows, i) {
      const r = rows[i]!
      const s = valueSum(r)
      if (s > VALUES_LOW_THRESHOLD) {
        return notMet(`本期數值加總 ${s} > ${VALUES_LOW_THRESHOLD}，未達低谷`)
      }
      return {
        met: true,
        detail: `本期數值加總 ${s} ≤ ${VALUES_LOW_THRESHOLD}`,
        related: valueRelated(r)
      }
    },
    outcome(rows, i) {
      return valueSum(rows[i + 1]!) > valueSum(rows[i]!)
    }
  },
  {
    id: 'b2-values-high-fall',
    name: 'B2 數值高峰 → 下期加總回落',
    description: `本期五顆數值加總 >${VALUES_HIGH_THRESHOLD} 時亮燈，預期下期「加總」低於本期。700 期驗證 92.6%（基準 48.5%）。`,
    expectation: '下期數值加總 < 本期',
    lookback: 0,
    condition(rows, i) {
      const r = rows[i]!
      const s = valueSum(r)
      if (s <= VALUES_HIGH_THRESHOLD) {
        return notMet(`本期數值加總 ${s} ≤ ${VALUES_HIGH_THRESHOLD}，未達高峰`)
      }
      return {
        met: true,
        detail: `本期數值加總 ${s} > ${VALUES_HIGH_THRESHOLD}`,
        related: valueRelated(r)
      }
    },
    outcome(rows, i) {
      return valueSum(rows[i + 1]!) < valueSum(rows[i]!)
    }
  },
  {
    id: 'sum-alternate',
    name: '總和交替性 → 下期反向',
    description: '本期總和與前期比有明確升／降（非平手）就亮燈，預期下期走反方向（一多一少交替）。700 期驗證交替率 70.4%。',
    expectation: '下期總和方向與本期相反',
    lookback: 1,
    condition(rows, i) {
      const dir = sumDir(rows, i)
      const prev = rows[i - 1]!
      const cur = rows[i]!
      if (dir === 0) {
        return notMet(`本期總和 ${cur.sum} = 前期 ${prev.sum}，平手無方向`)
      }
      const word = dir > 0 ? '升' : '降'
      return {
        met: true,
        detail: `本期總和 ${cur.sum} vs 前期 ${prev.sum}（${word}）`,
        related: gapRelated(cur)
      }
    },
    outcome(rows, i) {
      const cur = sumDir(rows, i)
      const next = sumDir(rows, i + 1)
      return cur !== 0 && next !== 0 && next !== cur
    }
  },
  {
    id: 'c-sum-run-break',
    name: 'C 總和連向斷裂 → 下期反轉',
    description: '總和已連續同方向走 2 步（= 連續 3 期連漲或連跌）時亮燈，預期下期反轉。700 期驗證連漲 2 步後回跌 78.2%；連 4 期以上同向兩年僅 29 段。',
    expectation: '下期總和反轉（連漲後跌、連跌後漲）',
    lookback: 2,
    condition(rows, i) {
      const d1 = sumDir(rows, i - 1)
      const d2 = sumDir(rows, i)
      if (d1 === 0 || d2 === 0 || d1 !== d2) {
        return notMet('總和未處於連續 2 步同向狀態')
      }
      const word = d2 > 0 ? '連漲' : '連跌'
      const a = rows[i - 2]!.sum
      const b = rows[i - 1]!.sum
      const c = rows[i]!.sum
      return {
        met: true,
        detail: `總和已${word} 3 期（${a} → ${b} → ${c}）`,
        related: gapRelated(rows[i]!)
      }
    },
    outcome(rows, i) {
      const cur = sumDir(rows, i)
      const next = sumDir(rows, i + 1)
      return cur !== 0 && next !== 0 && next !== cur
    }
  },
  {
    id: 'c1-sum-high-fall',
    name: 'C1 總和高峰 → 下期必降',
    description: `本期總和 ≥${SUM_HIGH_THRESHOLD} 時亮燈，預期下期總和低於本期。700 期驗證 98.1%（52/53，基準 49.6%）。`,
    expectation: '下期總和 < 本期',
    lookback: 0,
    condition(rows, i) {
      const r = rows[i]!
      if (r.sum < SUM_HIGH_THRESHOLD) {
        return notMet(`本期總和 ${r.sum} < ${SUM_HIGH_THRESHOLD}，未達高峰`)
      }
      return {
        met: true,
        detail: `本期總和 ${r.sum} ≥ ${SUM_HIGH_THRESHOLD}`,
        related: gapRelated(r)
      }
    },
    outcome(rows, i) {
      return rows[i + 1]!.sum < rows[i]!.sum
    }
  },
  {
    id: 'c2-sum-low-rise',
    name: 'C2 總和低谷 → 下期必升',
    description: `本期總和 ≤${SUM_LOW_THRESHOLD} 時亮燈，預期下期總和高於本期。700 期驗證 100%（55/55，基準 48.4%）。`,
    expectation: '下期總和 > 本期',
    lookback: 0,
    condition(rows, i) {
      const r = rows[i]!
      if (r.sum > SUM_LOW_THRESHOLD) {
        return notMet(`本期總和 ${r.sum} > ${SUM_LOW_THRESHOLD}，未達低谷`)
      }
      return {
        met: true,
        detail: `本期總和 ${r.sum} ≤ ${SUM_LOW_THRESHOLD}`,
        related: gapRelated(r)
      }
    },
    outcome(rows, i) {
      return rows[i + 1]!.sum > rows[i]!.sum
    }
  }
]
