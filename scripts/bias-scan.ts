/**
 * 539 偏差掃描（2026-10-31 使用者：以「開獎可能存在可被偵測的偏差」為前提，用程式實算找可疑之處）。
 *
 * 四項：
 * 1. 每個號碼出現次數 vs 期望
 * 2. 每 100 期一段：各段號碼頻率、突然改變的分界點
 * 3. 號碼關聯：同期兩碼組合、上一期 → 下一期（拖牌）
 * 4. 整體分布：隔期、值、位置 y、總和、奇偶、三分區、頭號、尾數、連號，以及長期有沒有往一邊漂
 *
 * 檢定：同樣期數跑 SIMS 次公平開獎（每期 39 取 5），同一個 measure() 算出同樣的統計量；
 * p = 模擬裡跟實際一樣偏或更偏的比例（(1 + 次數) / (SIMS + 1)），z模擬 = 實際離模擬平均幾個標準差。
 * 總和、奇偶、分區、連號、重號的公平分布是把 C(39,5) 種組合全部列出來算的，不是估的。
 * 種子固定，重跑結果一樣。
 *
 * 用法：node --import tsx scripts/bias-scan.ts
 * 輸出：docs/bias-scan.md
 */

import { readFileSync, writeFileSync } from 'node:fs'
import type { HistoryFile } from '../shared/lotto/history-file'
import { BALLS, PICK, SLOTS, mulberry32 } from './lib/container-sim'
import { GAP_CATS, SEG, SUM_BINS, VALUE_CAP, drift, exact, measure } from './lib/bias-measure'
import type { Exact, Measure } from './lib/bias-measure'

const SRC = 'public/data/lotto539-history.json'
const OUT = 'docs/bias-scan.md'
const SIMS = Number(process.env.SIMS ?? 1000)
const SEED = 20261031
const DRIFT_KEYS = ['sum', 'odd', 'low', 'consec', 'repeat', 'edge', 'y1'] as const
const DRIFT_LABEL: Record<(typeof DRIFT_KEYS)[number], string> = {
  sum: '總和', odd: '奇數顆數', low: '1～13 區顆數', consec: '有連號的期', repeat: '重號（跟上期同號）顆數', edge: '位置邊緣（y=1 或 y=x，x≥3）', y1: '位置 y=1（x≥2）'
}

const P = PICK / BALLS
const pairIdx: number[] = []
for (let a = 1; a <= BALLS; a++) for (let b = a + 1; b <= BALLS; b++) pairIdx.push(a * 40 + b)
const tripleIdx: number[] = []
for (let a = 1; a <= BALLS; a++) for (let b = a + 1; b <= BALLS; b++) for (let c = b + 1; c <= BALLS; c++) tripleIdx.push((a * 40 + b) * 40 + c)
/** 連續幾段一起偏高：掃 2～SCAN_MAX 段的窗；單段 39 碼卡方的公平平均 = 39 × (1 − 5/39) = 34 */
const SCAN_MAX = 10
const SEG_CHI2_MEAN = BALLS * (1 - PICK / BALLS)
const lagIdx: number[] = []
for (let a = 1; a <= BALLS; a++) for (let b = 1; b <= BALLS; b++) lagIdx.push(a * 40 + b)

function chi2(obs: number[], exp: number[]): number {
  return obs.reduce((s, o, i) => (exp[i]! > 0 ? s + (o - exp[i]!) ** 2 / exp[i]! : s), 0)
}

/** 2 × 39 列聯表：前段 vs 後段的號碼分布一不一樣 */
function split2(b: number[], a: number[]): number {
  const tb = b.reduce((s, x) => s + x, 0)
  const ta = a.reduce((s, x) => s + x, 0)
  let x2 = 0
  for (let i = 1; i <= BALLS; i++) {
    const c = b[i]! + a[i]!
    if (c === 0) continue
    const eb = c * tb / (tb + ta)
    const ea = c * ta / (tb + ta)
    x2 += (b[i]! - eb) ** 2 / eb + (a[i]! - ea) ** 2 / ea
  }
  return x2
}

const addTo = (acc: number[], xs: number[]): number[] => acc.map((v, i) => v + xs[i]!)

interface Stats {
  /** 檢定名稱 → 統計量（越大越偏） */
  s: Record<string, number>
  segChi2: number[]
  numCusum: number[]
  cpAt: number
  adjAt: number
  scanK: number
  scanAt: number
  hists: { gap: number[], value: number[], y: number[], xy: number[] }
}

