/**
 * 一篩／二篩選出來的號碼「全部」立柱，比較不同立柱排法的賠付（2026-11-02 使用者）。
 *   二星 70、三星 800、四星 12,500 倍，每碰 1 元、中獎另退本金。
 *   號碼固定＝blind-test.ts 每期的一篩、二篩名單（每期只用開完上一期為止的資料），只換「怎麼分柱」：
 *     連碰（每顆自己一柱，對照）、隔期格、隔期四段（0～5／6～9／10～19／20 以上）、值、位置 y、尾數。
 *   同柱不互碰，不同柱各取一顆成一碰。
 * 找：2007～2020；驗：2021 起原封不動照下。平均每期＝淨結果 ÷ 該段全部期數。
 *
 * 用法：node --import tsx scripts/list-columns.ts  → docs/list-columns.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, next, rows, type Ball, type Decision } from './blind-test'

const OUT = 'docs/list-columns.md'
const SPLIT = '2021-01-01'
const ODDS: Record<number, number> = { 2: 70, 3: 800, 4: 12500 }
const KS = [2, 3, 4]

const esym = (sizes: number[], k: number): number => {
  const e = new Array<number>(k + 1).fill(0)
  e[0] = 1
  for (const x of sizes) for (let j = k; j >= 1; j--) e[j]! += e[j - 1]! * x
  return e[k]!
}
const seg = (slot: number): string => (slot <= 5 ? '0～5' : slot <= 9 ? '6～9' : slot <= 19 ? '10～19' : '20+')
const LAYOUTS: { name: string, key: (b: Ball, x: number) => string }[] = [
  { name: '連碰', key: (_, x) => String(x) },
  { name: '隔期格', key: b => `隔期${b.slot}` },
  { name: '隔期四段', key: b => `隔期${seg(b.slot)}` },
  { name: '值', key: b => `值${b.value}` },
  { name: '位置 y', key: b => `y=${b.rank}` },
  { name: '尾數', key: (b, x) => `尾${x % 10}` },
]
const LISTS: { name: string, of: (d: Decision) => number[] }[] = [
  { name: '一篩', of: d => d.stage1 },
  { name: '二篩', of: d => d.final },
]
const columns = (d: Decision, balls: number[], key: (b: Ball, x: number) => string): Map<string, number[]> => {
  const g = new Map<string, number[]>()
  for (const x of [...balls].sort((a, b) => a - b)) {
    const c = key(d.ballOf[x]!, x)
    g.set(c, [...(g.get(c) ?? []), x])
  }
  return g
}

type Period = '找' | '驗'
interface Tally { cost: number, back: number, won: number }
const nDraws: Record<Period, number> = { 找: 0, 驗: 0 }
for (const d of allDecisions) nDraws[rows[d.t]![1] < SPLIT ? '找' : '驗']++

const out: string[] = []
const fmt = (x: number): string => (x >= 0 ? '+' : '') + x.toFixed(2)
const pct = (a: number, b: number): string => (b ? (100 * a / b).toFixed(1) : '—')
out.push('# 一篩／二篩號碼全部立柱：不同排法的賠付')
out.push('')
out.push(`> 由 \`scripts/list-columns.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期。每碰 1 元、中獎另退本金；二星 70、三星 800、四星 12,500 倍。`)
out.push(`> 號碼固定是每期的一篩／二篩名單，只換分柱方式。找：2007～2020 年 ${nDraws.找} 期；驗：2021 年起 ${nDraws.驗} 期。`)
out.push('')
out.push('| 名單 | 玩法 | 排法 | 平均柱數 | 每期碰數 | 找：拿回率 | 找：平均每期 | 驗：拿回率 | 驗：平均每期 | 驗：中獎期數 | 驗：各年淨結果 |')
out.push('|---|---|---|---|---|---|---|---|---|---|---|')
const best: { list: string, k: number, layout: string, f: number, v: number }[] = []
for (const L of LISTS) {
  for (const k of KS) {
    for (const lay of LAYOUTS) {
      const t: Record<Period, Tally> = { 找: { cost: 0, back: 0, won: 0 }, 驗: { cost: 0, back: 0, won: 0 } }
      const years = new Map<string, number>()
      let cols = 0
      for (const d of allDecisions) {
        const date = rows[d.t]![1]
        const p: Period = date < SPLIT ? '找' : '驗'
        const actual = new Set(draws[d.t]!)
        const g = [...columns(d, L.of(d), lay.key).values()]
        const cost = esym(g.map(v => v.length), k)
        const back = esym(g.map(v => v.filter(x => actual.has(x)).length), k) * (ODDS[k]! + 1)
        t[p].cost += cost
        t[p].back += back
        if (back) t[p].won++
        cols += g.length
        if (p === '驗') years.set(date.slice(0, 4), (years.get(date.slice(0, 4)) ?? 0) + back - cost)
      }
      const f = (t.找.back - t.找.cost) / nDraws.找
      const v = (t.驗.back - t.驗.cost) / nDraws.驗
      best.push({ list: L.name, k, layout: lay.name, f, v })
      const ys = [...years.entries()].map(([y, x]) => `${y} ${x >= 0 ? '+' : ''}${Math.round(x)}`).join('、')
      out.push(`| ${L.name} | ${k} 星 | ${lay.name} | ${(cols / allDecisions.length).toFixed(1)} | ${((t.找.cost + t.驗.cost) / allDecisions.length).toFixed(0)} | ${pct(t.找.back, t.找.cost)}% | ${fmt(f)} | ${pct(t.驗.back, t.驗.cost)}% | ${fmt(v)} | ${t.驗.won} | ${ys} |`)
    }
  }
}
out.push('')
out.push('## 兩段都是正數的')
out.push('')
const both = best.filter(b => b.f > 0 && b.v > 0)
out.push(both.length ? both.map(b => `- ${b.list} ${b.k} 星 ${b.layout}：找 ${fmt(b.f)}、驗 ${fmt(b.v)}`).join('\n') : '- 沒有')
out.push('')
out.push(`## 下一期（${rows[rows.length - 1]![0]} 開完後）各排法的立柱`)
out.push('')
for (const L of LISTS) {
  const balls = L.of(next)
  out.push(`### ${L.name} ${balls.length} 顆：${balls.join(' ')}`)
  out.push('')
  for (const lay of LAYOUTS.slice(1)) {
    const g = [...columns(next, balls, lay.key).entries()]
    const sizes = g.map(([, v]) => v.length)
    out.push(`- ${lay.name}（${g.length} 柱；二星 ${esym(sizes, 2)}、三星 ${esym(sizes, 3)}、四星 ${esym(sizes, 4)} 碰）：${g.map(([c, v]) => `${c}［${v.join(' ')}］`).join(' ')}`)
  }
  out.push('')
}
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
