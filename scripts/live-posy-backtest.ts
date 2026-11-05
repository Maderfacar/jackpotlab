/**
 * 活的第一版＋位置 y 線索，往前盲測（2026-11-05 使用者：三篩所有條件都當線索，再加五個位置各自的 y）。
 *   位置 y 的做法見 live-core.ts。同一期同一批判斷，「沒加」＝把位置 y 那幾條當成弱的（不用），其他完全一樣。
 *   設定：強 60%、不檢查（第一版單期報告用的）；強 70%、不檢查；強 70%、整體 30%（使用者說要保留深挖的）。
 *   另外統計（強 60%、不檢查、加位置 y）：每一條位置 y 線索用上幾次、實際開出不符合幾次。
 *
 * 用法：node --import tsx scripts/live-posy-backtest.ts → docs/live-posy-backtest.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, rows } from './blind-test'
import { D, baseCombos, choose, ctxAt, failMasks, histMasks, judgmentsAt, type Judgment, type PickOpt } from './live-core'

const OUT = 'docs/live-posy-backtest.md'
const FROM = '2024-01-01'
const MIN_N = 30
const SETTINGS: { name: string, opt: PickOpt }[] = [
  { name: '強 60%、不檢查', opt: { strong: 0.6, minN: MIN_N, jointMin: null } },
  { name: '強 70%、不檢查', opt: { strong: 0.7, minN: MIN_N, jointMin: null } },
  { name: '強 70%、整體 30%', opt: { strong: 0.7, minN: MIN_N, jointMin: 0.3 } }
]
const POS = '位置 y'

interface Acc { n: number, size: number, dist: number[], last10: string[] }
const newAcc = (): Acc => ({ n: 0, size: 0, dist: [0, 0, 0, 0, 0, 0], last10: [] })
const acc = SETTINGS.flatMap(() => [newAcc(), newAcc()])
const used = new Map<string, { use: number, miss: number }>()
const from = allDecisions.findIndex(d => rows[d.t]![1] >= FROM)
const t0 = Date.now()
for (let j = from; j < D; j++) {
  const c = ctxAt(j)
  const drawn = draws[c.t]!
  const js = judgmentsAt(c, c.b, { posY: true })
  const jsNo: Judgment[] = js.map(u => (u.stage === POS ? { ...u, share: 0 } : u))
  const base = baseCombos(c)
  const fm = failMasks(base.combos, js, c.b)
  const hm = histMasks(j, js)
  SETTINGS.forEach((s, si) => {
    ;[jsNo, js].forEach((jj, wi) => {
      const pk = choose(jj, base.combos, fm, hm, s.opt)
      const a = acc[si * 2 + wi]!
      const h = drawn.filter(x => pk.list.includes(x)).length
      a.n++; a.size += pk.list.length; a.dist[h]!++
      if (j >= D - 10) a.last10.push(`${pk.list.length}/${h}`)
      if (si === 0 && wi === 1) {
        for (const k of pk.use) {
          if (js[k]!.stage !== POS) continue
          const key = `${js[k]!.name}｜${js[k]!.say}`
          const u = used.get(key) ?? { use: 0, miss: 0 }
          u.use++
          if (!js[k]!.ok(drawn, c.b)) u.miss++
          used.set(key, u)
        }
      }
    })
  })
  if ((j - from) % 100 === 0) process.stderr.write(`${j - from}/${D - from} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`)
}

const pct = (a: number, b: number): string => (b ? (100 * a / b).toFixed(1) : '—')
const row = (name: string, a: Acc): string => `| ${name} | ${(a.size / a.n).toFixed(1)} | ${[5, 4, 3, 2, 1, 0].map(k => a.dist[k]).join(' | ')} | ${pct(a.dist[5]! + a.dist[4]! + a.dist[3]!, a.n)}% |`
const out: string[] = []
out.push('# 活的第一版＋位置 y 線索：2024 起往前盲測')
out.push('')
out.push(`> 由 \`scripts/live-posy-backtest.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期，共 ${acc[0]!.n} 期。每期只用開獎前的資料。`)
out.push('> 位置 y：五顆由小到大排第 1～5 顆；「上期這個位置 y＝a → 這期不是 a」，第 1 顆另看「已連 r 期不是 y＝1 → 這期回到 1」。強弱照歷史比例，強的才用，跟其他線索放在一起。')
out.push('')
out.push('| 篩法 | 平均顆數 | 中 5 | 中 4 | 中 3 | 中 2 | 中 1 | 中 0 | 中 3 顆以上 |')
out.push('|---|---|---|---|---|---|---|---|---|')
SETTINGS.forEach((s, si) => { out.push(row(`${s.name}（沒加）`, acc[si * 2]!)); out.push(row(`${s.name}（加位置 y）`, acc[si * 2 + 1]!)) })
out.push('')
out.push('## 最近十期（篩完顆數／中幾顆）')
out.push('')
const terms = allDecisions.slice(D - 10).map(d => rows[d.t]![0] % 1000)
out.push(`| 篩法 | ${terms.join(' | ')} |`)
out.push(`|---|${terms.map(() => '---').join('|')}|`)
SETTINGS.forEach((s, si) => { out.push(`| ${s.name}（沒加） | ${acc[si * 2]!.last10.join(' | ')} |`); out.push(`| ${s.name}（加位置 y） | ${acc[si * 2 + 1]!.last10.join(' | ')} |`) })
out.push('')
out.push('## 強 60%、不檢查、加位置 y：每一條位置 y 線索用上幾次、實際開出不符合幾次')
out.push('')
out.push('| 線索 | 用上 | 實際不符合 | 不符合比例 |')
out.push('|---|---|---|---|')
for (const [k, u] of [...used.entries()].sort((a, b) => b[1].use - a[1].use)) out.push(`| ${k} | ${u.use} | ${u.miss} | ${pct(u.miss, u.use)}% |`)
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
