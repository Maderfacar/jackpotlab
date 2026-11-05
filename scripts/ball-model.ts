/**
 * 每顆球打分數、每期取前 20 顆（2026-11-06 使用者：不受限制，用使用者的條件或自己想到的，找出 20 顆以內、命中提高的做法）。
 *   1. 每一期、每一顆球，把開獎前看得到的線索全部做成特徵（隔期、值、y、同格顆數、號碼、尾數、頭數、三區、
 *      近幾期開過幾次、平均間隔、上期鄰號、盤面水位、段的球數、G／V 範圍內組合裡出現的比例……），每個特徵分段。
 *   2. 用邏輯迴歸（每段一個分數，加起來）學「這顆會不會開」。
 *   3. 分三段：2008～2019 學、2020～2023 挑要用哪幾組特徵（一組一組加，有變好才留）、2024 起完全沒看過的期最後才驗證。
 *   每一期只用開獎前的資料（特徵都是開獎前的；分數表只用學習那一段的期）。
 *
 * 用法：node --import tsx scripts/ball-model.ts → docs/ball-model.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, next, rows, SLOTS, type Ball, type Decision } from './blind-test'

const OUT = 'docs/ball-model.md'
const BALLS = 39
const TOP = 20
const TRAIN_END = '2020-01-01'
const VALID_END = '2024-01-01'

// ---------- 每期的盤面 ----------
interface Board { t: number, b: Ball[], p: Decision['plan'] }
const onBoard = (b: Ball[]): boolean => { for (let x = 1; x <= BALLS; x++) if (b[x]!.slot >= SLOTS) return false; return true }
const boards: Board[] = allDecisions.filter(d => onBoard(d.ballOf)).map(d => ({ t: d.t, b: d.ballOf, p: d.plan }))
boards.push({ t: rows.length, b: next.ballOf, p: next.plan })
const isNext = (i: number): boolean => i === boards.length - 1

// ---------- 每顆球的歷史 ----------
const hit: boolean[][] = draws.map(d => { const a = new Array<boolean>(BALLS + 1).fill(false); for (const x of d) a[x] = true; return a })
const hitAt = (t: number, x: number): boolean => (t < draws.length ? hit[t]![x]! : false)
/** 到 t 之前（不含 t），x 最近 n 期開過幾次 */
const pre: number[][] = Array.from({ length: BALLS + 1 }, () => [0])
for (let t = 0; t < draws.length; t++) for (let x = 1; x <= BALLS; x++) pre[x]!.push(pre[x]![t]! + (hit[t]![x] ? 1 : 0))
const recent = (t: number, x: number, n: number): number => pre[x]![t]! - pre[x]![Math.max(0, t - n)]!
/** 到 t 之前，x 每次開出之間的間隔：平均、上一個間隔 */
const gapInfo = (() => {
  const avg: number[][] = [], prevGap: number[][] = []
  const last = new Array<number>(BALLS + 1).fill(-1), sum = new Array<number>(BALLS + 1).fill(0), cnt = new Array<number>(BALLS + 1).fill(0), pg = new Array<number>(BALLS + 1).fill(-1)
  for (let t = 0; t <= draws.length; t++) {
    avg.push(Array.from({ length: BALLS + 1 }, (_, x) => (cnt[x]! ? sum[x]! / cnt[x]! : 7.8)))
    prevGap.push([...pg])
    if (t === draws.length) break
    for (const x of draws[t]!) { if (last[x]! >= 0) { const g = t - last[x]! - 1; sum[x]! += g; cnt[x]!++; pg[x] = g } last[x] = t }
  }
  return { avg, prevGap }
})()

// ---------- 盤面的整體狀態 ----------
const level = (b: Ball[], k: 'slot' | 'value'): number => { let s = 0; for (let x = 1; x <= BALLS; x++) s += Math.min(b[x]![k], 200); return s * 5 / BALLS }
const segOf = (s: number): number => (s <= 5 ? 0 : s <= 9 ? 1 : s <= 19 ? 2 : 3)
const vSum = (t: number, b: Ball[]): number => draws[t]!.reduce((s, x) => s + b[x]!.value, 0)

