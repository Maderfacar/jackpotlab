/**
 * 從三條自然波段抓下一期的隔期方向（2026-11-02 使用者）：
 *   A 線：值總和 ≥ 隔期總和（每期有記 1−p、沒有記 −p 累加）
 *   G 線：隔期總和 ＞ 中位數
 *   V 線：值總和 ＞ 中位數
 * 每條線回落／回升滿 h 才算轉折（跟 gap-value-waves.ts 同一套），每期只用到「當期為止」已確認的方向，
 * 不偷看之後的轉折。把歷史上三條線方向跟現在一樣的期挑出來，看它們的下一期 5 顆從哪些隔期、哪些值開出，
 * 跟全部期比；再分 2007～2020／2021 起看是否同方向。最後列現在盤面上各隔期格的球。
 * 用法：node --import tsx scripts/gap-direction.ts
 */
import { readFileSync } from 'node:fs'
import { computeFeatures } from '../shared/lotto/patterns/features'
import type { HistoryFile } from '../shared/lotto/history-file'
import { firstBoard, nextBoard, type Board } from './lib/container-sim'

const HS = [2, 3]
const GAP_BINS: [number, number][] = [[0, 0], [1, 1], [2, 3], [4, 6], [7, 10], [11, 15], [16, 25], [26, 59]]
const VAL_BINS: [number, number][] = [[0, 0], [1, 1], [2, 3], [4, 6], [7, 12], [13, 24], [25, Infinity]]
const SPLIT_DATE = '2021-01-01'
const SHOW_SLOTS = 26

const file = JSON.parse(readFileSync('public/data/lotto539-history.json', 'utf8')) as HistoryFile
const rows = file.rows
const draws = rows.map(r => [...r[2]].sort((a, b) => a - b))
const feats = computeFeatures(draws, 60)
const n = draws.length
const START = 60

// 每期三個事件（有球隔期超過 60 的期：三條線都不動）
const G: (number | null)[] = new Array(n).fill(null)
const V: (number | null)[] = new Array(n).fill(null)
for (let t = START; t < n; t++) {
  const f = feats[t]!
  if (f.gaps.some(g => g == null)) continue
  G[t] = (f.gaps as number[]).reduce((a, b) => a + b, 0)
  V[t] = (f.values as number[]).reduce((a, b) => a + b, 0)
}
const median = (a: number[]): number => [...a].sort((x, y) => x - y)[a.length >> 1]!
const okT = Array.from({ length: n }, (_, t) => t).filter(t => G[t] != null)
const medG = median(okT.map(t => G[t]!))
const medV = median(okT.map(t => V[t]!))
const lines = {
  A: (t: number): number => (V[t]! >= G[t]! ? 1 : 0),
  G: (t: number): number => (G[t]! > medG ? 1 : 0),
  V: (t: number): number => (V[t]! > medV ? 1 : 0)
}
type Key = keyof typeof lines
const KEYS: Key[] = ['A', 'G', 'V']

interface State { dir: number, since: number }
/** 線上版轉折：每期結束後的方向（+1 上升、−1 下降、0 未定）與從哪一期的極值開始 */
function online(ev: (t: number) => number, h: number): State[] {
  const p = okT.reduce((s, t) => s + ev(t), 0) / okT.length
  const out: State[] = new Array(n).fill({ dir: 0, since: START })
  let c = 0
  let hi = 0
  let hiAt = START
  let lo = 0
  let loAt = START
  let dir = 0
  let since = START
  for (let t = START; t < n; t++) {
    if (G[t] != null) {
      c += ev(t) - p
      if (c > hi) { hi = c; hiAt = t }
      if (c < lo) { lo = c; loAt = t }
      if (dir >= 0 && hi - c >= h) { dir = -1; since = hiAt; lo = c; loAt = t }
      else if (dir <= 0 && c - lo >= h) { dir = 1; since = loAt; hi = c; hiAt = t }
    }
    out[t] = { dir, since }
  }
  return out
}

const binOf = (bins: [number, number][], x: number): number => bins.findIndex(([a, b]) => x >= a && x <= b)
const label = (t: number): string => `${rows[t]![0]}(${rows[t]![1]})`
const pct = (a: number, b: number): string => (b ? (100 * a / b).toFixed(1) : '—')
const splitT = rows.findIndex(r => r[1] >= SPLIT_DATE)

interface Tally { draws: number, gap: number[], val: number[], gsum: number[] }
const empty = (): Tally => ({ draws: 0, gap: new Array(GAP_BINS.length + 1).fill(0), val: new Array(VAL_BINS.length).fill(0), gsum: [] })
function add(tl: Tally, t: number): void {
  const f = feats[t]!
  tl.draws++
  f.gaps.forEach((g, i) => {
    if (g == null) tl.gap[GAP_BINS.length]! += 1
    else {
      tl.gap[binOf(GAP_BINS, g)]! += 1
      tl.val[binOf(VAL_BINS, f.values[i]!)]! += 1
    }
  })
  if (G[t] != null) tl.gsum.push(G[t]!)
}

