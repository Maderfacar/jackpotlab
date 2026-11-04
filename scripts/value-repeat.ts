/**
 * 值會不會在短期內一直出現（2026-11-04 使用者）：值 0、1、2（或 3）常連著出；值大一點的不會在短短幾期裡一直出現。
 *   一期裡只要有一顆獎號來自值 v 的格，就算值 v 出現。
 *   每個值：只看「盤面上有值 v 的格」的期，比較
 *     近 3 期（這期＋往前兩期）出現過 ≥1 次 → 下一期再出現的比例
 *     近 3 期都沒出現 → 下一期出現的比例
 *   界線：從哪個值開始，「出現過」之後再出現的比例比「沒出現過」低，而且更大的值也都這樣（補）。
 *   全部歷史一起算，另列 2021 起對照。
 *
 * 用法：node --import tsx scripts/value-repeat.ts  → docs/value-repeat.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, rows } from './blind-test'

const OUT = 'docs/value-repeat.md'
const SPLIT = '2021-01-01'
const SLOTS = 60
const WINDOW = 3
/** 值 0～MAX_V 各自一列，MAX_V+1 以上合成一列 */
const MAX_V = 15
const vKey = (v: number): number => Math.min(v, MAX_V + 1)
const vName = (k: number): string => (k > MAX_V ? `${MAX_V + 1} 以上` : String(k))
const K = MAX_V + 2

const N = allDecisions.length
const late = allDecisions.map(d => rows[d.t]![1] >= SPLIT)
/** seen[i][k]：第 i 期有沒有開出值 k；board[i][k]：第 i 期開獎前盤面有沒有值 k 的格 */
const seen = allDecisions.map(d => {
  const s = new Array<boolean>(K).fill(false)
  for (const x of draws[d.t]!) if (d.ballOf[x]!.slot < SLOTS) s[vKey(d.ballOf[x]!.value)] = true
  return s
})
const board = allDecisions.map(d => {
  const s = new Array<boolean>(K).fill(false)
  for (const b of d.ballOf.slice(1)) if (b!.slot < SLOTS) s[vKey(b!.value)] = true
  return s
})
const pct = (a: number, b: number): string => (b ? (100 * a / b).toFixed(1) + '%' : '—')

interface Cell { n: number, hit: number }
const stats = Array.from({ length: K }, () => ({ yes: { n: 0, hit: 0 } as Cell, no: { n: 0, hit: 0 } as Cell, yesL: { n: 0, hit: 0 } as Cell, noL: { n: 0, hit: 0 } as Cell }))
for (let i = WINDOW; i < N; i++) {
  for (let k = 0; k < K; k++) {
    if (!board[i]![k]) continue
    let recent = false
    for (let j = i - WINDOW; j < i; j++) if (seen[j]![k]) recent = true
    const st = stats[k]!
    const c = recent ? st.yes : st.no
    c.n++; if (seen[i]![k]) c.hit++
    if (late[i]) { const cl = recent ? st.yesL : st.noL; cl.n++; if (seen[i]![k]) cl.hit++ }
  }
}
const rate = (c: Cell): number => (c.n ? c.hit / c.n : 0)
// 界線：最小的 k，使得 k 以上（有足夠樣本的）都「出現過」< 「沒出現過」
const lower = stats.map(st => st.yes.n >= 30 && st.no.n >= 30 && rate(st.yes) < rate(st.no))
let cut = K
for (let k = K - 1; k >= 0; k--) { if (lower[k]) cut = k; else break }

const out: string[] = []
out.push('# 值會不會在短期內一直出現')
out.push('')
out.push(`> 由 \`scripts/value-repeat.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期。一期裡有一顆獎號來自值 v 的格＝值 v 出現；只看開獎前盤面上有值 v 的格的期。`)
out.push(`> 近 ${WINDOW} 期＝這期往前 ${WINDOW} 期（不含這期）。界線（補）：從這個值開始，往上每個值都是「近 ${WINDOW} 期出現過」之後再出現的比例比「沒出現過」低。`)
out.push('')
out.push(`| 值 | 近 ${WINDOW} 期出現過的期數 | → 這期再出現 | 近 ${WINDOW} 期沒出現的期數 | → 這期出現 | 差 | 2021 起：出現過 → 再出現 | 2021 起：沒出現 → 出現 |`)
out.push('|---|---|---|---|---|---|---|---|')
stats.forEach((st, k) => {
  const d = st.yes.n && st.no.n ? (100 * (rate(st.yes) - rate(st.no))).toFixed(1) : '—'
  out.push(`| ${vName(k)} | ${st.yes.n} | ${pct(st.yes.hit, st.yes.n)} | ${st.no.n} | ${pct(st.no.hit, st.no.n)} | ${d} | ${pct(st.yesL.hit, st.yesL.n)}（${st.yesL.n}） | ${pct(st.noL.hit, st.noL.n)}（${st.noL.n}） |`)
})
out.push('')
out.push(`**界線：值 ${vName(cut)}** 以上，近 ${WINDOW} 期出現過之後再出現的比例都比沒出現過的低。`)
// 現在
const recentVals = new Set<number>()
for (let j = N - WINDOW; j < N; j++) for (let k = 0; k < K; k++) if (seen[j]![k]) recentVals.add(k)
out.push('')
out.push(`## 現在（${rows[rows.length - 1]![0]} 開完後）`)
out.push('')
for (let j = N - WINDOW; j < N; j++) {
  const d = allDecisions[j]!
  out.push(`- 第 ${rows[d.t]![0]} 期開出的值：${draws[d.t]!.map(x => d.ballOf[x]!.value).join('、')}`)
}
out.push(`- 這三期出現過的值：${[...recentVals].sort((a, b) => a - b).map(vName).join('、')}；界線以上的：${[...recentVals].filter(k => k >= cut).sort((a, b) => a - b).map(vName).join('、') || '沒有'}`)
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))

