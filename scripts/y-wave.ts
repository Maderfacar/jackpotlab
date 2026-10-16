/**
 * 539 位置 y=1～5／值 0～5「近期波段的變化走勢」（使用者固定問法，2026-10-16 定案）。
 *
 * 範圍：最新一期所在的年份（今年以來）。每期數這期 5 顆中位置 y=k（或值=v）的顆數。
 * 各 y 出現頻率不同，不能都用 3 期看：視窗 W = round(7.1 ÷ 該 y 每期平均)（至少 3 期），
 * 讓 W 期合計平均都在 7 左右；高波段 = 今年 W 期合計的前 20%，低波段 = 後 20%。
 * 另給「上一期是 c 顆之後，下一期比較多／少／一樣」的次數與大小交替率。
 *
 * 用法（先補歷史檔再算）：
 *   node --import tsx --env-file=.env.local scripts/export-539-history.ts
 *   node --import tsx scripts/y-wave.ts          # 位置 y=1～5
 *   node --import tsx scripts/y-wave.ts value    # 值 0～5
 */
import { readFileSync } from 'node:fs'
import { hydrateFromDraws, type HistoryEntry } from '../app/utils/analysis'
import type { HistoryFile } from '../shared/lotto/history-file'

const METRICS = {
  y: {
    label: 'y',
    keys: [1, 2, 3, 4, 5],
    pick: (e: HistoryEntry) => (e.positions ?? '').split(',').map(p => Number(p.split('-')[1]))
  },
  value: {
    label: '值',
    keys: [0, 1, 2, 3, 4, 5],
    pick: (e: HistoryEntry) => (e.values ?? '').split(',').filter(v => v !== '').map(Number)
  }
} as const
const LOW_VALUE_SUM = 10

function valueSumOf(e: HistoryEntry): number {
  return (e.values ?? '').split(',').filter(v => v !== '').reduce((a, v) => a + Number(v), 0)
}

const metric = METRICS[process.argv[2] === 'value' ? 'value' : 'y']
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
  .map(e => ({ no: e.issue.slice(-3), ys: metric.pick(e), valueSum: valueSumOf(e) }))

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(q * (sorted.length - 1))]!
}

// 年內樣本少於這個數時，另附 2007 年起全史的分布當參考
const MIN_YEAR_SAMPLE = 20
const WARMUP = 100
const allDraws = state.history.slice(WARMUP).map(e => metric.pick(e))
const allValueSums = state.history.slice(WARMUP).map(valueSumOf)

/** 符合條件的期，下一期各是幾顆的次數 */
function distWhere(counts: number[], match: (i: number) => boolean): Map<number, number> {
  const dist = new Map<number, number>()
  for (let i = 0; i < counts.length - 1; i++) {
    if (!match(i)) continue
    dist.set(counts[i + 1]!, (dist.get(counts[i + 1]!) ?? 0) + 1)
  }
  return dist
}

/** 上一期是 last 顆時，下一期各是幾顆的次數 */
function nextDistribution(counts: number[], last: number): Map<number, number> {
  const dist = new Map<number, number>()
  for (let i = 0; i < counts.length - 1; i++) {
    if (counts[i] !== last) continue
    dist.set(counts[i + 1]!, (dist.get(counts[i + 1]!) ?? 0) + 1)
  }
  return dist
}

function formatDistribution(dist: Map<number, number>): string {
  const n = [...dist.values()].reduce((a, b) => a + b, 0)
  const mean = [...dist].reduce((a, [k, c]) => a + k * c, 0) / n
  const parts = [...dist].sort((a, b) => a[0] - b[0]).map(([k, c]) => `${k}顆 ${c}次(${Math.round(100 * c / n)}%)`)
  return `${parts.join('、')}｜共 ${n} 次，平均 ${mean.toFixed(2)} 顆`
}

/** 每一期當下的波段（W 期合計對照該序列自己的前後 20%）；前 W-1 期為 '' */
function zonesFor(counts: number[], w: number): string[] {
  const sums = counts.map((_, i) => i < w - 1 ? null : counts.slice(i - w + 1, i + 1).reduce((a, b) => a + b, 0))
  const valid = sums.filter((s): s is number => s !== null)
  const hi = quantile(valid, HIGH_Q)
  const lo = quantile(valid, LOW_Q)
  return sums.map(s => s === null ? '' : s >= hi ? '高' : s <= lo ? '低' : '中')
}

