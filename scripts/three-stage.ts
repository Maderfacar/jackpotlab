/**
 * 三篩一起回測（2026-11-04 使用者）：2024 起每一期，三篩都符合的五顆組合用到的號碼＝最終名單，列剩幾顆、中幾顆。
 * 每期只用那一期開獎前的盤面與到上一期為止的資料。
 *   某一篩把組合全部刪光時，那一篩這期不用，名單退回上一篩的結果（補）；一篩就排不出組合時，名單是全部 39 顆。
 *   一篩（blind-test.ts 的 plan）：G 區間、V 區間、隔期四段顆數、同值同顆數出現比例 < 30% 的值的格排除。
 *   二篩：頭數（0～3 頭）、三區（1～13、14～26、27～39）、總和，各自看「上期方向＋所在段」的歷史，判下一期變多／變少／一樣
 *     （補：一樣＝同顆數、變多＝比上期多、變少＝比上期少；總和另外要落在同樣狀況下一期的 25%～75%）；
 *     大於 10 的值過去三期出現過 → 盤面上這個值的格排除。
 *   三篩：第一個獎號 y＝1；A 連續 3 期以上剩下四顆都有 y＝4／5、B 近 3 期合計 4 顆以上、C 盤面 y＝4／5 剩 4～5 顆，
 *     三個一起成立 → 剩下四顆不能有 y＝4／5。
 *
 * 用法：node --import tsx scripts/three-stage.ts  → docs/three-stage-backtest.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, rows } from './blind-test'

const OUT = 'docs/three-stage-backtest.md'
const FROM = '2024-01-01'
const SUM_BIN = 20
const SLOTS = 60
const segOf = (sl: number): number => (sl <= 5 ? 0 : sl <= 9 ? 1 : sl <= 19 ? 2 : 3)
const headOf = (x: number): number => Math.floor(x / 10)
const zoneOf = (x: number): number => (x <= 13 ? 0 : x <= 26 ? 1 : 2)

// 每期（以 draws 的 index）頭數、三區、總和
const T = draws.length
const headCnt = draws.map(d => [0, 1, 2, 3].map(h => d.filter(x => headOf(x) === h).length))
const zoneCnt = draws.map(d => [0, 1, 2].map(z => d.filter(x => zoneOf(x) === z).length))
const sums = draws.map(d => d.reduce((a, b) => a + b, 0))

interface Rule { lo: number, hi: number }
/** 序列 xs 在第 t 期開獎前：上期方向＋所在段 → 歷史同樣的期，下一期變多／變少／一樣哪個最多 → 給出這期的範圍 */
function judge(xs: number[], t: number, band: (x: number) => number, withRange: boolean): Rule {
  const last = xs[t - 1]!
  const dir = Math.sign(last - xs[t - 2]!)
  let up = 0, down = 0, same = 0
  const nx: number[] = []
  for (let i = 2; i < t - 1; i++) {
    if (Math.sign(xs[i]! - xs[i - 1]!) !== dir || band(xs[i]!) !== band(last)) continue
    const m = Math.sign(xs[i + 1]! - xs[i]!)
    if (m > 0) up++; else if (m < 0) down++; else same++
    nx.push(xs[i + 1]!)
  }
  if (!nx.length) return { lo: -Infinity, hi: Infinity }
  const best = Math.max(up, down, same)
  let r: Rule = best === same ? { lo: last, hi: last } : best === up ? { lo: last + 1, hi: Infinity } : { lo: -Infinity, hi: last - 1 }
  if (withRange) {
    const s = [...nx].sort((a, b) => a - b)
    const q = (p: number): number => s[Math.floor(p * (s.length - 1))]!
    r = { lo: Math.max(r.lo, q(0.25)), hi: Math.min(r.hi, q(0.75)) }
    if (r.lo > r.hi) r = { lo: q(0.25), hi: q(0.75) }
  }
  return r
}

// 三篩 y＝4／5 的狀態（以決策 index）
const D = allDecisions.length
const k45 = allDecisions.map(d => [...draws[d.t]!].sort((a, b) => a - b).slice(1).filter(x => d.ballOf[x]!.rank >= 4).length)
const run45 = k45.map(() => 0)
for (let j = 0; j < D; j++) run45[j] = k45[j]! > 0 ? (j ? run45[j - 1]! : 0) + 1 : 0

