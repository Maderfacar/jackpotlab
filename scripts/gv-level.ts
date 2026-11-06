/**
 * 新版本（2026-11-06 使用者）：G、V 範圍（水位版）＋V 拉回＋值回 0～5，其他條件先不納入。
 *   G、V 範圍的算法見 blind-test.ts（levelPlan）、docs/539-selection-direction.md。
 *   V 拉回（使用者 2026-11-06）：上期 V 小於 10 → 這期 V 大於 10（「單顆值大於 10」一定 V 也大於 10，所以只看 V）。
 *   值回 0～5（使用者 2026-11-06 改定：針對每個位置，70%～80% 回來，不是全部要回）：
 *     上期五顆由小到大排，第 k 顆的值在 6 以上時，看第 k 顆歷史上這種情況下期回 0～5 的比例 p（每個位置各算，只用開獎前的資料）。
 *     組合不刪：這期第 k 顆回 0～5 的組合權重乘 p，沒回的乘 1－p（補）。
 *   名單：G、V、V 拉回留下的組合用到的全部號碼；另列每顆在組合裡的加權比例取前 20 顆（補）。對照：不加權的前 20 顆。
 *   2024 起每一期往前盲測，並給下一期名單。
 *
 * 用法：node --import tsx scripts/gv-level.ts → docs/gv-level.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, next, rows, SLOTS, type Ball, type Decision } from './blind-test'

const OUT = 'docs/gv-level.md'
const FROM = '2024-01-01'
const BALLS = 39
const TOP = 20
/** 值在這個以上算「大於 0～5」 */
const VAL_HIGH = 6
/** 上期 V 小於這個 → 這期 V 要大於這個 */
const V_LOW = 10

/** 每期五顆由小到大排，各自的值 */
const posVal = allDecisions.map(d => [...draws[d.t]!].sort((a, c) => a - c).map(x => d.ballOf[x]!.value))
/** 前 j 期裡，第 k 顆上期 6 以上的次數、下期回 0～5 的次數（累計） */
const backN = [0, 1, 2, 3, 4].map(() => [0])
const backH = [0, 1, 2, 3, 4].map(() => [0])
for (let j = 0; j < allDecisions.length; j++) {
  for (let k = 0; k < 5; k++) {
    const seen = j > 0 && posVal[j - 1]![k]! >= VAL_HIGH
    backN[k]!.push(backN[k]![j]! + (seen ? 1 : 0))
    backH[k]!.push(backH[k]![j]! + (seen && posVal[j]![k]! < VAL_HIGH ? 1 : 0))
  }
}
interface PosRate { k: number, p: number }
/** 第 j 期要看的位置與各自的比例（只用 j 之前的資料） */
const ratesAt = (j: number): PosRate[] => {
  if (j < 1) return []
  return [0, 1, 2, 3, 4].filter(k => posVal[j - 1]![k]! >= VAL_HIGH).map((k) => {
    const n = backN[k]![j]!
    return { k, p: n ? backH[k]![j]! / n : 0.75 }
  })
}
/** 上期 V 小於 10 → 這期 V 至少 11；否則不限 */
const vMinOf = (j: number): number => (j >= 1 && posVal[j - 1]!.reduce((a, c) => a + c, 0) < V_LOW ? V_LOW + 1 : -Infinity)

interface Pick { combos: number, list: number[], plain: number[], weighted: number[] }
const topOf = (s: number[]): number[] => Array.from({ length: BALLS }, (_, i) => i + 1).filter(x => s[x]! > 0).sort((a, c) => s[c]! - s[a]! || a - c).slice(0, TOP).sort((a, c) => a - c)
/** 盤面上 G、V 都在範圍裡的組合：不加權、照每個位置比例加權，各算每顆的分數 */
function pickOf(b: Ball[], p: Decision['plan'], rates: PosRate[], vMin = -Infinity): Pick {
  const g = p.g.range, v = { lo: Math.max(p.v.lo, vMin), hi: p.v.hi }
  const xs = Array.from({ length: BALLS }, (_, i) => i + 1).filter(x => b[x]!.slot < SLOTS).sort((a, c) => b[a]!.slot - b[c]!.slot)
  const sl = xs.map(x => b[x]!.slot), va = xs.map(x => b[x]!.value)
  const plain = new Array<number>(BALLS + 1).fill(0), weight = new Array<number>(BALLS + 1).fill(0)
  let combos = 0
  const N = xs.length
  const take = (five: number[]): void => {
    combos++
    let w = 1
    if (rates.length) {
      const so = [...five].sort((a, c) => a - c)
      for (const r of rates) w *= b[so[r.k]!]!.value < VAL_HIGH ? r.p : 1 - r.p
    }
    for (const x of five) { plain[x]!++; weight[x]! += w }
  }
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
            take([xs[i]!, xs[j]!, xs[k]!, xs[l]!, xs[m]!])
          }
        }
      }
    }
  }
  return { combos, list: Array.from({ length: BALLS }, (_, i) => i + 1).filter(x => plain[x]! > 0), plain: topOf(plain), weighted: topOf(weight) }
}

