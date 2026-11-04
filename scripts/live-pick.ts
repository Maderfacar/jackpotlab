/**
 * 活的篩法（2026-11-05 試做）：一篩二篩三篩的每一條判斷都附上「歷史上同樣狀況有幾成這樣走、共幾次」，
 * 強的才用、弱的不用；用了還排不出組合時，先放掉最弱的那條，直到排得出來。
 *   一直用（不是看比例的判斷）：G 區間、V 區間、同值同顆數 < 30% 的值的格排除、大於 10 的值近三期出現過的格排除。
 *   看強弱的：隔期四段各開幾顆、頭數、三區、號碼總和、y＝4／5 三個一起、y 1～5 走勢、值 0～9 走勢。
 *   補：強＝判的那一邊佔 60% 以上、而且歷史 30 次以上（使用者還沒定，先用這個）。
 *   每期只用開獎前的盤面與到上一期為止的資料。
 *
 * 用法：node --import tsx scripts/live-pick.ts [期號]   （不給期號＝下一期）→ docs/live-pick.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, next, rows, type Ball, type Decision } from './blind-test'
import { V_ITEMS, Y_ITEMS, judgeAt, seriesOf } from './item-trend'

const OUT = 'docs/live-pick.md'
const STRONG = 0.6
const MIN_N = 30
const SLOTS = 60
const SUM_BIN = 20
const MOVE = ['變少', '一樣', '變多']
const segOf = (sl: number): number => (sl <= 5 ? 0 : sl <= 9 ? 1 : sl <= 19 ? 2 : 3)
const SEG_NAME = ['0～5', '6～9', '10～19', '20 以上']
const headOf = (x: number): number => Math.floor(x / 10)
const zoneOf = (x: number): number => (x <= 13 ? 0 : x <= 26 ? 1 : 2)
const ZONE_NAME = ['1～13', '14～26', '27～39']

const D = allDecisions.length
const term = Number(process.argv[2] ?? 0)
const j = term ? allDecisions.findIndex(d => rows[d.t]![0] === term) : D
if (j < 0) throw new Error(`找不到第 ${term} 期`)
const t = j < D ? allDecisions[j]!.t : rows.length
const b: Ball[] = j < D ? allDecisions[j]!.ballOf : next.ballOf
const p: Decision['plan'] = j < D ? allDecisions[j]!.plan : next.plan

interface Rule { lo: number, hi: number }
interface Judgment { stage: string, name: string, say: string, share: number, n: number, ok: (x: number[]) => boolean }
const js: Judgment[] = []

// 二篩用：序列 xs 在第 t 期開獎前判（同 three-stage.ts，多回傳比例）
function judge(xs: number[], withRange: boolean, band: (x: number) => number): { rule: Rule, pick: number, share: number, n: number } {
  const last = xs[t - 1]!
  const dir = Math.sign(last - xs[t - 2]!)
  const cnt = [0, 0, 0]
  const nx: number[] = []
  for (let i = 2; i < t - 1; i++) {
    if (Math.sign(xs[i]! - xs[i - 1]!) !== dir || band(xs[i]!) !== band(last)) continue
    cnt[Math.sign(xs[i + 1]! - xs[i]!) + 1]!++
    nx.push(xs[i + 1]!)
  }
  const n = nx.length
  if (!n) return { rule: { lo: -Infinity, hi: Infinity }, pick: NaN, share: 0, n }
  const best = Math.max(...cnt)
  const pick = cnt[1] === best ? 0 : cnt[2] === best ? 1 : -1
  let rule: Rule = pick === 0 ? { lo: last, hi: last } : pick > 0 ? { lo: last + 1, hi: Infinity } : { lo: -Infinity, hi: last - 1 }
  if (withRange) {
    const s = [...nx].sort((a, c) => a - c)
    const q = (r: number): number => s[Math.floor(r * (s.length - 1))]!
    rule = { lo: Math.max(rule.lo, q(0.25)), hi: Math.min(rule.hi, q(0.75)) }
    if (rule.lo > rule.hi) rule = { lo: q(0.25), hi: q(0.75) }
  }
  return { rule, pick, share: best / n, n }
}
const inR = (c: number, r: Rule): boolean => c >= r.lo && c <= r.hi
const rName = (r: Rule): string => (r.lo === r.hi ? `${r.lo} 顆` : r.lo === -Infinity && r.hi === 0 ? '0 顆' : r.lo === -Infinity ? `${r.hi} 顆以下` : r.hi === Infinity ? `${r.lo} 顆以上` : `${r.lo}～${r.hi}`)

// 一篩：隔期四段
p.seg.forEach((s, si) => {
  const top = s.top
  const mode = p.segSum === 5 ? 0 : p.segSum < 5 ? 1 : -1
  js.push({
    stage: '一篩', name: `隔期 ${SEG_NAME[si]}`, say: `${mode === 0 ? '' : mode > 0 ? '至少 ' : '最多 '}${top} 顆（盤面剩 ${s.sup}）`, share: s.share, n: s.n,
    ok: (x) => { const c = x.filter(m => segOf(b[m]!.slot) === si).length; return mode === 0 ? c === top : mode > 0 ? c >= top : c <= top }
  })
})
// 二篩：頭數、三區、總和
const headCnt = draws.map(d => [0, 1, 2, 3].map(h => d.filter(x => headOf(x) === h).length))
const zoneCnt = draws.map(d => [0, 1, 2].map(z => d.filter(x => zoneOf(x) === z).length))
const sums = draws.map(d => d.reduce((a, c) => a + c, 0))
for (let h = 0; h < 4; h++) {
  const r = judge(headCnt.map(c => c[h]!), false, x => x)
  js.push({ stage: '二篩', name: `${h} 頭`, say: `${MOVE[r.pick + 1] ?? '查無'} → ${rName(r.rule)}`, share: r.share, n: r.n, ok: x => inR(x.filter(m => headOf(m) === h).length, r.rule) })
}
for (let z = 0; z < 3; z++) {
  const r = judge(zoneCnt.map(c => c[z]!), false, x => x)
  js.push({ stage: '二篩', name: ZONE_NAME[z]!, say: `${MOVE[r.pick + 1] ?? '查無'} → ${rName(r.rule)}`, share: r.share, n: r.n, ok: x => inR(x.filter(m => zoneOf(m) === z).length, r.rule) })
}
{
  const r = judge(sums, true, x => Math.floor(x / SUM_BIN))
  js.push({ stage: '二篩', name: '號碼總和', say: `${MOVE[r.pick + 1] ?? '查無'} → ${r.rule.lo}～${r.rule.hi}`, share: r.share, n: r.n, ok: x => inR(x.reduce((a, c) => a + c, 0), r.rule) })
}
// 三篩：y＝4／5 三個一起
const k45 = allDecisions.map(d => [...draws[d.t]!].sort((a, c) => a - c).slice(1).filter(x => d.ballOf[x]!.rank >= 4).length)
const run45 = k45.map(() => 0)
for (let i = 0; i < D; i++) run45[i] = k45[i]! > 0 ? (i ? run45[i - 1]! : 0) + 1 : 0
const sup45 = (bb: Ball[]): number => bb.slice(1).filter(o => o!.slot < SLOTS && o!.rank >= 4).length
const abc = (i: number, bb: Ball[]): boolean => i >= 3 && run45[i - 1]! >= 3 && k45[i - 1]! + k45[i - 2]! + k45[i - 3]! >= 4 && sup45(bb) >= 4 && sup45(bb) <= 5
if (abc(j, b)) {
  let n = 0, none = 0
  for (let i = 3; i < j; i++) if (abc(i, allDecisions[i]!.ballOf)) { n++; if (!k45[i]) none++ }
  js.push({ stage: '三篩', name: 'y＝4／5 三個一起', say: '剩下四顆沒有 y＝4／5', share: n ? none / n : 0, n, ok: x => !x.slice(1).some(m => b[m]!.rank >= 4) })
}
// 三篩：y、值各自走勢
for (const [items, w] of [[Y_ITEMS, false], [V_ITEMS, true]] as const) {
  for (const it of items) {
    const s = seriesOf(it)
    const r = judgeAt(s, j, w)
    if (!r.n) continue
    const last = s.X[j - 1]!
    const rule: Rule = r.pick === 0 ? { lo: last, hi: last } : r.pick > 0 ? { lo: last + 1, hi: Infinity } : { lo: -Infinity, hi: last - 1 }
    js.push({ stage: '三篩', name: it.name, say: `${MOVE[r.pick + 1]} → ${rName(rule)}`, share: r.cnt[r.pick + 1]! / r.n, n: r.n, ok: x => inR(x.filter(m => it.of(b[m]!)).length, rule) })
  }
}

// 一直用的：G、V、排除的格 → 先列出所有組合
const bigVals = new Set<number>()
for (let k = j - 3; k < j; k++) { const e = allDecisions[k]!; for (const x of draws[e.t]!) if (e.ballOf[x]!.value > 10) bigVals.add(e.ballOf[x]!.value) }
const ex = new Set(p.oneSlots)
const pool: number[] = []
for (let x = 1; x <= 39; x++) { const o = b[x]!; if (o.slot < SLOTS && !ex.has(o.slot) && !bigVals.has(o.value)) pool.push(x) }
const combos: number[][] = []
const P = pool.length
const sl = pool.map(x => b[x]!.slot)
const va = pool.map(x => b[x]!.value)
const gr = p.g.range, vr = p.v
for (let a = 0; a < P; a++) for (let c = a + 1; c < P; c++) {
  const g2 = sl[a]! + sl[c]!, v2 = va[a]! + va[c]!
  if (g2 > gr.hi || v2 > vr.hi) continue
  for (let d = c + 1; d < P; d++) {
    const g3 = g2 + sl[d]!, v3 = v2 + va[d]!
    if (g3 > gr.hi || v3 > vr.hi) continue
    for (let e = d + 1; e < P; e++) {
      const g4 = g3 + sl[e]!, v4 = v3 + va[e]!
      if (g4 > gr.hi || v4 > vr.hi) continue
      for (let f = e + 1; f < P; f++) {
        const G = g4 + sl[f]!, V = v4 + va[f]!
        if (G >= gr.lo && G <= gr.hi && V >= vr.lo && V <= vr.hi) combos.push([pool[a]!, pool[c]!, pool[d]!, pool[e]!, pool[f]!])
      }
    }
  }
}

// 強的用；排不出組合就放掉最弱的
const strong = js.filter(x => x.share >= STRONG && x.n >= MIN_N).sort((x, y) => x.share - y.share)
const dropped: Judgment[] = []
let use = [...strong]
let left = combos.filter(x => use.every(u => u.ok(x)))
while (!left.length && use.length) {
  dropped.push(use.shift()!)
  left = combos.filter(x => use.every(u => u.ok(x)))
}
const list = [...new Set(left.flat())].sort((x, y) => x - y)

const pct = (x: number): string => `${(100 * x).toFixed(1)}%`
const out: string[] = []
const label = term || `${rows[rows.length - 1]![0] + 1}`
out.push(`# 活的篩法：第 ${label} 期`)
out.push('')
out.push(`> 由 \`scripts/live-pick.ts\` 產生，只用開獎前的資料。強＝判的那一邊 ${STRONG * 100}% 以上、歷史 ${MIN_N} 次以上（補，使用者未定）。`)
out.push('')
out.push(`- 一直用：G ${gr.lo}～${gr.hi}、V ${vr.lo}～${vr.hi}；排除的格：隔期 ${[...ex].sort((x, y) => x - y).join('、') || '無'}（值出現比例 < 30%）${bigVals.size ? `、值 ${[...bigVals].join('、')} 的格（大於 10 近三期出現過）` : ''}`)
out.push(`- 這幾樣先排出 ${combos.length} 組`)
out.push('')
out.push('| 篩 | 項目 | 判 | 比例 | 次數 | 用不用 |')
out.push('|---|---|---|---|---|---|')
for (const x of js) {
  const st = use.includes(x) ? '用' : dropped.includes(x) ? '衝突，放掉' : x.n < MIN_N ? '不用（次數少）' : '不用（弱）'
  out.push(`| ${x.stage} | ${x.name} | ${x.say} | ${pct(x.share)} | ${x.n} | ${st} |`)
}
out.push('')
out.push(`- 用了 ${use.length} 條，剩 ${left.length} 組，名單 ${list.length} 顆`)
const bySlot = new Map<number, number[]>()
for (const x of list) bySlot.set(b[x]!.slot, [...(bySlot.get(b[x]!.slot) ?? []), x])
out.push('')
out.push('| 隔期 | 號碼 | 值 |')
out.push('|---|---|---|')
for (const [s, xs] of [...bySlot.entries()].sort((x, y) => x[0] - y[0])) out.push(`| ${s} | ${xs.join(' ')} | ${b[xs[0]!]!.value} |`)
if (j < D) {
  const drawn = draws[t]!
  const hit = drawn.filter(x => list.includes(x))
  out.push('')
  out.push(`- 開出 ${drawn.join(' ')}：中 ${hit.length} 顆（${hit.join(' ') || '無'}）；沒中的：${drawn.filter(x => !list.includes(x)).map(x => `${x}（隔期 ${b[x]!.slot}、值 ${b[x]!.value}、y＝${b[x]!.rank}）`).join('、') || '無'}`)
  const fails = js.filter(x => !x.ok(drawn))
  out.push(`- 實際開出的五顆不符合的判斷：${fails.map(x => `${x.stage} ${x.name}（${pct(x.share)}）`).join('、') || '無'}`)
}
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
