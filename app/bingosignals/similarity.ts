/**
 * 賓果版歷史相似比對引擎（2026-09-02 使用者拍板「第一版試水溫」）。
 *
 * 與 539 版（app/signals/similarity.ts）的差異：
 *   - 分桶尺為賓果重切（實測 2,985 期分布拍板）：
 *       遠近（隔期）0-1／2-4／5+；數值 0／1／2+；位置 y 1／2-3／4-7／8+
 *   - 組成／逐位 y 的計分用「窮舉計分」：從載入資料窮舉所有兩期配對的差分布，
 *     分數 = 這一對贏過幾 % 的隨機配對（0 差 ≠ 自動滿分 — 稀不稀奇由資料說了算）。
 *     使用者否決了線性內插版（差/隨機平均差按比例），改為完整分布查表。
 *   - 數值總和那條線用 log2 比形狀（單顆爆值 2000+ 不再淹沒整條線）；顯示仍用原始值。
 *
 * 8 維：三線曲線形狀（獎和/隔和/log值和）、漲跌方向、遠近組成、數值結構、
 *       y 結構、逐位 y 貼近（各位各查各的窮舉表）。
 * 硬過濾與 539 相同：三條總和線收尾步方向須與現在一致。
 */

import type { SignalRow } from '../signals/types'

/** 分桶邊界（2026-09-02 拍板；edges = 各桶上限，最後一桶無上限） */
export const GAP_EDGES = [1, 4] as const
export const VAL_EDGES = [0, 1] as const
export const Y_EDGES = [1, 3, 7] as const

export const GAP_BUCKET_LABEL = '0-1／2-4／5+'
export const VAL_BUCKET_LABEL = '0／1／2+'
export const Y_BUCKET_LABEL = '1／2-3／4-7／8+'

export function bucketize(arr: number[], edges: readonly number[]): number[] {
  const counts = new Array<number>(edges.length + 1).fill(0)
  for (const v of arr) {
    if (v < 0) continue // 無效值不入桶
    let i = 0
    while (i < edges.length && v > edges[i]!) i++
    counts[i]!++
  }
  return counts
}

function l1(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i]! - (b[i] ?? 0))
  return s
}

/**
 * 窮舉計分表：給定每期的「值」（組成向量的 L1 距離、或逐位 y 的 |Δ|），
 * 由值的直方圖精確推出「隨機兩期差 = d」的完整分布（與逐對窮舉同結果、瞬間算完），
 * 回傳 score(d) = 差比 d 更大的配對比例（= 贏過幾 % 的隨機配對）。
 */
export interface ExhaustiveTable {
  /** survival[d] = P(隨機配對的差 > d)，index 超界視為 0 */
  survival: number[]
}

export function scoreFromTable(table: ExhaustiveTable, d: number): number {
  return table.survival[d] ?? 0
}

/** 組成向量版：先數各「組成」出現次數，再對相異組成配對加權窮舉。 */
function buildCompTable(comps: number[][]): ExhaustiveTable {
  const keyCounts = new Map<string, { comp: number[], n: number }>()
  for (const c of comps) {
    const key = c.join('-')
    const cur = keyCounts.get(key)
    if (cur) cur.n++
    else keyCounts.set(key, { comp: c, n: 1 })
  }
  const distinct = [...keyCounts.values()]
  const diffWeight = new Map<number, number>()
  let totalPairs = 0
  for (let i = 0; i < distinct.length; i++) {
    const a = distinct[i]!
    // 同組成配對：差 0
    const samePairs = (a.n * (a.n - 1)) / 2
    if (samePairs > 0) {
      diffWeight.set(0, (diffWeight.get(0) ?? 0) + samePairs)
      totalPairs += samePairs
    }
    for (let j = i + 1; j < distinct.length; j++) {
      const b = distinct[j]!
      const d = l1(a.comp, b.comp)
      const w = a.n * b.n
      diffWeight.set(d, (diffWeight.get(d) ?? 0) + w)
      totalPairs += w
    }
  }
  return toSurvival(diffWeight, totalPairs)
}

