/**
 * 二篩名單「小的時候才下」（2026-11-03 使用者）：二篩顆數 ≤ N、或隔期格柱數 ≤ K 的期才下注，其他期不下。
 *   名單＝blind-test.ts（conditions-v2）每期的二篩，照隔期格立柱（同柱不互碰）。
 *   二星 70、三星 800、四星 12,500 倍，每碰 1 元、中獎另退本金；另列二三四星全下。
 *   找：2007～2020 挑門檻（下注期數至少 MIN_BET_DRAWS）；驗：2021 起原封不動照下。平均每期＝淨結果 ÷ 該段全部期數（沒下的期算 0）。
 *   附：二篩最高票數（名單裡票數最多的球拿到幾個採用的二篩條件）分組的結果，供參考。
 *
 * 用法：node --import tsx scripts/small-list.ts  → docs/small-list.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, next, rows, type Decision } from './blind-test'

const OUT = 'docs/small-list.md'
const SPLIT = '2021-01-01'
const ODDS: Record<number, number> = { 2: 70, 3: 800, 4: 12500 }
const PLAYS: { name: string, ks: number[] }[] = [
  { name: '二星', ks: [2] },
  { name: '三星', ks: [3] },
  { name: '四星', ks: [4] },
  { name: '二三四星全下', ks: [2, 3, 4] },
]
const N_FROM = 5
const N_TO = 15
const K_FROM = 1
const K_TO = 8
const MIN_BET_DRAWS = 100

const esym = (sizes: number[], k: number): number => {
  const e = new Array<number>(k + 1).fill(0)
  e[0] = 1
  for (const x of sizes) for (let j = k; j >= 1; j--) e[j]! += e[j - 1]! * x
  return e[k]!
}
const columnsOf = (d: Decision): Map<number, number[]> => {
  const g = new Map<number, number[]>()
  for (const x of d.final) g.set(d.slotOf[x]!, [...(g.get(d.slotOf[x]!) ?? []), x])
  return g
}
const topVote = (d: Decision): number =>
  Math.max(0, ...d.stage1.map(x => d.used.filter(u => u.apply && u.cond.stage === 2 && u.set.includes(x)).length))

type Period = '找' | '驗'
interface Draw { p: Period, year: string, balls: number, cols: number, vote: number, cost: Record<number, number>, back: Record<number, number> }
const all: Draw[] = allDecisions.map((d) => {
  const date = rows[d.t]![1]
  const actual = new Set(draws[d.t]!)
  const g = [...columnsOf(d).values()]
  const sizes = g.map(v => v.length)
  const hits = g.map(v => v.filter(x => actual.has(x)).length)
  const cost: Record<number, number> = {}
  const back: Record<number, number> = {}
  for (const k of [2, 3, 4]) {
    cost[k] = esym(sizes, k)
    back[k] = esym(hits, k) * (ODDS[k]! + 1)
  }
  return { p: date < SPLIT ? '找' : '驗', year: date.slice(0, 4), balls: d.final.length, cols: g.length, vote: topVote(d), cost, back }
})
const nDraws: Record<Period, number> = { 找: all.filter(x => x.p === '找').length, 驗: all.filter(x => x.p === '驗').length }

interface Rule { name: string, ok: (x: { balls: number, cols: number, vote: number }) => boolean }
const RULES: Rule[] = [
  { name: '每期都下', ok: () => true },
  ...Array.from({ length: N_TO - N_FROM + 1 }, (_, i) => ({ name: `二篩 ≤ ${N_FROM + i} 顆`, ok: (x: { balls: number }) => x.balls <= N_FROM + i })),
  ...Array.from({ length: K_TO - K_FROM + 1 }, (_, i) => ({ name: `柱數 ≤ ${K_FROM + i}`, ok: (x: { cols: number }) => x.cols <= K_FROM + i })),
]

interface Tally { bets: number, cost: number, back: number, won: number }
const tally = (pick: (x: Draw) => boolean, ks: number[]): { 找: Tally, 驗: Tally, years: Map<string, number> } => {
  const t = { 找: { bets: 0, cost: 0, back: 0, won: 0 }, 驗: { bets: 0, cost: 0, back: 0, won: 0 } }
  const years = new Map<string, number>()
  for (const x of all) {
    if (!pick(x)) continue
    const cost = ks.reduce((a, k) => a + x.cost[k]!, 0)
    if (!cost) continue
    const back = ks.reduce((a, k) => a + x.back[k]!, 0)
    const s = t[x.p]
    s.bets++
    s.cost += cost
    s.back += back
    if (back) s.won++
    if (x.p === '驗') years.set(x.year, (years.get(x.year) ?? 0) + back - cost)
  }
  return { ...t, years }
}

const fmt = (x: number): string => (x >= 0 ? '+' : '') + x.toFixed(2)
const pct = (a: number, b: number): string => (b ? (100 * a / b).toFixed(1) + '%' : '—')
const per = (s: Tally, p: Period): number => (s.back - s.cost) / nDraws[p]
const yearText = (y: Map<string, number>): string => [...y.entries()].map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${Math.round(v)}`).join('、') || '—'
const row = (name: string, r: ReturnType<typeof tally>): string =>
  `| ${name} | ${r.找.bets} | ${pct(r.找.back, r.找.cost)} | ${fmt(per(r.找, '找'))} | ${r.驗.bets} | ${pct(r.驗.back, r.驗.cost)} | ${fmt(per(r.驗, '驗'))} | ${r.驗.won} | ${yearText(r.years)} |`
const HEAD = '| 下注條件 | 找：下注期數 | 找：拿回率 | 找：平均每期 | 驗：下注期數 | 驗：拿回率 | 驗：平均每期 | 驗：中獎期數 | 驗：各年淨結果 |\n|---|---|---|---|---|---|---|---|---|'

const out: string[] = []
out.push('# 二篩名單小的時候才下：顆數／柱數門檻')
out.push('')
out.push(`> 由 \`scripts/small-list.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期。名單＝每期二篩（conditions-v2），照隔期格立柱；每碰 1 元、中獎另退本金；二星 70、三星 800、四星 12,500 倍。`)
out.push(`> 找：2007～2020 年 ${nDraws.找} 期；驗：2021 年起 ${nDraws.驗} 期。平均每期＝淨結果 ÷ 該段全部期數（沒下的期算 0）。找門檻時要求至少下注 ${MIN_BET_DRAWS} 期。`)
out.push('')
const picked: string[] = []
for (const play of PLAYS) {
  out.push(`## ${play.name}`)
  out.push('')
  out.push(HEAD)
  const rs = RULES.map(rule => ({ rule, r: tally(x => rule.ok(x), play.ks) }))
  for (const { rule, r } of rs) out.push(row(rule.name, r))
  out.push('')
  const cand = rs.filter(({ r }) => r.找.bets >= MIN_BET_DRAWS).sort((a, b) => per(b.r.找, '找') - per(a.r.找, '找'))[0]
  if (cand) {
    const line = `${play.name}：找出來最好的是「${cand.rule.name}」（找 ${fmt(per(cand.r.找, '找'))}、拿回 ${pct(cand.r.找.back, cand.r.找.cost)}）→ 驗 ${fmt(per(cand.r.驗, '驗'))}、拿回 ${pct(cand.r.驗.back, cand.r.驗.cost)}`
    picked.push(line)
    out.push(`- ${line}`)
  }
  const both = rs.filter(({ r }) => r.找.bets >= MIN_BET_DRAWS && per(r.找, '找') > 0 && per(r.驗, '驗') > 0)
  out.push(`- 兩段都正數的：${both.length ? both.map(({ rule }) => rule.name).join('、') : '沒有'}`)
  out.push('')
}

out.push('## 參考：二篩最高票數分組')
out.push('')
out.push('每期二篩名單裡票數最多的球拿到幾票（幾個採用的二篩條件挑到它），照這個分組看各玩法每期都下的結果。')
out.push('')
const votes = [...new Set(all.map(x => x.vote))].sort((a, b) => a - b)
for (const play of PLAYS) {
  out.push(`### ${play.name}`)
  out.push('')
  out.push(HEAD.replace('下注條件', '最高票數'))
  for (const v of votes) out.push(row(`${v} 票`, tally(x => x.vote === v, play.ks)))
  out.push('')
}

out.push('## 摘要')
out.push('')
out.push(picked.map(p => `- ${p}`).join('\n'))
out.push('')
const g = [...columnsOf(next).entries()]
const sizes = g.map(([, v]) => v.length)
const nx = { balls: next.final.length, cols: g.length, vote: topVote(next) }
out.push(`## 下一期（${rows[rows.length - 1]![0]} 開完後）`)
out.push('')
out.push(`- 二篩 ${nx.balls} 顆、${nx.cols} 柱、最高 ${nx.vote} 票：${next.final.join(' ')}`)
out.push(`- 立柱：${g.map(([s, v]) => `隔期${s}［${v.join(' ')}］`).join(' ')}（二星 ${esym(sizes, 2)}、三星 ${esym(sizes, 3)}、四星 ${esym(sizes, 4)} 碰）`)
out.push(`- 會下注的門檻：${RULES.filter(r => r.ok(nx)).map(r => r.name).join('、')}`)
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
