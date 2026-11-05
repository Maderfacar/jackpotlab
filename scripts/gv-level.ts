/**
 * 新版本（2026-11-06 使用者）：G、V 範圍（水位版）＋值回 0～5，其他條件先不納入。
 *   G、V 範圍的算法見 blind-test.ts（levelPlan）、docs/539-selection-direction.md。
 *   值回 0～5（使用者 2026-11-06）：上期五顆由小到大排，第 k 顆的值在 6 以上 → 這期第 k 顆的值要在 0～5。
 *   盤面上所有五顆組合，符合條件的留下；名單＝留下的組合用到的號碼。對照：只用 G、V。
 *   2024 起每一期往前盲測（只用開獎前的資料），並給下一期名單。
 *
 * 用法：node --import tsx scripts/gv-level.ts → docs/gv-level.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, next, rows, SLOTS, type Ball, type Decision } from './blind-test'

const OUT = 'docs/gv-level.md'
const FROM = '2024-01-01'
const BALLS = 39
/** 值在這個以上算「大於 0～5」 */
const VAL_HIGH = 6

interface Pick { combos: number, list: number[] }
/** 上期五顆由小到大排，值在 6 以上的位置（0 起算） */
const highPos = (j: number): number[] => {
  if (j < 1) return []
  const d = allDecisions[j - 1]!
  return [...draws[d.t]!].sort((a, c) => a - c).map((x, k) => (d.ballOf[x]!.value >= VAL_HIGH ? k : -1)).filter(k => k >= 0)
}
/** 這五顆由小到大排，need 裡的位置值都在 0～5 */
const backOk = (five: number[], b: Ball[], need: number[]): boolean => {
  if (!need.length) return true
  const so = [...five].sort((a, c) => a - c)
  return need.every(k => b[so[k]!]!.value < VAL_HIGH)
}
/** 盤面上 G、V 都在範圍裡（且 need 位置的值回 0～5）的五顆組合有幾組、用到哪些號碼 */
function pickOf(b: Ball[], p: Decision['plan'], need: number[] = []): Pick {
  const g = p.g.range, v = p.v
  const xs = Array.from({ length: BALLS }, (_, i) => i + 1).filter(x => b[x]!.slot < SLOTS).sort((a, c) => b[a]!.slot - b[c]!.slot)
  const sl = xs.map(x => b[x]!.slot), va = xs.map(x => b[x]!.value)
  const used = new Set<number>()
  let combos = 0
  const N = xs.length
  for (let i = 0; i < N; i++) {
    const g1 = sl[i]!, v1 = va[i]!
    if (g1 * 5 > g.hi) break
    for (let j = i + 1; j < N; j++) {
      const g2 = g1 + sl[j]!, v2 = v1 + va[j]!
      if (g2 + sl[j]! * 3 > g.hi) break
      if (v2 > v.hi) continue
      for (let k = j + 1; k < N; k++) {
        const g3 = g2 + sl[k]!, v3 = v2 + va[k]!
        if (g3 + sl[k]! * 2 > g.hi) break
        if (v3 > v.hi) continue
        for (let l = k + 1; l < N; l++) {
          const g4 = g3 + sl[l]!, v4 = v3 + va[l]!
          if (g4 + sl[l]! > g.hi) break
          if (v4 > v.hi) continue
          for (let m = l + 1; m < N; m++) {
            const G = g4 + sl[m]!, V = v4 + va[m]!
            if (G > g.hi) break
            if (G < g.lo || V < v.lo || V > v.hi) continue
            if (!backOk([xs[i]!, xs[j]!, xs[k]!, xs[l]!, xs[m]!], b, need)) continue
            combos++
            used.add(xs[i]!); used.add(xs[j]!); used.add(xs[k]!); used.add(xs[l]!); used.add(xs[m]!)
          }
        }
      }
    }
  }
  return { combos, list: [...used].sort((a, c) => a - c) }
}

