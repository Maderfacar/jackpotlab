/**
 * G 範圍（水位版）往前回測（2026-11-06 使用者：G 範圍改用盤面水位，先不管 V）。
 *   1. 盤面水位＝開這期前，盤面 39 顆的隔期平均 × 5（補）。
 *   2. 找歷史上開獎前水位跟現在相差 1.5 以內的期（補）；不到 30 期就每次放寬 0.5，直到滿 30 期（補）。
 *   3. 那些期開出的 G 由小排到大，去掉最小 10%、最大 10%，中間 80% 就是 G 範圍（補）。
 *   每一期只用開獎前的資料。比較：全部歷史 10%～90%（不看盤面）。
 *
 * 用法：node --import tsx scripts/g-level-backtest.ts → docs/g-level-backtest.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, next, rows, SLOTS, type Ball } from './blind-test'

const OUT = 'docs/g-level-backtest.md'
const WIN = 1.5
const WIN_STEP = 0.5
const MIN_N = 30
const LO = 0.1
const HI = 0.9

const onBoard = (b: Ball[]): boolean => { for (let x = 1; x <= 39; x++) if (b[x]!.slot >= SLOTS) return false; return true }
export const levelOf = (b: Ball[]): number => { let s = 0; for (let x = 1; x <= 39; x++) s += b[x]!.slot; return s * 5 / 39 }
const H = allDecisions.filter(d => onBoard(d.ballOf))
const G = H.map(d => draws[d.t]!.reduce((s, x) => s + d.ballOf[x]!.slot, 0))
const L = H.map(d => levelOf(d.ballOf))
const q = (a: number[], p: number): number => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(p * (b.length - 1))]! }

interface Range { lo: number, hi: number, n: number, win: number }
/** 用前 upTo 期（不含）找水位相近的期，回傳 G 範圍 */
export function gRange(level: number, upTo: number): Range | null {
  if (upTo < MIN_N) return null
  for (let w = WIN; ; w += WIN_STEP) {
    const pool: number[] = []
    for (let j = 0; j < upTo; j++) if (Math.abs(L[j]! - level) <= w) pool.push(G[j]!)
    if (pool.length >= MIN_N) return { lo: q(pool, LO), hi: q(pool, HI), n: pool.length, win: w }
  }
}
const allRange = (upTo: number): Range => { const p = G.slice(0, upTo); return { lo: q(p, LO), hi: q(p, HI), n: p.length, win: 0 } }

interface Acc { m: number, inn: number, low: number, high: number, w: number }
const newAcc = (): Acc => ({ m: 0, inn: 0, low: 0, high: 0, w: 0 })
const add = (a: Acc, r: Range, g: number): void => { a.m++; a.w += r.hi - r.lo; if (g < r.lo) a.low++; else if (g > r.hi) a.high++; else a.inn++ }
const byYear = new Map<string, [Acc, Acc]>()
const byLevel = new Map<string, [Acc, Acc]>()
const LEVELS: [string, number, number][] = [['29 以下', 0, 29], ['29～33', 29, 33], ['33～37', 33, 37], ['37 以上', 37, 1e9]]
const tot: [Acc, Acc] = [newAcc(), newAcc()]
const last10: string[] = []
let widened = 0
const START = MIN_N * 10
for (let i = START; i < H.length; i++) {
  const r = gRange(L[i]!, i)!
  const a = allRange(i)
  if (r.win > WIN) widened++
  const y = rows[H[i]!.t]![1].slice(0, 4)
  const lv = LEVELS.find(([, lo, hi]) => L[i]! >= lo && L[i]! < hi)![0]
  for (const [m, rr] of [[0, r], [1, a]] as const) {
    add(tot[m], rr, G[i]!)
    if (!byYear.has(y)) byYear.set(y, [newAcc(), newAcc()])
    add(byYear.get(y)![m], rr, G[i]!)
    if (!byLevel.has(lv)) byLevel.set(lv, [newAcc(), newAcc()])
    add(byLevel.get(lv)![m], rr, G[i]!)
  }
  if (i >= H.length - 10) last10.push(`| ${rows[H[i]!.t]![0] % 1000} | ${L[i]!.toFixed(1)} | ${r.lo}～${r.hi} | ${G[i]} | ${G[i]! < r.lo ? '低於' : G[i]! > r.hi ? '高於' : '在裡面'} |`)
}
const nowR = gRange(levelOf(next.ballOf), H.length)!

const pct = (a: number, b: number): string => `${(100 * a / b).toFixed(1)}%`
const cells = (a: Acc): string => `${pct(a.inn, a.m)} | ${pct(a.low, a.m)} | ${pct(a.high, a.m)} | ${(a.w / a.m).toFixed(1)}`
const out: string[] = []
out.push('# G 範圍（水位版）往前回測')
out.push('')
out.push(`> 由 \`scripts/g-level-backtest.ts\` 產生。資料到第 ${rows[H[H.length - 1]!.t]![0]} 期。前 ${START} 期只累積資料，從 ${rows[H[START]!.t]![1]} 起每期只用開獎前的資料，共 ${tot[0].m} 期。`)
out.push(`> 水位＝開獎前盤面 39 顆的隔期平均 × 5；找水位相差 ${WIN} 以內的期（不到 ${MIN_N} 期就每次放寬 ${WIN_STEP}），它們開出的 G 去掉最小、最大各 10%。比較：全部歷史 10%～90%。以上門檻都是補的。`)
out.push('')
out.push('## 整體')
out.push('')
out.push('| 範圍 | 落在裡面 | 低於範圍 | 高於範圍 | 平均寬度 |')
out.push('|---|---|---|---|---|')
out.push(`| 水位版 | ${cells(tot[0])} |`)
out.push(`| 全部歷史 | ${cells(tot[1])} |`)
out.push('')
out.push(`- 水位版要放寬才滿 ${MIN_N} 期的：${widened} 期`)
out.push('')
out.push('## 依盤面水位')
out.push('')
out.push('| 水位 | 期數 | 水位版 落在裡面 | 低於 | 高於 | 寬度 | 全部歷史 落在裡面 | 低於 | 高於 | 寬度 |')
out.push('|---|---|---|---|---|---|---|---|---|---|')
for (const [k] of LEVELS) { const e = byLevel.get(k); if (e) out.push(`| ${k} | ${e[0].m} | ${cells(e[0])} | ${cells(e[1])} |`) }
out.push('')
out.push('## 每年')
out.push('')
out.push('| 年 | 期數 | 水位版 落在裡面 | 低於 | 高於 | 寬度 | 全部歷史 落在裡面 | 低於 | 高於 | 寬度 |')
out.push('|---|---|---|---|---|---|---|---|---|---|')
for (const [y, e] of [...byYear.entries()].sort()) out.push(`| ${y} | ${e[0].m} | ${cells(e[0])} | ${cells(e[1])} |`)
out.push('')
out.push('## 最近十期（水位版）')
out.push('')
out.push('| 期 | 水位 | G 範圍 | 實際 G | |')
out.push('|---|---|---|---|---|')
out.push(...last10)
out.push('')
out.push(`- 下一期：水位 ${levelOf(next.ballOf).toFixed(1)}，找到 ${nowR.n} 期，G 範圍 ${nowR.lo}～${nowR.hi}`)
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
