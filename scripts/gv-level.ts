/**
 * 新版本（2026-11-06 使用者）：只用 G、V 範圍（水位版），其他條件先不納入。
 *   G、V 範圍的算法見 blind-test.ts（levelPlan）、docs/539-selection-direction.md。
 *   盤面上所有五顆組合，G、V 都在範圍裡的留下；名單＝留下的組合用到的號碼。
 *   2024 起每一期往前盲測（只用開獎前的資料），並給下一期名單。
 *
 * 用法：node --import tsx scripts/gv-level.ts → docs/gv-level.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, next, rows, SLOTS, type Ball, type Decision } from './blind-test'

const OUT = 'docs/gv-level.md'
const FROM = '2024-01-01'
const BALLS = 39

interface Pick { combos: number, list: number[] }
/** 盤面上 G、V 都在範圍裡的五顆組合有幾組、用到哪些號碼 */
function pickOf(b: Ball[], p: Decision['plan']): Pick {
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
const dist = [0, 0, 0, 0, 0, 0]
let size = 0, combosSum = 0, gIn = 0, vIn = 0, both = 0, m = 0
const last10: string[] = []
for (let j = from; j < allDecisions.length; j++) {
  const d = allDecisions[j]!
  const drawn = draws[d.t]!
  const pk = pickOf(d.ballOf, d.plan)
  const h = drawn.filter(x => pk.list.includes(x)).length
  const G = drawn.reduce((s, x) => s + d.ballOf[x]!.slot, 0), V = drawn.reduce((s, x) => s + d.ballOf[x]!.value, 0)
  const gi = G >= d.plan.g.range.lo && G <= d.plan.g.range.hi, vi = V >= d.plan.v.lo && V <= d.plan.v.hi
  m++; size += pk.list.length; combosSum += pk.combos; dist[h]!++
  if (gi) gIn++
  if (vi) vIn++
  if (gi && vi) both++
  if (j >= allDecisions.length - 10) last10.push(`| ${rows[d.t]![0] % 1000} | ${d.plan.g.range.lo}～${d.plan.g.range.hi} | ${G}${gi ? '' : '（外）'} | ${d.plan.v.lo}～${d.plan.v.hi} | ${V}${vi ? '' : '（外）'} | ${pk.list.length} | ${h} |`)
}
const nx = pickOf(next.ballOf, next.plan)
const pct = (a: number): string => `${(100 * a / m).toFixed(1)}%`
const out: string[] = []
out.push('# 只用 G、V 範圍（水位版）')
out.push('')
out.push(`> 由 \`scripts/gv-level.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期。2024 起 ${m} 期，每期只用開獎前的資料。`)
out.push('> 只有兩個條件：G 範圍、V 範圍（盤面水位相近的歷史期，去掉兩頭各 10%）。盤面上 G、V 都在範圍裡的五顆組合留下，名單＝這些組合用到的號碼。')
out.push('')
out.push('## 盲測')
out.push('')
out.push('| 平均名單 | 平均留下組合 | 中 5 | 中 4 | 中 3 | 中 2 | 中 1 | 中 0 | 中 3 顆以上 |')
out.push('|---|---|---|---|---|---|---|---|---|')
out.push(`| ${(size / m).toFixed(1)} 顆 | ${Math.round(combosSum / m).toLocaleString()} | ${[5, 4, 3, 2, 1, 0].map(k => dist[k]).join(' | ')} | ${pct(dist[5]! + dist[4]! + dist[3]!)} |`)
out.push('')
out.push(`- 實際 G 在範圍裡：${pct(gIn)}；實際 V 在範圍裡：${pct(vIn)}；兩個都在（實際開出的五顆被留下）：${pct(both)}`)
out.push('')
out.push('## 最近十期')
out.push('')
out.push('| 期 | G 範圍 | 實際 G | V 範圍 | 實際 V | 名單 | 中 |')
out.push('|---|---|---|---|---|---|---|')
out.push(...last10)
out.push('')
out.push(`## 第 ${rows[rows.length - 1]![0] + 1} 期`)
out.push('')
out.push(`- G ${next.plan.g.range.lo}～${next.plan.g.range.hi}（${next.plan.g.band}，${next.plan.g.n} 期）、V ${next.plan.v.lo}～${next.plan.v.hi}（${next.plan.vSelf.band}，${next.plan.vSelf.n} 期）`)
out.push(`- 留下 ${nx.combos.toLocaleString()} 組，名單 ${nx.list.length} 顆：${nx.list.join(' ')}`)
const off = Array.from({ length: BALLS }, (_, i) => i + 1).filter(x => !nx.list.includes(x))
out.push(`- 沒進名單：${off.map(x => `${x}（隔期 ${next.ballOf[x]!.slot}、值 ${next.ballOf[x]!.value}）`).join('、') || '無'}`)
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