/** G、V 範圍內的組合裡，每顆出現在幾成 */
function comboShare(bd: Board): number[] {
  const b = bd.b, g = bd.p.g.range, v = bd.p.v
  const xs = Array.from({ length: BALLS }, (_, i) => i + 1).sort((a, c) => b[a]!.slot - b[c]!.slot)
  const sl = xs.map(x => b[x]!.slot), va = xs.map(x => b[x]!.value)
  const cnt = new Array<number>(BALLS + 1).fill(0)
  let tot = 0
  const N = xs.length
  for (let i = 0; i < N; i++) {
    if (sl[i]! * 5 > g.hi) break
    for (let j = i + 1; j < N; j++) {
      const g2 = sl[i]! + sl[j]!, v2 = va[i]! + va[j]!
      if (g2 + sl[j]! * 3 > g.hi) break
      if (v2 > v.hi) continue
      for (let k = j + 1; k < N; k++) {
        const g3 = g2 + sl[k]!, v3 = v2 + va[k]!
        if (g3 + sl[k]! * 2 > g.hi) break
        if (v3 > v.hi) continue
        for (let l = k + 1; l < N; l++) {
          const g4 = g3 + sl[l]!, v4 = v3 + va[l]!
          if (g4 + sl[l]! > g.hi) break
          if (v4 > v.hi) continue
          for (let m = l + 1; m < N; m++) {
            const G = g4 + sl[m]!, V = v4 + va[m]!
            if (G > g.hi) break
            if (G < g.lo || V < v.lo || V > v.hi) continue
            tot++
            cnt[xs[i]!]!++; cnt[xs[j]!]!++; cnt[xs[k]!]!++; cnt[xs[l]!]!++; cnt[xs[m]!]!++
          }
        }
      }
    }
  }
  return cnt.map(c => (tot ? c / tot : 0))
}