function stats(m: Measure, ex: Exact): Stats {
  const n = m.n
  const s: Record<string, number> = {}
  const E1 = n * P
  const sd1 = Math.sqrt(n * P * (1 - P))
  s.freqChi2 = chi2(m.counts.slice(1), new Array<number>(BALLS).fill(E1))
  s.freqMaxZ = Math.max(...m.counts.slice(1).map(c => Math.abs(c - E1) / sd1))

  const segE = new Array<number>(BALLS).fill(SEG * P)
  const segChi2 = m.segCounts.map(c => chi2(c.slice(1), segE))
  s.segMax = Math.max(...segChi2)
  s.segDisp = segChi2.reduce((a, b) => a + b, 0)
  let cp = 0
  let cpAt = 0
  let before = new Array<number>(BALLS + 1).fill(0)
  const total = m.segCounts.reduce(addTo, new Array<number>(BALLS + 1).fill(0))
  for (let k = 0; k + 1 < m.segCounts.length; k++) {
    before = addTo(before, m.segCounts[k]!)
    const x = split2(before, total.map((v, i) => v - before[i]!))
    if (x > cp) {
      cp = x
      cpAt = k + 1
    }
  }
  s.changePoint = cp
  let adj = 0
  let adjAt = 0
  for (let k = 0; k + 1 < m.segCounts.length; k++) {
    const x = split2(m.segCounts[k]!, m.segCounts[k + 1]!)
    if (x > adj) {
      adj = x
      adjAt = k + 1
    }
  }
  s.adjacent = adj
  let scan = 0
  let scanK = 0
  let scanAt = 0
  for (let k = 2; k <= SCAN_MAX; k++) {
    for (let a = 0; a + k <= segChi2.length; a++) {
      let sum = 0
      for (let j = a; j < a + k; j++) sum += segChi2[j]!
      const z = (sum - k * SEG_CHI2_MEAN) / Math.sqrt(k)
      if (z > scan) {
        scan = z
        scanK = k
        scanAt = a
      }
    }
  }
  s.segScan = scan
  const numCusum = Array.from({ length: BALLS }, (_, i) => Math.abs(drift(m.series[`n${i + 1}`]!).cusum))
  s.numCusumMax = Math.max(...numCusum)

  const q2 = (PICK * (PICK - 1)) / (BALLS * (BALLS - 1))
  const E2 = n * q2
  const pc = pairIdx.map(i => m.pairs[i]!)
  s.pairChi2 = chi2(pc, new Array<number>(pc.length).fill(E2))
  s.pairMax = Math.max(...pc)
  s.pairMin = -Math.min(...pc)
  const top3 = pairIdx.map((pi, i) => ({ pi, c: pc[i]! })).sort((x, y) => y.c - x.c).slice(0, 3)
  s.top3Triangle = new Set(top3.flatMap(t => [Math.floor(t.pi / 40), t.pi % 40])).size === 3 ? 1 : 0
  let tMax = 0
  for (const i of tripleIdx) if (m.triples[i]! > tMax) tMax = m.triples[i]!
  s.tripleMax = tMax
  const EL = (n - 1) * P * P
  const lc = lagIdx.map(i => m.lag[i]!)
  s.lagChi2 = chi2(lc, new Array<number>(lc.length).fill(EL))
  s.lagMax = Math.max(...lc)
  s.lagMin = -Math.min(...lc)
  const rep = m.repeatHist.reduce((a, c, k) => a + c * k, 0)
  s.repeatAbs = Math.abs(rep - (n - 1) * PICK * P)
  s.repeatDist = chi2(m.repeatHist, ex.repeatDist.map(q => q * (n - 1)))
  s.neighborAbs = Math.abs(m.neighbor - (BALLS - 1) * 2 * EL)

  s.sumBins = chi2(m.sumBins, ex.sumBins.map(q => q * n))
  s.sumMean = Math.abs(m.sumTotal / n - ex.sumMean)
  s.oddDist = chi2(m.oddHist, ex.oddDist.map(q => q * n))
  const balls = n * PICK
  s.zoneBall = chi2(m.zoneBall, [13, 13, 13].map(k => balls * k / BALLS))
  s.zonePattern = chi2([...ex.zoneDist.keys()].map(k => m.zonePattern.get(k) ?? 0), [...ex.zoneDist.values()].map(q => q * n))
  s.headBall = chi2(m.headBall, [9, 10, 10, 10].map(k => balls * k / BALLS))
  s.tailBall = chi2(m.tailBall, [3, 4, 4, 4, 4, 4, 4, 4, 4, 4].map(k => balls * k / BALLS))
  s.consecRate = Math.abs(m.consecDraws - n * ex.consecP)
  s.consecPairs = chi2(m.consecPairsHist, ex.consecPairsDist.map(q => q * n))
  for (const k of DRIFT_KEYS) {
    const d = drift(m.series[k]!)
    s[`disp_${k}`] = d.disp
    s[`cusum_${k}`] = Math.abs(d.cusum)
  }
  return { s, segChi2, numCusum, cpAt, adjAt, scanK, scanAt, hists: { gap: m.gapHist, value: m.valueHist, y: m.yHist, xy: m.xyHist } }
}

