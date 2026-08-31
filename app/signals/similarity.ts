/**
 * 歷史相似片段（形狀比對）引擎 — 2026-08-31 使用者拍板規格。
 *
 * 拿「最新 L 期窗口」對載入歷史中所有同長度窗口做 10 項純形狀比對，
 * 每項 0~1（1 = 完全一樣），總分 = 等權平均。比的是形狀（比例／差的節奏），
 * 不比絕對數字；尾數不參與（使用者指定移除）。
 *
 * 10 項：
 *   1-3 獎號總和／隔期總和／數值總和 曲線形狀（窗口內 z-score 後點距）
 *   4   漲跌方向（三序列共 3×(L-1) 步的方向吻合率）
 *   5   隔期明細形狀（每期五顆隔期排序後向量距離）
 *   6   數值明細形狀（每期五顆數值排序後、log2 壓縮的向量距離）
 *   7   數值結構（每期 0／1-5／6-10／>10 顆數組成）
 *   8   位置 y 貼近（|Δy| 距離計分，y 差 1 給部分分）
 *   9   遠近組成（0-5／6-9／10+ 顆數組成完全相同的期數比例）
 *   10  振幅特徵（三序列的 峰位置 + 振幅比例）
 */

import type { SignalRow } from './types'

export interface WindowPeriod {
  issue: string
  date: string
  prizes: number[]
  prizeSum: number
  gapSum: number
  valueSum: number
  bucket: string
}

export interface DimScore {
  key: string
  label: string
  score: number
}

export interface SimilarMatch {
  score: number
  dims: DimScore[]
  window: WindowPeriod[]
  next1: WindowPeriod | null
  next2: WindowPeriod | null
}

export interface SimilarityResult {
  windowLen: number
  /** 全部候選窗口數（含被收尾方向過濾掉的） */
  candidatesAll: number
  /** 通過收尾方向硬過濾、實際進入比分的窗口數 */
  candidates: number
  mean: number
  p95: number
  current: WindowPeriod[]
  top: SimilarMatch[]
}

/** 分桶邊界（2026-09-01 使用者拍板）：近 0-5 / 中 6-9 / 遠 10+ */
const GAP_LOW_MAX = 5
const GAP_MID_MAX = 9
/** 隔期明細向量的距離尺度（平均每顆差 10 期 → 0 分） */
const GAP_DETAIL_SCALE = 10
/** 數值明細 log2 空間的距離尺度（平均差 2 → 值差 4 倍 → 0 分） */
const VALUE_DETAIL_SCALE = 2

function bucketOf(gaps: number[]): string {
  let low = 0
  let mid = 0
  let high = 0
  for (const g of gaps) {
    if (g <= GAP_LOW_MAX) low++
    else if (g <= GAP_MID_MAX) mid++
    else high++
  }
  return `${low}-${mid}-${high}`
}

function toPeriod(r: SignalRow): WindowPeriod {
  return {
    issue: r.issue,
    date: r.date,
    prizes: r.prizes,
    prizeSum: r.prizes.reduce((a, b) => a + b, 0),
    gapSum: r.sum,
    valueSum: r.values.reduce((a, b) => a + b, 0),
    bucket: bucketOf(r.gaps)
  }
}

/** 窗口內 z-score：去水位、去尺度，只剩形狀 */
function zshape(series: number[]): number[] {
  const mean = series.reduce((a, b) => a + b, 0) / series.length
  const sd = Math.sqrt(series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length) || 1
  return series.map(v => (v - mean) / sd)
}

function shapeClose(a: number[], b: number[]): number {
  const za = zshape(a)
  const zb = zshape(b)
  let s = 0
  for (let i = 0; i < za.length; i++) s += Math.abs(za[i]! - zb[i]!)
  return Math.max(0, 1 - (s / za.length) / 2)
}

function dirs(series: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < series.length; i++) {
    const d = series[i]! - series[i - 1]!
    out.push(d > 0 ? 1 : d < 0 ? -1 : 0)
  }
  return out
}

