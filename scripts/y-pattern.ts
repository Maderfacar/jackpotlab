/**
 * 位置 y 的規律（2026-11-04 使用者，二篩重寫的依據）。y＝號碼在自己隔期格裡由小到大排第幾顆（開獎前盤面）。
 *   1. y＝1～5 每一種：每期開出幾顆；像 G 一樣看「這期比上期多或少＋這期開幾顆」→ 下一期開幾顆。
 *   2. 第一個獎號（五顆由小到大的第一顆）的 y：連續幾期是 y＝1 之後變成不是 1；變成不是 1 時是 y＝2、3 還是更大。
 *
 * 用法：node --import tsx scripts/y-pattern.ts  → docs/y-pattern.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, rows } from './blind-test'

const OUT = 'docs/y-pattern.md'
const N = allDecisions.length
const pct = (a: number, b: number): string => (b ? (100 * a / b).toFixed(1) + '%' : '—')
const cnt = [1, 2, 3, 4, 5].map(y => allDecisions.map(d => draws[d.t]!.filter(x => d.ballOf[x]!.rank === y).length))
const first = allDecisions.map(d => d.ballOf[Math.min(...draws[d.t]!)]!.rank)

const out: string[] = []
out.push('# 位置 y 的規律')
out.push('')
out.push(`> 由 \`scripts/y-pattern.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期，共 ${N} 期。y＝號碼在自己隔期格裡由小到大排第幾顆（開獎前盤面）。`)
out.push('')
out.push('## 1. y＝1～5 每期開出幾顆')
out.push('')
out.push('| y | 0 顆 | 1 顆 | 2 顆 | 3 顆 | 4 顆以上 | 平均 |')
out.push('|---|---|---|---|---|---|---|')
cnt.forEach((c, i) => {
  const d = [0, 1, 2, 3].map(k => c.filter(x => x === k).length)
  out.push(`| ${i + 1} | ${d.map(x => pct(x, N)).join(' | ')} | ${pct(c.filter(x => x >= 4).length, N)} | ${(c.reduce((a, b) => a + b, 0) / N).toFixed(2)} |`)
})
out.push('')
out.push('### 這期比上期多或少＋這期開幾顆 → 下一期開幾顆')
out.push('')
out.push('| y | 這期 | 期數 | 下一期 0 | 1 | 2 | 3 以上 | 下一期平均 |')
out.push('|---|---|---|---|---|---|---|---|')
cnt.forEach((c, i) => {
  for (const dir of [1, 0, -1]) {
    for (let k = 0; k <= 4; k++) {
      const idx = c.map((_, j) => j).filter(j => j >= 1 && j < N - 1 && Math.sign(c[j]! - c[j - 1]!) === dir && Math.min(c[j]!, 4) === k)
      if (idx.length < 30) continue
      const nx = [0, 1, 2].map(m => idx.filter(j => c[j + 1] === m).length)
      const ge3 = idx.filter(j => c[j + 1]! >= 3).length
      out.push(`| ${i + 1} | ${dir > 0 ? '變多' : dir < 0 ? '變少' : '一樣'}、開 ${k < 4 ? k : '4 以上'} 顆 | ${idx.length} | ${nx.map(x => pct(x, idx.length)).join(' | ')} | ${pct(ge3, idx.length)} | ${(idx.reduce((a, j) => a + c[j + 1]!, 0) / idx.length).toFixed(2)} |`)
    }
  }
})
out.push('')
out.push('## 2. 第一個獎號的 y')
out.push('')
const fd = [1, 2, 3, 4, 5].map(y => first.filter(x => x === y).length)
out.push(`- 全部 ${N} 期：${fd.map((c, i) => `y＝${i + 1} ${pct(c, N)}`).join('、')}`)
// y＝1 連續幾期
const run = first.map(() => 0)
for (let j = 0; j < N; j++) run[j] = first[j] === 1 ? (j ? run[j - 1]! : 0) + 1 : 0
const segs: number[] = []
for (let j = 0; j < N; j++) if (first[j] === 1 && (j === N - 1 || first[j + 1] !== 1)) segs.push(run[j]!)
const segDone = segs.slice(0, first[N - 1] === 1 ? -1 : undefined)
const sc = [1, 2, 3, 4, 5, 6, 7].map(L => segDone.filter(x => (L < 7 ? x === L : x >= L)).length)
out.push(`- y＝1 連續的段 ${segDone.length} 段：${sc.map((c, i) => `${i < 6 ? i + 1 : '7 以上'} 期 ${c}`).join('、')}（平均 ${(segDone.reduce((a, b) => a + b, 0) / segDone.length).toFixed(2)} 期）`)
out.push('')
out.push('| 已連續 y＝1 | 期數 | 下一期變成不是 1 | 變成 y＝2 | 變成 y＝3 | 變成 y＝4 以上 |')
out.push('|---|---|---|---|---|---|')
for (let L = 1; L <= 7; L++) {
  const idx = run.map((r, j) => j).filter(j => j < N - 1 && (L < 7 ? run[j] === L : run[j]! >= L))
  if (!idx.length) continue
  const non = idx.filter(j => first[j + 1] !== 1)
  out.push(`| ${L < 7 ? L : '7 以上'} 期 | ${idx.length} | ${pct(non.length, idx.length)} | ${pct(non.filter(j => first[j + 1] === 2).length, non.length)} | ${pct(non.filter(j => first[j + 1] === 3).length, non.length)} | ${pct(non.filter(j => first[j + 1]! >= 4).length, non.length)} |`)
}
out.push('')
// 不是 1 之後
out.push('| 這期第一顆 | 期數 | 下一期 y＝1 | y＝2 | y＝3 | y＝4 以上 |')
out.push('|---|---|---|---|---|---|')
for (const y of [2, 3, 4]) {
  const idx = first.map((f, j) => j).filter(j => j < N - 1 && (y < 4 ? first[j] === y : first[j]! >= 4))
  out.push(`| y＝${y < 4 ? y : '4 以上'} | ${idx.length} | ${[1, 2, 3].map(m => pct(idx.filter(j => first[j + 1] === m).length, idx.length)).join(' | ')} | ${pct(idx.filter(j => first[j + 1]! >= 4).length, idx.length)} |`)
}
out.push('')
out.push(`## 現在（${rows[rows.length - 1]![0]} 開完後）`)
out.push('')
out.push(`- 最近 8 期第一個獎號的 y：${first.slice(-8).join(' ')}；現在 y＝1 已連續 ${run[N - 1]} 期`)
cnt.forEach((c, i) => out.push(`- y＝${i + 1} 最近 8 期開出顆數：${c.slice(-8).join(' ')}`))
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
