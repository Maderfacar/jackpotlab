/**
 * 隔期總和 G 與值總和 V 的關係與波段（2026-11-03 使用者）。
 *   每期開出的五顆：G＝五顆的隔期加總、V＝五顆所在隔期格的值加總（開獎前的盤面）。差距 D＝G − V。
 *   1. 全部歷史：G、V、D 的分布，V > G 的比例，D 依 G 大小分組。
 *   2. 「V 大於 G」的自然波段（每期 V > G 記 1、否則 0；D 本身偶爾有幾百上千的極端值，直接畫線會被拉走，所以用 1／0）：
 *      現在判下一期 V 大於 G 的期會偏多還是偏少，歷史上同樣判斷時 D 落在哪。
 *   3. 下一期：隔期總和大小交替推 G 的範圍，再用同樣 G、同樣波段判斷的歷史期，看 V 落在哪個區間。
 *
 * 用法：node --import tsx scripts/gap-value-sum.ts  → docs/gap-value-sum.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, next, rows, Wave } from './blind-test'

const OUT = 'docs/gap-value-sum.md'
const SLOTS = 60
/** 下一期 G 的範圍：用上一期 G ± 這麼多的歷史期 */
const G_NEAR = 8

const G = allDecisions.map(d => draws[d.t]!.reduce((a, x) => a + Math.min(d.ballOf[x]!.slot, SLOTS), 0))
const V = allDecisions.map(d => draws[d.t]!.reduce((a, x) => a + d.ballOf[x]!.value, 0))
const D = G.map((g, i) => g - V[i]!)
const N = D.length

const q = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]! : NaN
}
const qs = (xs: number[]): string => `${q(xs, 0.1)}／${q(xs, 0.25)}／${q(xs, 0.5)}／${q(xs, 0.75)}／${q(xs, 0.9)}`
const mean = (xs: number[]): string => (xs.reduce((a, b) => a + b, 0) / (xs.length || 1)).toFixed(1)
const pct = (a: number, b: number): string => (b ? (100 * a / b).toFixed(1) + '%' : '—')

// 「V 大於 G」的自然波段：每期決定前記下判斷，再把這期的 1／0 推進去
const wave = new Wave()
const pred: boolean[] = []
for (let i = 0; i < N; i++) {
  pred.push(wave.up())
  wave.push(D[i]! < 0 ? 1 : 0)
}
const nowUp = wave.up()

const out: string[] = []
out.push('# 隔期總和與值總和：差距、比例、波段')
out.push('')
out.push(`> 由 \`scripts/gap-value-sum.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期，共 ${N} 期。G＝開出五顆的隔期加總，V＝五顆所在隔期格的值加總（開獎前盤面），差距 D＝G − V。`)
out.push('> 分布寫成「10%／25%／中間／75%／90%」：例如中間＝一半的期小於等於它。')
out.push('')
out.push('## 全部歷史')
out.push('')
out.push('| 項目 | 平均 | 分布 |')
out.push('|---|---|---|')
out.push(`| 隔期總和 G | ${mean(G)} | ${qs(G)} |`)
out.push(`| 值總和 V | ${mean(V)} | ${qs(V)} |`)
out.push(`| 差距 D＝G − V | ${mean(D)} | ${qs(D)} |`)
out.push('')
out.push(`- V 大於 G：${D.filter(d => d < 0).length} 期（${pct(D.filter(d => d < 0).length, N)}）；V 等於 G：${D.filter(d => d === 0).length} 期；V 小於 G：${D.filter(d => d > 0).length} 期（${pct(D.filter(d => d > 0).length, N)}）。`)
out.push('')
out.push('### 依隔期總和 G 分組')
out.push('')
out.push('| G | 期數 | 值總和 V 分布 | 差距 D 分布 | V 大於 G |')
out.push('|---|---|---|---|---|')
const BINS: [number, number][] = [[0, 19], [20, 29], [30, 39], [40, 49], [50, 57], [58, 69], [70, 89], [90, 999]]
for (const [lo, hi] of BINS) {
  const idx = G.map((g, i) => (g >= lo && g <= hi ? i : -1)).filter(i => i >= 0)
  if (!idx.length) continue
  out.push(`| ${lo}～${hi === 999 ? '' : hi} | ${idx.length} | ${qs(idx.map(i => V[i]!))} | ${qs(idx.map(i => D[i]!))} | ${pct(idx.filter(i => D[i]! < 0).length, idx.length)} |`)
}
out.push('')
out.push('## 「V 大於 G」的自然波段')
out.push('')
out.push(`- 現在：${wave.label()}。判「多」＝V 大於 G 的期會偏多（值相對偏大）；判「少」＝V 大於 G 的期偏少（值相對偏小）。`)
out.push('')
out.push('| 歷史上判 | 期數 | 差距 D 分布 | V 大於 G |')
out.push('|---|---|---|---|')
for (const up of [true, false]) {
  const idx = pred.map((p, i) => (p === up ? i : -1)).filter(i => i >= 0)
  out.push(`| ${up ? '多（V 大於 G 偏多）' : '少（V 大於 G 偏少）'} | ${idx.length} | ${qs(idx.map(i => D[i]!))} | ${pct(idx.filter(i => D[i]! < 0).length, idx.length)} |`)
}
out.push('')
out.push('### 最近 30 期')
out.push('')
out.push('| 期 | G | V | D |')
out.push('|---|---|---|---|')
for (let i = N - 30; i < N; i++) out.push(`| ${rows[allDecisions[i]!.t]![0]} | ${G[i]} | ${V[i]} | ${D[i]} |`)
out.push('')