/** 純量版（逐位 y 用）：值的直方圖 → |Δ| 分布。 */
function buildScalarTable(values: number[]): ExhaustiveTable {
  const hist = new Map<number, number>()
  for (const v of values) {
    if (v < 0) continue
    hist.set(v, (hist.get(v) ?? 0) + 1)
  }
  const entries = [...hist.entries()]
  const diffWeight = new Map<number, number>()
  let totalPairs = 0
  for (let i = 0; i < entries.length; i++) {
    const [va, na] = entries[i]!
    const samePairs = (na * (na - 1)) / 2
    if (samePairs > 0) {
      diffWeight.set(0, (diffWeight.get(0) ?? 0) + samePairs)
      totalPairs += samePairs
    }
    for (let j = i + 1; j < entries.length; j++) {
      const [vb, nb] = entries[j]!
      const d = Math.abs(va - vb)
      const w = na * nb
      diffWeight.set(d, (diffWeight.get(d) ?? 0) + w)
      totalPairs += w
    }
  }
  return toSurvival(diffWeight, totalPairs)
}

function toSurvival(diffWeight: Map<number, number>, totalPairs: number): ExhaustiveTable {
  const maxD = Math.max(0, ...diffWeight.keys())
  const survival = new Array<number>(maxD + 1).fill(0)
  if (totalPairs === 0) return { survival }
  let acc = totalPairs
  for (let d = 0; d <= maxD; d++) {
    acc -= diffWeight.get(d) ?? 0
    survival[d] = acc / totalPairs
  }
  return { survival }
}

/** 由載入資料建好的全部窮舉表（資料每天長、表跟著自動重算） */
export interface BingoTables {
  gapComp: ExhaustiveTable
  valComp: ExhaustiveTable
  yComp: ExhaustiveTable
  /** 逐位（獎號升序第 p 顆）y 的 |Δ| 表 */
  yByRank: ExhaustiveTable[]
}

export function buildTables(rows: SignalRow[]): BingoTables {
  const gapComps = rows.map(r => bucketize(r.gaps, GAP_EDGES))
  const valComps = rows.map(r => bucketize(r.values, VAL_EDGES))
  const yComps = rows.map(r => bucketize(r.ys, Y_EDGES))
  const yByRank: ExhaustiveTable[] = []
  for (let p = 0; p < 20; p++) {
    yByRank.push(buildScalarTable(rows.map(r => r.ys[p] ?? -1)))
  }
  return {
    gapComp: buildCompTable(gapComps),
    valComp: buildCompTable(valComps),
    yComp: buildCompTable(yComps),
    yByRank
  }
}

// ---------- 形狀比對（與 539 同一套純形狀工具） ----------

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

function lastStepDir(series: number[]): number {
  const d = series[series.length - 1]! - series[series.length - 2]!
  return d > 0 ? 1 : d < 0 ? -1 : 0
}

const sumOf = (nums: number[]): number => nums.reduce((a, b) => a + b, 0)
const log2p = (v: number): number => Math.log2(1 + Math.max(0, v))

// ---------- 視窗特徵與計分 ----------

export interface BingoWindowPeriod {
  issue: string
  date: string
  prizes: number[]
  prizeSum: number
  gapSum: number
  valueSum: number
  gapComp: number[]
  valComp: number[]
  yComp: number[]
}

export function toBingoPeriod(r: SignalRow): BingoWindowPeriod {
  return {
    issue: r.issue,
    date: r.date,
    prizes: r.prizes,
    prizeSum: sumOf(r.prizes),
    gapSum: r.sum,
    valueSum: sumOf(r.values),
    gapComp: bucketize(r.gaps, GAP_EDGES),
    valComp: bucketize(r.values, VAL_EDGES),
    yComp: bucketize(r.ys, Y_EDGES)
  }
}

export interface DimScore {
  key: string
  label: string
  score: number
}

export interface BingoSimilarMatch {
  score: number
  dims: DimScore[]
  window: BingoWindowPeriod[]
  next1: BingoWindowPeriod | null
  next2: BingoWindowPeriod | null
}

export interface BingoSimilarityResult {
  windowLen: number
  candidatesAll: number
  candidates: number
  mean: number
  p95: number
  current: BingoWindowPeriod[]
  top: BingoSimilarMatch[]
}

interface WindowFeatures {
  prizeS: number[]
  gapS: number[]
  logValS: number[]
  dirSeq: number[]
  gapComps: number[][]
  valComps: number[][]
  yComps: number[][]
  ysPerPeriod: number[][]
}