function sortedVecClose(a: number[], b: number[], scale: number): number {
  const sa = [...a].sort((x, y) => x - y)
  const sb = [...b].sort((x, y) => x - y)
  let s = 0
  for (let i = 0; i < sa.length; i++) s += Math.abs(sa[i]! - sb[i]!)
  return Math.max(0, 1 - (s / sa.length) / scale)
}

function valueStructure(values: number[]): number[] {
  let zero = 0
  let low = 0
  let mid = 0
  let high = 0
  for (const v of values) {
    if (v === 0) zero++
    else if (v <= 5) low++
    else if (v <= 10) mid++
    else high++
  }
  return [zero, low, mid, high]
}

function amplitudeFeatures(series: number[]): { peakIdx: number, amp: number } {
  let peakIdx = 0
  for (let i = 1; i < series.length; i++) {
    if (series[i]! > series[peakIdx]!) peakIdx = i
  }
  const max = Math.max(...series)
  const min = Math.min(...series)
  const mean = series.reduce((a, b) => a + b, 0) / series.length
  return { peakIdx, amp: (max - min) / (mean + 1) }
}

function ratioClose(a: number, b: number): number {
  const hi = Math.max(a, b, 0.001)
  const lo = Math.min(a, b)
  return Math.max(0, lo / hi)
}

interface WindowFeatures {
  prizeS: number[]
  gapS: number[]
  valS: number[]
  dirSeq: number[]
  gapsPerPeriod: number[][]
  logValsPerPeriod: number[][]
  structPerPeriod: number[][]
  ysPerPeriod: number[][]
  buckets: string[]
}

function featuresOf(w: SignalRow[]): WindowFeatures {
  const prizeS = w.map(r => r.prizes.reduce((a, b) => a + b, 0))
  const gapS = w.map(r => r.sum)
  const valS = w.map(r => r.values.reduce((a, b) => a + b, 0))
  return {
    prizeS,
    gapS,
    valS,
    dirSeq: [...dirs(prizeS), ...dirs(gapS), ...dirs(valS)],
    gapsPerPeriod: w.map(r => r.gaps),
    logValsPerPeriod: w.map(r => r.values.map(v => Math.log2(1 + Math.max(0, v)))),
    structPerPeriod: w.map(r => valueStructure(r.values)),
    ysPerPeriod: w.map(r => r.ys),
    buckets: w.map(r => bucketOf(r.gaps))
  }
}

function scoreDims(cur: WindowFeatures, cand: WindowFeatures, L: number): DimScore[] {
  const dirMatch = cand.dirSeq.filter((d, i) => d === cur.dirSeq[i]).length / cand.dirSeq.length

  let gapDetail = 0
  let valDetail = 0
  let struct = 0
  let yScore = 0
  let bucketMatch = 0
  for (let k = 0; k < L; k++) {
    gapDetail += sortedVecClose(cur.gapsPerPeriod[k]!, cand.gapsPerPeriod[k]!, GAP_DETAIL_SCALE)
    valDetail += sortedVecClose(cur.logValsPerPeriod[k]!, cand.logValsPerPeriod[k]!, VALUE_DETAIL_SCALE)
    const sa = cur.structPerPeriod[k]!
    const sb = cand.structPerPeriod[k]!
    let diff = 0
    for (let i = 0; i < sa.length; i++) diff += Math.abs(sa[i]! - sb[i]!)
    struct += Math.max(0, 1 - diff / 10)
    for (let p = 0; p < 5; p++) {
      const ya = cur.ysPerPeriod[k]![p]
      const yb = cand.ysPerPeriod[k]![p]
      if (ya != null && yb != null && ya >= 1 && yb >= 1) {
        yScore += Math.max(0, 1 - Math.abs(ya - yb) / 4)
      }
    }
    if (cur.buckets[k] === cand.buckets[k]) bucketMatch++
  }

  let ampScore = 0
  for (const key of ['prizeS', 'gapS', 'valS'] as const) {
    const fa = amplitudeFeatures(cur[key])
    const fb = amplitudeFeatures(cand[key])
    const peakClose = 1 - Math.abs(fa.peakIdx - fb.peakIdx) / (L - 1)
    ampScore += (peakClose + ratioClose(fa.amp, fb.amp)) / 2
  }

  return [
    { key: 'prizeShape', label: '獎號總和形狀', score: shapeClose(cur.prizeS, cand.prizeS) },
    { key: 'gapShape', label: '隔期總和形狀', score: shapeClose(cur.gapS, cand.gapS) },
    { key: 'valShape', label: '數值總和形狀', score: shapeClose(cur.valS, cand.valS) },
    { key: 'dir', label: '漲跌方向', score: dirMatch },
    { key: 'gapDetail', label: '隔期明細形狀', score: gapDetail / L },
    { key: 'valDetail', label: '數值明細形狀', score: valDetail / L },
    { key: 'valStruct', label: '數值結構', score: struct / L },
    { key: 'yClose', label: '位置y貼近', score: yScore / (L * 5) },
    { key: 'bucket', label: '遠近組成', score: bucketMatch / L },
    { key: 'amplitude', label: '振幅特徵', score: ampScore / 3 }
  ]
}

