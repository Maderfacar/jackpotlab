/**
 * 首發七條「條件燈」規則。
 *
 * 代號對齊 2026-08-29 的 700 期驗證分析（成熟樣本 640 期）：
 *   B0 / B1 / B2 = 數值欄，交替 / C / C1 / C2 = 總和欄。
 * 文案原則（2026-08-30 使用者要求）：全部白話、不用術語 —
 * 名稱與說明要讓人一眼看懂條件跟預期，不出現「低谷/回歸/lift」這類詞。
 * 卡片上的命中率／平常機率一律由 engine 對「當前載入的歷史」即時重算，
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
    code: 'B0',
    name: '數值超低 → 下期冒出一顆大數值（對照觀察）',
    description: `這期五顆「數值」加起來 ≤${VALUES_LOW_THRESHOLD} 就亮燈。原本猜下期會有一顆獎號的數值超過 ${SINGLE_VALUE_SPIKE}，但用兩年歷史驗證後只比平常高一點點，先留著繼續累積看看。`,
    expectation: `下期至少有一顆獎號的數值超過 ${SINGLE_VALUE_SPIKE}`,
    lookback: 0,
    condition(rows, i) {
      const r = rows[i]!
      const s = valueSum(r)
      if (s > VALUES_LOW_THRESHOLD) {
        return notMet(`這期五顆數值加起來 ${s}，沒有 ≤${VALUES_LOW_THRESHOLD}`)
      }
      return {
        met: true,
        detail: `這期五顆數值加起來只有 ${s}（≤${VALUES_LOW_THRESHOLD}）`,
        related: valueRelated(r)
      }
    },
    outcome(rows, i) {
      return Math.max(...rows[i + 1]!.values) > SINGLE_VALUE_SPIKE
    }
  },
  {
    id: 'b1-values-low-rebound',
    code: 'B1',
    name: '數值超低 → 下期整體變大',
    description: `這期五顆「數值」加起來 ≤${VALUES_LOW_THRESHOLD} 就亮燈：下期五顆數值加起來，通常會比這期大。`,
    expectation: '下期五顆數值加起來 > 這期',
    lookback: 0,
    condition(rows, i) {
      const r = rows[i]!
      const s = valueSum(r)
      if (s > VALUES_LOW_THRESHOLD) {
        return notMet(`這期五顆數值加起來 ${s}，沒有 ≤${VALUES_LOW_THRESHOLD}`)
      }
      return {
        met: true,
        detail: `這期五顆數值加起來只有 ${s}（≤${VALUES_LOW_THRESHOLD}）`,
        related: valueRelated(r)
      }
    },
    outcome(rows, i) {
      return valueSum(rows[i + 1]!) > valueSum(rows[i]!)
    }
  },
  {
    id: 'b2-values-high-fall',
    code: 'B2',
    name: '數值超高 → 下期整體變小',
    description: `這期五顆「數值」加起來超過 ${VALUES_HIGH_THRESHOLD} 就亮燈：下期五顆數值加起來，通常會比這期小。`,
    expectation: '下期五顆數值加起來 < 這期',
    lookback: 0,
    condition(rows, i) {
      const r = rows[i]!
      const s = valueSum(r)
      if (s <= VALUES_HIGH_THRESHOLD) {
        return notMet(`這期五顆數值加起來 ${s}，沒超過 ${VALUES_HIGH_THRESHOLD}`)
      }
      return {
        met: true,
        detail: `這期五顆數值加起來高達 ${s}（超過 ${VALUES_HIGH_THRESHOLD}）`,
        related: valueRelated(r)
      }
    },
    outcome(rows, i) {
      return valueSum(rows[i + 1]!) < valueSum(rows[i]!)
    }
  },
  {
    id: 'sum-alternate',
    code: '交替',
    name: '總和一多一少交替',
    description: '「總和」這期比上期高，下期通常就比這期低；反過來也一樣。只要這期跟上期有高低差就亮燈。',
    expectation: '下期總和走反方向（這期升、下期降；這期降、下期升）',
    lookback: 1,
    condition(rows, i) {
      const dir = sumDir(rows, i)
      const prev = rows[i - 1]!
      const cur = rows[i]!
      if (dir === 0) {
        return notMet(`這期總和 ${cur.sum} 跟上期一樣，沒有高低差`)
      }
      const word = dir > 0 ? '高' : '低'
      return {
        met: true,
        detail: `這期總和 ${cur.sum}，比上期 ${prev.sum} ${word}`,
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
    code: 'C',
    name: '總和連走 3 期 → 下期轉向',
    description: '「總和」很少連續 4 期都往同一邊走。已經連 3 期變大（或連 3 期變小）時亮燈：下期通常會轉向。',
    expectation: '下期總和轉向（連漲後變小、連跌後變大）',
    lookback: 2,
    condition(rows, i) {
      const d1 = sumDir(rows, i - 1)
      const d2 = sumDir(rows, i)
      if (d1 === 0 || d2 === 0 || d1 !== d2) {
        return notMet('總和目前沒有連 3 期往同一邊走')
      }
      const word = d2 > 0 ? '變大' : '變小'
      const a = rows[i - 2]!.sum
      const b = rows[i - 1]!.sum
      const c = rows[i]!.sum
      return {
        met: true,
        detail: `總和已連 3 期${word}（${a} → ${b} → ${c}）`,
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
    code: 'C1',
    name: `總和衝太高（≥${SUM_HIGH_THRESHOLD}）→ 下期變小`,
    description: `這期「總和」達到 ${SUM_HIGH_THRESHOLD} 以上就亮燈：下期總和幾乎都會比這期小。兩年歷史裡只失手過 1 次。`,
    expectation: '下期總和 < 這期',
    lookback: 0,
    condition(rows, i) {
      const r = rows[i]!
      if (r.sum < SUM_HIGH_THRESHOLD) {
        return notMet(`這期總和 ${r.sum}，沒到 ${SUM_HIGH_THRESHOLD}`)
      }
      return {
        met: true,
        detail: `這期總和 ${r.sum}，已達 ${SUM_HIGH_THRESHOLD} 以上`,
        related: gapRelated(r)
      }
    },
    outcome(rows, i) {
      return rows[i + 1]!.sum < rows[i]!.sum
    }
  },
  {
    id: 'c2-sum-low-rise',
    code: 'C2',
    name: `總和掉太低（≤${SUM_LOW_THRESHOLD}）→ 下期變大`,
    description: `這期「總和」掉到 ${SUM_LOW_THRESHOLD} 以下就亮燈：下期總和幾乎都會比這期大。兩年歷史裡零例外。`,
    expectation: '下期總和 > 這期',
    lookback: 0,
    condition(rows, i) {
      const r = rows[i]!
      if (r.sum > SUM_LOW_THRESHOLD) {
        return notMet(`這期總和 ${r.sum}，沒有 ≤${SUM_LOW_THRESHOLD}`)
      }
      return {
        met: true,
        detail: `這期總和只有 ${r.sum}（≤${SUM_LOW_THRESHOLD}）`,
        related: gapRelated(r)
      }
    },
    outcome(rows, i) {
      return rows[i + 1]!.sum > rows[i]!.sum
    }
  }
]
