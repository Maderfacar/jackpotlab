/**
 * 找「平均每期是正數」的挑號策略（2026-11-02 使用者）：二星 70、三星 800、四星 12,500 倍，每碰 1 元、中獎另退本金，連碰。
 *
 * 候選策略全部來自 blind-test.ts 每一期的條件選號（每期只用開完上一期為止的資料）：
 *   單一條件挑出的球（S1a～S8、T1～Y3、少見 R1/R2）；同一條件只在成立線判斷「採用」時才下；
 *   一篩、二篩名單；任兩個條件挑出的球的交集。
 * 找：2007～2020 年平均每期淨結果 > 0（而且下注期數夠）；驗：2021 年起原封不動照下，看還是不是正數。
 *
 * 用法：node --import tsx scripts/positive-strategies.ts  → docs/positive-strategies.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, next, rows } from './blind-test'
import { setsOf } from './lib/strategy-sets'

const OUT = 'docs/positive-strategies.md'
const SPLIT = '2021-01-01'
const ODDS: Record<number, number> = { 2: 70, 3: 800, 4: 12500 }
const KS = [2, 3, 4]
const MIN_BET_DRAWS = 100
const SHOW = 15

const choose = (a: number, b: number): number => {
  if (b > a) return 0
  let r = 1
  for (let i = 0; i < b; i++) r = r * (a - i) / (i + 1)
  return r
}

interface Acc { cost: number, back: number, bets: number, size: number }
const acc = new Map<string, Record<string, Acc>>()
const periodDraws: Record<string, number> = {}
const yearNet = new Map<string, Map<string, number>>()
for (const d of allDecisions) {
  const date = rows[d.t]![1]
  const period = date < SPLIT ? '找' : '驗'
  periodDraws[period] = (periodDraws[period] ?? 0) + 1
  const actual = new Set(draws[d.t]!)
  for (const [name, set] of setsOf(d)) {
    const h = set.filter(x => actual.has(x)).length
    for (const k of KS) {
      if (set.length < k) continue
      const key = `${name}|${k}`
      const rec = acc.get(key) ?? {}
      const a = (rec[period] ??= { cost: 0, back: 0, bets: 0, size: 0 })
      const c = choose(set.length, k)
      const b = choose(h, k) * (ODDS[k]! + 1)
      a.cost += c
      a.back += b
      a.bets++
      a.size += set.length
      acc.set(key, rec)
      if (period === '驗') {
        const yn = yearNet.get(key) ?? new Map<string, number>()
        yn.set(date.slice(0, 4), (yn.get(date.slice(0, 4)) ?? 0) + b - c)
        yearNet.set(key, yn)
      }
    }
  }
}

const per = (a: Acc | undefined, p: string): number => (a ? (a.back - a.cost) / periodDraws[p]! : 0)
const fmt = (x: number): string => (x >= 0 ? '+' : '') + x.toFixed(2)
const out: string[] = []
out.push('# 平均每期是正數的挑號策略：2007～2020 找、2021 起驗')
out.push('')
out.push(`> 由 \`scripts/positive-strategies.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期。每碰 1 元、連碰、中獎另退本金；二星 70、三星 800、四星 12,500 倍。`)
out.push(`> 找：2007～2020 年 ${periodDraws['找']} 期；驗：2021 年起 ${periodDraws['驗']} 期。平均每期＝淨結果 ÷ 該段全部期數（沒下注的期算 0）。`)
out.push(`> 每期挑號只用開完上一期為止的資料。找的時候要求至少下注 ${MIN_BET_DRAWS} 期。`)
out.push('')
const verified: string[] = []
for (const k of KS) {
  const all = [...acc.entries()].filter(([key]) => key.endsWith(`|${k}`))
  const found = all.filter(([, r]) => (r['找']?.bets ?? 0) >= MIN_BET_DRAWS && per(r['找'], '找') > 0)
  const held = found.filter(([, r]) => per(r['驗'], '驗') > 0)
  out.push(`## ${k} 星（${ODDS[k]} 倍）`)
  out.push('')
  out.push(`試了 ${all.length} 種策略；2007～2020 平均每期正數的 ${found.length} 種；其中 2021 起也是正數的 ${held.length} 種。`)
  out.push('')
  out.push('| 策略 | 找：下注期數 | 找：平均挑幾顆 | 找：拿回率 | 找：平均每期 | 驗：下注期數 | 驗：拿回率 | 驗：平均每期 | 驗：各年淨結果 |')
  out.push('|---|---|---|---|---|---|---|---|---|')
  const rank = [...found].sort((a, b) => per(b[1]['找'], '找') - per(a[1]['找'], '找'))
  const shown = [...held, ...rank.filter(e => !held.includes(e))].slice(0, Math.max(SHOW, held.length))
  for (const [key, r] of shown) {
    const f = r['找']!
    const v = r['驗']
    const yn = yearNet.get(key)
    const years = yn ? [...yn.entries()].map(([y, x]) => `${y} ${x >= 0 ? '+' : ''}${Math.round(x)}`).join('、') : '—'
    const name = key.split('|')[0]!
    const ok = held.some(([k2]) => k2 === key)
    if (ok) verified.push(`${k} 星：${name}`)
    out.push(`| ${ok ? '**' + name + '**' : name} | ${f.bets} | ${(f.size / f.bets).toFixed(1)} | ${(100 * f.back / f.cost).toFixed(1)}% | ${fmt(per(f, '找'))} | ${v?.bets ?? 0} | ${v ? (100 * v.back / v.cost).toFixed(1) : '—'}% | ${fmt(per(v, '驗'))} | ${years} |`)
  }
  out.push('')
}
out.push('## 兩段都正數的')
out.push('')
out.push(verified.length ? verified.map(v => `- ${v}`).join('\n') : '- 沒有')
out.push('')
out.push(`## 下一期（${rows[rows.length - 1]![0]} 開完後）這些策略要下的號碼`)
out.push('')
const nextSets = setsOf(next)
out.push('| 玩法 | 策略 | 號碼 | 碰數 |')
out.push('|---|---|---|---|')
for (const v of verified) {
  const [kText, name] = v.split(' 星：') as [string, string]
  const k = Number(kText)
  const set = nextSets.get(name)
  const ok = set && set.length >= k
  out.push(`| ${k} 星 | ${name} | ${ok ? [...set].sort((a, b) => a - b).join(' ') : `這期不下（條件不成立或不到 ${k} 顆）`} | ${ok ? choose(set.length, k) : 0} |`)
}
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
