/**
 * 539 下一期的少見情況（2026-11-12 使用者：最新一期更新後給我下一期的少見情況；照 /4d 少見的做法）。
 * 目前狀態在歷史上「這麼極端以上」不到一成（和值兩頭各 5%）就列出，附歷史上同樣情況下一期／5 期內的結果。
 * 隔期、值、y 用 app/utils/wave-series.ts walk（與 /board 一致）。設定（一成、5%、次數少 = 不到 10 次）是我補的。
 * 用法：先 pnpm dlx tsx --env-file=.env.local scripts/export-539-history.ts 補歷史檔，再 pnpm dlx tsx scripts/rare-539.ts
 */
/* eslint-disable @stylistic/max-statements-per-line -- 分析腳本，計數迴圈寫成一行比較好對照 */
import { readFileSync } from 'node:fs'
import { walk } from '../app/utils/wave-series'

const { rows } = JSON.parse(readFileSync('public/data/lotto539-history.json', 'utf8')) as { rows: [number, string, number[]][] }
const N = rows.length, WARM = 100, LAST = N - 1
const RARE = 0.1, TAIL = 0.05, FEW = 10
const { balls } = walk(rows.map(([t, d, p]) => ({ drawTerm: t, drawDate: d, prizes: p })))
const hit = Array.from({ length: 40 }, () => new Uint8Array(N))
rows.forEach(([, , p], t) => { for (const n of p) hit[n]![t] = 1 })

// 每期開完後的狀態（看下一期）
const gapAfter = Array.from({ length: 40 }, () => new Int32Array(N)) // 號碼 n 在 t 開完後已隔幾期
const slotVal = Array.from({ length: 20 }, () => new Int32Array(N)) // 隔期格 g 在 t 開完後已連續幾期沒開出
{
  const last = new Array<number>(40).fill(-1), lastHit = new Array<number>(20).fill(-1)
  for (let t = 0; t < N; t++) {
    for (const b of balls[t]!) if (b.gap != null && b.gap < 20) lastHit[b.gap] = t
    for (const n of rows[t]![2]) last[n] = t
    for (let n = 1; n <= 39; n++) gapAfter[n]![t] = last[n]! < 0 ? 999 : t - last[n]!
    for (let g = 0; g < 20; g++) slotVal[g]![t] = t - lastHit[g]!
  }
}
const slotHitAt = (g: number, t: number) => balls[t]!.some(b => b.gap === g)
const slotCount = (g: number, t: number) => { let c = 0; for (let n = 1; n <= 39; n++) if (gapAfter[n]![t] === g) c++; return c }

interface Item { group: string, title: string, share: number, next: string, within?: string, few: boolean }
const items: Item[] = []
const pct = (x: number) => `${(x * 100).toFixed(1)}%`
/** cond(t)：t 開完後是否「跟現在一樣極端以上」；ok(t+1)：下一期要看的事 */
function follow(cond: (t: number) => boolean, ok: (u: number) => boolean, from = WARM) {
  let n = 0, k = 0, w = 0, base = 0, bn = 0, wb = 0
  for (let t = from; t < LAST; t++) {
    const o = ok(t + 1); bn++; if (o) base++
    let ww = false; for (let j = 1; j <= 5 && t + j <= LAST; j++) if (ok(t + j)) { ww = true; break }
    if (ww) wb++
    if (!cond(t)) continue
    n++; if (o) k++; if (ww) w++
  }
  return { n, next: n ? k / n : 0, within: n ? w / n : 0, base: base / bn, wbase: wb / bn }
}
function add(group: string, title: string, share: number, f: ReturnType<typeof follow>, what: string) {
  if (share > RARE) return
  items.push({ group, title, share, few: f.n < FEW, next: `歷史上 ${f.n} 次，下一期${what} ${pct(f.next)}（平常 ${pct(f.base)}）`, within: `5 期內${what} ${pct(f.within)}（平常 ${pct(f.wbase)}）` })
}

