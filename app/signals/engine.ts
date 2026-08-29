/**
 * 條件燈回測引擎。
 *
 * 對載入視窗內每一期（去暖機後）跑 condition/outcome：
 *   - 命中率：條件成立的期，下一期 outcome 成立的比例
 *   - 基準率：不看條件、所有期 outcome 成立的比例（讓使用者看規則有沒有真的抬高機率）
 * 條件期與判定期任一欄位不齊全（valid=false）就跳過，不硬算。
 */

import type { ConditionResult, FiringRecord, LightRule, RuleBacktest, SignalRow } from './types'

const RECENT_FIRINGS_LIMIT = 10

/** i-lookback ~ i+1 的每一期欄位都齊全才可判定 */
function windowValid(rows: SignalRow[], i: number, lookback: number, includeNext: boolean): boolean {
  const start = i - lookback
  const end = includeNext ? i + 1 : i
  for (let j = start; j <= end; j++) {
    if (!rows[j]?.valid) return false
  }
  return true
}

export function backtestRule(rule: LightRule, rows: SignalRow[]): RuleBacktest {
  let fired = 0
  let hit = 0
  let baselineN = 0
  let baselineHit = 0
  const firings: FiringRecord[] = []

  for (let i = rule.lookback; i < rows.length - 1; i++) {
    if (!windowValid(rows, i, rule.lookback, true)) continue
    baselineN++
    if (rule.outcome(rows, i)) baselineHit++

    const cond = rule.condition(rows, i)
    if (!cond.met) continue
    fired++
    const ok = rule.outcome(rows, i)
    if (ok) hit++
    firings.push({
      issue: rows[i]!.issue,
      date: rows[i]!.date,
      detail: cond.detail,
      nextIssue: rows[i + 1]!.issue,
      nextDate: rows[i + 1]!.date,
      hit: ok
    })
  }

  return {
    fired,
    hit,
    hitRate: fired > 0 ? hit / fired : null,
    baselineN,
    baselineHit,
    baselineRate: baselineN > 0 ? baselineHit / baselineN : null,
    recentFirings: firings.slice(-RECENT_FIRINGS_LIMIT).reverse()
  }
}

/** 對最新一期評估條件（亮／暗）。資料不足或欄位缺值時回 null。 */
export function evaluateCurrent(rule: LightRule, rows: SignalRow[]): ConditionResult | null {
  const i = rows.length - 1
  if (i < rule.lookback) return null
  if (!windowValid(rows, i, rule.lookback, false)) return null
  return rule.condition(rows, i)
}