// ---------- 特徵（每組一種線索，每個值分段成一格） ----------
const cut = (x: number, edges: number[]): number => { let i = 0; while (i < edges.length && x >= edges[i]!) i++; return i }
const SLOT_E = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 17, 21, 27, 35]
const VAL_E = [1, 2, 3, 4, 5, 6, 8, 10, 13, 17, 25, 40]
const SLOT_C = [1, 3, 6, 10, 15, 25]
const VAL_C = [1, 3, 6, 11, 25]
interface Ctx { i: number, t: number, b: Ball[], x: number, share: number[], gl: number, vl: number, lastV: number, segSup: number[], pb: Ball[], lastG: number }
type Feat = (c: Ctx) => string
const GROUPS: Record<string, Feat> = {
  隔期: c => `s${cut(c.b[c.x]!.slot, SLOT_E)}`,
  值: c => `v${cut(c.b[c.x]!.value, VAL_E)}`,
  "隔期×值": c => `sv${cut(c.b[c.x]!.slot, SLOT_C)}_${cut(c.b[c.x]!.value, VAL_C)}`,
  y: c => `y${Math.min(c.b[c.x]!.rank, 6)}`,
  同格顆數: c => `n${c.b[c.x]!.size}`,
  "y×同格顆數": c => `yn${Math.min(c.b[c.x]!.rank, 5)}_${c.b[c.x]!.size}`,
  號碼: c => `x${c.x}`,
  尾數: c => `t${c.x % 10}`,
  頭數: c => `h${Math.floor(c.x / 10)}`,
  近10期開幾次: c => `r10_${Math.min(recent(c.t, c.x, 10), 4)}`,
  近30期開幾次: c => `r30_${cut(recent(c.t, c.x, 30), [2, 3, 4, 5, 6, 8])}`,
  近100期開幾次: c => `r100_${cut(recent(c.t, c.x, 100), [9, 11, 13, 15, 17])}`,
  "隔期÷平均間隔": c => `ra${cut(c.b[c.x]!.slot / Math.max(gapInfo.avg[c.t]![c.x]!, 1), [0.25, 0.5, 0.75, 1, 1.5, 2, 3])}`,
  上一個間隔: c => `pg${cut(gapInfo.prevGap[c.t]![c.x]!, [0, 1, 3, 6, 10, 16])}`,
  上期鄰號: c => `nb${(c.x > 1 && hitAt(c.t - 1, c.x - 1) ? 1 : 0) + (c.x < BALLS && hitAt(c.t - 1, c.x + 1) ? 1 : 0)}`,
  上期同尾: c => `st${draws[c.t - 1]!.filter(y => y % 10 === c.x % 10 && y !== c.x).length}`,
  GV組合比例: c => `cs${cut(c.share[c.x]! * BALLS / 5, [0.2, 0.5, 0.8, 1, 1.2, 1.5, 2])}`,
  "水位×隔期": c => `gl${cut(c.gl, [29, 33, 37])}_${cut(c.b[c.x]!.slot, SLOT_C)}`,
  "V水位×值": c => `vl${cut(c.vl, [23, 33, 55])}_${cut(c.b[c.x]!.value, VAL_C)}`,
  "上期V×值": c => `lv${c.lastV < 10 ? 0 : c.lastV < 30 ? 1 : 2}_${cut(c.b[c.x]!.value, VAL_C)}`,
  "段球數×段": c => { const s = segOf(c.b[c.x]!.slot); return `sg${s}_${cut(c.segSup[s]!, [[18, 21, 24], [6, 8, 10], [6, 8, 10], [1, 3, 5]][s]!)}` },
  // ---- 第二輪：使用者其他線索、交叉組合 ----
  "上期頭數×頭": c => { const h = Math.floor(c.x / 10); return `hc${h}_${draws[c.t - 1]!.filter(y => Math.floor(y / 10) === h).length}` },
  "近3期頭數×頭": c => { const h = Math.floor(c.x / 10); let k = 0; for (let d = 1; d <= 3; d++) k += draws[c.t - d]!.filter(y => Math.floor(y / 10) === h).length; return `h3${h}_${Math.min(k, 7)}` },
  "上期三區×區": c => { const z = (x: number): number => (x <= 13 ? 0 : x <= 26 ? 1 : 2); return `zc${z(c.x)}_${draws[c.t - 1]!.filter(y => z(y) === z(c.x)).length}` },
  "上期號碼總和×頭": c => `ls${cut(draws[c.t - 1]!.reduce((a, y) => a + y, 0), [80, 90, 100, 110, 120])}_${Math.floor(c.x / 10)}`,
  "y×上期同y顆數": c => { const y = Math.min(c.b[c.x]!.rank, 5); return `yy${y}_${draws[c.t - 1]!.filter(z => Math.min(c.pb[z]!.rank, 5) === y).length}` },
  "值×上期有沒有開這個值": c => { const v = Math.min(c.b[c.x]!.value, 10); return `vv${v}_${draws[c.t - 1]!.some(z => c.pb[z]!.value === c.b[c.x]!.value) ? 1 : 0}` },
  "值×近5期這個值開幾次": c => { const v = c.b[c.x]!.value; let k = 0; for (let d = 1; d <= 5 && c.i - d >= 0; d++) { const bd = boards[c.i - d]!; if (bd.t === c.t - d) k += draws[bd.t]!.filter(z => bd.b[z]!.value === v).length } return `v5${Math.min(v, 10)}_${Math.min(k, 4)}` },
  "y×值": c => `yv${Math.min(c.b[c.x]!.rank, 5)}_${cut(c.b[c.x]!.value, VAL_C)}`,
  "隔期×值×同格顆數": c => `svn${cut(c.b[c.x]!.slot, SLOT_C)}_${cut(c.b[c.x]!.value, [1, 3, 6])}_${Math.min(c.b[c.x]!.size, 3)}`,
  "隔期×近30期": c => `s30${cut(c.b[c.x]!.slot, SLOT_C)}_${cut(recent(c.t, c.x, 30), [2, 4, 6])}`,
  "上期G離水位×隔期": c => `gd${cut(c.lastG - c.gl, [-15, -5, 5, 15])}_${cut(c.b[c.x]!.slot, SLOT_C)}`,
  "尾數×上期尾數有沒有開": c => `tt${c.x % 10}_${draws[c.t - 1]!.some(y => y % 10 === c.x % 10) ? 1 : 0}`,
  "號碼×隔期": c => `xs${c.x}_${cut(c.b[c.x]!.slot, [1, 4, 10])}`
}
const GNAMES = Object.keys(GROUPS)
/** 第三輪（樹）：同樣的線索，直接用數字，讓程式自己找交叉組合 */
const zoneOf = (x: number): number => (x <= 13 ? 0 : x <= 26 ? 1 : 2)
const NUM: [string, (c: Ctx) => number][] = [
  ['隔期', c => c.b[c.x]!.slot], ['值', c => Math.min(c.b[c.x]!.value, 200)], ['y', c => c.b[c.x]!.rank], ['同格顆數', c => c.b[c.x]!.size],
  ['號碼', c => c.x], ['尾數', c => c.x % 10], ['頭數', c => Math.floor(c.x / 10)], ['三區', c => zoneOf(c.x)],
  ['近10期', c => recent(c.t, c.x, 10)], ['近30期', c => recent(c.t, c.x, 30)], ['近100期', c => recent(c.t, c.x, 100)],
  ['隔期÷平均間隔', c => c.b[c.x]!.slot / Math.max(gapInfo.avg[c.t]![c.x]!, 1)], ['上一個間隔', c => gapInfo.prevGap[c.t]![c.x]!],
  ['上期鄰號', c => (c.x > 1 && hitAt(c.t - 1, c.x - 1) ? 1 : 0) + (c.x < BALLS && hitAt(c.t - 1, c.x + 1) ? 1 : 0)],
  ['上期同尾', c => draws[c.t - 1]!.filter(y => y % 10 === c.x % 10 && y !== c.x).length],
  ['GV組合比例', c => c.share[c.x]!], ['水位', c => c.gl], ['V水位', c => c.vl], ['上期V', c => Math.min(c.lastV, 300)],
  ['所在段', c => segOf(c.b[c.x]!.slot)], ['所在段球數', c => c.segSup[segOf(c.b[c.x]!.slot)]!],
  ['段0~5球數', c => c.segSup[0]!], ['段20+球數', c => c.segSup[3]!],
  ['上期同頭顆數', c => draws[c.t - 1]!.filter(y => Math.floor(y / 10) === Math.floor(c.x / 10)).length],
  ['上期同區顆數', c => draws[c.t - 1]!.filter(y => zoneOf(y) === zoneOf(c.x)).length],
  ['上期號碼總和', c => draws[c.t - 1]!.reduce((a, y) => a + y, 0)],
  ['上期同y顆數', c => draws[c.t - 1]!.filter(z => Math.min(c.pb[z]!.rank, 5) === Math.min(c.b[c.x]!.rank, 5)).length],
  ['上期有開這個值', c => (draws[c.t - 1]!.some(z => c.pb[z]!.value === c.b[c.x]!.value) ? 1 : 0)],
  ['上期G離水位', c => c.lastG - c.gl], ['上期尾數有開', c => (draws[c.t - 1]!.some(y => y % 10 === c.x % 10) ? 1 : 0)]
]
const MODE_TREE = process.argv.includes('tree')
const MODE_MINE = process.argv.includes('mine')

