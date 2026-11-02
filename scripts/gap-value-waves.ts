/**
 * 隔期總和 vs 值總和的自然波段（2026-11-02 使用者：不要用固定 100 期切，從分佈找週期）：
 * 把「值總和 ≥ 隔期總和」每期記 1−p、沒有記 −p 累加成一條線（多開時往上、少開時往下），
 * 線從高點回落滿 h、或從低點回升滿 h 就算一個轉折；不切固定段，波段長度由轉折自己決定。
 * 看上升段、下降段、整個波（高點到高點）的長度分佈：集中在某個長度就是週期。
 * 每個 h 都把同一串真實結果打亂 1,000 次，比較波長有多集中（變異係數越小越規律）。
 * 用法：node --import tsx scripts/gap-value-waves.ts（約 30 秒）
 */
import { readFileSync } from 'node:fs'
import { computeFeatures } from '../shared/lotto/patterns/features'
import type { HistoryFile } from '../shared/lotto/history-file'
import { mulberry32 } from './lib/container-sim'

const SHUFFLES = 1000
const HS = [2, 3, 5, 8, 12]
const BINS = [10, 20, 30, 40, 60, 80, 120, 160, 240, 320, 480, Infinity]

const file = JSON.parse(readFileSync('public/data/lotto539-history.json', 'utf8')) as HistoryFile
const rows = file.rows
const draws = rows.map(r => [...r[2]].sort((a, b) => a - b))
const feats = computeFeatures(draws, 60)
const T: number[] = []
const ev: number[] = []
for (let t = 60; t < draws.length; t++) {
  const f = feats[t]!
  if (f.gaps.some(g => g == null)) continue
  T.push(t)
  const G = (f.gaps as number[]).reduce((a, b) => a + b, 0)
  const V = (f.values as number[]).reduce((a, b) => a + b, 0)
  ev.push(V >= G ? 1 : 0)
}
const n = ev.length
const p = ev.reduce((a, b) => a + b, 0) / n
const label = (j: number): string => `${rows[T[j]!]![0]}(${rows[T[j]!]![1]})`

interface Turn { i: number, top: boolean }
/** 累積線的轉折：回落／回升滿 h 才確認 */
function turns(e: number[], h: number): Turn[] {
  const out: Turn[] = []
  let c = 0
  let hi = 0
  let hiAt = 0
  let lo = 0
  let loAt = 0
  let dir = 0
  e.forEach((x, i) => {
    c += x - p
    if (c > hi) { hi = c; hiAt = i }
    if (c < lo) { lo = c; loAt = i }
    if (dir >= 0 && hi - c >= h) {
      out.push({ i: hiAt, top: true })
      dir = -1
      lo = c
      loAt = i
    } else if (dir <= 0 && c - lo >= h) {
      out.push({ i: loAt, top: false })
      dir = 1
      hi = c
      hiAt = i
    }
  })
  return out
}
interface Waves { up: number[], down: number[], cycle: number[] }
function waves(ts: Turn[]): Waves {
  const up: number[] = []
  const down: number[] = []
  const cycle: number[] = []
  for (let k = 1; k < ts.length; k++) (ts[k]!.top ? up : down).push(ts[k]!.i - ts[k - 1]!.i)
  for (let k = 2; k < ts.length; k++) if (ts[k]!.top) cycle.push(ts[k]!.i - ts[k - 2]!.i)
  return { up, down, cycle }
}
const q = (a: number[], r: number): number => {
  const s = [...a].sort((x, y) => x - y)
  return s[Math.floor(r * (s.length - 1))] ?? 0
}
const cv = (a: number[]): number => {
  const m = a.reduce((x, y) => x + y, 0) / a.length
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length) / m
}
const hist = (a: number[]): number[] => BINS.map((b, k) => a.filter(x => x > (BINS[k - 1] ?? 0) && x <= b).length)
const binName = BINS.map((b, k) => `${(BINS[k - 1] ?? 0) + 1}～${b === Infinity ? '' : b}`)
const rng = mulberry32(20261102)
const shuffle = (a: number[]): number[] => {
  const e = [...a]
  for (let i = e.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[e[i], e[j]] = [e[j]!, e[i]!]
  }
  return e
}