function fairDraws(n: number, rng: () => number): number[][] {
  const box = Array.from({ length: BALLS }, (_, i) => i + 1)
  return Array.from({ length: n }, () => {
    for (let k = 0; k < PICK; k++) {
      const j = k + Math.floor(rng() * (BALLS - k))
      const tmp = box[k]!
      box[k] = box[j]!
      box[j] = tmp
    }
    return box.slice(0, PICK).sort((a, b) => a - b)
  })
}

// ── 跑 ───────────────────────────────────────────────

const started = Date.now()
const file = JSON.parse(readFileSync(SRC, 'utf8')) as HistoryFile
const rows = file.rows
const draws = rows.map(r => [...r[2]].sort((a, b) => a - b))
const n = draws.length
const ex = exact()
const realM = measure(draws, ex)
const real = stats(realM, ex)
const rng = mulberry32(SEED)
const sims: Stats[] = []
for (let i = 0; i < SIMS; i++) sims.push(stats(measure(fairDraws(n, rng), ex), ex))

// 隔期、值、y 沒有公式可算，期望值 = 公平模擬的平均
const meanHist = (pick: (h: Stats['hists']) => number[]): number[] =>
  sims.map(x => pick(x.hists)).reduce(addTo, new Array<number>(pick(real.hists).length).fill(0)).map(v => v / SIMS)
const histE = { gap: meanHist(h => h.gap), value: meanHist(h => h.value), y: meanHist(h => h.y), xy: meanHist(h => h.xy) }
const xyCells = Array.from({ length: 36 }, (_, i) => i).filter(i => histE.xy[i]! > 0)
const withHist = (x: Stats): void => {
  x.s.gapDist = chi2(x.hists.gap, histE.gap)
  x.s.valueDist = chi2(x.hists.value, histE.value)
  x.s.yDist = chi2(x.hists.y, histE.y)
  x.s.xyDist = chi2(xyCells.map(i => x.hists.xy[i]!), xyCells.map(i => histE.xy[i]!))
}
withHist(real)
sims.forEach(withHist)

const pOf = (key: string): number => (1 + sims.filter(x => x.s[key]! >= real.s[key]! - 1e-9).length) / (SIMS + 1)
const zOf = (key: string): number => {
  const v = sims.map(x => x.s[key]!)
  const mu = v.reduce((a, b) => a + b, 0) / SIMS
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / (SIMS - 1))
  return sd > 0 ? (real.s[key]! - mu) / sd : 0
}
/** 是／否的檢定沒有 z 可言 */
const BINARY = new Set(['top3Triangle'])
const zStr = (key: string): string => (BINARY.has(key) ? '—' : f2(zOf(key)))
/** 「越少越偏」的檢定存成負數，顯示時翻回正的 */
const NEGATED = new Set(['pairMin', 'lagMin'])
const range = (key: string): string => {
  const v = sims.map(x => x.s[key]!).sort((a, b) => a - b)
  const lo = v[Math.floor(SIMS * 0.025)]!
  const hi = v[Math.floor(SIMS * 0.975)]!
  return NEGATED.has(key) ? `${f2(-hi)}～${f2(-lo)}` : `${f2(lo)}～${f2(hi)}`
}

// ── 格式 ───────────────────────────────────────────────

const f1 = (x: number): string => x.toFixed(1)
const f2 = (x: number): string => x.toFixed(2)
const pad = (x: number): string => String(x).padStart(2, '0')
const pct = (x: number): string => `${(100 * x).toFixed(2)}%`
const pStr = (p: number): string => (p <= 1 / (SIMS + 1) + 1e-12 ? `< ${(1 / SIMS).toFixed(3)}` : p.toFixed(3))
const sign = (x: number): string => (x >= 0 ? `+${f2(x)}` : f2(x))
/** 常態雙尾 p（單一號碼、單一格用；之後再乘檢定數） */
function normP(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp(-z * z / 2)
  const tail = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return Math.min(1, 2 * tail)
}
const termAt = (t: number): string => `${rows[t]![0]}（${rows[t]![1]}）`

interface TestRow { key: string, label: string, sec: string, real: string }
const tests: TestRow[] = []
const lines: string[] = []
const out = (...xs: string[]): void => {
  lines.push(...xs)
}
const testLine = (key: string, label: string, sec: string, realText: string): string => {
  tests.push({ key, label, sec, real: realText })
  return `| ${label} | ${realText} | ${BINARY.has(key) ? '—' : range(key)} | ${zStr(key)} | **${pStr(pOf(key))}** |`
}
const TEST_HEAD = ['| 檢定 | 實際 | 公平 95% 範圍 | z模擬 | p |', '|---|---|---|---|---|']

