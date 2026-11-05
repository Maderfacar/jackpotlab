/**
 * 活的篩法單期報告（2026-11-05 試做）：每一條判斷附強弱，強的才用；排不出組合時先放掉最弱的那條。
 *   做法見 live-core.ts。補：強＝判的那一邊佔 60% 以上、而且歷史 30 次以上（使用者還沒定，先用這個）。
 *   另列「用上的強判斷合起來，歷史上實際開出的五顆同時符合的比例」（整體檢查用，這支不拿來刪）。
 *
 * 用法：node --import tsx scripts/live-pick.ts [期號] [posy]   （不給期號＝下一期）→ docs/live-pick.md
 *   加 posy＝再加「位置 y」線索（2026-11-05 使用者）→ docs/live-pick-posy.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, rows } from './blind-test'
import { D, baseCombos, choose, ctxAt, failMasks, histMasks, judgmentsAt } from './live-core'

const args = process.argv.slice(2)
const POSY = args.includes('posy')
const OUT = POSY ? 'docs/live-pick-posy.md' : 'docs/live-pick.md'
const STRONG = 0.6
const MIN_N = 30

const term = Number(args.find(a => /^\d+$/.test(a)) ?? 0)
const j = term ? allDecisions.findIndex(d => rows[d.t]![0] === term) : D
if (j < 0) throw new Error(`找不到第 ${term} 期`)
const c = ctxAt(j)
const { b, p, t } = c
const js = judgmentsAt(c, b, { posY: POSY })
const base = baseCombos(c)
const pk = choose(js, base.combos, failMasks(base.combos, js, b), histMasks(j, js), { strong: STRONG, minN: MIN_N, jointMin: null })

const pct = (x: number): string => `${(100 * x).toFixed(1)}%`
const out: string[] = []
out.push(`# 活的篩法${POSY ? '＋位置 y' : ''}：第 ${term || rows[rows.length - 1]![0] + 1} 期`)
out.push('')
out.push(`> 由 \`scripts/live-pick.ts\` 產生，只用開獎前的資料。強＝判的那一邊 ${STRONG * 100}% 以上、歷史 ${MIN_N} 次以上（補，使用者未定）。`)
out.push('')
out.push(`- 一直用：G ${p.g.range.lo}～${p.g.range.hi}、V ${p.v.lo}～${p.v.hi}；排除的格：隔期 ${base.ex.join('、') || '無'}（值出現比例 < 30%）${base.bigVals.length ? `、值 ${base.bigVals.join('、')} 的格（大於 10 近三期出現過）` : ''}`)
out.push(`- 這幾樣先排出 ${base.combos.length} 組`)
out.push('')
out.push('| 篩 | 項目 | 判 | 比例 | 次數 | 用不用 |')
out.push('|---|---|---|---|---|---|')
js.forEach((x, k) => {
  const st = pk.use.includes(k) ? '用' : pk.dropped.includes(k) ? '衝突，放掉' : x.n < MIN_N ? '不用（次數少）' : '不用（弱）'
  out.push(`| ${x.stage} | ${x.name} | ${x.say} | ${pct(x.share)} | ${x.n} | ${st} |`)
})
out.push('')
out.push(`- 用了 ${pk.use.length} 條，剩 ${pk.left} 組，名單 ${pk.list.length} 顆`)
out.push(`- 用上的 ${pk.use.length} 條合起來，歷史上實際開出的五顆同時符合：${pct(pk.joint)}`)
const bySlot = new Map<number, number[]>()
for (const x of pk.list) bySlot.set(b[x]!.slot, [...(bySlot.get(b[x]!.slot) ?? []), x])
out.push('')
out.push('| 隔期 | 號碼 | 值 |')
out.push('|---|---|---|')
for (const [s, xs] of [...bySlot.entries()].sort((x, y) => x[0] - y[0])) out.push(`| ${s} | ${xs.join(' ')} | ${b[xs[0]!]!.value} |`)
if (j < D) {
  const drawn = draws[t]!
  const hit = drawn.filter(x => pk.list.includes(x))
  out.push('')
  out.push(`- 開出 ${drawn.join(' ')}：中 ${hit.length} 顆（${hit.join(' ') || '無'}）；沒中的：${drawn.filter(x => !pk.list.includes(x)).map(x => `${x}（隔期 ${b[x]!.slot}、值 ${b[x]!.value}、y＝${b[x]!.rank}）`).join('、') || '無'}`)
  const fails = js.filter(x => !x.ok(drawn, b))
  out.push(`- 實際開出的五顆不符合的判斷：${fails.map(x => `${x.stage} ${x.name}（${pct(x.share)}）`).join('、') || '無'}`)
}
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