function featuresOf(w: SignalRow[]): WindowFeatures {
  const prizeS = w.map(r => sumOf(r.prizes))
  const gapS = w.map(r => r.sum)
  const logValS = w.map(r => log2p(sumOf(r.values)))
  return {
    prizeS,
    gapS,
    logValS,
    dirSeq: [...dirs(prizeS), ...dirs(gapS), ...dirs(logValS)],
    gapComps: w.map(r => bucketize(r.gaps, GAP_EDGES)),
    valComps: w.map(r => bucketize(r.values, VAL_EDGES)),
    yComps: w.map(r => bucketize(r.ys, Y_EDGES)),
    ysPerPeriod: w.map(r => r.ys)
  }
}

function scoreDims(cur: WindowFeatures, cand: WindowFeatures, L: number, tables: BingoTables): DimScore[] {
  const dirMatch = cand.dirSeq.filter((d, i) => d === cur.dirSeq[i]).length / cand.dirSeq.length

  let gapCompScore = 0
  let valCompScore = 0
  let yCompScore = 0
  let yRankScore = 0
  let yRankN = 0
  for (let k = 0; k < L; k++) {
    gapCompScore += scoreFromTable(tables.gapComp, l1(cur.gapComps[k]!, cand.gapComps[k]!))
    valCompScore += scoreFromTable(tables.valComp, l1(cur.valComps[k]!, cand.valComps[k]!))
    yCompScore += scoreFromTable(tables.yComp, l1(cur.yComps[k]!, cand.yComps[k]!))
    for (let p = 0; p < 20; p++) {
      const ya = cur.ysPerPeriod[k]![p]
      const yb = cand.ysPerPeriod[k]![p]
      if (ya != null && yb != null && ya >= 1 && yb >= 1) {
        yRankScore += scoreFromTable(tables.yByRank[p]!, Math.abs(ya - yb))
        yRankN++
      }
    }
  }

  return [
    { key: 'prizeShape', label: '獎號總和形狀', score: shapeClose(cur.prizeS, cand.prizeS) },
    { key: 'gapShape', label: '隔期總和形狀', score: shapeClose(cur.gapS, cand.gapS) },
    { key: 'valShape', label: '數值總和形狀(log)', score: shapeClose(cur.logValS, cand.logValS) },
    { key: 'dir', label: '漲跌方向', score: dirMatch },
    { key: 'gapComp', label: '遠近組成', score: gapCompScore / L },
    { key: 'valComp', label: '數值結構', score: valCompScore / L },
    { key: 'yComp', label: '位置y結構', score: yCompScore / L },
    { key: 'yRank', label: '逐位y貼近', score: yRankN > 0 ? yRankScore / yRankN : 0 }
  ]
}

export function buildBingoSimilarity(
  rows: SignalRow[],
  windowLen = 3,
  topK = 5,
  prebuiltTables?: BingoTables
): BingoSimilarityResult | null {
  if (rows.length < windowLen * 2 + 2) return null
  const L = windowLen
  const tables = prebuiltTables ?? buildTables(rows)
  const curRows = rows.slice(-L)
  const cur = featuresOf(curRows)
  const curLastDirs = [lastStepDir(cur.prizeS), lastStepDir(cur.gapS), lastStepDir(cur.logValS)]

  let candidatesAll = 0
  const scored: Array<{ endIdx: number, score: number, dims: DimScore[] }> = []
  for (let j = L - 1; j <= rows.length - 1 - L; j++) {
    const w = rows.slice(j - L + 1, j + 1)
    candidatesAll++
    const feats = featuresOf(w)
    if (
      lastStepDir(feats.prizeS) !== curLastDirs[0]
      || lastStepDir(feats.gapS) !== curLastDirs[1]
      || lastStepDir(feats.logValS) !== curLastDirs[2]
    ) continue
    const dims = scoreDims(cur, feats, L, tables)
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
      window: rows.slice(s.endIdx - L + 1, s.endIdx + 1).map(toBingoPeriod),
      next1: rows[s.endIdx + 1] ? toBingoPeriod(rows[s.endIdx + 1]!) : null,
      next2: rows[s.endIdx + 2] ? toBingoPeriod(rows[s.endIdx + 2]!) : null
    }))

  return {
    windowLen: L,
    candidatesAll,
    candidates: scored.length,
    mean,
    p95,
    current: curRows.map(toBingoPeriod),
    top
  }
}