out(
  '# 539 偏差掃描',
  '',
  `由 \`scripts/bias-scan.ts\` 產生。資料：\`${SRC}\`，${rows[0]![0]}（${rows[0]![1]}）到 ${file.lastTerm}（${file.lastDate}），共 ${n} 期、${n * PICK} 顆。`,
  '',
  `做法：同樣 ${n} 期跑 ${SIMS} 次公平開獎（每期 39 取 5），用同一支程式算出同樣的統計量。p＝模擬裡跟實際一樣偏或更偏的比例；z模擬＝實際離模擬平均幾個標準差。總和、奇偶、分區、連號、重號的公平分布由 C(39,5)＝575,757 種組合全部列出算出。種子 ${SEED}。`,
  ''
)

// 1 ────────────────
const E1 = n * P
const sd1 = Math.sqrt(n * P * (1 - P))
const numRows = Array.from({ length: BALLS }, (_, i) => {
  const c = realM.counts[i + 1]!
  const z = (c - E1) / sd1
  return { x: i + 1, c, z, p: normP(z) }
})
const numSorted = [...numRows].sort((a, b) => b.z - a.z)
out(
  '## 1. 每個號碼的出現次數',
  '',
  `每期每個號碼開出的機會 5/39＝${pct(P)}，${n} 期期望 **${f1(E1)} 次**，標準差 √(n·p·(1−p))＝${f1(sd1)}。`,
  '',
  '| 號碼 | 次數 | 差 | z | 單號 p | ×39 後 |',
  '|---|---|---|---|---|---|',
  ...numSorted.map(r => `| ${pad(r.x)} | ${r.c} | ${sign(r.c - E1)} | ${sign(r.z)} | ${r.p.toFixed(4)} | ${Math.min(1, r.p * BALLS).toFixed(3)} |`),
  '',
  ...TEST_HEAD,
  testLine('freqChi2', '39 碼次數卡方', '1', f1(real.s.freqChi2!)),
  testLine('freqMaxZ', '最偏一碼的 |z|', '1', f2(real.s.freqMaxZ!)),
  ''
)

// 2 ────────────────
const segs = realM.segCounts
const pooled = sims.flatMap(x => x.segChi2).sort((a, b) => a - b)
const segP = (v: number): number => (1 + pooled.filter(x => x >= v - 1e-9).length) / (pooled.length + 1)
const segRows = segs.map((c, k) => {
  const zs = c.slice(1).map((v, i) => ({ x: i + 1, z: (v - SEG * P) / Math.sqrt(SEG * P * (1 - P)), v }))
  zs.sort((a, b) => b.z - a.z)
  return { k, x2: real.segChi2[k]!, hi: zs.slice(0, 3), lo: zs.slice(-3).reverse() }
})
const segTop = [...segRows].sort((a, b) => b.x2 - a.x2)
const segLabel = (k: number): string => `${termAt(k * SEG)} ～ ${termAt(k * SEG + SEG - 1)}`
const cusumRows = Array.from({ length: BALLS }, (_, i) => {
  const d = drift(realM.series[`n${i + 1}`]!)
  return { x: i + 1, c: d.cusum, at: d.at }
}).sort((a, b) => Math.abs(b.c) - Math.abs(a.c))
const pooledCusum = sims.flatMap(x => x.numCusum)
const cusumP = (v: number): number => (1 + pooledCusum.filter(x => x >= v - 1e-9).length) / (pooledCusum.length + 1)
out(
  '## 2. 每 100 期一段',
  '',
  `前 ${segs.length * SEG} 期切成 ${segs.length} 段（最後 ${n - segs.length * SEG} 期不滿一段不算）。每段每碼期望 ${f2(SEG * P)} 次。`,
  '',
  '### 號碼最不平均的 10 段',
  '',
  `段內 39 碼卡方；單段 p 用 ${SIMS} 次模擬 × ${segs.length} 段＝${pooled.length} 個公平段當對照。`,
  '',
  '| 段 | 期間 | 卡方 | 單段 p | 偏多 | 偏少 |',
  '|---|---|---|---|---|---|',
  ...segTop.slice(0, 10).map(r => `| ${r.k + 1} | ${segLabel(r.k)} | ${f1(r.x2)} | ${segP(r.x2).toFixed(4)} | ${r.hi.map(h => `${pad(h.x)}×${h.v}`).join(' ')} | ${r.lo.map(h => `${pad(h.x)}×${h.v}`).join(' ')} |`),
  '',
  '### 全部段的卡方（依時間）',
  '',
  segRows.map(r => `${r.k + 1}:${f1(r.x2)}`).join('　'),
  '',
  '### 分界點',
  '',
  `- 連續幾段一起偏高：第 ${real.scanAt + 1}～${real.scanAt + real.scanK} 段（${termAt(real.scanAt * SEG)} ～ ${termAt((real.scanAt + real.scanK) * SEG - 1)}），${real.scanK} 段卡方平均 ${f1(real.segChi2.slice(real.scanAt, real.scanAt + real.scanK).reduce((a, b) => a + b, 0) / real.scanK)}（公平平均 ${SEG_CHI2_MEAN}）。`,
  `- 前後兩半最不一樣的切點：切在第 ${real.cpAt} 段之後，也就是 ${termAt(real.cpAt * SEG)} 開始（2×39 列聯卡方 ${f1(real.s.changePoint!)}，掃過所有切點取最大）。`,
  `- 相鄰兩段差最多：第 ${real.adjAt} 段 → 第 ${real.adjAt + 1} 段，${termAt(real.adjAt * SEG)} 開始（卡方 ${f1(real.s.adjacent!)}）。`,
  '',
  ...TEST_HEAD,
  testLine('segMax', '最不平均那一段的卡方', '2', f1(real.s.segMax!)),
  testLine('segDisp', '全部段卡方加總', '2', f1(real.s.segDisp!)),
  testLine('changePoint', '前後切一刀最大差（掃全部切點）', '2', `${f1(real.s.changePoint!)}（第 ${real.cpAt} 段後）`),
  testLine('adjacent', '相鄰兩段最大差', '2', `${f1(real.s.adjacent!)}（第 ${real.adjAt}→${real.adjAt + 1} 段）`),
  testLine('segScan', `連續 2～${SCAN_MAX} 段一起偏高（掃全部窗取最大）`, '2', `${f2(real.s.segScan!)}（第 ${real.scanAt + 1}～${real.scanAt + real.scanK} 段）`),
  testLine('numCusumMax', '單一號碼累積偏離最大（39 碼取最大）', '2', f2(real.s.numCusumMax!)),
  '',
  '### 單一號碼的累積偏離（從第一期累加「實際 − 期望」，標準化後的最大值與發生期）',
  '',
  '正＝那一刻之前偏多、之後回落；負＝偏少。單碼 p 用 39 碼 × 模擬全部當對照。',
  '',
  '| 號碼 | 最大累積偏離 | 發生在 | 單碼 p |',
  '|---|---|---|---|',
  ...cusumRows.slice(0, 10).map(r => `| ${pad(r.x)} | ${sign(r.c)} | ${termAt(r.at)} | ${cusumP(Math.abs(r.c)).toFixed(4)} |`),
  ''
)