console.log(`共 ${n} 期，值總和 ≥ 隔期總和 ${(100 * p).toFixed(1)}%`)
for (const h of HS) {
  const ts = turns(ev, h)
  const w = waves(ts)
  const simH = BINS.map(() => 0)
  let cvLe = 0
  let upCvLe = 0
  let downCvLe = 0
  const simMed: number[] = []
  for (let s = 0; s < SHUFFLES; s++) {
    const sw = waves(turns(shuffle(ev), h))
    hist(sw.cycle).forEach((c, k) => { simH[k]! += c / SHUFFLES })
    if (cv(sw.cycle) <= cv(w.cycle)) cvLe++
    if (cv(sw.up) <= cv(w.up)) upCvLe++
    if (cv(sw.down) <= cv(w.down)) downCvLe++
    simMed.push(q(sw.cycle, 0.5))
  }
  const pv = (c: number): string => ((c + 1) / (SHUFFLES + 1)).toFixed(3)
  console.log(`\n## 回落／回升滿 ${h}`)
  console.log(`整個波 ${w.cycle.length} 個：中位 ${q(w.cycle, 0.5)} 期（25%～75%：${q(w.cycle, 0.25)}～${q(w.cycle, 0.75)}），打亂後中位 ${q(simMed, 0.5)}`)
  console.log(`上升段中位 ${q(w.up, 0.5)}、下降段中位 ${q(w.down, 0.5)}`)
  console.log(`波長集中度（變異係數）${cv(w.cycle).toFixed(3)}，打亂後更集中的比例 p=${pv(cvLe)}；上升段 p=${pv(upCvLe)}、下降段 p=${pv(downCvLe)}`)
  console.log('波長 | 實際 | 打亂平均')
  hist(w.cycle).forEach((c, k) => console.log(`${binName[k]} | ${c} | ${simH[k]!.toFixed(1)}`))
  const last = ts[ts.length - 1]!
  console.log(`最後轉折：${last.top ? '高點' : '低點'} ${label(last.i)}，至今 ${n - 1 - last.i} 期；目前在${last.top ? '下降' : '上升'}段`)
  console.log('最近 6 個轉折：' + ts.slice(-6).map(x => `${x.top ? '高' : '低'}${label(x.i)}`).join(' → '))
}

// 上升段（值總和大的期變多那一段）長度細看：h=2、3，前段 2007～2020 vs 後段 2021 起
const SPLIT = T.findIndex(t => rows[t]![1] >= '2021-01-01')
const UP_BINS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100, Infinity]
const upHist = (a: number[]): number[] => UP_BINS.map((b, k) => a.filter(x => x > (UP_BINS[k - 1] ?? 0) && x <= b).length)
for (const h of [2, 3]) {
  const ts = turns(ev, h)
  const ups: { len: number, end: number }[] = []
  for (let k = 1; k < ts.length; k++) if (ts[k]!.top) ups.push({ len: ts[k]!.i - ts[k - 1]!.i, end: ts[k]!.i })
  const early = ups.filter(u => u.end < SPLIT).map(u => u.len)
  const late = ups.filter(u => u.end >= SPLIT).map(u => u.len)
  const sim = UP_BINS.map(() => 0)
  for (let s = 0; s < SHUFFLES; s++) upHist(waves(turns(shuffle(ev), h)).up).forEach((c, k) => { sim[k]! += c / SHUFFLES })
  console.log(`\n## 上升段長度（回升滿 ${h}）：全部 ${ups.length}、前段 ${early.length}、後段 ${late.length}`)
  console.log(`中位：全部 ${q(ups.map(u => u.len), 0.5)}、前段 ${q(early, 0.5)}、後段 ${q(late, 0.5)}；變異係數 前段 ${cv(early).toFixed(3)}、後段 ${cv(late).toFixed(3)}`)
  console.log('長度 | 全部 | 打亂平均 | 前段 | 後段')
  const all = upHist(ups.map(u => u.len))
  const e = upHist(early)
  const l = upHist(late)
  UP_BINS.forEach((b, k) => console.log(`${(UP_BINS[k - 1] ?? 0) + 1}～${b === Infinity ? '' : b} | ${all[k]} | ${sim[k]!.toFixed(1)} | ${e[k]} | ${l[k]}`))
  console.log('後段各上升段長度：' + late.join(' '))
}
