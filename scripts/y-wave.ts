/**
 * 539 位置 y=1～5「近期波段的變化走勢」（使用者固定問法，2026-10-16 定案）。
 *
 * 範圍：最新一期所在的年份（今年以來）。每期數這期 5 顆中位置 y=k 的顆數。
 * 各 y 出現頻率不同，不能都用 3 期看：視窗 W = round(7.1 ÷ 該 y 每期平均)（至少 3 期），
 * 讓 W 期合計平均都在 7 左右；高波段 = 今年 W 期合計的前 20%，低波段 = 後 20%。
 * 另給「上一期是 c 顆之後，下一期比較多／少／一樣」的次數與大小交替率。
 *
 * 用法（先補歷史檔再算）：
 *   node --import tsx --env-file=.env.local scripts/export-539-history.ts
 *   node --import tsx scripts/y-wave.ts
 */
import { readFileSync } from 'node:fs'
import { hydrateFromDraws } from '../app/utils/analysis'
import type { HistoryFile } from '../shared/lotto/history-file'

const Y_VALUES = [1, 2, 3, 4, 5]
const TARGET_WINDOW_SUM = 7.1
const MIN_WINDOW = 3
const HIGH_Q = 0.8
const LOW_Q = 0.2
const SLOTS = 60

const file = JSON.parse(readFileSync('public/data/lotto539-history.json', 'utf8')) as HistoryFile
const state = hydrateFromDraws('lotto539', SLOTS, file.rows.map(([t, d, p]) => ({ drawTerm: t, drawDate: d, prizes: p })))
const year = state.history.at(-1)!.date.slice(0, 4)
const draws = state.history
  .filter(e => e.date.startsWith(year))
  .map(e => ({ no: e.issue.slice(-3), ys: (e.positions ?? '').split(',').map(p => Number(p.split('-')[1])) }))

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(q * (sorted.length - 1))]!
}

function trendWord(sums: number[]): string {
  const [a, b, c] = sums as [number, number, number]
  if (a < b && b < c) return '一路往上'
  if (a > b && b > c) return '一路往下'
  if (c > b) return '最近往上'
  if (c < b) return '最近往下'
  return '持平'
}

console.log(`${year} 年到第 ${state.history.at(-1)!.issue} 期，共 ${draws.length} 期\n`)
for (const y of Y_VALUES) {
  const counts = draws.map(d => d.ys.filter(v => v === y).length)
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length
  const w = Math.max(MIN_WINDOW, Math.round(TARGET_WINDOW_SUM / mean))
  const sums = counts.slice(w - 1).map((_, i) => counts.slice(i, i + w).reduce((a, b) => a + b, 0))
  const hi = quantile(sums, HIGH_Q)
  const lo = quantile(sums, LOW_Q)
  const lastSums = sums.slice(-3)
  const now = lastSums.at(-1)!
  const zone = now >= hi ? '正處在高波段' : now <= lo ? '正處在低波段' : '在中間（不高不低）'

  const last = counts.at(-1)!
  let more = 0, less = 0, same = 0
  for (let i = 0; i < counts.length - 1; i++) {
    if (counts[i] !== last) continue
    if (counts[i + 1]! > last) more++
    else if (counts[i + 1]! < last) less++
    else same++
  }
  const dirs = counts.slice(1).map((v, i) => Math.sign(v - counts[i]!)).filter(d => d !== 0)
  const alt = dirs.slice(1).filter((d, i) => d !== dirs[i]).length
  const recentN = Math.max(w, 5)
  const recent = draws.slice(-recentN).map((d, i) => `${d.no}:${counts[counts.length - recentN + i]}`).join(' ')

  console.log(`y=${y}｜平均每期 ${mean.toFixed(2)} 顆｜看 ${w} 期合計（平均 ${(sums.reduce((a, b) => a + b, 0) / sums.length).toFixed(1)}，高 ≥${hi}、低 ≤${lo}）`)
  console.log(`  最近 ${recentN} 期：${recent}`)
  console.log(`  最近三個 ${w} 期合計：${lastSums.join('、')} → ${zone}，${trendWord(lastSums)}`)
  console.log(`  上一期 ${last} 顆之後的下一期：比較多 ${more}、比較少 ${less}、一樣 ${same}｜大小交替 ${Math.round(100 * alt / (dirs.length - 1))}%\n`)
}