// 3 ────────────────
const q2 = (PICK * (PICK - 1)) / (BALLS * (BALLS - 1))
const E2 = n * q2
const sd2 = Math.sqrt(n * q2 * (1 - q2))
const pairRows = pairIdx.map(i => ({ a: Math.floor(i / 40), b: i % 40, c: realM.pairs[i]! })).sort((x, y) => y.c - x.c)
const q3 = (PICK * (PICK - 1) * (PICK - 2)) / (BALLS * (BALLS - 1) * (BALLS - 2))
const E3 = n * q3
const tripleRows = tripleIdx.map(i => ({ a: Math.floor(i / 1600), b: Math.floor(i / 40) % 40, c: i % 40, n: realM.triples[i]! })).sort((x, y) => y.n - x.n)
const EL = (n - 1) * P * P
const sdL = Math.sqrt((n - 1) * P * P * (1 - P * P))
const lagRows = lagIdx.map(i => ({ a: Math.floor(i / 40), b: i % 40, c: realM.lag[i]! })).sort((x, y) => y.c - x.c)
const repTotal = realM.repeatHist.reduce((a, c, k) => a + c * k, 0)
const repE = (n - 1) * PICK * P
const neighE = (BALLS - 1) * 2 * EL
const perNumRepeat = Array.from({ length: BALLS }, (_, i) => {
  const x = i + 1
  const c = realM.lag[x * 40 + x]!
  return { x, c, rate: c / realM.counts[x]! }
}).sort((a, b) => b.rate - a.rate)
out(
  '## 3. 號碼關聯',
  '',
  '### 同一期一起開出的兩碼',
  '',
  `每期某兩碼同時開出的機會 (5×4)/(39×38)＝${pct(q2)}，${n} 期期望 **${f1(E2)} 次**（標準差 ${f1(sd2)}）。共 ${pairIdx.length} 組。`,
  '',
  '| 最多 | 次數 | z | | 最少 | 次數 | z |',
  '|---|---|---|---|---|---|---|',
  ...Array.from({ length: 10 }, (_, i) => {
    const h = pairRows[i]!
    const l = pairRows[pairRows.length - 1 - i]!
    return `| ${pad(h.a)}-${pad(h.b)} | ${h.c} | ${sign((h.c - E2) / sd2)} | | ${pad(l.a)}-${pad(l.b)} | ${l.c} | ${sign((l.c - E2) / sd2)} |`
  }),
  '',
  '### 同一期一起開出的三碼',
  '',
  ...(real.s.top3Triangle === 1
    ? (() => {
        const [a, b, c] = [...new Set(pairRows.slice(0, 3).flatMap(r => [r.a, r.b]))].sort((x, y) => x - y)
        return [`- 兩碼前三名 ${pairRows.slice(0, 3).map(r => `${pad(r.a)}-${pad(r.b)}`).join('、')} 剛好是同一組三碼 **${pad(a!)}-${pad(b!)}-${pad(c!)}** 的三條邊。公平模擬裡前三名剛好圍成一組三碼的比例 ${pct(sims.filter(x => x.s.top3Triangle === 1).length / SIMS)}。（這項檢定是看到這個現象之後才加的。）這三碼同期全開 ${realM.triples[(a! * 40 + b!) * 40 + c!]} 次（期望 ${f2(E3)}）。`, '']
      })()
    : []),
  `每期某三碼同時開出的機會 (5×4×3)/(39×38×37)＝${pct(q3)}，期望 **${f2(E3)} 次**。共 ${tripleIdx.length} 組。`,
  '',
  '| 三碼 | 次數 | 三碼裡各兩碼的次數 |',
  '|---|---|---|',
  ...tripleRows.slice(0, 10).map(r => `| ${pad(r.a)}-${pad(r.b)}-${pad(r.c)} | ${r.n} | ${pad(r.a)}-${pad(r.b)}×${realM.pairs[r.a * 40 + r.b]} ${pad(r.a)}-${pad(r.c)}×${realM.pairs[r.a * 40 + r.c]} ${pad(r.b)}-${pad(r.c)}×${realM.pairs[r.b * 40 + r.c]} |`),
  '',
  '### 上一期 → 下一期（拖牌）',
  '',
  `上一期有 a、下一期有 b：${n - 1} 次轉換、39×39＝1,521 格，每格期望 (5/39)²×${n - 1}＝**${f1(EL)} 次**（標準差 ${f1(sdL)}）。a＝b 就是重號。`,
  '',
  '| 拖最多 a→b | 次數 | z | | 拖最少 a→b | 次數 | z |',
  '|---|---|---|---|---|---|---|',
  ...Array.from({ length: 10 }, (_, i) => {
    const h = lagRows[i]!
    const l = lagRows[lagRows.length - 1 - i]!
    return `| ${pad(h.a)}→${pad(h.b)} | ${h.c} | ${sign((h.c - EL) / sdL)} | | ${pad(l.a)}→${pad(l.b)} | ${l.c} | ${sign((l.c - EL) / sdL)} |`
  }),
  '',
  `- 重號（下一期開出上一期的號碼）：實際 **${repTotal} 顆**，期望 ${f1(repE)}（每期 25/39＝0.641 顆）。`,
  `- 每期重號顆數分布：${realM.repeatHist.map((c, k) => `${k} 顆 ${c} 期（期望 ${f1(ex.repeatDist[k]! * (n - 1))}）`).join('、')}。`,
  `- 鄰號拖（上一期 a、下一期 a±1）：實際 **${realM.neighbor}**，期望 ${f1(neighE)}。`,
  `- 重號率最高的號碼：${perNumRepeat.slice(0, 5).map(r => `${pad(r.x)} ${pct(r.rate)}（${r.c} 次）`).join('、')}；最低：${perNumRepeat.slice(-5).reverse().map(r => `${pad(r.x)} ${pct(r.rate)}（${r.c} 次）`).join('、')}。公平 ${pct(P)}。`,
  '',
  ...TEST_HEAD,
  testLine('pairChi2', '741 組兩碼卡方', '3', f1(real.s.pairChi2!)),
  testLine('pairMax', '最多那組的次數', '3', String(real.s.pairMax)),
  testLine('pairMin', '最少那組的次數（越少越偏）', '3', String(-real.s.pairMin!)),
  testLine('top3Triangle', '兩碼前三名圍成同一組三碼', '3', real.s.top3Triangle === 1 ? '是' : '否'),
  testLine('tripleMax', '最多那組三碼的次數', '3', `${real.s.tripleMax}（${pad(tripleRows[0]!.a)}-${pad(tripleRows[0]!.b)}-${pad(tripleRows[0]!.c)}）`),
  testLine('lagChi2', '1,521 格拖牌卡方', '3', f1(real.s.lagChi2!)),
  testLine('lagMax', '拖最多那格的次數', '3', String(real.s.lagMax)),
  testLine('lagMin', '拖最少那格的次數（越少越偏）', '3', String(-real.s.lagMin!)),
  testLine('repeatAbs', '重號總數離期望多遠', '3', `${repTotal}（差 ${sign(repTotal - repE)}）`),
  testLine('repeatDist', '每期重號顆數分布卡方', '3', f1(real.s.repeatDist!)),
  testLine('neighborAbs', '鄰號拖總數離期望多遠', '3', `${realM.neighbor}（差 ${sign(realM.neighbor - neighE)}）`),
  ''
)