/** 序列收尾那一步的方向：1 加 / -1 減 / 0 平（嚴格看正負，0 才算平） */
function lastStepDir(series: number[]): number {
  const d = series[series.length - 1]! - series[series.length - 2]!
  return d > 0 ? 1 : d < 0 ? -1 : 0
}

export function buildSimilarity(rows: SignalRow[], windowLen = 3, topK = 5): SimilarityResult | null {
  if (rows.length < windowLen * 2 + 2) return null
  const L = windowLen
  const curRows = rows.slice(-L)
  const cur = featuresOf(curRows)

  // 2026-09-01 使用者拍板（方案 A）：收尾步方向硬過濾 —
  // 三條總和線（獎號/隔期/數值）收尾那步的加減方向，與現在不一致的段落直接淘汰。
  const curLastDirs = [lastStepDir(cur.prizeS), lastStepDir(cur.gapS), lastStepDir(cur.valS)]

  let candidatesAll = 0
  const scored: Array<{ endIdx: number, score: number, dims: DimScore[] }> = []
  for (let j = L - 1; j <= rows.length - 1 - L; j++) {
    const w = rows.slice(j - L + 1, j + 1)
    candidatesAll++
    const feats = featuresOf(w)
    if (
      lastStepDir(feats.prizeS) !== curLastDirs[0]
      || lastStepDir(feats.gapS) !== curLastDirs[1]
      || lastStepDir(feats.valS) !== curLastDirs[2]
    ) continue
    const dims = scoreDims(cur, feats, L)
    const score = dims.reduce((a, d) => a + d.score, 0) / dims.length
    scored.push({ endIdx: j, score, dims })
  }
  if (scored.length === 0) return null

  const sortedScores = scored.map(s => s.score).sort((a, b) => a - b)
  const mean = sortedScores.reduce((a, b) => a + b, 0) / sortedScores.length
  const p95 = sortedScores[Math.floor(sortedScores.length * 0.95)] ?? 0

  const top = [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => ({
      score: s.score,
      dims: s.dims,
      window: rows.slice(s.endIdx - L + 1, s.endIdx + 1).map(toPeriod),
      next1: rows[s.endIdx + 1] ? toPeriod(rows[s.endIdx + 1]!) : null,
      next2: rows[s.endIdx + 2] ? toPeriod(rows[s.endIdx + 2]!) : null
    }))

  return {
    windowLen: L,
    candidatesAll,
    candidates: scored.length,
    mean,
    p95,
    current: curRows.map(toPeriod),
    top
  }
}
