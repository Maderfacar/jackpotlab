/**
 * 高低機率搭配（2026-11-06 使用者提示）：很多強線索指向同一方向時不會全部開出，一期必然是高機率搭低機率。
 *   做法：每期把線索（活的第一版＋位置 y）裡強的那些拿出來（判的那邊歷史 60% 以上、30 次以上，補），
 *   看歷史上每期實際開出的五顆「符合其中幾條」，取常見的範圍（10%～90%，補）；
 *   組合只留「符合條數也在這個範圍」的，不再要求全部符合。
 *   名單：留下的組合裡，每顆出現在幾成組合，取前 20 顆（補）。對照：活的第一版（強的全部要符合）。
 *   2024 起每期往前盲測，只用開獎前的資料。
 *
 * 用法：node --import tsx scripts/live-mix.ts → docs/live-mix.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, rows } from './blind-test'
import { D, baseCombos, choose, ctxAt, failMasks, histMasks, judgmentsAt, type Masks } from './live-core'

const OUT = 'docs/live-mix.md'
const FROM = '2024-01-01'
const STRONG = 0.6
const MIN_N = 30
const TOP = 20
const LO = 0.1
const HI = 0.9

const pop = (x: number): number => { x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24 }
/** 第 i 列在 use 裡不符合幾條 */
const failCnt = (M: Masks, i: number, use: Uint32Array): number => { let c = 0; for (let q = 0; q < M.w; q++) c += pop(M.m[i * M.w + q]! & use[q]!); return c }
const quant = (a: number[], p: number): number => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(p * (b.length - 1))]! }

interface Acc { m: number, size: number, dist: number[], kept: number, last10: string[] }
const newAcc = (): Acc => ({ m: 0, size: 0, dist: [0, 0, 0, 0, 0, 0], kept: 0, last10: [] })
const accMix = newAcc(), accAll = newAcc(), accMixAll = newAcc()
let sumStrong = 0, sumLo = 0, sumHi = 0, sumActual = 0
const from = allDecisions.findIndex(d => rows[d.t]![1] >= FROM)
const t0 = Date.now()
let nextOut: string[] = []
for (let j = from; j <= D; j++) {
  const c = ctxAt(j)
  const js = judgmentsAt(c, c.b, { posY: true })
  const base = baseCombos(c)
  const fm = failMasks(base.combos, js, c.b)
  const hm = histMasks(j, js)
  const strong = js.map((u, k) => (u.share >= STRONG && u.n >= MIN_N ? k : -1)).filter(k => k >= 0)
  const use = new Uint32Array(fm.w)
  for (const k of strong) use[k >> 5] = (use[k >> 5]! | (1 << (k & 31))) >>> 0
  // 歷史上每期實際開出的五顆，符合幾條強線索
  const passHist: number[] = []
  for (let i = 60; i < j; i++) passHist.push(strong.length - failCnt(hm, i, use))
  const lo = passHist.length ? quant(passHist, LO) : 0, hi = passHist.length ? quant(passHist, HI) : strong.length
  // 留下符合條數在範圍內的組合，算每顆出現幾次
  const cnt = new Array<number>(40).fill(0)
  let kept = 0
  for (let i = 0; i < fm.n; i++) { const p = strong.length - failCnt(fm, i, use); if (p >= lo && p <= hi) { kept++; for (const x of base.combos[i]!) cnt[x]!++ } }
  const ranked = Array.from({ length: 39 }, (_, i) => i + 1).filter(x => cnt[x]! > 0).sort((a, b) => cnt[b]! - cnt[a]! || a - b)
  const list = ranked.slice(0, TOP).sort((a, b) => a - b)
  const all = ranked.sort((a, b) => a - b)
  const v1 = choose(js, base.combos, fm, hm, { strong: STRONG, minN: MIN_N, jointMin: null })
  if (j === D) {
    nextOut = [`- 強線索 ${strong.length} 條；歷史上每期實際符合 ${lo}～${hi} 條（10%～90%）`, `- 符合條數在範圍內的組合 ${kept.toLocaleString()} 組（全部 ${fm.n.toLocaleString()} 組）`, `- 前 20 顆：${list.join(' ')}`, `- 活的第一版：${v1.list.join(' ')}（${v1.list.length} 顆）`]
    break
  }
  const drawn = draws[c.t]!
  const actualPass = strong.length - strong.filter(k => !js[k]!.ok(drawn, c.b)).length
  sumStrong += strong.length; sumLo += lo; sumHi += hi; sumActual += actualPass
  const inBase = base.combos.some(x => x.every(y => drawn.includes(y)))
  const add = (a: Acc, l: number[], keep: boolean): void => { const h = drawn.filter(x => l.includes(x)).length; a.m++; a.size += l.length; a.dist[h]!++; if (keep) a.kept++; if (j >= D - 10) a.last10.push(`${l.length}/${h}`) }
  add(accMix, list, false)
  add(accMixAll, all, inBase && actualPass >= lo && actualPass <= hi)
  add(accAll, v1.list, false)
  if ((j - from) % 50 === 0) process.stderr.write(`${j - from}/${D - from} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`)
}

const pct = (a: number, b: number): string => `${(100 * a / b).toFixed(1)}%`
const row = (name: string, a: Acc): string => `| ${name} | ${(a.size / a.m).toFixed(1)} | ${[5, 4, 3, 2, 1, 0].map(k => a.dist[k]).join(' | ')} | ${pct(a.dist[5]! + a.dist[4]! + a.dist[3]!, a.m)} |`
const m = accMix.m
const out: string[] = []
out.push('# 高低機率搭配：不要求強線索全部符合')
out.push('')
out.push(`> 由 \`scripts/live-mix.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期，2024 起 ${m} 期，每期只用開獎前的資料。`)
out.push('> 強線索＝活的第一版＋位置 y 裡，判的那邊歷史 60% 以上、30 次以上（補）。歷史上每期實際開出的五顆符合幾條強線索，取 10%～90% 當常見範圍（補）；組合只留符合條數在範圍內的。')
out.push('')
out.push(`- 每期平均強線索 ${(sumStrong / m).toFixed(1)} 條；常見範圍平均 ${(sumLo / m).toFixed(1)}～${(sumHi / m).toFixed(1)} 條；實際開出的五顆平均符合 ${(sumActual / m).toFixed(1)} 條。`)
out.push(`- 實際開出的五顆被留下（在基本組合裡、符合條數也在範圍內）：${pct(accMixAll.kept, m)}`)
out.push('')
out.push('| 做法 | 平均顆數 | 中 5 | 中 4 | 中 3 | 中 2 | 中 1 | 中 0 | 中 3 顆以上 |')
out.push('|---|---|---|---|---|---|---|---|---|')
out.push(row('高低搭配，前 20 顆', accMix))
out.push(row('高低搭配，留下組合用到的全部號碼', accMixAll))
out.push(row('活的第一版（強的全部要符合）', accAll))
out.push('')
out.push('## 最近十期（顆數／中幾顆）')
out.push('')
const terms = allDecisions.slice(D - 10).map(d => rows[d.t]![0] % 1000)
out.push(`| 做法 | ${terms.join(' | ')} |`)
out.push(`|---|${terms.map(() => '---').join('|')}|`)
out.push(`| 高低搭配，前 20 顆 | ${accMix.last10.join(' | ')} |`)
out.push(`| 活的第一版 | ${accAll.last10.join(' | ')} |`)
out.push('')
out.push(`## 第 ${rows[rows.length - 1]![0] + 1} 期`)
out.push('')
out.push(...nextOut)
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
