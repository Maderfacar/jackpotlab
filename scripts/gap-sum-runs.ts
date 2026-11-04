/**
 * 隔期總和 G：大小交替與連續變大／變小之間的規律（2026-11-04 使用者）。
 *   每期 G＝開出五顆的隔期加總；方向＝比上一期大（上）、小（下）、一樣（平）。
 *   看：前幾期的方向排法、已經交替了幾次、已經連續幾期、G 的高低、上一期變動的幅度，各自跟「下一期轉向還是繼續」的關係。
 *   全部歷史一起算，另列 2021 起當對照（看規律有沒有變）。
 *
 * 用法：node --import tsx scripts/gap-sum-runs.ts  → docs/gap-sum-runs.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, rows } from './blind-test'

const OUT = 'docs/gap-sum-runs.md'
const SPLIT = '2021-01-01'
const SLOTS = 60

const G = allDecisions.map(d => draws[d.t]!.reduce((a, x) => a + Math.min(d.ballOf[x]!.slot, SLOTS), 0))
const N = G.length
const late = allDecisions.map(d => rows[d.t]![1] >= SPLIT)
const dir = G.map((g, i) => (i ? Math.sign(g - G[i - 1]!) : 0))
/** 走到第 i 期為止，同方向連續幾期 */
const run = dir.map(() => 0)
/** 走到第 i 期為止，連續交替了幾次（方向和前一期相反算一次） */
const flips = dir.map(() => 0)
for (let i = 1; i < N; i++) {
  run[i] = dir[i] !== 0 && dir[i] === dir[i - 1] ? run[i - 1]! + 1 : dir[i] !== 0 ? 1 : 0
  flips[i] = dir[i] !== 0 && dir[i - 1] !== 0 && dir[i] === -dir[i - 1]! ? flips[i - 1]! + 1 : 0
}
const sym = (d: number): string => (d > 0 ? '大' : d < 0 ? '小' : '平')
const pct = (a: number, b: number): string => (b ? (100 * a / b).toFixed(1) + '%' : '—')

interface Tally { n: number, turn: number, nL: number, turnL: number }
const tally = (pick: (i: number) => boolean): Tally => {
  const t = { n: 0, turn: 0, nL: 0, turnL: 0 }
  for (let i = 1; i < N - 1; i++) {
    if (dir[i] === 0 || dir[i + 1] === 0 || !pick(i)) continue
    const tn = dir[i + 1] === -dir[i]! ? 1 : 0
    t.n++; t.turn += tn
    if (late[i + 1]) { t.nL++; t.turnL += tn }
  }
  return t
}
const row = (name: string, t: Tally): string => `| ${name} | ${t.n} | ${pct(t.turn, t.n)} | ${pct(t.n - t.turn, t.n)} | ${t.nL} | ${pct(t.turnL, t.nL)} |`
const HEAD = '| 狀況 | 期數 | 下一期轉向（交替） | 下一期繼續（連續） | 2021 起期數 | 2021 起轉向 |\n|---|---|---|---|---|---|'

