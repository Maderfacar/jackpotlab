/**
 * 值 0～9 會不會出現：找「波段幾期 W × 近期幾期 R」哪一組分得出來（2026-11-03 使用者）。
 *   一期有獎號來自值 v 的隔期格＝值 v 出現。每期只用到上一期為止：最近 W 期出現的百分比 vs 最近 R 期出現的百分比。
 *   使用者的方向：近 R 期比波段多 → 判不會（排除）；一樣或少 → 判會。另列反方向（近 R 期多 → 判會）對照。
 *   分得出來＝判會的期實際開出的比例 − 判不會的期實際開出的比例（百分點），越大越好。
 *   找：2007～2020 每個值各自挑最好的一組（判不會的期至少佔 MIN_SHARE）；驗：2021 起原封不動照用。
 *
 * 用法：node --import tsx scripts/value-window.ts  → docs/value-window.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, rows } from './blind-test'

const OUT = 'docs/value-window.md'
const SPLIT = '2021-01-01'
const VALS = 10
const SLOTS = 60
const WS = [10, 15, 20, 25, 30, 40, 50, 60, 80, 100]
const RS = [1, 2, 3, 4, 5, 6, 8, 10, 15]
const MIN_SHARE = 0.1

/** seen[v][i]：第 i 個決策期值 v 有沒有出現 */
const seen = Array.from({ length: VALS }, (_, v) => allDecisions.map(d => (draws[d.t]!.some(x => d.ballOf[x]!.slot < SLOTS && d.ballOf[x]!.value === v) ? 1 : 0)))
const isFind = allDecisions.map(d => rows[d.t]![1] < SPLIT)
const pre = seen.map(s => s.reduce<number[]>((a, x) => [...a, a[a.length - 1]! + x], [0]))

type Period = '找' | '驗'
interface Tally { inN: number, inHit: number, outN: number, outHit: number }
interface Score { w: number, r: number, dir: 1 | -1, t: Record<Period, Tally> }
const sep = (x: Tally): number => (x.inN && x.outN ? 100 * (x.inHit / x.inN - x.outHit / x.outN) : NaN)
const share = (x: Tally): number => x.outN / (x.inN + x.outN)

function score(v: number, w: number, r: number, dir: 1 | -1): Score {
  const t: Record<Period, Tally> = { 找: { inN: 0, inHit: 0, outN: 0, outHit: 0 }, 驗: { inN: 0, inHit: 0, outN: 0, outHit: 0 } }
  const p = pre[v]!
  for (let i = w; i < allDecisions.length; i++) {
    const wave = (p[i]! - p[i - w]!) / w
    const recent = (p[i]! - p[i - r]!) / r
    const out = dir === 1 ? recent > wave : recent < wave
    const s = t[isFind[i] ? '找' : '驗']
    const hit = seen[v]![i]!
    if (out) { s.outN++; s.outHit += hit } else { s.inN++; s.inHit += hit }
  }
  return { w, r, dir, t }
}

const f1 = (x: number): string => (Number.isNaN(x) ? '—' : (x >= 0 ? '+' : '') + x.toFixed(1))
const rate = (h: number, n: number): string => (n ? (100 * h / n).toFixed(1) + '%' : '—')
const out: string[] = []
out.push('# 值 0～9 會不會出現：波段期數 × 近期期數')
out.push('')
out.push(`> 由 \`scripts/value-window.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期。一期有獎號來自值 v 的隔期格＝值 v 出現；每期只用到上一期為止。`)
out.push('> 分得出來＝判會的期實際開出的比例 − 判不會的期實際開出的比例（百分點），正的越大越好。找：2007～2020；驗：2021 起。')
out.push(`> 試的波段期數：${WS.join('、')}；近期期數：${RS.join('、')}。判不會的期至少要佔 ${100 * MIN_SHARE}%。`)
out.push('')

const all = new Map<number, Score[]>()
for (let v = 0; v < VALS; v++) {
  const list: Score[] = []
  for (const w of WS) for (const r of RS) if (r < w) for (const dir of [1, -1] as const) list.push(score(v, w, r, dir))
  all.set(v, list)
}

