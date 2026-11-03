/**
 * 開出的獎號是「高票搭低票」嗎？（2026-11-03 使用者）
 *   票數＝每顆球被幾個「採用的二篩條件」挑到（blind-test.ts，conditions-v2，每期只用開完上一期為止的資料）。
 *   每期把 39 顆分三層：高票（＝這期最高票）、低票（＝這期最低票）、中間；最高＝最低的期不算。
 *   對照：同一期的分層下，隨便開 5 顆時各種搭配的機率（超幾何），全部期加總成「隨機期望」。
 *   下注：照票數分層立柱（同層不互碰），只下跨層的碰；二星 70、三星 800、四星 12,500 倍，每碰 1 元、中獎另退本金。
 * 找：2007～2020；驗：2021 起。
 *
 * 用法：node --import tsx scripts/vote-mix.ts  → docs/vote-mix.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, next, rows, type Decision } from './blind-test'

const OUT = 'docs/vote-mix.md'
const SPLIT = '2021-01-01'
const ODDS: Record<number, number> = { 2: 70, 3: 800, 4: 12500 }
const BALLS = 39
const PICK = 5
const ALL = Array.from({ length: BALLS }, (_, i) => i + 1)

const choose = (a: number, b: number): number => {
  if (b < 0 || b > a) return 0
  let r = 1
  for (let i = 0; i < b; i++) r = r * (a - i) / (i + 1)
  return r
}
const esym = (sizes: number[], k: number): number => {
  const e = new Array<number>(k + 1).fill(0)
  e[0] = 1
  for (const x of sizes) for (let j = k; j >= 1; j--) e[j]! += e[j - 1]! * x
  return e[k]!
}
const votesOf = (d: Decision): number[] => {
  const v = new Array<number>(BALLS + 1).fill(0)
  for (const u of d.used) if (u.apply && u.cond.stage === 2) for (const x of u.set) v[x]! += 1
  return v
}
type Tier = '高' | '中' | '低'
const tiersOf = (d: Decision): Map<Tier, number[]> | null => {
  const v = votesOf(d)
  const vs = ALL.map(x => v[x]!)
  const hi = Math.max(...vs)
  const lo = Math.min(...vs)
  if (hi === lo) return null
  const g = new Map<Tier, number[]>([['高', []], ['中', []], ['低', []]])
  for (const x of ALL) g.get(v[x] === hi ? '高' : v[x] === lo ? '低' : '中')!.push(x)
  return g
}

type Period = '找' | '驗'
const TIERS: Tier[] = ['高', '中', '低']
/** 開出 5 顆在 高／中／低 的顆數組合，例如 "1-2-2" */
const keyOf = (h: number, m: number, l: number): string => `${h}-${m}-${l}`
interface Stat { draws: number, actual: Map<string, number>, expect: Map<string, number>, ballHits: Record<Tier, number>, ballCount: Record<Tier, number> }
const mkStat = (): Stat => ({ draws: 0, actual: new Map(), expect: new Map(), ballHits: { 高: 0, 中: 0, 低: 0 }, ballCount: { 高: 0, 中: 0, 低: 0 } })
const stat: Record<Period, Stat> = { 找: mkStat(), 驗: mkStat() }

/** 下注：分層立柱 */
const LAYOUTS: { name: string, cols: (g: Map<Tier, number[]>) => number[][] }[] = [
  { name: '高｜低 兩柱', cols: g => [g.get('高')!, g.get('低')!] },
  { name: '高｜中 兩柱', cols: g => [g.get('高')!, g.get('中')!] },
  { name: '高｜中＋低 兩柱', cols: g => [g.get('高')!, [...g.get('中')!, ...g.get('低')!]] },
  { name: '高｜中｜低 三柱', cols: g => [g.get('高')!, g.get('中')!, g.get('低')!] },
]
interface Bet { cost: number, back: number, bets: number, won: number }
const bet = new Map<string, Record<Period, Bet>>()
const years = new Map<string, Map<string, number>>()

for (const d of allDecisions) {
  const g = tiersOf(d)
  if (!g) continue
  const date = rows[d.t]![1]
  const p: Period = date < SPLIT ? '找' : '驗'
  const actual = new Set(draws[d.t]!)
  const s = stat[p]
  s.draws++
  const n = { 高: g.get('高')!.length, 中: g.get('中')!.length, 低: g.get('低')!.length }
  const hit = { 高: 0, 中: 0, 低: 0 }
  for (const t of TIERS) {
    hit[t] = g.get(t)!.filter(x => actual.has(x)).length
    s.ballHits[t] += hit[t]
    s.ballCount[t] += n[t]
  }
  const ak = keyOf(hit.高, hit.中, hit.低)
  s.actual.set(ak, (s.actual.get(ak) ?? 0) + 1)
  const total = choose(BALLS, PICK)
  for (let h = 0; h <= PICK; h++) {
    for (let m = 0; h + m <= PICK; m++) {
      const l = PICK - h - m
      const pr = choose(n.高, h) * choose(n.中, m) * choose(n.低, l) / total
      if (pr) s.expect.set(keyOf(h, m, l), (s.expect.get(keyOf(h, m, l)) ?? 0) + pr)
    }
  }
  for (const lay of LAYOUTS) {
    const cols = lay.cols(g).filter(c => c.length)
    const sizes = cols.map(c => c.length)
    const hits = cols.map(c => c.filter(x => actual.has(x)).length)
    for (const k of [2, 3, 4]) {
      const cost = esym(sizes, k)
      if (!cost) continue
      const back = esym(hits, k) * (ODDS[k]! + 1)
      const key = `${lay.name}|${k}`
      const rec = bet.get(key) ?? { 找: { cost: 0, back: 0, bets: 0, won: 0 }, 驗: { cost: 0, back: 0, bets: 0, won: 0 } }
      rec[p].cost += cost
      rec[p].back += back
      rec[p].bets++
      if (back) rec[p].won++
      bet.set(key, rec)
      if (p === '驗') {
        const y = years.get(key) ?? new Map<string, number>()
        y.set(date.slice(0, 4), (y.get(date.slice(0, 4)) ?? 0) + back - cost)
        years.set(key, y)
      }
    }
  }
}

