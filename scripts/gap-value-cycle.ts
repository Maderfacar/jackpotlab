/**
 * 隔期總和 vs 值總和的節奏與週期（2026-11-02 使用者）：
 * 1. 兩次「值總和 ≥ 隔期總和」之間隔幾期的分佈，對照「每期機率固定、不記前面」時的幾何分佈
 * 2. 自相關（隔 1～120 期）
 * 3. 頻譜：週期 3～1000 期哪一個最強，跟同一串真實結果打亂順序 1,000 次比
 * 4. 每 100 期一段的比例起伏，跟打亂比
 * 5. 近 30 期高位（≥13 期）的時段與彼此間距
 * 序列：ev = 值總和 ≥ 隔期總和（1/0）；rank = 差值（隔期 − 值）的名次，避開值的長尾。只用真實資料。
 * 用法：node --import tsx scripts/gap-value-cycle.ts（約 1 分鐘）
 */
import { readFileSync } from 'node:fs'
import { computeFeatures } from '../shared/lotto/patterns/features'
import type { HistoryFile } from '../shared/lotto/history-file'
import { mulberry32 } from './lib/container-sim'

const SHUFFLES = 1000
const MAX_LAG = 120
const MIN_PERIOD = 3
const MAX_PERIOD = 1000
const SEG = 100
const WIN = 30
const HIGH = 13

const file = JSON.parse(readFileSync('public/data/lotto539-history.json', 'utf8')) as HistoryFile
const rows = file.rows
const draws = rows.map(r => [...r[2]].sort((a, b) => a - b))
const feats = computeFeatures(draws, 60)
const T: number[] = []
const diff: number[] = []
for (let t = 60; t < draws.length; t++) {
  const f = feats[t]!
  if (f.gaps.some(g => g == null)) continue
  T.push(t)
  diff.push((f.gaps as number[]).reduce((a, b) => a + b, 0) - (f.values as number[]).reduce((a, b) => a + b, 0))
}
const n = diff.length
const ev = diff.map(d => (d <= 0 ? 1 : 0))
const order = diff.map((d, i) => [d, i] as const).sort((a, b) => a[0] - b[0])
const rank = new Array<number>(n)
order.forEach(([, i], r) => { rank[i] = r / (n - 1) })
const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length
const fmt = (x: number, d = 3): string => x.toFixed(d)
const rng = mulberry32(20261102)
const shuffle = (a: number[]): number[] => {
  const e = [...a]
  for (let i = e.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[e[i], e[j]] = [e[j]!, e[i]!]
  }
  return e
}

// 1. 間隔分佈
const p = mean(ev)
const idx = ev.map((x, i) => (x ? i : -1)).filter(i => i >= 0)
const iv = idx.slice(1).map((x, i) => x - idx[i]!)
console.log(`## 1. 間隔分佈（p=${fmt(p)}，共 ${iv.length} 個間隔）`)
console.log('間隔 | 實際 | 不記前面時的期望')
let chi = 0
for (let k = 1; k <= 12; k++) {
  const obs = k < 12 ? iv.filter(x => x === k).length : iv.filter(x => x >= 12).length
  const pk = k < 12 ? (1 - p) ** (k - 1) * p : (1 - p) ** 11
  const exp = pk * iv.length
  chi += (obs - exp) ** 2 / exp
  console.log(`${k < 12 ? k : '12+'} | ${obs} | ${fmt(exp, 1)}`)
}
console.log(`卡方 ${fmt(chi, 2)}（自由度 11，門檻 p<0.05 約 19.7）`)

// 2. 自相關
const acf = (a: number[], lag: number): number => {
  const m = mean(a)
  let num = 0
  let den = 0
  for (let i = 0; i < a.length; i++) {
    den += (a[i]! - m) ** 2
    if (i + lag < a.length) num += (a[i]! - m) * (a[i + lag]! - m)
  }
  return num / den
}
const acfMax = (a: number[]): { lag: number, r: number } => {
  let best = { lag: 0, r: 0 }
  for (let l = 1; l <= MAX_LAG; l++) {
    const r = acf(a, l)
    if (Math.abs(r) > Math.abs(best.r)) best = { lag: l, r }
  }
  return best
}