// ---------- 做表 ----------
interface Row { i: number, x: number, y: number, f: string[], nf: number[] }
const allRows: Row[] = []
const t0 = Date.now()
boards.forEach((bd, i) => {
  if (i < 1) return
  const share = comboShare(bd)
  const segSup = [0, 0, 0, 0]
  for (let x = 1; x <= BALLS; x++) segSup[segOf(bd.b[x]!.slot)]!++
  const prev = boards[i - 1]!
  const c0 = { i, t: bd.t, b: bd.b, share, gl: level(bd.b, 'slot'), vl: level(bd.b, 'value'), lastV: prev.t === bd.t - 1 ? vSum(prev.t, prev.b) : 20, segSup, pb: prev.b, lastG: draws[bd.t - 1]!.reduce((a, y) => a + Math.min(prev.b[y]!.slot, 200), 0) }
  for (let x = 1; x <= BALLS; x++) {
    const c: Ctx = { ...c0, x }
    allRows.push({ i, x, y: hitAt(bd.t, x) ? 1 : 0, f: MODE_TREE ? [] : GNAMES.map(g => `${g}:${GROUPS[g]!(c)}`), nf: MODE_TREE ? NUM.map(([, fn]) => fn(c)) : [] })
  }
  if (i % 1000 === 0) process.stderr.write(`做表 ${i}/${boards.length} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`)
})
const dateOf = (i: number): string => (isNext(i) ? '9999' : rows[boards[i]!.t]![1])
const part = (r: Row): number => { const d = dateOf(r.i); return d < TRAIN_END ? 0 : d < VALID_END ? 1 : isNext(r.i) ? 3 : 2 }

// ---------- 邏輯迴歸（每格一個分數） ----------
interface Model { w: Map<string, number>, b: number }
function fit(rs: Row[], use: Set<number>, l2: number, epochs = 6): Model {
  const w = new Map<string, number>(), g2 = new Map<string, number>()
  let b = Math.log(5 / 34), gb = 0
  const lr = 0.1
  for (let e = 0; e < epochs; e++) {
    for (let k = 0; k < rs.length; k++) {
      const r = rs[(k * 7919 + e * 104729) % rs.length]!
      let z = b
      for (let g = 0; g < r.f.length; g++) if (use.has(g)) z += w.get(r.f[g]!) ?? 0
      const p = 1 / (1 + Math.exp(-z)), d = p - r.y
      gb += d * d; b -= lr * d / Math.sqrt(gb + 1e-8)
      for (let g = 0; g < r.f.length; g++) {
        if (!use.has(g)) continue
        const key = r.f[g]!, wv = w.get(key) ?? 0, grad = d + l2 * wv
        const acc = (g2.get(key) ?? 0) + grad * grad
        g2.set(key, acc); w.set(key, wv - lr * grad / Math.sqrt(acc + 1e-8))
      }
    }
  }
  return { w, b }
}
const score = (m: Model, r: Row, use: Set<number>): number => { let z = m.b; for (let g = 0; g < r.f.length; g++) if (use.has(g)) z += m.w.get(r.f[g]!) ?? 0; return z }
/** 每期取分數最高的 20 顆，回傳每期中幾顆 */
function evalTop(m: Model, rs: Row[], use: Set<number>): number[] {
  const byI = new Map<number, Row[]>()
  for (const r of rs) byI.set(r.i, [...(byI.get(r.i) ?? []), r])
  const out: number[] = []
  for (const [, rr] of byI) { const top = [...rr].sort((a, c) => score(m, c, use) - score(m, a, use)).slice(0, TOP); out.push(top.reduce((s, r) => s + r.y, 0)) }
  return out
}
const mean = (a: number[]): number => a.reduce((s, x) => s + x, 0) / a.length
const ge3 = (a: number[]): number => a.filter(h => h >= 3).length / a.length