const nAll: Record<Period, number> = { 找: 0, 驗: 0 }
for (const d of allDecisions) nAll[rows[d.t]![1] < SPLIT ? '找' : '驗']++
const pct = (a: number, b: number): string => (b ? (100 * a / b).toFixed(1) + '%' : '—')
const fmt = (x: number): string => (x >= 0 ? '+' : '') + x.toFixed(2)
const out: string[] = []
out.push('# 開出的獎號：高票搭低票？')
out.push('')
out.push(`> 由 \`scripts/vote-mix.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期。票數＝每顆球被幾個採用的二篩條件挑到（conditions-v2）。`)
out.push('> 每期 39 顆分三層：高票＝這期最高票、低票＝這期最低票、其餘＝中間；最高＝最低的期不算。隨機期望＝同一期的分層下隨便開 5 顆的機率，全部期加總。')
out.push('')
for (const p of ['找', '驗'] as Period[]) {
  const s = stat[p]
  out.push(`## ${p === '找' ? '2007～2020' : '2021 起'}（${s.draws} 期）`)
  out.push('')
  out.push('### 每層每顆球的命中率')
  out.push('')
  out.push('| 層 | 平均每期幾顆 | 命中率 | 平均 5/39 |')
  out.push('|---|---|---|---|')
  for (const t of TIERS) out.push(`| ${t}票 | ${(s.ballCount[t] / s.draws).toFixed(1)} | ${pct(s.ballHits[t], s.ballCount[t])} | 12.8% |`)
  out.push('')
  out.push('### 開出 5 顆的搭配（高-中-低 各幾顆）')
  out.push('')
  out.push('| 搭配 | 實際期數 | 隨機期望 | 實際 ÷ 期望 |')
  out.push('|---|---|---|---|')
  const keys = [...new Set([...s.actual.keys(), ...s.expect.keys()])].sort((a, b) => (s.expect.get(b) ?? 0) - (s.expect.get(a) ?? 0))
  for (const k of keys) {
    const a = s.actual.get(k) ?? 0
    const e = s.expect.get(k) ?? 0
    if (a === 0 && e < 1) continue
    out.push(`| ${k} | ${a} | ${e.toFixed(1)} | ${e ? (a / e).toFixed(2) : '—'} |`)
  }
  const sumBy = (f: (h: number, m: number, l: number) => boolean, m: Map<string, number>): number =>
    [...m.entries()].filter(([k]) => { const [h, mm, l] = k.split('-').map(Number) as [number, number, number]; return f(h, mm, l) }).reduce((x, [, v]) => x + v, 0)
  const mixes: [string, (h: number, m: number, l: number) => boolean][] = [
    ['有高票、也有低票', (h, _m, l) => h > 0 && l > 0],
    ['有高票、沒有低票', (h, _m, l) => h > 0 && l === 0],
    ['沒有高票、有低票', (h, _m, l) => h === 0 && l > 0],
    ['高票 ≥ 2 顆', h => h >= 2],
    ['全部同一層', (h, m, l) => h === 5 || m === 5 || l === 5],
  ]
  out.push('')
  out.push('| 合併看 | 實際期數 | 隨機期望 | 實際 ÷ 期望 |')
  out.push('|---|---|---|---|')
  for (const [name, f] of mixes) {
    const a = sumBy(f, s.actual)
    const e = sumBy(f, s.expect)
    out.push(`| ${name} | ${a} | ${e.toFixed(1)} | ${e ? (a / e).toFixed(2) : '—'} |`)
  }
  out.push('')
}

out.push('## 照票數分層立柱、只下跨層的碰')
out.push('')
out.push(`平均每期＝淨結果 ÷ 該段全部期數（找 ${nAll.找} 期、驗 ${nAll.驗} 期）。`)
out.push('')
out.push('| 排法 | 玩法 | 每期平均碰數 | 找：拿回率 | 找：平均每期 | 驗：拿回率 | 驗：平均每期 | 驗：中獎期數 | 驗：各年淨結果 |')
out.push('|---|---|---|---|---|---|---|---|---|')
for (const lay of LAYOUTS) {
  for (const k of [2, 3, 4]) {
    const r = bet.get(`${lay.name}|${k}`)
    if (!r) continue
    const y = [...(years.get(`${lay.name}|${k}`) ?? new Map<string, number>()).entries()].map(([a, b]) => `${a} ${b >= 0 ? '+' : ''}${Math.round(b)}`).join('、')
    out.push(`| ${lay.name} | ${k} 星 | ${((r.找.cost + r.驗.cost) / (r.找.bets + r.驗.bets)).toFixed(0)} | ${pct(r.找.back, r.找.cost)} | ${fmt((r.找.back - r.找.cost) / nAll.找)} | ${pct(r.驗.back, r.驗.cost)} | ${fmt((r.驗.back - r.驗.cost) / nAll.驗)} | ${r.驗.won} | ${y} |`)
  }
}
out.push('')
const g = tiersOf(next)
out.push(`## 下一期（${rows[rows.length - 1]![0]} 開完後）`)
out.push('')
if (g) {
  for (const t of TIERS) out.push(`- ${t}票（${g.get(t)!.length} 顆）：${g.get(t)!.join(' ')}`)
} else out.push('- 這期 39 顆票數都一樣，分不出層')
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