// 3. 頻譜（FFT，補零到 2 的次方）
const fftPower = (a: number[]): Float64Array => {
  let N = 1
  while (N < a.length) N <<= 1
  const re = new Float64Array(N)
  const im = new Float64Array(N)
  const m = mean(a)
  a.forEach((x, i) => { re[i] = x - m })
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j]!, re[i]!]
      ;[im[i], im[j]] = [im[j]!, im[i]!]
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len
    for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) {
      const wr = Math.cos(ang * k)
      const wi = Math.sin(ang * k)
      const ur = re[i + k]!
      const ui = im[i + k]!
      const vr = re[i + k + len / 2]! * wr - im[i + k + len / 2]! * wi
      const vi = re[i + k + len / 2]! * wi + im[i + k + len / 2]! * wr
      re[i + k] = ur + vr
      im[i + k] = ui + vi
      re[i + k + len / 2] = ur - vr
      im[i + k + len / 2] = ui - vi
    }
  }
  const pw = new Float64Array(N / 2)
  for (let k = 1; k < N / 2; k++) pw[k] = re[k]! ** 2 + im[k]! ** 2
  return pw
}
const N2 = 1 << Math.ceil(Math.log2(n))
const kLo = Math.ceil(N2 / MAX_PERIOD)
const kHi = Math.floor(N2 / MIN_PERIOD)
const peaks = (pw: Float64Array): { k: number, rel: number }[] => {
  let tot = 0
  for (let k = kLo; k <= kHi; k++) tot += pw[k]!
  const avg = tot / (kHi - kLo + 1)
  const out: { k: number, rel: number }[] = []
  for (let k = kLo; k <= kHi; k++) out.push({ k, rel: pw[k]! / avg })
  return out.sort((a, b) => b.rel - a.rel)
}

// 4. 每 100 期一段的比例起伏
const segDisp = (a: number[]): number => {
  const m = mean(a)
  let s = 0
  for (let i = 0; i + SEG <= a.length; i += SEG) s += (mean(a.slice(i, i + SEG)) - m) ** 2
  return s
}

for (const [name, series] of [['ev（值總和≥隔期總和）', ev], ['rank（差值名次）', rank]] as const) {
  const realAcf = acfMax(series)
  const realPk = peaks(fftPower(series))
  const realDisp = segDisp(series)
  let acfGe = 0
  let pkGe = 0
  let dispGe = 0
  const simTop: number[] = []
  for (let s = 0; s < SHUFFLES; s++) {
    const sh = shuffle(series)
    if (Math.abs(acfMax(sh).r) >= Math.abs(realAcf.r)) acfGe++
    const top = peaks(fftPower(sh))[0]!.rel
    simTop.push(top)
    if (top >= realPk[0]!.rel) pkGe++
    if (segDisp(sh) >= realDisp) dispGe++
  }
  simTop.sort((a, b) => a - b)
  const pv = (c: number): string => fmt((c + 1) / (SHUFFLES + 1))
  console.log(`\n## ${name}`)
  console.log(`自相關最大：隔 ${realAcf.lag} 期 r=${fmt(realAcf.r)}；打亂後隔 1～${MAX_LAG} 期最大 |r| 不小於它的比例 p=${pv(acfGe)}`)
  console.log('隔 1～10 期 r：' + Array.from({ length: 10 }, (_, i) => fmt(acf(series, i + 1))).join(' '))
  console.log(`頻譜前 8 強週期（期）／強度（平均=1）：` + realPk.slice(0, 8).map(x => `${fmt(N2 / x.k, 1)}/${fmt(x.rel, 2)}`).join('  '))
  console.log(`最強週期 p=${pv(pkGe)}（打亂後最強峰中位 ${fmt(simTop[SHUFFLES >> 1]!, 2)}、95% ${fmt(simTop[Math.floor(SHUFFLES * 0.95)]!, 2)}）`)
  console.log(`每 ${SEG} 期一段的起伏 p=${pv(dispGe)}`)
}

// 5. 高位時段
console.log(`\n## 近 ${WIN} 期 ≥${HIGH} 期的時段`)
const roll: number[] = []
for (let i = WIN; i <= n; i++) roll.push(ev.slice(i - WIN, i).reduce((a, b) => a + b, 0))
const eps: { s: number, e: number, peak: number }[] = []
roll.forEach((c, j) => {
  if (c < HIGH) return
  const last = eps[eps.length - 1]
  if (last && j - last.e <= WIN) {
    last.e = j
    last.peak = Math.max(last.peak, c)
  } else eps.push({ s: j, e: j, peak: c })
})
const at = (j: number): string => `${rows[T[j + WIN - 1]!]![0]}(${rows[T[j + WIN - 1]!]![1]})`
eps.forEach((x, i) => console.log(`${at(x.s)} ～ ${at(x.e)} 最高 ${x.peak}${i ? `，距上一段 ${x.s - eps[i - 1]!.e} 期` : ''}`))