const out: string[] = []
out.push('# 隔期總和 G：大小交替 vs 連續變大／變小')
out.push('')
out.push(`> 由 \`scripts/gap-sum-runs.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期，共 ${N} 期。方向＝這期 G 比上一期大或小；一樣（平）的期不算。`)
out.push('> 「轉向」＝下一期方向和這期相反（大小交替）；「繼續」＝下一期同方向（連續變大或變小）。')
out.push('')
out.push('## 1. 已經連續幾期同方向')
out.push('')
out.push(HEAD)
for (const d of [1, -1]) for (const L of [1, 2, 3, 4]) out.push(row(`連續${sym(d)} ${L} 期`, tally(i => dir[i] === d && (L < 4 ? run[i] === L : run[i]! >= L))))
out.push('')
out.push('## 2. 已經連續交替幾次（大小大小…）')
out.push('')
out.push(HEAD)
for (const k of [0, 1, 2, 3, 4, 5]) out.push(row(k === 0 ? '上一步是連續（沒交替）' : k < 5 ? `已經交替 ${k} 次` : '已經交替 5 次以上', tally(i => (k < 5 ? flips[i] === k : flips[i]! >= k))))
out.push('')
out.push('## 3. 前三期的方向排法 → 下一期')
out.push('')
out.push('| 前三期 | 期數 | 下一期變大 | 下一期變小 | 2021 起期數 | 2021 起變大 |')
out.push('|---|---|---|---|---|---|')
for (const a of [1, -1]) for (const b of [1, -1]) for (const c of [1, -1]) {
  let n = 0, up = 0, nL = 0, upL = 0
  for (let i = 3; i < N - 1; i++) {
    if (dir[i - 2] !== a || dir[i - 1] !== b || dir[i] !== c || dir[i + 1] === 0) continue
    n++; if (dir[i + 1]! > 0) up++
    if (late[i + 1]) { nL++; if (dir[i + 1]! > 0) upL++ }
  }
  out.push(`| ${sym(a)}${sym(b)}${sym(c)} | ${n} | ${pct(up, n)} | ${pct(n - up, n)} | ${nL} | ${pct(upL, nL)} |`)
}
out.push('')
out.push('## 4. 這期 G 的高低')
out.push('')
const BINS: [number, number][] = [[0, 19], [20, 29], [30, 39], [40, 49], [50, 59], [60, 999]]
out.push('| 這期方向 | G | 期數 | 下一期轉向 | 下一期繼續 | 2021 起期數 | 2021 起轉向 |')
out.push('|---|---|---|---|---|---|---|')
for (const d of [1, -1]) for (const [lo, hi] of BINS) {
  const t = tally(i => dir[i] === d && G[i]! >= lo && G[i]! <= hi)
  out.push(`| 變${sym(d)} | ${lo}～${hi === 999 ? '' : hi} | ${t.n} | ${pct(t.turn, t.n)} | ${pct(t.n - t.turn, t.n)} | ${t.nL} | ${pct(t.turnL, t.nL)} |`)
}
out.push('')
out.push('## 5. 這期變動的幅度')
out.push('')
const AMP: [number, number][] = [[1, 5], [6, 10], [11, 20], [21, 30], [31, 999]]
out.push('| 這期方向 | 比上一期差 | 期數 | 下一期轉向 | 下一期繼續 | 2021 起期數 | 2021 起轉向 |')
out.push('|---|---|---|---|---|---|---|')
for (const d of [1, -1]) for (const [lo, hi] of AMP) {
  const t = tally(i => dir[i] === d && Math.abs(G[i]! - G[i - 1]!) >= lo && Math.abs(G[i]! - G[i - 1]!) <= hi)
  out.push(`| 變${sym(d)} | ${lo}～${hi === 999 ? '' : hi} | ${t.n} | ${pct(t.turn, t.n)} | ${pct(t.n - t.turn, t.n)} | ${t.nL} | ${pct(t.turnL, t.nL)} |`)
}
out.push('')
// 連續段：哪些情況下會出現連續 2 期以上
out.push('## 6. 連續變大／變小的段，平均多長、多久出現一次')
out.push('')
const segs: { d: number, len: number }[] = []
for (let i = 1; i < N; i++) if (dir[i] !== 0 && (i === N - 1 || dir[i + 1] !== dir[i]) && run[i]! >= 1) segs.push({ d: dir[i]!, len: run[i]! })
for (const d of [1, -1]) {
  const ls = segs.filter(s => s.d === d).map(s => s.len)
  const c = [1, 2, 3, 4, 5].map(L => ls.filter(x => (L < 5 ? x === L : x >= L)).length)
  out.push(`- 變${sym(d)}的段 ${ls.length} 段：1 期 ${c[0]}、2 期 ${c[1]}、3 期 ${c[2]}、4 期 ${c[3]}、5 期以上 ${c[4]}（平均 ${(ls.reduce((a, b) => a + b, 0) / ls.length).toFixed(2)} 期）`)
}
const gapsBetween: number[] = []
let lastLong = -1
for (let i = 1; i < N; i++) if (run[i] === 2) { if (lastLong >= 0) gapsBetween.push(i - lastLong); lastLong = i }
const gs = [...gapsBetween].sort((a, b) => a - b)
out.push(`- 出現「連續 2 期以上」的間隔：中間值 ${gs[Math.floor(gs.length / 2)]} 期、平均 ${(gs.reduce((a, b) => a + b, 0) / gs.length).toFixed(1)} 期；上一次在第 ${rows[allDecisions[lastLong]!.t]![0]} 期，到現在隔了 ${N - 1 - lastLong} 期。`)
out.push('')
out.push(`## 現在（${rows[rows.length - 1]![0]} 開完後）`)
out.push('')
out.push(`- 最近 8 期 G：${G.slice(-8).join(' ')}；方向：${dir.slice(-7).map(sym).join('')}`)
out.push(`- 這期變${sym(dir[N - 1]!)}、連續 ${run[N - 1]} 期、已經交替 ${flips[N - 1]} 次、G＝${G[N - 1]}、比上期差 ${Math.abs(G[N - 1]! - G[N - 2]!)}`)
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