const lines: string[] = []
const levels = new Map<string, number>()
const cross = new Map<number, number[]>()
const dist = [0, 0, 0, 0, 0, 0]
let totalSize = 0, n = 0
const from = allDecisions.findIndex(d => rows[d.t]![1] >= FROM)
for (let j = from; j < D; j++) {
  const d = allDecisions[j]!
  const t = d.t
  const b = d.ballOf
  const p = d.plan
  // 一篩
  const ex = new Set(p.oneSlots)
  // 二篩：大於 10 的值過去三期出現過
  const bigVals = new Set<number>()
  for (let k = j - 3; k < j; k++) { const e = allDecisions[k]!; for (const x of draws[e.t]!) if (e.ballOf[x]!.value > 10) bigVals.add(e.ballOf[x]!.value) }
  const pool: number[] = []
  for (let x = 1; x <= 39; x++) if (b[x]!.slot < SLOTS && !ex.has(b[x]!.slot)) pool.push(x)
  const hR = [0, 1, 2, 3].map(h => judge(headCnt.map(c => c[h]!), t, x => x, false))
  const zR = [0, 1, 2].map(z => judge(zoneCnt.map(c => c[z]!), t, x => x, false))
  const sR = judge(sums, t, x => Math.floor(x / SUM_BIN), true)
  // 三篩
  const sup45 = b.slice(1).filter(o => o!.rank >= 4).length
  const no45 = j >= 3 && run45[j - 1]! >= 3 && k45[j - 1]! + k45[j - 2]! + k45[j - 3]! >= 4 && sup45 >= 4 && sup45 <= 5
  const segOk = (cnt: number[]): boolean => cnt.every((c, si) => (p.segSum === 5 ? c === p.seg[si]!.top : p.segSum < 5 ? c >= p.seg[si]!.top : c <= p.seg[si]!.top))
  const used1 = new Set<number>()
  const used2 = new Set<number>()
  const used = new Set<number>()
  const P = pool.length
  const sl = pool.map(x => b[x]!.slot)
  const va = pool.map(x => b[x]!.value)
  for (let i1 = 0; i1 < P; i1++) {
    const G1 = sl[i1]!, V1 = va[i1]!, S1 = pool[i1]!
    for (let i2 = i1 + 1; i2 < P; i2++) {
      const G2 = G1 + sl[i2]!, V2 = V1 + va[i2]!, S2 = S1 + pool[i2]!
      if (G2 > p.g.range.hi || V2 > p.v.hi) continue
      for (let i3 = i2 + 1; i3 < P; i3++) {
        const G3 = G2 + sl[i3]!, V3 = V2 + va[i3]!, S3 = S2 + pool[i3]!
        if (G3 > p.g.range.hi || V3 > p.v.hi) continue
        for (let i4 = i3 + 1; i4 < P; i4++) {
          const G4 = G3 + sl[i4]!, V4 = V3 + va[i4]!, S4 = S3 + pool[i4]!
          if (G4 > p.g.range.hi || V4 > p.v.hi) continue
          for (let i5 = i4 + 1; i5 < P; i5++) {
            const G = G4 + sl[i5]!, V = V4 + va[i5]!, S = S4 + pool[i5]!
            if (G > p.g.range.hi || V > p.v.hi || G < p.g.range.lo || V < p.v.lo) continue
            const x = [pool[i1]!, pool[i2]!, pool[i3]!, pool[i4]!, pool[i5]!]
            const seg = [0, 0, 0, 0]
            for (const m of x) seg[segOf(b[m]!.slot)]!++
            if (!segOk(seg)) continue
            for (const m of x) used1.add(m)
            if (S < sR.lo || S > sR.hi || x.some(m => bigVals.has(b[m]!.value))) continue
            const h = [0, 0, 0, 0]
            for (const m of x) h[headOf(m)]!++
            if (!h.every((c, k) => c >= hR[k]!.lo && c <= hR[k]!.hi)) continue
            const z = [0, 0, 0]
            for (const m of x) z[zoneOf(m)]!++
            if (!z.every((c, k) => c >= zR[k]!.lo && c <= zR[k]!.hi)) continue
            for (const m of x) used2.add(m)
            if (b[x[0]!]!.rank !== 1 || (no45 && x.slice(1).some(m => b[m]!.rank >= 4))) continue
            for (const m of x) used.add(m)
          }
        }
      }
    }
  }
  const level = used.size ? '三篩' : used2.size ? '退回二篩' : used1.size ? '退回一篩' : '一篩排不出（全部）'
  const pick = used.size ? used : used2.size ? used2 : used1.size ? used1 : new Set(Array.from({ length: 39 }, (_, k) => k + 1))
  levels.set(level, (levels.get(level) ?? 0) + 1)
  const list = [...pick].sort((a, c) => a - c)
  const hits = draws[t]!.filter(x => pick.has(x)).length
  const ck = Math.min(Math.floor(list.length / 5), 7)
  const row = cross.get(ck) ?? [0, 0, 0, 0, 0, 0]
  row[hits]!++
  cross.set(ck, row)
  dist[hits]!++
  totalSize += list.length
  n++
  lines.push(`| ${rows[t]![0]} | ${list.length} | ${hits} | ${level} | ${draws[t]!.join(' ')} |`)
}

const out: string[] = []
out.push('# 三篩一起回測：2024 起每一期')
out.push('')
out.push(`> 由 \`scripts/three-stage.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期。每期只用開獎前的盤面與到上一期為止的資料。`)
out.push('> 名單＝三篩都符合的五顆組合用到的號碼。做法見 docs/539-selection-direction.md；二篩、三篩的判斷換成組合規定是補的（見腳本開頭）。')
out.push('')
out.push(`共 ${n} 期，名單平均 ${(totalSize / n).toFixed(1)} 顆。名單來自：${[...levels.entries()].map(([k, v]) => `${k} ${v} 期`).join('、')}。`)
out.push('')
out.push('## 篩完幾顆 vs 中幾顆（期數）')
out.push('')
out.push('| 篩完顆數 | 中 0 | 中 1 | 中 2 | 中 3 | 中 4 | 中 5 |')
out.push('|---|---|---|---|---|---|---|')
for (const k of [...cross.keys()].sort((a, c) => a - c)) out.push(`| ${k < 7 ? `${5 * k}～${5 * k + 4}` : '35～39'} 顆 | ${cross.get(k)!.join(' | ')} |`)
out.push('')
out.push('| 中幾顆 | 期數 |')
out.push('|---|---|')
for (let k = 5; k >= 0; k--) out.push(`| ${k} 顆 | ${dist[k]} |`)
out.push('')
out.push('| 期 | 剩幾顆 | 中幾顆 | 名單來自 | 開出 |')
out.push('|---|---|---|---|---|')
out.push(...lines)
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.slice(0, 30).join('\n'))
console.log(lines.slice(-5).join('\n'))