function formatDistributionSafe(dist: Map<number, number>): string {
  return dist.size === 0 ? '無' : formatDistribution(dist)
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
for (const y of metric.keys) {
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

  console.log(`${metric.label}=${y}｜平均每期 ${mean.toFixed(2)} 顆｜看 ${w} 期合計（平均 ${(sums.reduce((a, b) => a + b, 0) / sums.length).toFixed(1)}，高 ≥${hi}、低 ≤${lo}）`)
  console.log(`  最近 ${recentN} 期：${recent}`)
  console.log(`  最近三個 ${w} 期合計：${lastSums.join('、')} → ${zone}，${trendWord(lastSums)}`)
  console.log(`  上一期 ${last} 顆之後的下一期：比較多 ${more}、比較少 ${less}、一樣 ${same}｜大小交替 ${Math.round(100 * alt / (dirs.length - 1))}%`)

  const yearDist = nextDistribution(counts, last)
  console.log(`  下一期幾顆（今年）：${formatDistribution(yearDist)}`)
  const yearN = [...yearDist.values()].reduce((a, b) => a + b, 0)
  const allDist = nextDistribution(allDraws.map(vs => vs.filter(v => v === y).length), last)
  if (yearN < MIN_YEAR_SAMPLE) {
    console.log(`  下一期幾顆（2007 起全史參考）：${formatDistribution(allDist)}`)
  }
  // 下一期開完：最舊那期移出視窗，加上下一期的顆數
  const base = now - counts[counts.length - w]!
  const options = [...new Set([...yearDist.keys(), ...allDist.keys()])].sort((a, b) => a - b).map((k) => {
    const s = base + k
    const z = s >= hi ? '高' : s <= lo ? '低' : '中'
    return `開${k}顆→${s}(${z})`
  })
  console.log(`  下一期開完的 ${w} 期合計：移出 ${draws.at(-w)!.no} 期的 ${counts[counts.length - w]} 顆，${options.join('、')}`)

  // 同盤面：上一期同樣顆數＋同樣在高／中／低波段（使用者：要以目前盤面結合目前波段來看）
  const yearZones = zonesFor(counts, w)
  const nowZone = yearZones.at(-1)!
  const allCounts = allDraws.map(vs => vs.filter(v => v === y).length)
  const allZones = zonesFor(allCounts, w)
  const sameYear = distWhere(counts, i => counts[i] === last && yearZones[i] === nowZone)
  const sameAll = distWhere(allCounts, i => allCounts[i] === last && allZones[i] === nowZone)
  console.log(`  ★同盤面（上一期${last}顆＋${nowZone}波段）今年：${formatDistributionSafe(sameYear)}`)
  console.log(`  ★同盤面（上一期${last}顆＋${nowZone}波段）全史：${formatDistributionSafe(sameAll)}`)

  if (metric.label === '值') {
    // 加條件：上一期的值總和 <10（使用者問「波段遇上值總和小於 10 時」）
    const zoneOf = (i: number): string => yearZones[i]!
    console.log(`  ★同盤面＋值總和<10 全史：${formatDistributionSafe(distWhere(allCounts, i => allCounts[i] === last && allZones[i] === nowZone && allValueSums[i]! < LOW_VALUE_SUM))}`)
    console.log(`  ★同盤面＋值總和≥10 全史：${formatDistributionSafe(distWhere(allCounts, i => allCounts[i] === last && allZones[i] === nowZone && allValueSums[i]! >= LOW_VALUE_SUM))}`)
    const lines: [string, Map<number, number>][] = [
      [`今年 上一期${last}顆＋值總和<10`, distWhere(counts, i => counts[i] === last && draws[i]!.valueSum < LOW_VALUE_SUM)],
      [`今年 上一期${last}顆＋值總和≥10`, distWhere(counts, i => counts[i] === last && draws[i]!.valueSum >= LOW_VALUE_SUM)],
      [`今年 同在${nowZone}波段＋值總和<10`, distWhere(counts, i => zoneOf(i) === nowZone && draws[i]!.valueSum < LOW_VALUE_SUM)],
      [`今年 同在${nowZone}波段＋值總和≥10`, distWhere(counts, i => zoneOf(i) === nowZone && draws[i]!.valueSum >= LOW_VALUE_SUM)],
      [`全史 上一期${last}顆＋值總和<10`, distWhere(allCounts, i => allCounts[i] === last && allValueSums[i]! < LOW_VALUE_SUM)],
      [`全史 上一期${last}顆＋值總和≥10`, distWhere(allCounts, i => allCounts[i] === last && allValueSums[i]! >= LOW_VALUE_SUM)]
    ]
    console.log(`  目前值總和 ${draws.at(-1)!.valueSum}（${draws.at(-1)!.valueSum < LOW_VALUE_SUM ? '<10' : '≥10'}）`)
    for (const [label, dist] of lines) console.log(`    ${label}：${formatDistribution(dist)}`)
  }
  console.log('')
}