const from = allDecisions.findIndex(d => rows[d.t]![1] >= FROM)
interface Acc { m: number, size: number, combos: number, dist: number[], kept: number }
const newAcc = (): Acc => ({ m: 0, size: 0, combos: 0, dist: [0, 0, 0, 0, 0, 0], kept: 0 })
const acc = [newAcc(), newAcc()]
let gIn = 0, vIn = 0, useN = 0, posN = 0, posOk = 0
const last10: string[] = []
for (let j = from; j < allDecisions.length; j++) {
  const d = allDecisions[j]!
  const drawn = draws[d.t]!
  const need = highPos(j)
  const G = drawn.reduce((s, x) => s + d.ballOf[x]!.slot, 0), V = drawn.reduce((s, x) => s + d.ballOf[x]!.value, 0)
  const gi = G >= d.plan.g.range.lo && G <= d.plan.g.range.hi, vi = V >= d.plan.v.lo && V <= d.plan.v.hi
  if (gi) gIn++
  if (vi) vIn++
  if (need.length) {
    useN++
    const so = [...drawn].sort((a, c) => a - c)
    for (const k of need) { posN++; if (d.ballOf[so[k]!]!.value < VAL_HIGH) posOk++ }
  }
  const hs: number[] = []
  ;[[] as number[], need].forEach((nd, w) => {
    const pk = pickOf(d.ballOf, d.plan, nd)
    const h = drawn.filter(x => pk.list.includes(x)).length
    const a = acc[w]!
    a.m++; a.size += pk.list.length; a.combos += pk.combos; a.dist[h]!++
    if (gi && vi && backOk(drawn, d.ballOf, nd)) a.kept++
    hs.push(pk.list.length, h)
  })
  if (j >= allDecisions.length - 10) last10.push(`| ${rows[d.t]![0] % 1000} | ${d.plan.g.range.lo}～${d.plan.g.range.hi} | ${G}${gi ? '' : '（外）'} | ${d.plan.v.lo}～${d.plan.v.hi} | ${V}${vi ? '' : '（外）'} | ${need.map(k => `第 ${k + 1} 顆`).join('、') || '—'} | ${hs[0]}／${hs[1]} | ${hs[2]}／${hs[3]} |`)
}
const needNow = highPos(allDecisions.length)
const nx = pickOf(next.ballOf, next.plan, needNow)
const pct = (a: number, m: number): string => `${(100 * a / m).toFixed(1)}%`
const row = (name: string, a: Acc): string => `| ${name} | ${(a.size / a.m).toFixed(1)} 顆 | ${Math.round(a.combos / a.m).toLocaleString()} | ${[5, 4, 3, 2, 1, 0].map(k => a.dist[k]).join(' | ')} | ${pct(a.dist[5]! + a.dist[4]! + a.dist[3]!, a.m)} | ${pct(a.kept, a.m)} |`
const m = acc[0]!.m
const out: string[] = []
out.push('# G、V 範圍（水位版）＋值回 0～5')
out.push('')
out.push(`> 由 \`scripts/gv-level.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期。2024 起 ${m} 期，每期只用開獎前的資料。`)
out.push('> 條件：G 範圍、V 範圍（盤面水位相近的歷史期，去掉兩頭各 10%）；值回 0～5（上期由小到大第 k 顆的值在 6 以上 → 這期第 k 顆的值在 0～5）。盤面上符合的五顆組合留下，名單＝這些組合用到的號碼。')
out.push('')
out.push('## 盲測')
out.push('')
out.push('| 條件 | 平均名單 | 平均留下組合 | 中 5 | 中 4 | 中 3 | 中 2 | 中 1 | 中 0 | 中 3 顆以上 | 實際開出的五顆被留下 |')
out.push('|---|---|---|---|---|---|---|---|---|---|---|')
out.push(row('G、V', acc[0]!))
out.push(row('G、V＋值回 0～5', acc[1]!))
out.push('')
out.push(`- 實際 G 在範圍裡：${pct(gIn, m)}；實際 V 在範圍裡：${pct(vIn, m)}`)
out.push(`- 值回 0～5 用上 ${useN} 期（共 ${posN} 個位置），實際回到 0～5 的位置 ${posOk} 個（${pct(posOk, posN)}）`)
out.push('')
out.push('## 最近十期')
out.push('')
out.push('| 期 | G 範圍 | 實際 G | V 範圍 | 實際 V | 要回 0～5 的位置 | G、V 名單／中 | 加值回 0～5 名單／中 |')
out.push('|---|---|---|---|---|---|---|---|')
out.push(...last10)
out.push('')
out.push(`## 第 ${rows[rows.length - 1]![0] + 1} 期`)
out.push('')
out.push(`- G ${next.plan.g.range.lo}～${next.plan.g.range.hi}（${next.plan.g.band}，${next.plan.g.n} 期）、V ${next.plan.v.lo}～${next.plan.v.hi}（${next.plan.vSelf.band}，${next.plan.vSelf.n} 期）`)
out.push(`- 值回 0～5：${needNow.length ? needNow.map(k => `第 ${k + 1} 顆`).join('、') : '上期五顆的值都在 0～5，這期用不到'}`)
out.push(`- 留下 ${nx.combos.toLocaleString()} 組，名單 ${nx.list.length} 顆：${nx.list.join(' ')}`)
const off = Array.from({ length: BALLS }, (_, i) => i + 1).filter(x => !nx.list.includes(x))
out.push(`- 沒進名單：${off.map(x => `${x}（隔期 ${next.ballOf[x]!.slot}、值 ${next.ballOf[x]!.value}）`).join('、') || '無'}`)
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