const from = allDecisions.findIndex(d => rows[d.t]![1] >= FROM)
interface Acc { m: number, size: number, dist: number[] }
const newAcc = (): Acc => ({ m: 0, size: 0, dist: [0, 0, 0, 0, 0, 0] })
const accAll = newAcc(), accPlain = newAcc(), accWeighted = newAcc()
let gIn = 0, vIn = 0, lowN = 0, lowOk = 0, kept = 0
const posN = [0, 0, 0, 0, 0], posOk = [0, 0, 0, 0, 0]
const last10: string[] = []
const add = (a: Acc, l: number[], drawn: number[]): number => { const h = drawn.filter(x => l.includes(x)).length; a.m++; a.size += l.length; a.dist[h]!++; return h }
for (let j = from; j < allDecisions.length; j++) {
  const d = allDecisions[j]!
  const drawn = draws[d.t]!
  const rates = ratesAt(j)
  const vMin = vMinOf(j)
  const G = drawn.reduce((s, x) => s + d.ballOf[x]!.slot, 0), V = drawn.reduce((s, x) => s + d.ballOf[x]!.value, 0)
  const gi = G >= d.plan.g.range.lo && G <= d.plan.g.range.hi, vi = V >= d.plan.v.lo && V <= d.plan.v.hi
  if (gi) gIn++
  if (vi) vIn++
  if (vMin > -Infinity) { lowN++; if (V >= vMin) lowOk++ }
  if (gi && vi && V >= vMin) kept++
  for (const r of rates) { posN[r.k]!++; if (posVal[j]![r.k]! < VAL_HIGH) posOk[r.k]!++ }
  const pk = pickOf(d.ballOf, d.plan, rates, vMin)
  add(accAll, pk.list, drawn)
  const h1 = add(accPlain, pk.plain, drawn), h2 = add(accWeighted, pk.weighted, drawn)
  if (j >= allDecisions.length - 10) last10.push(`| ${rows[d.t]![0] % 1000} | ${G}${gi ? '' : '（外）'} | ${V}${vi && V >= vMin ? '' : '（外）'} | ${rates.map(r => `第 ${r.k + 1} 顆 ${(100 * r.p).toFixed(0)}%`).join('、') || '—'} | ${h1} | ${h2} |`)
}
const J = allDecisions.length
const ratesNow = ratesAt(J)
const vMinNow = vMinOf(J)
const nx = pickOf(next.ballOf, next.plan, ratesNow, vMinNow)
const pct = (a: number, m: number): string => `${(100 * a / m).toFixed(1)}%`
const row = (name: string, a: Acc): string => `| ${name} | ${(a.size / a.m).toFixed(1)} 顆 | ${[5, 4, 3, 2, 1, 0].map(k => a.dist[k]).join(' | ')} | ${pct(a.dist[5]! + a.dist[4]! + a.dist[3]!, a.m)} |`
const m = accAll.m
const out: string[] = []
out.push('# 新版本：G、V 範圍（水位版）＋V 拉回＋值回 0～5')
out.push('')
out.push(`> 由 \`scripts/gv-level.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期。2024 起 ${m} 期，每期只用開獎前的資料。`)
out.push('> G、V 範圍、V 拉回會刪組合。值回 0～5 不刪組合：每個位置用自己的比例加權（回來的組合乘 p、沒回的乘 1－p，補）。前 20 顆＝每顆在組合裡的分數最高的 20 顆（補）。')
out.push('')
out.push('## 盲測')
out.push('')
out.push('| 名單 | 顆數 | 中 5 | 中 4 | 中 3 | 中 2 | 中 1 | 中 0 | 中 3 顆以上 |')
out.push('|---|---|---|---|---|---|---|---|---|')
out.push(row('留下的組合用到的全部號碼', accAll))
out.push(row('前 20 顆，不加權', accPlain))
out.push(row('前 20 顆，值回 0～5 各位置加權', accWeighted))
out.push('')
out.push(`- 實際開出的五顆被留下（G、V、V 拉回都符合）：${pct(kept, m)}；實際 G 在範圍裡 ${pct(gIn, m)}；實際 V 在範圍裡 ${pct(vIn, m)}`)
out.push(`- V 拉回用上 ${lowN} 期，實際 V 大於 10 的 ${lowOk} 期（${pct(lowOk, lowN)}）`)
out.push('')
out.push('## 值回 0～5：每個位置（2024 起實際）')
out.push('')
out.push('| 位置 | 上期 6 以上 | 下期回 0～5 | 比例 |')
out.push('|---|---|---|---|')
for (let k = 0; k < 5; k++) out.push(`| 第 ${k + 1} 顆 | ${posN[k]} | ${posOk[k]} | ${pct(posOk[k]!, posN[k]!)} |`)
out.push('')
out.push('## 最近十期')
out.push('')
out.push('| 期 | 實際 G | 實際 V | 要看的位置與比例 | 前 20 顆不加權 中 | 加權 中 |')
out.push('|---|---|---|---|---|---|')
out.push(...last10)
out.push('')
out.push(`## 第 ${rows[rows.length - 1]![0] + 1} 期`)
out.push('')
out.push(`- G ${next.plan.g.range.lo}～${next.plan.g.range.hi}（${next.plan.g.band}，${next.plan.g.n} 期）、V ${next.plan.v.lo}～${next.plan.v.hi}（${next.plan.vSelf.band}，${next.plan.vSelf.n} 期）`)
out.push(`- V 拉回：${vMinNow > -Infinity ? '上期 V 小於 10，這期 V 要大於 10' : '上期 V 在 10 以上，這期用不到'}`)
out.push(`- 值回 0～5：${ratesNow.length ? ratesNow.map(r => `第 ${r.k + 1} 顆 ${(100 * r.p).toFixed(1)}%`).join('、') : '上期五顆的值都在 0～5，這期用不到'}`)
out.push(`- 留下 ${nx.combos.toLocaleString()} 組，全部號碼 ${nx.list.length} 顆`)
out.push(`- 前 20 顆：${nx.weighted.join(' ')}`)
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