// 4 ────────────────
const ballsAfter = realM.gapHist.reduce((a, b) => a + b, 0)
const distTable = (labels: string[], obs: number[], expv: number[]): string[] => [
  '| | 實際 | 期望 | 差 | 差／√期望 |',
  '|---|---|---|---|---|',
  ...labels.map((l, i) => `| ${l} | ${obs[i]} | ${f1(expv[i]!)} | ${sign(obs[i]! - expv[i]!)} | ${sign((obs[i]! - expv[i]!) / Math.sqrt(expv[i]!))} |`)
]
const gapLabels = Array.from({ length: GAP_CATS }, (_, g) => (g === SLOTS ? '盤外' : `隔期 ${g}`))
const gapShow = Array.from({ length: GAP_CATS }, (_, g) => g).filter(g => g <= 20 || g === SLOTS || Math.abs(realM.gapHist[g]! - histE.gap[g]!) / Math.sqrt(histE.gap[g]!) > 2)
const valueLabels = Array.from({ length: VALUE_CAP + 1 }, (_, v) => (v === VALUE_CAP ? `${VALUE_CAP}+` : `值 ${v}`))
const sumLabels = [`< ${SUM_BINS[0]}`, ...SUM_BINS.slice(1).map((b, i) => `${SUM_BINS[i]}～${b - 1}`), `≥ ${SUM_BINS[SUM_BINS.length - 1]}`]
const zoneKeys = [...ex.zoneDist.keys()]
const zoneLabel = (k: number): string => `${Math.floor(k / 36)}:${Math.floor(k / 6) % 6}:${k % 6}`
const zoneObs = zoneKeys.map(k => realM.zonePattern.get(k) ?? 0)
const zoneExp = zoneKeys.map(k => ex.zoneDist.get(k)! * n)
const zoneOrder = zoneKeys.map((_, i) => i).sort((a, b) => Math.abs((zoneObs[b]! - zoneExp[b]!) / Math.sqrt(zoneExp[b]!)) - Math.abs((zoneObs[a]! - zoneExp[a]!) / Math.sqrt(zoneExp[a]!)))
const balls = n * PICK
const xyLabel = (i: number): string => `x${Math.floor(i / 6)} y${i % 6}`
const xyOrder = [...xyCells].sort((a, b) => Math.abs((realM.xyHist[b]! - histE.xy[b]!) / Math.sqrt(histE.xy[b]!)) - Math.abs((realM.xyHist[a]! - histE.xy[a]!) / Math.sqrt(histE.xy[a]!)))
out(
  '## 4. 整體分布',
  '',
  `### 隔期（第 ${SLOTS + 1} 期起 ${ballsAfter} 顆；期望＝${SIMS} 次公平模擬的平均）`,
  '',
  `只列隔期 0～20、盤外、以及其他差／√期望超過 ±2 的格。`,
  '',
  ...distTable(gapShow.map(g => gapLabels[g]!), gapShow.map(g => realM.gapHist[g]!), gapShow.map(g => histE.gap[g]!)),
  '',
  '### 值',
  '',
  ...distTable(valueLabels, realM.valueHist, histE.value),
  '',
  '### 位置 y',
  '',
  ...distTable([1, 2, 3, 4, 5].map(y => `y=${y}`), realM.yHist.slice(1), histE.y.slice(1)),
  '',
  '位置 (x, y) 差最多的 8 格：',
  '',
  ...distTable(xyOrder.slice(0, 8).map(xyLabel), xyOrder.slice(0, 8).map(i => realM.xyHist[i]!), xyOrder.slice(0, 8).map(i => histE.xy[i]!)),
  '',
  `### 總和（公平平均 ${f2(ex.sumMean)}、標準差 ${f2(Math.sqrt(ex.sumVar))}；實際平均 **${f2(realM.sumTotal / n)}**）`,
  '',
  ...distTable(sumLabels, realM.sumBins, ex.sumBins.map(q => q * n)),
  '',
  '### 奇偶（奇數顆數；39 碼裡 20 奇 19 偶）',
  '',
  ...distTable([0, 1, 2, 3, 4, 5].map(k => `${k} 奇 ${5 - k} 偶`), realM.oddHist, ex.oddDist.map(q => q * n)),
  '',
  '### 三分區（1～13、14～26、27～39）',
  '',
  ...distTable(['1～13', '14～26', '27～39'], realM.zoneBall, [13, 13, 13].map(k => balls * k / BALLS)),
  '',
  '每期三區顆數組合差最多的 8 種（區1:區2:區3）：',
  '',
  ...distTable(zoneOrder.slice(0, 8).map(i => zoneLabel(zoneKeys[i]!)), zoneOrder.slice(0, 8).map(i => zoneObs[i]!), zoneOrder.slice(0, 8).map(i => zoneExp[i]!)),
  '',
  '### 頭號（1～9、10～19、20～29、30～39）',
  '',
  ...distTable(['1～9', '10～19', '20～29', '30～39'], realM.headBall, [9, 10, 10, 10].map(k => balls * k / BALLS)),
  '',
  '### 尾數',
  '',
  ...distTable(Array.from({ length: 10 }, (_, d) => `尾 ${d}`), realM.tailBall, [3, 4, 4, 4, 4, 4, 4, 4, 4, 4].map(k => balls * k / BALLS)),
  '',
  `### 連號（有至少一組連號的期：實際 **${realM.consecDraws} 期 ${pct(realM.consecDraws / n)}**，公平 ${pct(ex.consecP)}）`,
  '',
  ...distTable([0, 1, 2, 3, 4].map(k => `${k} 組連號`), realM.consecPairsHist, ex.consecPairsDist.map(q => q * n)),
  '',
  ...TEST_HEAD,
  testLine('gapDist', '隔期分布卡方', '4', f1(real.s.gapDist!)),
  testLine('valueDist', '值分布卡方', '4', f1(real.s.valueDist!)),
  testLine('yDist', '位置 y 分布卡方', '4', f1(real.s.yDist!)),
  testLine('xyDist', '位置 (x,y) 分布卡方', '4', f1(real.s.xyDist!)),
  testLine('sumBins', '總和分段卡方', '4', f1(real.s.sumBins!)),
  testLine('sumMean', '總和平均離 100 多遠', '4', `${f2(realM.sumTotal / n)}（差 ${f2(real.s.sumMean!)}）`),
  testLine('oddDist', '奇偶分布卡方', '4', f1(real.s.oddDist!)),
  testLine('zoneBall', '三分區顆數卡方', '4', f1(real.s.zoneBall!)),
  testLine('zonePattern', '三分區每期組合卡方', '4', f1(real.s.zonePattern!)),
  testLine('headBall', '頭號卡方', '4', f1(real.s.headBall!)),
  testLine('tailBall', '尾數卡方', '4', f1(real.s.tailBall!)),
  testLine('consecRate', '有連號的期數離期望多遠', '4', `${realM.consecDraws}（差 ${sign(realM.consecDraws - n * ex.consecP)}）`),
  testLine('consecPairs', '連號組數分布卡方', '4', f1(real.s.consecPairs!)),
  ''
)