// 下一期：G 的方向與範圍
const g1 = G[N - 1]!
const g2 = G[N - 2]!
const down = g1 > g2
const gIdx = G.map((_, i) => i).filter(i => i >= 2 && (G[i - 1]! > G[i - 2]!) === down && Math.abs(G[i - 1]! - g1) <= G_NEAR && (down ? G[i]! < G[i - 1]! : G[i]! > G[i - 1]!))
const nextG = gIdx.map(i => G[i]!)
out.push(`## 下一期（${rows[rows.length - 1]![0]} 開完後）`)
out.push('')
out.push(`- 上一期 G＝${g1}，前一期 ${g2} → ${down ? `這期要比 ${g1} 小` : `這期要比 ${g1} 大`}。`)
out.push(`- 歷史上同樣${down ? '上升後' : '下降後'}、上一期 G 在 ${g1 - G_NEAR}～${g1 + G_NEAR}、這期也照交替走的 ${gIdx.length} 期：這期 G 分布 ${qs(nextG)}。`)
out.push(`- 「V 大於 G」的波段現在判「${nowUp ? '多（值相對偏大）' : '少（值相對偏小）'}」。`)
out.push('')
const gLo = q(nextG, 0.25)
const gHi = q(nextG, 0.75)
const vIdx = G.map((g, i) => (g >= gLo && g <= gHi && pred[i] === nowUp ? i : -1)).filter(i => i >= 0)
out.push(`G 落在 ${gLo}～${gHi}（上面分布的 25%～75%）、而且「V 大於 G」波段同樣判「${nowUp ? '多' : '少'}」的歷史 ${vIdx.length} 期：`)
out.push('')
out.push(`- 值總和 V 分布 ${qs(vIdx.map(i => V[i]!))}；差距 D 分布 ${qs(vIdx.map(i => D[i]!))}；V 大於 G ${pct(vIdx.filter(i => D[i]! < 0).length, vIdx.length)}。`)
out.push('')
out.push('### 目前盤面：各值的格與顆數')
out.push('')
const byV = new Map<number, { slots: number[], balls: number }>()
for (let x = 1; x <= 39; x++) {
  const b = next.ballOf[x]!
  const e = byV.get(b.value) ?? { slots: [], balls: 0 }
  if (!e.slots.includes(b.slot)) e.slots.push(b.slot)
  e.balls++
  byV.set(b.value, e)
}
out.push('| 值 | 隔期格 | 顆數 |')
out.push('|---|---|---|')
for (const [v, e] of [...byV.entries()].sort((a, b) => a[0] - b[0])) out.push(`| ${v} | ${e.slots.sort((a, b) => a - b).join('、')} | ${e.balls} |`)
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