// 1. 號碼隔期正處於歷史高位
for (let n = 1; n <= 39; n++) {
  const g = gapAfter[n]![LAST]!
  let c = 0, tot = 0
  for (let m = 1; m <= 39; m++) for (let t = WARM; t < LAST; t++) { tot++; if (gapAfter[m]![t]! >= g) c++ }
  if (c / tot > RARE) continue
  // 後續：所有號碼在「已隔 ≥ g」時下一期開出
  let k = 0, w = 0, cn = 0
  for (let m = 1; m <= 39; m++) for (let t = WARM; t < LAST; t++) {
    if (gapAfter[m]![t]! < g) continue
    cn++; if (hit[m]![t + 1]) k++
    for (let j = 1; j <= 5 && t + j <= LAST; j++) if (hit[m]![t + j]) { w++; break }
  }
  items.push({ group: '號碼隔期', title: `${String(n).padStart(2, '0')} 已 ${g} 期沒開`, share: c / tot, few: cn < FEW, next: `所有號碼隔到 ${g} 期以上歷史 ${cn} 次，下一期開出 ${pct(k / cn)}（平常 12.8%）`, within: `5 期內開出 ${pct(w / cn)}（平常 49.3%）` })
}

// 2. 隔期格（容器）的值正處於歷史高位
for (let g = 0; g < 20; g++) {
  const v = slotVal[g]![LAST]!, cnt = slotCount(g, LAST)
  let c = 0, tot = 0; for (let t = WARM; t < LAST; t++) { tot++; if (slotVal[g]![t]! >= v) c++ }
  add('隔期格的值', `隔期 ${g} 已連續 ${v} 期沒開出（格內現有 ${cnt} 顆）`, c / tot, follow(t => slotVal[g]![t]! >= v, u => slotHitAt(g, u)), `隔期 ${g} 開出`)
}

// 3. 剩餘號碼的隔期配置：隔期 20 以上、10 以上各剩幾顆
for (const [lo, label] of [[20, '20 以上'], [10, '10 以上']] as const) {
  const cntAt = (t: number) => { let c = 0; for (let n = 1; n <= 39; n++) if (gapAfter[n]![t]! >= lo) c++; return c }
  const cur = cntAt(LAST)
  const hist = Array.from({ length: LAST - WARM }, (_, i) => cntAt(WARM + i))
  const hiShare = hist.filter(x => x >= cur).length / hist.length, loShare = hist.filter(x => x <= cur).length / hist.length
  const fromLo = (u: number) => balls[u]!.some(b => b.gap == null || b.gap >= lo)
  if (hiShare <= RARE) add('隔期配置', `隔期 ${label}剩 ${cur} 顆（偏多）`, hiShare, follow(t => cntAt(t) >= cur, fromLo), `有號碼從隔期 ${label}開出`)
  if (loShare <= RARE) add('隔期配置', `隔期 ${label}只剩 ${cur} 顆（偏少）`, loShare, follow(t => cntAt(t) <= cur, fromLo), `有號碼從隔期 ${label}開出`)
}

// 4. 第 k 顆連續幾期隔期 > 5（使用者第 3 點）、值 ≥ 10、y ≥ 2
const run = (pred: (t: number) => boolean) => { const r = new Int32Array(N); for (let t = 0; t < N; t++) r[t] = pred(t) ? (t ? r[t - 1]! : 0) + 1 : 0; return r }
for (let k = 0; k < 5; k++) {
  const defs: [string, (t: number) => boolean, string][] = [
    ['隔期大於 5', t => (balls[t]![k]!.gap ?? 99) > 5, '隔期在 0～5'],
    ['隔期 0～5', t => (balls[t]![k]!.gap ?? 99) <= 5, '隔期大於 5'],
    ['值 10 以上', t => (balls[t]![k]!.value ?? 0) >= 10, '值 0～9'],
    ['y 2 以上', t => (balls[t]![k]!.y ?? 1) >= 2, 'y = 1'],
    ['y = 1', t => (balls[t]![k]!.y ?? 1) === 1, 'y 2 以上']
  ]
  for (const [name, pred, opp] of defs) {
    const r = run(pred), cur = r[LAST]!
    if (cur < 2) continue
    let c = 0, tot = 0; for (let t = WARM; t < LAST; t++) { tot++; if (r[t]! >= cur) c++ }
    add('同一顆連續', `第 ${k + 1} 顆連續 ${cur} 期${name}`, c / tot, follow(t => r[t]! >= cur, u => !pred(u)), `第 ${k + 1} 顆${opp}`)
  }
}

