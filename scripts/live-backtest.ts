/**
 * 活的篩法往前盲測（2026-11-05）：2024 起每一期，用開獎前的資料照 live-core.ts 選名單，跟死規矩版（three-stage.ts）比。
 *   強的門檻：55%、60%、70%（次數都要 30 次以上）。
 *   整體檢查（補）：用上的強判斷合起來、歷史上實際開出的五顆同時符合的比例，低於 10%／20%／30% 就先放掉最弱的；「不檢查」＝不做這一步。
 *   另外統計（60%、不檢查）：每一條判斷被用上幾次、實際開出的五顆不符合幾次；沒中的號碼是被哪一步擋掉的。
 *
 * 用法：node --import tsx scripts/live-backtest.ts  → docs/live-backtest.md（先跑 three-stage.ts 產生死規矩版的每期結果）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { allDecisions, draws, rows, SLOTS } from './blind-test'
import { D, baseCombos, choose, ctxAt, failMasks, histMasks, judgmentsAt, type PickOpt } from './live-core'

const OUT = 'docs/live-backtest.md'
const FROM = '2024-01-01'
const MIN_N = 30
const STRONGS = [0.55, 0.6, 0.7]
const JOINTS: (number | null)[] = [null, 0.1, 0.2, 0.3]
const REF = { strong: 0.6, jointMin: null as number | null }

// 死規矩版每期結果
const rigid = new Map<number, { size: number, hits: number }>()
for (const l of readFileSync('docs/three-stage-backtest.md', 'utf8').split(/\r?\n/)) {
  const m = /^\| (1\d{8}) \| (\d+) \| (\d) \|/.exec(l)
  if (m) rigid.set(Number(m[1]), { size: Number(m[2]), hits: Number(m[3]) })
}

interface Acc { n: number, size: number, dist: number[], last10: string[] }
const newAcc = (): Acc => ({ n: 0, size: 0, dist: [0, 0, 0, 0, 0, 0], last10: [] })
const variants = STRONGS.flatMap(s => JOINTS.map(jm => ({ key: `${s}|${jm}`, opt: { strong: s, minN: MIN_N, jointMin: jm } as PickOpt })))
const acc = new Map(variants.map(v => [v.key, newAcc()]))
const rigidAcc = newAcc()
const used = new Map<string, { use: number, miss: number }>()
const blame = new Map<string, number>()
const from = allDecisions.findIndex(d => rows[d.t]![1] >= FROM)
const t0 = Date.now()
for (let j = from; j < D; j++) {
  const c = ctxAt(j)
  const drawn = draws[c.t]!
  const js = judgmentsAt(c, c.b)
  const base = baseCombos(c)
  const fm = failMasks(base.combos, js, c.b)
  const hm = histMasks(j, js)
  for (const v of variants) {
    const pk = choose(js, base.combos, fm, hm, v.opt)
    const a = acc.get(v.key)!
    const hits = drawn.filter(x => pk.list.includes(x)).length
    a.n++; a.size += pk.list.length; a.dist[hits]!++
    if (j >= D - 10) a.last10.push(`${pk.list.length}/${hits}`)
    if (v.opt.strong === REF.strong && v.opt.jointMin === REF.jointMin) {
      for (const k of pk.use) {
        const u = used.get(js[k]!.name) ?? { use: 0, miss: 0 }
        u.use++
        if (!js[k]!.ok(drawn, c.b)) u.miss++
        used.set(js[k]!.name, u)
      }
      const inBase = new Set(base.combos.flat())
      for (const x of drawn.filter(q => !pk.list.includes(q))) {
        const o = c.b[x]!
        const why = !base.combos.length ? '基本組合排不出（不會發生：名單是全部）'
          : o.slot >= SLOTS ? '不在盤面'
            : base.ex.includes(o.slot) ? '一篩：值出現比例 < 30% 排除'
              : base.bigVals.includes(o.value) ? '二篩：大於 10 的值近三期出現過'
                : !inBase.has(x) ? 'G、V 區間排不進'
                  : '強判斷刪掉'
        blame.set(why, (blame.get(why) ?? 0) + 1)
      }
    }
  }
  const r = rigid.get(rows[c.t]![0])
  if (r) { rigidAcc.n++; rigidAcc.size += r.size; rigidAcc.dist[r.hits]!++; if (j >= D - 10) rigidAcc.last10.push(`${r.size}/${r.hits}`) }
  if ((j - from) % 100 === 0) process.stderr.write(`${j - from}/${D - from} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`)
}

const pct = (a: number, b: number): string => (b ? (100 * a / b).toFixed(1) : '—')
const row = (name: string, a: Acc): string => `| ${name} | ${(a.size / a.n).toFixed(1)} | ${[5, 4, 3, 2, 1, 0].map(k => `${a.dist[k]}`).join(' | ')} | ${pct(a.dist[5]! + a.dist[4]! + a.dist[3]!, a.n)}% |`
const out: string[] = []
out.push('# 活的篩法往前盲測：2024 起每一期')
out.push('')
out.push(`> 由 \`scripts/live-backtest.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期，共 ${rigidAcc.n} 期。每期只用開獎前的資料。`)
out.push('> 強＝判的那一邊佔多少以上、次數 30 次以上。整體檢查＝用上的強判斷合起來，歷史上實際開出的五顆同時符合的比例低於門檻就先放掉最弱的（補）。')
out.push('')
out.push('## 平均顆數、中幾顆（期數）')
out.push('')
out.push('| 篩法 | 平均顆數 | 中 5 | 中 4 | 中 3 | 中 2 | 中 1 | 中 0 | 中 3 顆以上 |')
out.push('|---|---|---|---|---|---|---|---|---|')
out.push(row('死規矩版（三篩）', rigidAcc))
for (const v of variants) out.push(row(`強 ${Math.round(v.opt.strong * 100)}%、${v.opt.jointMin === null ? '不檢查' : `整體 ${v.opt.jointMin * 100}%`}`, acc.get(v.key)!))
out.push('')
out.push('## 最近十期（篩完顆數／中幾顆）')
out.push('')
const terms = allDecisions.slice(D - 10).map(d => rows[d.t]![0] % 1000)
out.push(`| 篩法 | ${terms.join(' | ')} |`)
out.push(`|---|${terms.map(() => '---').join('|')}|`)
out.push(`| 死規矩版 | ${rigidAcc.last10.join(' | ')} |`)
for (const v of variants) out.push(`| 強 ${Math.round(v.opt.strong * 100)}%、${v.opt.jointMin === null ? '不檢查' : `整體 ${v.opt.jointMin * 100}%`} | ${acc.get(v.key)!.last10.join(' | ')} |`)
out.push('')
out.push(`## 強 ${REF.strong * 100}%、不檢查：每一條判斷用上幾次、實際開出不符合幾次`)
out.push('')
out.push('| 判斷 | 用上 | 實際不符合 | 不符合比例 |')
out.push('|---|---|---|---|')
for (const [k, u] of [...used.entries()].sort((a, b) => b[1].miss / b[1].use - a[1].miss / a[1].use)) out.push(`| ${k} | ${u.use} | ${u.miss} | ${pct(u.miss, u.use)}% |`)
out.push('')
out.push(`## 強 ${REF.strong * 100}%、不檢查：沒中的號碼是被哪一步擋掉的`)
out.push('')
out.push('| 擋掉的一步 | 顆數 |')
out.push('|---|---|')
for (const [k, n] of [...blame.entries()].sort((a, b) => b[1] - a[1])) out.push(`| ${k} | ${n} |`)
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