for (const h of HS) {
  const st = Object.fromEntries(KEYS.map(k => [k, online(lines[k], h)])) as Record<Key, State[]>
  const cur = Object.fromEntries(KEYS.map(k => [k, st[k][n - 1]!])) as Record<Key, State>
  const name = (d: number): string => (d > 0 ? '上升' : d < 0 ? '下降' : '未定')
  console.log(`\n# 回落／回升滿 ${h}`)
  for (const k of KEYS) console.log(`${k} 線：${name(cur[k].dir)}，從 ${label(cur[k].since)} 起，至今 ${n - 1 - cur[k].since} 期`)

  // 條件：三條線方向都跟現在一樣；也列只看 A＋G、只看 A 的
  const conds: [string, (t: number) => boolean][] = [
    ['A、G、V 都跟現在一樣', t => KEYS.every(k => st[k][t]!.dir === cur[k].dir)],
    ['A、G 跟現在一樣', t => st.A[t]!.dir === cur.A.dir && st.G[t]!.dir === cur.G.dir],
    ['A、V 跟現在一樣', t => st.A[t]!.dir === cur.A.dir && st.V[t]!.dir === cur.V.dir],
    ['只看 A', t => st.A[t]!.dir === cur.A.dir]
  ]
  const all = { e: empty(), l: empty() }
  for (let t = START; t < n - 1; t++) add(t + 1 < splitT ? all.e : all.l, t + 1)
  for (const [cname, ok] of conds) {
    const e = empty()
    const l = empty()
    for (let t = START; t < n - 1; t++) if (ok(t)) add(t + 1 < splitT ? e : l, t + 1)
    const balls = (tl: Tally): number => tl.draws * 5
    console.log(`\n## ${cname}：下一期（前段 ${e.draws} 期、後段 ${l.draws} 期）`)
    console.log(`下一期隔期總和中位：前段 ${e.gsum.length ? median(e.gsum) : '—'}（全部 ${median(all.e.gsum)}）、後段 ${l.gsum.length ? median(l.gsum) : '—'}（全部 ${median(all.l.gsum)}）`)
    console.log('隔期 | 前段% | 全部前段% | 後段% | 全部後段% | 兩段同向')
    ;[...GAP_BINS, null].forEach((b, i) => {
      const de = Number(pct(e.gap[i]!, balls(e))) - Number(pct(all.e.gap[i]!, balls(all.e)))
      const dl = Number(pct(l.gap[i]!, balls(l))) - Number(pct(all.l.gap[i]!, balls(all.l)))
      const same = Math.sign(de) === Math.sign(dl) && Math.abs(de) >= 0.5 && Math.abs(dl) >= 0.5 ? (de > 0 ? '多' : '少') : ''
      console.log(`${b ? (b[0] === b[1] ? b[0] : `${b[0]}～${b[1]}`) : '60+'} | ${pct(e.gap[i]!, balls(e))} | ${pct(all.e.gap[i]!, balls(all.e))} | ${pct(l.gap[i]!, balls(l))} | ${pct(all.l.gap[i]!, balls(all.l))} | ${same}`)
    })
    console.log('值 | 前段% | 全部前段% | 後段% | 全部後段% | 兩段同向')
    VAL_BINS.forEach((b, i) => {
      const se = e.val.reduce((a, x) => a + x, 0)
      const sl = l.val.reduce((a, x) => a + x, 0)
      const ae = all.e.val.reduce((a, x) => a + x, 0)
      const al = all.l.val.reduce((a, x) => a + x, 0)
      const de = Number(pct(e.val[i]!, se)) - Number(pct(all.e.val[i]!, ae))
      const dl = Number(pct(l.val[i]!, sl)) - Number(pct(all.l.val[i]!, al))
      const same = Math.sign(de) === Math.sign(dl) && Math.abs(de) >= 0.5 && Math.abs(dl) >= 0.5 ? (de > 0 ? '多' : '少') : ''
      console.log(`${b[0] === b[1] ? b[0] : `${b[0]}～${b[1] === Infinity ? '' : b[1]}`} | ${pct(e.val[i]!, se)} | ${pct(all.e.val[i]!, ae)} | ${pct(l.val[i]!, sl)} | ${pct(all.l.val[i]!, al)} | ${same}`)
    })
  }
}

// 現在盤面
let board: Board = firstBoard(draws[0]!)
for (let t = 1; t < n; t++) board = nextBoard(board, draws[t]!)
console.log(`\n# 開完 ${label(n - 1)} 後的盤面（隔期 0～${SHOW_SLOTS - 1}）`)
console.log('隔期 | 值 | 剩下的球')
for (let i = 0; i < SHOW_SLOTS; i++) console.log(`${i} | ${board.values[i]} | ${board.slots[i]!.join(' ')}`)
const onBoard = new Set(board.slots.flat())
console.log(`不在 60 格內：${Array.from({ length: 39 }, (_, i) => i + 1).filter(x => !onBoard.has(x)).join(' ') || '無'}`)