const train = allRows.filter(r => part(r) === 0), valid = allRows.filter(r => part(r) === 1), test = allRows.filter(r => part(r) === 2), nextRows = allRows.filter(r => part(r) === 3)
process.stderr.write(`學 ${train.length / BALLS} 期、挑 ${valid.length / BALLS} 期、驗證 ${test.length / BALLS} 期\n`)

if (MODE_TREE) { runTree(); process.exit(0) }

// ---------- 第三輪：樹（每棵 3 層，一棵接一棵修正前面的錯） ----------
function runTree(): void {
  const NF = NUM.length, BINS = 24, DEPTH = 3, LR = 0.05, LAMBDA = 1, MIN_LEAF = 300, ROUNDS = 400
  const tr = train, va = valid, te = test, nr = nextRows
  const edges = NUM.map((_, f) => { const v = tr.map(r => r.nf[f]!).sort((a, c) => a - c); const e: number[] = []; for (let k = 1; k < BINS; k++) { const q = v[Math.floor(k * (v.length - 1) / BINS)]!; if (!e.length || q > e[e.length - 1]!) e.push(q) } return e })
  const binOf = (f: number, x: number): number => { const e = edges[f]!; let lo = 0, hi = e.length; while (lo < hi) { const m = (lo + hi) >> 1; if (x > e[m]!) lo = m + 1; else hi = m } return lo }
  const toBins = (rs: Row[]): Uint8Array => { const a = new Uint8Array(rs.length * NF); rs.forEach((r, k) => { for (let f = 0; f < NF; f++) a[k * NF + f] = binOf(f, r.nf[f]!) }); return a }
  const Btr = toBins(tr), Bva = toBins(va), Bte = toBins(te), Bnx = toBins(nr)
  interface Node { f: number, b: number, l: number, r: number, v: number }
  const trees: Node[][] = []
  const base = Math.log(5 / 34)
  const Ftr = new Float64Array(tr.length).fill(base), Fva = new Float64Array(va.length).fill(base)
  const predict = (tree: Node[], B: Uint8Array, k: number): number => { let n = 0; for (;;) { const nd = tree[n]!; if (nd.f < 0) return nd.v; n = B[k * NF + nd.f]! <= nd.b ? nd.l : nd.r } }
  const groupOf = (rs: Row[]): number[][] => { const by = new Map<number, number[]>(); rs.forEach((r, k) => { const a = by.get(r.i); if (a) a.push(k); else by.set(r.i, [k]) }); return [...by.values()] }
  const topHits = (rs: Row[], F: Float64Array): number[] => groupOf(rs).map(ks => [...ks].sort((a, c) => F[c]! - F[a]!).slice(0, TOP).reduce((x, k) => x + rs[k]!.y, 0))
  let bestV = -1, bestN = 0
  const curve: string[] = []
  for (let round = 1; round <= ROUNDS; round++) {
    const g = new Float64Array(tr.length), h = new Float64Array(tr.length)
    for (let k = 0; k < tr.length; k++) { const p = 1 / (1 + Math.exp(-Ftr[k]!)); g[k] = p - tr[k]!.y; h[k] = p * (1 - p) }
    const tree: Node[] = []
    const grow = (idx: Int32Array, depth: number): number => {
      let G = 0, H = 0
      for (const k of idx) { G += g[k]!; H += h[k]! }
      const me = tree.length
      tree.push({ f: -1, b: 0, l: 0, r: 0, v: -LR * G / (H + LAMBDA) })
      if (depth >= DEPTH || idx.length < 2 * MIN_LEAF) return me
      let bg = 0, bf = -1, bb = 0
      const hg = new Float64Array(NF * BINS), hh = new Float64Array(NF * BINS), hc = new Int32Array(NF * BINS)
      for (const k of idx) for (let f = 0; f < NF; f++) { const q = f * BINS + Btr[k * NF + f]!; hg[q]! += g[k]!; hh[q]! += h[k]!; hc[q]!++ }
      const parent = G * G / (H + LAMBDA)
      for (let f = 0; f < NF; f++) {
        let gl = 0, hl = 0, cl = 0
        for (let b = 0; b < BINS - 1; b++) {
          const q = f * BINS + b; gl += hg[q]!; hl += hh[q]!; cl += hc[q]!
          const cr = idx.length - cl
          if (cl < MIN_LEAF || cr < MIN_LEAF) continue
          const gain = gl * gl / (hl + LAMBDA) + (G - gl) * (G - gl) / (H - hl + LAMBDA) - parent
          if (gain > bg) { bg = gain; bf = f; bb = b }
        }
      }
      if (bf < 0) return me
      const L: number[] = [], R: number[] = []
      for (const k of idx) (Btr[k * NF + bf]! <= bb ? L : R).push(k)
      tree[me]!.f = bf; tree[me]!.b = bb
      tree[me]!.l = grow(Int32Array.from(L), depth + 1)
      tree[me]!.r = grow(Int32Array.from(R), depth + 1)
      return me
    }
    grow(Int32Array.from({ length: tr.length }, (_, k) => k), 0)
    trees.push(tree)
    for (let k = 0; k < tr.length; k++) Ftr[k]! += predict(tree, Btr, k)
    for (let k = 0; k < va.length; k++) Fva[k]! += predict(tree, Bva, k)
    if (round % 20 === 0) {
      const hv = topHits(va, Fva), v = mean(hv)
      curve.push(`| ${round} | ${v.toFixed(3)} | ${(100 * ge3(hv)).toFixed(1)}% |`)
      process.stderr.write(`樹 ${round} 棵 → 2020～2023 平均中 ${v.toFixed(3)}\n`)
      if (v > bestV) { bestV = v; bestN = round }
    }
  }
  const Fte = new Float64Array(te.length).fill(base), Fnx = new Float64Array(nr.length).fill(base)
  for (let n = 0; n < bestN; n++) { for (let k = 0; k < te.length; k++) Fte[k]! += predict(trees[n]!, Bte, k); for (let k = 0; k < nr.length; k++) Fnx[k]! += predict(trees[n]!, Bnx, k) }
  const hits = topHits(te, Fte)
  const nx = nr.map((r, k) => [r.x, Fnx[k]!] as const).sort((a, c) => c[1] - a[1]).slice(0, TOP).map(([x]) => x).sort((a, c) => a - c)
  const dist = [5, 4, 3, 2, 1, 0].map(k => hits.filter(x => x === k).length).join(' | ')
  const out = ['# 每顆球打分數、每期取 20 顆（第三輪：樹，自己找交叉組合）', '', `> 由 \`scripts/ball-model.ts tree\` 產生。${NUM.length} 種線索直接用數字；每棵樹 3 層，2008～2019 學，2020～2023 決定用幾棵（${bestN} 棵），2024 起 ${hits.length} 期最後才驗證。`, '', '| 樹的棵數 | 2020～2023 平均中幾顆 | 中 3 顆以上 |', '|---|---|---|', ...curve, '', '## 2024 起驗證（每期 20 顆）', '', '| 中 5 | 中 4 | 中 3 | 中 2 | 中 1 | 中 0 | 中 3 顆以上 | 平均中幾顆 |', '|---|---|---|---|---|---|---|---|', `| ${dist} | ${(100 * ge3(hits)).toFixed(1)}% | ${mean(hits).toFixed(2)} |`, '', `## 第 ${rows[rows.length - 1]![0] + 1} 期`, '', `- ${nx.join(' ')}`]
  writeFileSync('docs/ball-tree.md', out.join('\n') + '\n')
  console.log(out.join('\n'))
}

