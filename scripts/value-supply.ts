/**
 * 值 4 以上會不會出現：是看盤面上這個值的格裡剩幾顆，還是每個值有自己的出現比例（2026-11-04 使用者）。
 *   一期裡只要有一顆獎號來自值 v 的格，就算值 v 出現；只看開獎前盤面上有值 v 的格的期。
 *   1. 每個值依「盤面上這個值的格共剩幾顆」分組，看這期出現的比例。
 *   2. 每個值的「每顆命中率」：這個值的格裡的號碼，開出幾顆 ÷ 共有幾顆。剩幾顆都一樣的話，每顆命中率不變、出現比例跟著顆數走。
 *
 * 用法：node --import tsx scripts/value-supply.ts  → docs/value-supply.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, next, rows } from './blind-test'

const OUT = 'docs/value-supply.md'
const SLOTS = 60
const MAX_V = 15
const vKey = (v: number): number => Math.min(v, MAX_V + 1)
const vName = (k: number): string => (k > MAX_V ? `${MAX_V + 1} 以上` : String(k))
const KS = [1, 2, 3, 4, 5]
const kKey = (n: number): number => Math.min(n, 5)
const pct = (a: number, b: number): string => (b ? (100 * a / b).toFixed(1) + '%' : '—')

interface Cell { draws: number, appear: number, balls: number, hits: number }
const mk = (): Cell => ({ draws: 0, appear: 0, balls: 0, hits: 0 })
const table = new Map<number, Map<number, Cell>>()
const total = new Map<number, Cell>()
const add = (c: Cell, balls: number, hits: number): void => { c.draws++; if (hits) c.appear++; c.balls += balls; c.hits += hits }
const group4 = new Map<number, Cell>()
for (const d of allDecisions) {
  const balls = new Map<number, number>()
  const hits = new Map<number, number>()
  for (const b of d.ballOf.slice(1)) if (b!.slot < SLOTS) balls.set(vKey(b!.value), (balls.get(vKey(b!.value)) ?? 0) + 1)
  for (const x of draws[d.t]!) if (d.ballOf[x]!.slot < SLOTS) hits.set(vKey(d.ballOf[x]!.value), (hits.get(vKey(d.ballOf[x]!.value)) ?? 0) + 1)
  let b4 = 0, h4 = 0
  for (const [k, n] of balls) {
    const h = hits.get(k) ?? 0
    const row = table.get(k) ?? new Map<number, Cell>()
    const c = row.get(kKey(n)) ?? mk()
    add(c, n, h)
    row.set(kKey(n), c)
    table.set(k, row)
    const tc = total.get(k) ?? mk()
    add(tc, n, h)
    total.set(k, tc)
    if (k >= 4) { b4 += n; h4 += h }
  }
  if (b4) { const key = Math.min(b4, 12); const c = group4.get(key) ?? mk(); add(c, b4, h4); group4.set(key, c) }
}

const out: string[] = []
out.push('# 值會不會出現：看剩幾顆，還是看值本身')
out.push('')
out.push(`> 由 \`scripts/value-supply.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期。一期裡有一顆獎號來自值 v 的格＝值 v 出現；只看開獎前盤面上有值 v 的格的期。`)
out.push('> 每顆命中率＝這個值的格裡的號碼開出幾顆 ÷ 共有幾顆（每期每顆號碼平均被開中 5/39＝12.8%）。')
out.push('')
out.push('## 1. 每個值：盤面上剩幾顆 → 這期出現的比例')
out.push('')
out.push(`| 值 | ${KS.map(k => (k < 5 ? `剩 ${k} 顆` : '剩 5 顆以上')).join(' | ')} | 全部：每顆命中率 |`)
out.push(`|---|${KS.map(() => '---').join('|')}|---|`)
for (const k of [...table.keys()].sort((a, b) => a - b)) {
  const row = table.get(k)!
  const cells = KS.map((n) => { const c = row.get(n); return c && c.draws >= 20 ? `${pct(c.appear, c.draws)}（${c.draws}）` : c ? `（${c.draws} 期）` : '—' })
  const t = total.get(k)!
  out.push(`| ${vName(k)} | ${cells.join(' | ')} | ${pct(t.hits, t.balls)} |`)
}
out.push('')
out.push('## 2. 值 4 以上合起來：盤面上值 4 以上的格共剩幾顆 → 這期開出值 4 以上的比例')
out.push('')
out.push('| 共剩幾顆 | 期數 | 這期有開出值 4 以上 | 平均開出幾顆 | 每顆命中率 |')
out.push('|---|---|---|---|---|')
for (const n of [...group4.keys()].sort((a, b) => a - b)) {
  const c = group4.get(n)!
  if (c.draws < 20) continue
  out.push(`| ${n < 12 ? n : '12 以上'} | ${c.draws} | ${pct(c.appear, c.draws)} | ${(c.hits / c.draws).toFixed(2)} | ${pct(c.hits, c.balls)} |`)
}
out.push('')
// 現在盤面
const nowBalls = new Map<number, number[]>()
for (let x = 1; x <= 39; x++) { const b = next.ballOf[x]!; if (b.slot < SLOTS) nowBalls.set(vKey(b.value), [...(nowBalls.get(vKey(b.value)) ?? []), x]) }
out.push(`## 現在盤面（${rows[rows.length - 1]![0]} 開完後）`)
out.push('')
out.push('| 值 | 號碼 | 剩幾顆 | 歷史上同值、同顆數 → 出現比例 |')
out.push('|---|---|---|---|')
for (const k of [...nowBalls.keys()].sort((a, b) => a - b)) {
  const bs = nowBalls.get(k)!
  const c = table.get(k)?.get(kKey(bs.length))
  out.push(`| ${vName(k)} | ${bs.join(' ')} | ${bs.length} | ${c ? `${pct(c.appear, c.draws)}（${c.draws} 期）` : '—'} |`)
}
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
