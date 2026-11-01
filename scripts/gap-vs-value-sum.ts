/**
 * 每期 5 顆的隔期總和 vs 值總和（2026-11-02 使用者）：哪邊大的比例、值總和追上的連續期數與間隔、
 * 前後期有沒有黏在一起（跟同一串結果打亂順序比）、是哪顆球把值撐高、各年比例、近 30 期跟歷史比。
 * 有球隔期超過 60（null）的期不算。只用真實資料。
 * 用法：node --import tsx scripts/gap-vs-value-sum.ts（結果印在終端）
 */

import { readFileSync } from 'node:fs'
import { computeFeatures } from '../shared/lotto/patterns/features'
import type { HistoryFile } from '../shared/lotto/history-file'
const file = JSON.parse(readFileSync('public/data/lotto539-history.json', 'utf8')) as HistoryFile
const rows = file.rows
const draws = rows.map(r => [...r[2]].sort((a, b) => a - b))
const feats = computeFeatures(draws, 60)
let nullDraws = 0
const D: { t: number, G: number, V: number }[] = []
for (let t = 60; t < draws.length; t++) {
  const f = feats[t]!
  if (f.gaps.some(g => g == null)) { nullDraws++; continue }
  D.push({ t, G: f.gaps.reduce((a, b) => a! + b!, 0)!, V: f.values.reduce((a, b) => a! + b!, 0)! })
}
const n = D.length
const gt = D.filter(d => d.G > d.V).length, eq = D.filter(d => d.G === d.V).length, lt = D.filter(d => d.G < d.V).length
console.log({ n, nullDraws, gt, eq, lt })
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
console.log('meanG', mean(D.map(d => d.G)), 'meanV', mean(D.map(d => d.V)), 'meanDiff', mean(D.map(d => d.G - d.V)))
const hist = new Map<number, number>()
for (const d of D) { const k = Math.max(-10, Math.min(30, Math.floor((d.G - d.V) / 5) * 5)); hist.set(k, (hist.get(k) ?? 0) + 1) }
console.log([...hist].sort((a, b) => a[0] - b[0]))
// per-ball relation
let ballGt = 0, ballEq = 0, ballLt = 0
for (let t = 60; t < draws.length; t++) feats[t]!.gaps.forEach((g, i) => { if (g == null) return; const v = feats[t]!.values[i]!; if (g > v) ballGt++; else if (g === v) ballEq++; else ballLt++ })
console.log({ ballGt, ballEq, ballLt })
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]! }
const diffs = D.map(d => d.G - d.V)
console.log('median G', q(D.map(d => d.G), 0.5), 'median V', q(D.map(d => d.V), 0.5), 'median D', q(diffs, 0.5))
const lows = D.filter(d => d.V >= d.G)
console.log('when V>=G: median V-G', q(lows.map(d => d.V - d.G), 0.5), 'p90', q(lows.map(d => d.V - d.G), 0.9), 'max', Math.max(...lows.map(d => d.V - d.G)))
console.log('|D|<=2', diffs.filter(x => Math.abs(x) <= 2).length, '|D|<=5', diffs.filter(x => Math.abs(x) <= 5).length)
// runs of G>V
const ev = D.map(d => d.V >= d.G ? 1 : 0)
const runs = (e: number[]) => { const g: number[] = []; const o: number[] = []; let c = 0, cur = e[0]!; for (const x of e) { if (x === cur) c++; else { (cur ? o : g).push(c); cur = x; c = 1 } } (cur ? o : g).push(c); return { g, o } }
const r = runs(ev)
const dist = (a: number[]) => { const m = new Map<number, number>(); for (const x of a) m.set(Math.min(x, 15), (m.get(Math.min(x, 15)) ?? 0) + 1); return [...m].sort((a, b) => a[0] - b[0]) }
console.log('G>V run lengths', dist(r.g), 'max', Math.max(...r.g), 'mean', mean(r.g))
console.log('V>=G run lengths', dist(r.o), 'max', Math.max(...r.o), 'mean', mean(r.o))
// permutation: shuffle order of real D, count runs
let rng = 12345; const rnd = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff }
const realRuns = r.g.length + r.o.length
let le = 0; const S = 2000; const sims: number[] = []
for (let s = 0; s < S; s++) { const e = [...ev]; for (let i = e.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [e[i], e[j]] = [e[j]!, e[i]!] } const rr = runs(e); const k = rr.g.length + rr.o.length; sims.push(k); if (k <= realRuns) le++ }
console.log('runs real', realRuns, 'shuffled mean', mean(sims), 'p(<=real)', (le + 1) / (S + 1))
// lag-1 conditional
let a11 = 0, a1 = 0, a01 = 0, a0 = 0
for (let i = 1; i < ev.length; i++) { if (ev[i - 1]) { a1++; a11 += ev[i]! } else { a0++; a01 += ev[i]! } }
console.log('P(V>=G | prev V>=G)', a11 / a1, a1, 'P(V>=G | prev G>V)', a01 / a0, a0)
// last 30
console.log(D.slice(-30).map(d => `${rows[d.t]![0]} G${d.G} V${d.V}`).join('\n'))
// what makes V>=G: largest single ball value share, count of balls with v>g
let dom = 0, oneBall = 0
const byK = new Map<number, [number, number]>()
for (const d of D) {
  const f = feats[d.t]!
  const vs = f.values as number[], gs = f.gaps as number[]
  const k = vs.filter((v, i) => v > gs[i]!).length
  const e = byK.get(k) ?? [0, 0]; e[0]++; if (d.V >= d.G) e[1]++; byK.set(k, e)
  if (d.V >= d.G) { const mx = Math.max(...vs); if (mx >= d.G) dom++; if (Math.max(...vs.map((v, i) => v - gs[i]!)) >= d.V - d.G) oneBall++ }
}
console.log('V>=G draws where one ball value alone >= G sum', dom, 'of', lows.length)
console.log('by #balls with v>g: [draws, V>=G]', [...byK].sort((a, b) => a[0] - b[0]))
// by year
const yr = new Map<string, [number, number]>()
for (const d of D) { const y = rows[d.t]![1].slice(0, 4); const e = yr.get(y) ?? [0, 0]; e[0]++; if (d.V >= d.G) e[1]++; yr.set(y, e) }
console.log([...yr].map(([y, [a, b]]) => `${y} ${(100 * b / a).toFixed(1)}% (${b}/${a})`).join('\n'))
// gaps between V>=G events
const idx = ev.map((x, i) => x ? i : -1).filter(i => i >= 0)
const gapsE = idx.slice(1).map((x, i) => x - idx[i]!)
console.log('interval mean', mean(gapsE), 'median', q(gapsE, 0.5), 'max', Math.max(...gapsE))
const lastF = feats[draws.length - 1]!
console.log('last', rows[rows.length - 1], lastF.gaps, lastF.values)
const W = 30; const roll: number[] = []
for (let i = W; i <= ev.length; i++) roll.push(ev.slice(i - W, i).reduce((a, b) => a + b, 0))
const cur = roll[roll.length - 1]!
console.log('rolling30 current', cur, 'share of windows >= cur', roll.filter(x => x >= cur).length / roll.length, 'max', Math.max(...roll))