if (MODE_MINE) { runMine(); process.exit(0) }

// ---------- 第四輪：自己找規則（一顆球在某兩種線索同時成立時，特別容易／特別不容易開） ----------
function runMine(): void {
  const BASE = 5 / BALLS
  const UP = 1.35, DOWN = 0.6, MIN_TR = 300, MIN_VA = 100
  interface Cell { n: number, h: number }
  const parts = [train, valid, test]
  /** 單一線索、兩種線索同時成立，每一格在三段裡各有幾次、開出幾次 */
  const keysOf = (r: Row): string[] => {
    const ks: string[] = [...r.f]
    for (let a = 0; a < r.f.length; a++) for (let b = a + 1; b < r.f.length; b++) ks.push(`${r.f[a]}＋${r.f[b]}`)
    return ks
  }
  const stat = parts.map(() => new Map<string, Cell>())
  parts.forEach((rs, pi) => {
    const m = stat[pi]!
    for (const r of rs) for (const k of keysOf(r)) { const c = m.get(k); if (c) { c.n++; c.h += r.y } else m.set(k, { n: 1, h: r.y }) }
    process.stderr.write(`第 ${pi + 1} 段統計完 ${m.size} 格\n`)
  })
  const rate = (c: Cell | undefined): number => (c && c.n ? c.h / c.n : NaN)
  interface Rule { k: string, tr: Cell, va: Cell, te: Cell | undefined, up: boolean }
  const found: Rule[] = []
  let trOnly = 0
  for (const [k, tr] of stat[0]!) {
    if (tr.n < MIN_TR) continue
    const r0 = tr.h / tr.n
    const up = r0 >= BASE * UP, down = r0 <= BASE * DOWN
    if (!up && !down) continue
    trOnly++
    const va = stat[1]!.get(k)
    if (!va || va.n < MIN_VA) continue
    const r1 = va.h / va.n
    if (up ? r1 < BASE * UP : r1 > BASE * DOWN) continue
    found.push({ k, tr, va, te: stat[2]!.get(k), up })
  }
  // 用留下的規則打分數：每條規則加上（2008～2023 這一格的開出比例 ÷ 平常）的對數
  const w = new Map<string, number>()
  for (const r of found) { const n = r.tr.n + r.va.n, h = r.tr.h + r.va.h; w.set(r.k, Math.log(((h + 1) / (n + 2)) / BASE)) }
  const byI = new Map<number, Row[]>()
  for (const r of test) { const a = byI.get(r.i); if (a) a.push(r); else byI.set(r.i, [r]) }
  const sc = (r: Row): number => keysOf(r).reduce((s, k) => s + (w.get(k) ?? 0), 0)
  const hits = [...byI.values()].map(rr => rr.map(r => [r, sc(r)] as const).sort((a, c) => c[1] - a[1]).slice(0, TOP).reduce((s, [r]) => s + r.y, 0))
  // 規則在 2024 起還成立的比例
  const held = found.filter(r => r.te && r.te.n >= 30 && (r.up ? rate(r.te) >= BASE * 1.15 : rate(r.te) <= BASE * 0.85))
  const withTe = found.filter(r => r.te && r.te.n >= 30)
  const pct = (x: number): string => `${(100 * x).toFixed(1)}%`
  const show = (r: Rule): string => `| ${r.k.replace(/[a-z]+[0-9_]*/g, m => m)} | ${r.up ? '容易開' : '不容易開'} | ${pct(rate(r.tr))}（${r.tr.n}） | ${pct(rate(r.va))}（${r.va.n}） | ${r.te ? `${pct(rate(r.te))}（${r.te.n}）` : '—'} |`
  const top = [...found].sort((a, b) => Math.abs(Math.log(rate(b.tr) / BASE)) - Math.abs(Math.log(rate(a.tr) / BASE))).slice(0, 30)
  const nxRows = nextRows.map(r => [r.x, sc(r)] as const).sort((a, c) => c[1] - a[1]).slice(0, TOP).map(([x]) => x).sort((a, c) => a - c)
  const out = ['# 第四輪：自己找規則', '', `> 由 \`scripts/ball-model.ts mine\` 產生。每顆球平常開出的比例是 ${pct(BASE)}。找「一種線索、或兩種線索同時成立」時，開出比例特別高（≥ 平常 × ${UP}）或特別低（≤ 平常 × ${DOWN}）的格。2008～2019 至少 ${MIN_TR} 次先找，2020～2023 至少 ${MIN_VA} 次再確認，2024 起最後才看。`, '',
    `- 2008～2019 找到 ${trOnly} 格，2020～2023 也成立的剩 ${found.length} 格。`,
    `- 這 ${found.length} 格在 2024 起有 30 次以上的 ${withTe.length} 格，還成立的 ${held.length} 格（${withTe.length ? pct(held.length / withTe.length) : '—'}）。`,
    `- 用這些規則打分數、每期取 20 顆，2024 起 ${hits.length} 期：中 3 顆以上 ${pct(hits.filter(h => h >= 3).length / hits.length)}，平均中 ${mean(hits).toFixed(2)} 顆；中 5／4／3／2／1／0：${[5, 4, 3, 2, 1, 0].map(k => hits.filter(h => h === k).length).join('／')}`,
    '', '## 最強的 30 格', '', '| 格 | 方向 | 2008～2019 | 2020～2023 | 2024 起 |', '|---|---|---|---|---|', ...top.map(show), '', `## 第 ${rows[rows.length - 1]![0] + 1} 期`, '', `- ${nxRows.join(' ')}`]
  writeFileSync('docs/ball-rules.md', out.join('\n') + '\n')
  console.log(out.join('\n'))
}

