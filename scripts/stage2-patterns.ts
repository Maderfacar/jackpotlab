/**
 * 二篩（2026-11-04 使用者重定）：三樣都和 G 一樣找規律、走勢，給出最新一期的方向。
 *   1. 頭數：0 頭（1～9）、1 頭（10～19）、2 頭（20～29）、3 頭（30～39），每期各開幾顆。
 *   2. 三區：1～13、14～26、27～39，每期各開幾顆。
 *   3. 獎號總和：五顆號碼加起來。
 *   和 G 一樣＝看這期比上期多或少（方向）＋這期在哪一段（高低）→ 歷史上同樣的期，下一期變多、變少還是一樣，下一期落在哪。
 *   顆數每顆一段；總和每 SUM_BIN 一段（補）。
 *
 * 用法：node --import tsx scripts/stage2-patterns.ts  → docs/stage2-patterns.md
 */
import { writeFileSync } from 'node:fs'
import { draws, rows } from './blind-test'

const OUT = 'docs/stage2-patterns.md'
const SUM_BIN = 20
const ds = draws.slice(1)
const N = ds.length
const pct = (a: number, b: number): string => (b ? (100 * a / b).toFixed(1) + '%' : '—')
const q = (xs: number[], p: number): number => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(p * (s.length - 1))]! : NaN }

interface Series { name: string, xs: number[], band: (x: number) => number, bandName: (b: number) => string, isCount: boolean }
const groupSeries = (name: string, lo: number, hi: number): Series => ({ name, xs: ds.map(d => d.filter(x => x >= lo && x <= hi).length), band: x => x, bandName: b => `${b} 顆`, isCount: true })
const heads: Series[] = [groupSeries('0 頭（1～9）', 1, 9), groupSeries('1 頭（10～19）', 10, 19), groupSeries('2 頭（20～29）', 20, 29), groupSeries('3 頭（30～39）', 30, 39)]
const zones: Series[] = [groupSeries('1～13', 1, 13), groupSeries('14～26', 14, 26), groupSeries('27～39', 27, 39)]
const sum: Series = { name: '總和', xs: ds.map(d => d.reduce((a, b) => a + b, 0)), band: x => Math.floor(x / SUM_BIN), bandName: b => `${b * SUM_BIN}～${b * SUM_BIN + SUM_BIN - 1}`, isCount: false }

/** 歷史上「這期方向一樣、在同一段」的期，下一期的狀況 */
function look(s: Series, dir: number, b: number): { n: number, up: number, down: number, same: number, tail: string } {
  const idx = s.xs.map((_, i) => i).filter(i => i >= 1 && i < N - 1 && Math.sign(s.xs[i]! - s.xs[i - 1]!) === dir && s.band(s.xs[i]!) === b)
  const d1 = idx.map(i => Math.sign(s.xs[i + 1]! - s.xs[i]!))
  const nx = idx.map(i => s.xs[i + 1]!)
  let tail: string
  if (s.isCount) { const c = [0, 1, 2, 3, 4, 5].map(k => nx.filter(x => x === k).length); const top = c.indexOf(Math.max(...c)); tail = `最常開 ${top} 顆（${pct(c[top]!, idx.length)}）` } else tail = `${q(nx, 0.25)}～${q(nx, 0.75)}`
  return { n: idx.length, up: d1.filter(x => x > 0).length, down: d1.filter(x => x < 0).length, same: d1.filter(x => x === 0).length, tail }
}
const judgeOf = (r: { up: number, down: number, same: number }): string => { const m = Math.max(r.up, r.down, r.same); return m === r.same ? '一樣' : m === r.up ? '變多' : '變少' }
const dirName = (d: number): string => (d > 0 ? '變多' : d < 0 ? '變少' : '一樣')

function table(s: Series): string[] {
  const out: string[] = []
  out.push(`| 這期 | 期數 | 下一期變多 | 下一期變少 | 下一期一樣 | 下一期${s.isCount ? '最常' : ' 25%～75%'} |`)
  out.push('|---|---|---|---|---|---|')
  const bands = [...new Set(s.xs.map(s.band))].sort((a, b) => a - b)
  for (const dir of [1, 0, -1]) {
    for (const b of bands) {
      const r = look(s, dir, b)
      if (r.n < 30) continue
      out.push(`| ${dirName(dir)}、${s.bandName(b)} | ${r.n} | ${pct(r.up, r.n)} | ${pct(r.down, r.n)} | ${pct(r.same, r.n)} | ${r.tail} |`)
    }
  }
  return out
}

const out: string[] = []
out.push('# 二篩：頭數、三區、總和的規律')
out.push('')
out.push(`> 由 \`scripts/stage2-patterns.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期，共 ${N} 期。和 G 一樣：看這期比上期多或少＋這期在哪一段，歷史上同樣的期下一期怎麼走。顆數每顆一段；總和每 ${SUM_BIN} 一段（補）。`)
out.push('')
out.push(`## 最新一期（${rows[rows.length - 1]![0]} 開完後）的方向`)
out.push('')
out.push('| 項目 | 最近 5 期 | 現在 | 同樣狀況 | 下一期 多／少／一樣 | 判斷 | 下一期 |')
out.push('|---|---|---|---|---|---|---|')
for (const s of [...heads, ...zones, sum]) {
  const last = s.xs[N - 1]!
  const dir = Math.sign(last - s.xs[N - 2]!)
  const r = look(s, dir, s.band(last))
  out.push(`| ${s.name} | ${s.xs.slice(-5).join(' ')} | ${dirName(dir)}、${s.bandName(s.band(last))} | ${r.n} 期${r.n < 30 ? '（樣本少）' : ''} | ${pct(r.up, r.n)}／${pct(r.down, r.n)}／${pct(r.same, r.n)} | **${judgeOf(r)}** | ${r.tail} |`)
}
out.push('')
for (const [title, list] of [['1. 頭數', heads], ['2. 三區', zones], ['3. 獎號總和', [sum]]] as const) {
  out.push(`## ${title}`)
  out.push('')
  for (const s of list) { out.push(`### ${s.name}`); out.push(''); out.push(...table(s)); out.push('') }
}
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.slice(0, 18).join('\n'))