// 5. 隔期和、值和、總和：在兩頭（各 5%）＋連續同方向
const series: [string, (t: number) => number][] = [
  ['隔期和', t => balls[t]!.reduce((a, b) => a + (b.gap ?? 60), 0)],
  ['值總和', t => balls[t]!.reduce((a, b) => a + (b.value ?? 0), 0)],
  ['號碼總和', t => rows[t]![2].reduce((a, b) => a + b, 0)]
]
for (const [name, f] of series) {
  const v = Array.from({ length: N }, (_, t) => f(t)), cur = v[LAST]!
  const hist = v.slice(WARM, LAST)
  const lo = hist.filter(x => x <= cur).length / hist.length, hi = hist.filter(x => x >= cur).length / hist.length
  const mid = [...hist].sort((a, b) => a - b)[Math.floor(hist.length / 2)]!
  if (lo <= TAIL) add('和值', `${name} ${cur}，落在最低 ${pct(lo)}`, lo, follow(t => v[t]! <= cur, u => v[u]! > mid), `${name}回到中位數 ${mid} 以上`)
  if (hi <= TAIL) add('和值', `${name} ${cur}，落在最高 ${pct(hi)}`, hi, follow(t => v[t]! >= cur, u => v[u]! < mid), `${name}回到中位數 ${mid} 以下`)
  // 連續同方向（比上一期大／小）
  const dir = (t: number) => Math.sign(v[t]! - v[t - 1]!)
  const r = new Int32Array(N); for (let t = 2; t < N; t++) r[t] = dir(t) !== 0 && dir(t) === dir(t - 1) ? r[t - 1]! + 1 : (dir(t) !== 0 ? 1 : 0)
  const d = dir(LAST), cur2 = r[LAST]!
  if (cur2 >= 2) {
    let c = 0, tot = 0; for (let t = WARM; t < LAST; t++) { tot++; if (r[t]! >= cur2 && dir(t) === d) c++ }
    add('和值', `${name}連續 ${cur2} 期${d > 0 ? '變大' : '變小'}`, c / tot, follow(t => r[t]! >= cur2 && dir(t) === d, u => Math.sign(v[u]! - v[u - 1]!) === -d), `${name}${d > 0 ? '變小' : '變大'}`)
  }
}

// 6. 尾數、頭數：連續幾期沒出現
for (const [kind, of, vals] of [['尾數', (n: number) => n % 10, 10], ['頭數', (n: number) => Math.floor(n / 10), 4]] as const) {
  for (let d = 0; d < vals; d++) {
    const has = (t: number) => rows[t]![2].some(n => of(n) === d)
    const r = run(t => !has(t)), cur = r[LAST]!
    if (cur < 1) continue
    let c = 0, tot = 0; for (let t = WARM; t < LAST; t++) { tot++; if (r[t]! >= cur) c++ }
    add('尾數頭數', `${kind} ${d} 已連續 ${cur} 期沒出現`, c / tot, follow(t => r[t]! >= cur, has), `${kind} ${d} 出現`)
  }
}

items.sort((a, b) => a.share - b.share)
console.log(JSON.stringify({ last: rows[LAST], next: rows[LAST]![0] + 1, items }, null, 1))