out(
  '### 長期有沒有往一邊漂',
  '',
  `每期一個量減掉公平期望，(a) 每 100 期一段的 z 平方加總：段跟段之間起伏是否比公平大；(b) 從第一期累加的最大偏離（標準化）：有沒有一段長時間一直偏同一邊，發生在哪一期。`,
  '',
  '| 量 | 各段 z（依時間，|z|≥2 標出） | 最大累積偏離 | 發生在 |',
  '|---|---|---|---|',
  ...DRIFT_KEYS.map((k) => {
    const d = drift(realM.series[k]!)
    return `| ${DRIFT_LABEL[k]} | ${d.segZ.map((z, i) => (Math.abs(z) >= 2 ? `**${i + 1}:${sign(z)}**` : '')).filter(Boolean).join(' ') || '無'} | ${sign(d.cusum)} | ${termAt(d.at)} |`
  }),
  '',
  ...TEST_HEAD,
  ...DRIFT_KEYS.flatMap(k => [
    testLine(`disp_${k}`, `${DRIFT_LABEL[k]}：段間起伏`, '4', f1(real.s[`disp_${k}`]!)),
    testLine(`cusum_${k}`, `${DRIFT_LABEL[k]}：累積偏離`, '4', f2(real.s[`cusum_${k}`]!))
  ]),
  ''
)

