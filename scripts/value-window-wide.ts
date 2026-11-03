/**
 * 值 0～9 會不會出現：W／R 放大範圍再找（2026-11-03 使用者：W／R 配比還不夠好）。
 *   一期有獎號來自值 v 的隔期格＝值 v 出現；每期只用到上一期為止，比「最近 W 期出現的百分比」與「最近 R 期出現的百分比」。
 *   兩個方向都試：多→不會（近 R 期比波段多 → 判不會）、少→不會（近 R 期比波段少 → 判不會）；一樣 → 判會。
 *   這次直接看命中：判不會就排除這個值的隔期格，比「判會時這些格每顆的命中率」與「判不會時每顆的命中率」，差越大越好。
 *   找：2007～2020 每個值挑差最大的一組（盤面有這個值的期裡，判不會至少佔 MIN_SHARE）；驗：2021 起原封不動照用，不看驗證結果挑。
 *
 * 用法：node --import tsx scripts/value-window-wide.ts  → docs/value-window-wide.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, rows } from './blind-test'

const OUT = 'docs/value-window-wide.md'
const SPLIT = '2021-01-01'
const VALS = 10
const SLOTS = 60
const WS = Array.from({ length: 30 }, (_, i) => 5 * (i + 1))
const R_MAX = 40
const MIN_SHARE = 0.1

const D = allDecisions.length
const isFind = allDecisions.map(d => rows[d.t]![1] < SPLIT)
/** seen：這期值 v 有沒有出現；cnt：盤面上值 v 的格有幾顆；hit：開出幾顆來自值 v 的格 */
const seen = Array.from({ length: VALS }, (_, v) => allDecisions.map(d => (draws[d.t]!.some(x => d.ballOf[x]!.slot < SLOTS && d.ballOf[x]!.value === v) ? 1 : 0)))
const cnt = Array.from({ length: VALS }, (_, v) => allDecisions.map(d => d.ballOf.filter(b => b && b.slot < SLOTS && b.value === v).length))
const hit = Array.from({ length: VALS }, (_, v) => allDecisions.map(d => draws[d.t]!.filter(x => d.ballOf[x]!.slot < SLOTS && d.ballOf[x]!.value === v).length))
const pre = seen.map((s) => {
  const p = [0]
  for (const x of s) p.push(p[p.length - 1]! + x)
  return p
})

type Period = '找' | '驗'
interface Tally { inBalls: number, inHits: number, outBalls: number, outHits: number, outDraws: number, draws: number }
interface Score { w: number, r: number, dir: 1 | -1, t: Record<Period, Tally> }
const mk = (): Tally => ({ inBalls: 0, inHits: 0, outBalls: 0, outHits: 0, outDraws: 0, draws: 0 })
const gap = (x: Tally): number => (x.inBalls && x.outBalls ? 100 * (x.inHits / x.inBalls - x.outHits / x.outBalls) : NaN)
const share = (x: Tally): number => (x.draws ? x.outDraws / x.draws : 0)

function score(v: number, w: number, r: number, dir: 1 | -1): Score {
  const t: Record<Period, Tally> = { 找: mk(), 驗: mk() }
  const p = pre[v]!
  for (let i = w; i < D; i++) {
    const c = cnt[v]![i]!
    if (!c) continue
    const wave = (p[i]! - p[i - w]!) / w
    const recent = (p[i]! - p[i - r]!) / r
    const out = dir === 1 ? recent > wave : recent < wave
    const s = t[isFind[i] ? '找' : '驗']
    s.draws++
    if (out) { s.outDraws++; s.outBalls += c; s.outHits += hit[v]![i]! } else { s.inBalls += c; s.inHits += hit[v]![i]! }
  }
  return { w, r, dir, t }
}

const f1 = (x: number): string => (Number.isNaN(x) ? '—' : (x >= 0 ? '+' : '') + x.toFixed(1))
const rate = (h: number, n: number): string => (n ? (100 * h / n).toFixed(1) + '%' : '—')
const bestOf: Score[] = []
for (let v = 0; v < VALS; v++) {
  let best: Score | undefined
  for (const w of WS) {
    for (let r = 1; r < w && r <= R_MAX; r++) {
      for (const dir of [1, -1] as const) {
        const s = score(v, w, r, dir)
        if (share(s.t.找) < MIN_SHARE || Number.isNaN(gap(s.t.找))) continue
        if (!best || gap(s.t.找) > gap(best.t.找)) best = s
      }
    }
  }
  bestOf.push(best!)
}

const out: string[] = []
out.push('# 值 0～9 會不會出現：W／R 放大範圍，用每顆命中率挑')
out.push('')
out.push(`> 由 \`scripts/value-window-wide.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期。W 試 5～150（每 5 期一格），R 試 1～${R_MAX}（小於 W），兩個方向都試。`)
out.push('> 判不會＝排除這個值的隔期格。每顆命中率＝這些格的號碼開出幾顆 ÷ 這些格共有幾顆（只算盤面上有這個值的期）。')
out.push(`> 找：2007～2020 每個值挑「判會時每顆命中率 − 判不會時每顆命中率」最大的一組，判不會至少佔 ${100 * MIN_SHARE}% 的期；驗：2021 起原封不動。`)
out.push('')
out.push('| 值 | W | R | 方向 | 找：判會每顆 | 找：判不會每顆 | 找：差 | 驗：判會每顆 | 驗：判不會每顆 | 驗：差 | 驗：判不會佔 |')
out.push('|---|---|---|---|---|---|---|---|---|---|---|')
bestOf.forEach((s, v) => {
  out.push(`| ${v} | ${s.w} | ${s.r} | ${s.dir === 1 ? '多→不會' : '少→不會'} | ${rate(s.t.找.inHits, s.t.找.inBalls)} | ${rate(s.t.找.outHits, s.t.找.outBalls)} | ${f1(gap(s.t.找))} | ${rate(s.t.驗.inHits, s.t.驗.inBalls)} | ${rate(s.t.驗.outHits, s.t.驗.outBalls)} | ${f1(gap(s.t.驗))} | ${(100 * share(s.t.驗)).toFixed(0)}% |`)
})
out.push('')
out.push('## 對照：conditions-v5 現在用的組合，同樣看每顆命中率')
out.push('')
out.push('| 值 | W | R | 方向 | 找：判會每顆 | 找：判不會每顆 | 找：差 | 驗：判會每顆 | 驗：判不會每顆 | 驗：差 |')
out.push('|---|---|---|---|---|---|---|---|---|---|')
const V5: [number, number, 1 | -1][] = [[10, 1, -1], [20, 15, -1], [25, 10, -1], [30, 3, -1], [10, 5, -1], [80, 6, -1], [60, 10, -1], [15, 5, 1], [60, 3, 1], [30, 15, 1]]
V5.forEach(([w, r, dir], v) => {
  const sc = score(v, w, r, dir)
  out.push(`| ${v} | ${w} | ${r} | ${dir === 1 ? '多→不會' : '少→不會'} | ${rate(sc.t.找.inHits, sc.t.找.inBalls)} | ${rate(sc.t.找.outHits, sc.t.找.outBalls)} | ${f1(gap(sc.t.找))} | ${rate(sc.t.驗.inHits, sc.t.驗.inBalls)} | ${rate(sc.t.驗.outHits, sc.t.驗.outBalls)} | ${f1(gap(sc.t.驗))} |`)
})
out.push('')
out.push('## 給 blind-test.ts 用')
out.push('')
out.push('```ts')
out.push(bestOf.map(s => `  { w: ${s.w}, r: ${s.r}, dir: ${s.dir} },`).join('\n'))
out.push('```')
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