// ---------- 一組一組加（只看 2020～2023 決定） ----------
const L2 = 0.002
let chosen = new Set<number>()
let best = -1
const log: string[] = []
for (;;) {
  let pick = -1, pickV = best
  for (let g = 0; g < GNAMES.length; g++) {
    if (chosen.has(g)) continue
    const use = new Set([...chosen, g])
    const v = mean(evalTop(fit(train, use, L2, 3), valid, use))
    if (v > pickV + 0.002) { pickV = v; pick = g }
  }
  if (pick < 0) break
  chosen = new Set([...chosen, pick]); best = pickV
  log.push(`| ${chosen.size} | 加「${GNAMES[pick]}」 | ${best.toFixed(3)} |`)
  process.stderr.write(`加 ${GNAMES[pick]} → ${best.toFixed(3)}\n`)
}

// ---------- 最後：用 2008～2023 學，2024 起驗證 ----------
const finalTrain = [...train, ...valid]
const model = fit(finalTrain, chosen, L2, 6)
const testHits = evalTop(model, test, chosen)
const allUse = new Set(GNAMES.map((_, g) => g))
const modelAll = fit(finalTrain, allUse, L2, 6)
const testAll = evalTop(modelAll, test, allUse)
/** 對照：只用隔期、只用 G／V 組合比例 */
const one = (name: string): number[] => { const u = new Set([GNAMES.indexOf(name)]); return evalTop(fit(finalTrain, u, L2, 4), test, u) }
const onlySlot = one('隔期'), onlyShare = one('GV組合比例')
/** 對照：隔期最小的 20 顆（同隔期看號碼） */
const nearest = (() => { const byI = new Map<number, Row[]>(); for (const r of test) byI.set(r.i, [...(byI.get(r.i) ?? []), r]); return [...byI.values()].map(rr => [...rr].sort((a, c) => boards[a.i]!.b[a.x]!.slot - boards[c.i]!.b[c.x]!.slot || a.x - c.x).slice(0, TOP).reduce((s, r) => s + r.y, 0)) })()