// 排名 ────────────────
const ranked = tests.map(t => ({ ...t, p: pOf(t.key), z: zOf(t.key) })).sort((a, b) => a.p - b.p || b.z - a.z)
const bonf = 0.05 / tests.length
out(
  '## 全部檢定依 p 排序',
  '',
  `共 ${tests.length} 個檢定。全部一起看時，要過「整體 5%」門檻，單一 p 要 ≤ 0.05 / ${tests.length}＝${bonf.toFixed(4)}；模擬 ${SIMS} 次能分辨的最小 p 是 ${(1 / (SIMS + 1)).toFixed(4)}，碰到底時看 z模擬（≥ 3.5 約相當於 p ≤ 0.0005）。`,
  '',
  '| 排名 | 項目 | 檢定 | 實際 | z模擬 | p |',
  '|---|---|---|---|---|---|',
  ...ranked.map((t, i) => `| ${i + 1} | ${t.sec} | ${t.label} | ${t.real} | ${zStr(t.key)} | ${pStr(t.p)} |`),
  '',
  `執行 ${((Date.now() - started) / 1000).toFixed(0)} 秒。`
)

writeFileSync(OUT, lines.join('\n') + '\n')
process.stdout.write(ranked.slice(0, 15).map(t => `${pStr(t.p)}\tz=${f2(t.z)}\t${t.sec}\t${t.label}\t${t.real}`).join('\n') + '\n')
