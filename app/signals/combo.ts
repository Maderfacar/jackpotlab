/**
 * 組合湊數工具（2026-09-01 使用者拍板）：
 * 「下一期若要開出 隔期總和=G 且 數值總和=V，有哪些五碼組合？」
 *
 * 原理：目前每個號碼恰好存在於一個 slot（它最近一次開出的那格），
 * 所以每個號碼下期開出時的 隔期值 = 該 slot index、數值 = 該 slot 記錄現值，
 * 在本期狀態下已完全確定 — 枚舉 C(39,5) 全部組合即可。
 * 注意：只對「下一期」有效，每開一期整張對照表都會變。
 *
 * 濃縮排序：先統計每個號碼在所有符合組合中出現的次數，
 * 再以「五顆成員出現次數加總」為分數取前 N 組。
 */

import type { AnalysisState } from '../utils/analysis'

export interface ComboNumberInfo {
  num: number
  gap: number
  value: number
}

export interface NumberFreq extends ComboNumberInfo {
  count: number
}

export interface ComboEntry {
  nums: ComboNumberInfo[]
  score: number
}

export interface ComboResult {
  /** 符合條件的組合總數 */
  total: number
  /** 枚舉的組合總數 C(K,5) */
  totalPossible: number
  /** 各號碼在符合組合中的出現次數（由高到低，只含 count>0） */
  freq: NumberFreq[]
  /** 依成員出現次數加總排序的前 N 組 */
  top: ComboEntry[]
  /** 60 期內沒出現、無法取值而不參與的號碼 */
  missing: number[]
}

function leftVal(record: string): number {
  const first = record.split(',')[0]
  const v = first ? Number.parseInt(first, 10) : Number.NaN
  return Number.isFinite(v) ? v : 0
}

/** 從目前 AnalysisState 取出每個號碼的（隔期, 數值）。539 專用（1-39）。 */
export function numberInfosFromState(state: AnalysisState, maxNum = 39): { infos: ComboNumberInfo[], missing: number[] } {
  const byNum = new Map<number, ComboNumberInfo>()
  for (const p of state.periods) {
    if (!p.issue) continue
    const value = leftVal(p.record)
    for (const num of p.prizes) {
      // 演算法保證每號僅存在一個 slot；防禦性只取第一次遇到的
      if (!byNum.has(num)) byNum.set(num, { num, gap: p.period, value })
    }
  }
  const infos: ComboNumberInfo[] = []
  const missing: number[] = []
  for (let n = 1; n <= maxNum; n++) {
    const info = byNum.get(n)
    if (info) infos.push(info)
    else missing.push(n)
  }
  return { infos, missing }
}

export function findCombos(
  infos: ComboNumberInfo[],
  gapTarget: number,
  valTarget: number,
  topN = 5
): ComboResult {
  const K = infos.length
  const totalPossible = K >= 5 ? (K * (K - 1) * (K - 2) * (K - 3) * (K - 4)) / 120 : 0

  // pass 1：計數 + 每號出現次數（streaming，不存全部組合）
  const counts = new Array<number>(K).fill(0)
  let total = 0
  for (let a = 0; a < K; a++) {
    for (let b = a + 1; b < K; b++) {
      for (let c = b + 1; c < K; c++) {
        for (let d = c + 1; d < K; d++) {
          for (let e = d + 1; e < K; e++) {
            if (infos[a]!.gap + infos[b]!.gap + infos[c]!.gap + infos[d]!.gap + infos[e]!.gap !== gapTarget) continue
            if (infos[a]!.value + infos[b]!.value + infos[c]!.value + infos[d]!.value + infos[e]!.value !== valTarget) continue
            total++
            counts[a]!++
            counts[b]!++
            counts[c]!++
            counts[d]!++
            counts[e]!++
          }
        }
      }
    }
  }

  // pass 2：以成員出現次數加總為分數，取前 topN
  const top: Array<{ idx: number[], score: number }> = []
  if (total > 0) {
    for (let a = 0; a < K; a++) {
      for (let b = a + 1; b < K; b++) {
        for (let c = b + 1; c < K; c++) {
          for (let d = c + 1; d < K; d++) {
            for (let e = d + 1; e < K; e++) {
              if (infos[a]!.gap + infos[b]!.gap + infos[c]!.gap + infos[d]!.gap + infos[e]!.gap !== gapTarget) continue
              if (infos[a]!.value + infos[b]!.value + infos[c]!.value + infos[d]!.value + infos[e]!.value !== valTarget) continue
              const score = counts[a]! + counts[b]! + counts[c]! + counts[d]! + counts[e]!
              if (top.length < topN) {
                top.push({ idx: [a, b, c, d, e], score })
                top.sort((x, y) => y.score - x.score)
              } else if (score > top[top.length - 1]!.score) {
                top[top.length - 1] = { idx: [a, b, c, d, e], score }
                top.sort((x, y) => y.score - x.score)
              }
            }
          }
        }
      }
    }
  }

  const freq: NumberFreq[] = infos
    .map((info, i) => ({ ...info, count: counts[i]! }))
    .filter(f => f.count > 0)
    .sort((x, y) => y.count - x.count)

  return {
    total,
    totalPossible,
    freq,
    top: top.map(t => ({
      nums: t.idx.map(i => infos[i]!),
      score: t.score
    })),
    missing: []
  }
}