out.push('## 你的方向（近期比波段多 → 判不會）：每個值找出來最好的一組')
out.push('')
out.push('| 值 | 波段 W | 近期 R | 找：判會開出 | 找：判不會開出 | 找：分得出來 | 驗：判會開出 | 驗：判不會開出 | 驗：分得出來 | 驗：判不會佔 |')
out.push('|---|---|---|---|---|---|---|---|---|---|')
const best = (v: number, dir: 1 | -1): Score | undefined =>
  all.get(v)!.filter(s => s.dir === dir && share(s.t.找) >= MIN_SHARE).sort((a, b) => sep(b.t.找) - sep(a.t.找))[0]
const line = (v: number, s: Score): string =>
  `| ${v} | ${s.w} | ${s.r} | ${rate(s.t.找.inHit, s.t.找.inN)} | ${rate(s.t.找.outHit, s.t.找.outN)} | ${f1(sep(s.t.找))} | ${rate(s.t.驗.inHit, s.t.驗.inN)} | ${rate(s.t.驗.outHit, s.t.驗.outN)} | ${f1(sep(s.t.驗))} | ${(100 * share(s.t.驗)).toFixed(0)}% |`
for (let v = 0; v < VALS; v++) { const s = best(v, 1); if (s) out.push(line(v, s)) }
out.push('')
out.push('## 反方向（近期比波段多 → 判會）：每個值找出來最好的一組，對照用')
out.push('')
out.push('| 值 | 波段 W | 近期 R | 找：判會開出 | 找：判不會開出 | 找：分得出來 | 驗：判會開出 | 驗：判不會開出 | 驗：分得出來 | 驗：判不會佔 |')
out.push('|---|---|---|---|---|---|---|---|---|---|')
for (let v = 0; v < VALS; v++) { const s = best(v, -1); if (s) out.push(line(v, s)) }
out.push('')
out.push('## 你的方向：同一組用在全部值（找的平均分得出來排前 10）')
out.push('')
out.push('| 波段 W | 近期 R | 找：平均分得出來 | 驗：平均分得出來 | 驗：分得出來是正的值 |')
out.push('|---|---|---|---|---|')
const pairs = WS.flatMap(w => RS.filter(r => r < w).map(r => ({ w, r })))
const avg = (w: number, r: number, p: Period): number[] => Array.from({ length: VALS }, (_, v) => sep(all.get(v)!.find(s => s.w === w && s.r === r && s.dir === 1)!.t[p]))
const ranked = pairs.map(({ w, r }) => ({ w, r, find: avg(w, r, '找'), test: avg(w, r, '驗') }))
  .map(x => ({ ...x, fm: x.find.reduce((a, b) => a + b, 0) / VALS, tm: x.test.reduce((a, b) => a + b, 0) / VALS }))
  .sort((a, b) => b.fm - a.fm)
for (const x of ranked.slice(0, 10)) out.push(`| ${x.w} | ${x.r} | ${f1(x.fm)} | ${f1(x.tm)} | ${x.test.map((s, v) => (s > 0 ? v : -1)).filter(v => v >= 0).join('、') || '沒有'} |`)
out.push('')

// 下一期：每個值用自己找出來的那組
const n = allDecisions.length
for (const dir of [1, -1] as const) {
  out.push(`## 下一期（${rows[rows.length - 1]![0]} 開完後）：每個值用自己找出來的那組（${dir === 1 ? '你的方向' : '反方向'}）`)
  out.push('')
  out.push('| 值 | 波段 W | 近期 R | 最近 W 期出現 | 最近 R 期出現 | 判 |')
  out.push('|---|---|---|---|---|---|')
  for (let v = 0; v < VALS; v++) {
    const sc = best(v, dir)
    if (!sc) continue
    const p = pre[v]!
    const wave = (p[n]! - p[n - sc.w]!) / sc.w
    const recent = (p[n]! - p[n - sc.r]!) / sc.r
    const no = dir === 1 ? recent > wave : recent < wave
    out.push(`| ${v} | ${sc.w} | ${sc.r} | ${(100 * wave).toFixed(0)}% | ${(100 * recent).toFixed(0)}% | ${no ? '不會' : '會'} |`)
  }
  out.push('')
}
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