const dist = (a: number[]): string => [5, 4, 3, 2, 1, 0].map(k => a.filter(h => h === k).length).join(' | ')
const line = (name: string, a: number[]): string => `| ${name} | ${dist(a)} | ${(100 * ge3(a)).toFixed(1)}% | ${mean(a).toFixed(2)} |`
const nx = [...nextRows].sort((a, c) => score(model, c, chosen) - score(model, a, chosen)).slice(0, TOP).map(r => r.x).sort((a, c) => a - c)

const out: string[] = []
out.push('# 每顆球打分數、每期取 20 顆（第二輪：34 種線索）')
out.push('')
out.push(`> 由 \`scripts/ball-model.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期。2008～2019 學、2020～2023 挑線索、2024 起 ${test.length / BALLS} 期最後才驗證（挑線索時沒看過）。每期只用開獎前的資料。`)
out.push('')
out.push('## 2020～2023 一組一組加線索（每期 20 顆平均中幾顆）')
out.push('')
out.push('| 第幾組 | 加了 | 平均中幾顆 |')
out.push('|---|---|---|')
out.push(...log)
out.push('')
out.push('## 2024 起驗證（每期 20 顆）')
out.push('')
out.push('| 做法 | 中 5 | 中 4 | 中 3 | 中 2 | 中 1 | 中 0 | 中 3 顆以上 | 平均中幾顆 |')
out.push('|---|---|---|---|---|---|---|---|---|')
out.push(line('挑出來的線索', testHits))
out.push(line('全部線索一起用', testAll))
out.push(line('只用隔期', onlySlot))
out.push(line('只用 G、V 組合比例', onlyShare))
out.push(line('隔期最小的 20 顆', nearest))
out.push('')
out.push(`## 第 ${rows[rows.length - 1]![0] + 1} 期（挑出來的線索）`)
out.push('')
out.push(`- ${nx.join(' ')}`)
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
