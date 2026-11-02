/**
 * 使用者的選號策略，從 2024 年第一期起逐期盲測（2026-11-02 使用者）。
 *
 * 條件全部來自使用者講過的查找方向（隔期狀態、獎號關聯七點、A/G/V 三條線、尾數與 y 的走勢）：
 *   一篩（隔期、值）
 *     S1 每期 5 顆隔期配置：0～5 有 2～3 顆、6～9 有 1～2 顆、10 以上 0～1 顆（三段各一條）
 *     S2 隔期 20 以上整段剩 ≥2 顆 → 從這幾顆開出
 *     S3 隔期總和大小交替：上一期比前一期大 → 這期變小（每顆隔期 < 上一期總和 ÷5），反之變大
 *     S4 值總和多數小於隔期總和 → 每顆值 < 隔期
 *     S5 值總和 < 10 → 下一期有單顆值 > 10
 *     S6 同一位置（第 1～5 顆）連 2 期以上隔期 > 5 → 下一期落在隔期 0～5
 *     S7 隔期 0～19 每格：目前的值高於最近 5、10、15 個紀錄的平均（含目前）
 *     S8 A（值總和 ≥ 隔期總和）、G（隔期總和）、V（值總和）三條自然波段照週期判斷下一期多或少，
 *        歷史上同樣組合的期，隔期、值落在哪些區比平常多 → 隔期方向、值方向
 *   二篩（尾數、位置 y）
 *     T1 幾乎每期都跟上一期同尾 → 上一期開出的尾數
 *     T2 上一期有 2 個以上同尾 → 下一期開出這個尾數
 *     T3 上上期有 2 個以上同尾、上一期沒開 → 這期開出
 *     T4 每個尾數自己的自然波段照週期判斷下一期多
 *     Y1 y=1 佔多數 → y=1
 *     Y2 y=2～5：距離上次出現已經等到平均間隔以上 → 這種 y
 *     Y3 每種 y（最小／中間／最大／單顆）自己的自然波段照週期判斷下一期多
 *
 * 週期與修正：每個條件都有一條「成立線」（每期條件成立記 1、不成立記 0 的自然波段）。
 *   決定時看這條線現在在上升或下降段、走了幾次，歷史上同方向走到這麼長還延續的比例 ≥ 一半 → 延續；
 *   判斷下一次「成立」才採用，判斷「不成立」這期就不用。開獎後把成不成立記進線裡，下一期重新判斷。
 *   成立＝這個條件挑出的球，開出的顆數多於「挑出顆數 × 5/39」（挑 1～7 顆時＝至少中 1 顆）。
 * 留球（使用者沒講怎麼合併，這裡補的）：一篩每顆球數有幾個採用的一篩條件挑到它，票數最多的一層一層往下收，收到至少 10 顆；
 *   二篩在一篩的球裡同樣用二篩條件的票數收，收到至少 5 顆。
 * 每一期只用「開完上一期為止」的資料。
 *
 * 用法：node --import tsx scripts/blind-test.ts  → docs/blind-test.md
 */
import { readFileSync, writeFileSync } from 'node:fs'
import type { HistoryFile } from '../shared/lotto/history-file'
import { computeFeatures } from '../shared/lotto/patterns/features'
import { BALLS, PICK, SLOTS, firstBoard, nextBoard, type Board } from './lib/container-sim'

const SRC = 'public/data/lotto539-history.json'
const OUT = 'docs/blind-test.md'
const TEST_FROM = '2024-01-01'
const H = 2
const START = SLOTS
const MIN1 = 10
const MIN2 = 5
const GAP_BINS: [number, number][] = [[0, 0], [1, 1], [2, 3], [4, 6], [7, 10], [11, 15], [16, 25], [26, 59]]
const VAL_BINS: [number, number][] = [[0, 0], [1, 1], [2, 3], [4, 6], [7, 12], [13, 24], [25, Infinity]]
const Y_NAMES = ['單顆', '最小', '中間', '最大']

const file = JSON.parse(readFileSync(SRC, 'utf8')) as HistoryFile
const rows = file.rows
const draws = rows.map(r => [...r[2]].sort((a, b) => a - b))
const feats = computeFeatures(draws, SLOTS)
const n = draws.length
const testFrom = rows.findIndex(r => r[1] >= TEST_FROM)

/** 自然波段：線 = Σ（實際 − 之前的平均），回落／回升滿 H 才確認轉折；長度用「推進幾次」算 */
class Wave {
  private sum = 0
  private cnt = 0
  private c = 0
  private hi = 0
  private hiAt = 0
  private lo = 0
  private loAt = 0
  private step = 0
  dir = 0
  private since = 0
  private done: Record<'up' | 'down', number[]> = { up: [], down: [] }
  push(x: number): void {
    this.step++
    const t = this.step
    const mean = this.cnt ? this.sum / this.cnt : x
    this.sum += x
    this.cnt++
    this.c += x - mean
    if (this.c > this.hi) { this.hi = this.c; this.hiAt = t }
    if (this.c < this.lo) { this.lo = this.c; this.loAt = t }
    if (this.dir >= 0 && this.hi - this.c >= H) {
      if (this.dir > 0) this.done.up.push(this.hiAt - this.since)
      this.dir = -1
      this.since = this.hiAt
      this.lo = this.c
      this.loAt = t
    } else if (this.dir <= 0 && this.c - this.lo >= H) {
      if (this.dir < 0) this.done.down.push(this.loAt - this.since)
      this.dir = 1
      this.since = this.loAt
      this.hi = this.c
      this.hiAt = t
    }
  }
  mean(): number {
    return this.cnt ? this.sum / this.cnt : 0
  }
  /** 歷史上同方向、走到現在這麼長還沒結束的波段，再多走一次的比例（沒有前例＝0） */
  cont(): number {
    if (this.dir === 0) return 0
    const L = this.step - this.since
    const past = this.done[this.dir > 0 ? 'up' : 'down']
    const alive = past.filter(x => x >= L).length
    return alive ? past.filter(x => x > L).length / alive : 0
  }
  /** 照週期判斷下一次「多」：延續就照現在方向，轉折就反過來；方向未定當「少」 */
  up(): boolean {
    if (this.dir === 0) return false
    return this.cont() >= 0.5 ? this.dir > 0 : this.dir < 0
  }
  label(): string {
    if (this.dir === 0) return '方向未定→少'
    return `${this.dir > 0 ? '上升' : '下降'}${this.step - this.since}次、延續${(100 * this.cont()).toFixed(0)}%→${this.up() ? '多' : '少'}`
  }
}

class RunMedian {
  private h: number[]
  private total = 0
  constructor(private max: number) { this.h = new Array<number>(max + 1).fill(0) }
  add(x: number): void { this.h[Math.min(x, this.max)]! += 1; this.total++ }
  get(): number {
    let acc = 0
    for (let i = 0; i <= this.max; i++) {
      acc += this.h[i]!
      if (acc * 2 >= this.total) return i
    }
    return this.max
  }
}

const binOf = (bins: [number, number][], x: number): number => bins.findIndex(([a, b]) => x >= a && x <= b)
interface Ball { slot: number, value: number, rank: number, size: number, tail: number }
/** 開完上一期後每顆球在盤面上的位置（不在 60 格內：slot 60、值 0） */
function ballsOf(b: Board): Ball[] {
  const out: Ball[] = new Array(BALLS + 1)
  for (let x = 1; x <= BALLS; x++) out[x] = { slot: SLOTS, value: 0, rank: 1, size: 1, tail: x % 10 }
  b.slots.forEach((s, i) => s.forEach((x, k) => { out[x] = { slot: i, value: b.values[i]!, rank: k + 1, size: s.length, tail: x % 10 } }))
  return out
}
const yCat = (b: Ball): number => (b.size === 1 ? 0 : b.rank === 1 ? 1 : b.rank === b.size ? 3 : 2)
const ALL = Array.from({ length: BALLS }, (_, i) => i + 1)
const gapSum = (t: number): number => feats[t]!.gaps.reduce<number>((a, g) => a + (g ?? SLOTS), 0)
const valSum = (t: number): number => feats[t]!.values.reduce<number>((a, v) => a + (v ?? 0), 0)

// ---- 跨期狀態 ----
const lineA = new Wave()
const lineG = new Wave()
const lineV = new Wave()
const medG = new RunMedian(400)
const medV = new RunMedian(5000)
const gapByState = new Map<string, number[]>()
const valByState = new Map<string, number[]>()
const gapAll = new Array<number>(GAP_BINS.length + 1).fill(0)
const valAll = new Array<number>(VAL_BINS.length + 1).fill(0)
const tailWave = Array.from({ length: 10 }, () => new Wave())
const yWave = Y_NAMES.map(() => new Wave())
/** 每格的值紀錄（被打中前等了幾期） */
const slotRecords: number[][] = Array.from({ length: SLOTS }, () => [])
/** y=2～5 上次出現在第幾期、歷次間隔 */
const yLast = new Array<number>(6).fill(-1)
const yGaps: number[][] = Array.from({ length: 6 }, () => [])

interface Ctx { t: number, balls: Ball[] }
interface Cond {
  id: string
  name: string
  stage: 1 | 2
  /** 這期挑出的球；null＝條件不適用（例如上一期沒有同尾） */
  pick: (c: Ctx) => { set: number[], why: string } | null
  wave: Wave
}
const mk = (id: string, name: string, stage: 1 | 2, pick: Cond['pick']): Cond => ({ id, name, stage, pick, wave: new Wave() })
const segCount = (c: Ctx, lo: number, hi: number): number[] => ALL.filter(x => c.balls[x]!.slot >= lo && c.balls[x]!.slot <= hi)
const avgLast = (a: number[], k: number): number => {
  const s = a.slice(-k)
  return s.reduce((x, y) => x + y, 0) / s.length
}

const conds: Cond[] = [
  mk('S1a', '隔期0～5 有2～3顆', 1, c => {
    const s = segCount(c, 0, 5)
    return s.length && 2.5 / s.length > PICK / BALLS ? { set: s, why: `0～5 剩 ${s.length} 顆，開 2～3 顆` } : null
  }),
  mk('S1b', '隔期6～9 有1～2顆', 1, c => {
    const s = segCount(c, 6, 9)
    return s.length && 1.5 / s.length > PICK / BALLS ? { set: s, why: `6～9 剩 ${s.length} 顆，開 1～2 顆` } : null
  }),
  mk('S1c', '隔期10以上 0～1顆', 1, c => {
    const s = segCount(c, 10, SLOTS)
    return s.length && 0.5 / s.length > PICK / BALLS ? { set: s, why: `10 以上剩 ${s.length} 顆，開 0～1 顆` } : null
  }),
  mk('S2', '隔期20以上剩≥2顆', 1, c => {
    const s = segCount(c, 20, SLOTS)
    return s.length >= 2 ? { set: s, why: `20 以上剩 ${s.length} 顆` } : null
  }),
  mk('S3', '隔期總和大小交替', 1, c => {
    const g1 = gapSum(c.t - 1)
    const g2 = gapSum(c.t - 2)
    if (g1 === g2) return null
    const cut = g1 / PICK
    return g1 > g2
      ? { set: ALL.filter(x => c.balls[x]!.slot < cut), why: `上期 ${g1} > 前期 ${g2} → 這期變小，隔期 < ${cut.toFixed(1)}` }
      : { set: ALL.filter(x => c.balls[x]!.slot > cut), why: `上期 ${g1} < 前期 ${g2} → 這期變大，隔期 > ${cut.toFixed(1)}` }
  }),
  mk('S4', '值總和小於隔期總和', 1, c => ({ set: ALL.filter(x => c.balls[x]!.value < c.balls[x]!.slot), why: '每顆值 < 隔期' })),
  mk('S5', '值總和<10 → 單顆值>10', 1, c => {
    const v = valSum(c.t - 1)
    if (v >= 10) return null
    const s = ALL.filter(x => c.balls[x]!.value > 10)
    return s.length ? { set: s, why: `上期值總和 ${v}` } : null
  }),
  mk('S6', '同位置連2期隔期>5 → 0～5', 1, c => {
    const a = feats[c.t - 1]!.gaps
    const b = feats[c.t - 2]!.gaps
    const pos = a.map((g, k) => ((g ?? SLOTS) > 5 && (b[k] ?? SLOTS) > 5 ? k + 1 : 0)).filter(Boolean)
    return pos.length ? { set: segCount(c, 0, 5), why: `第 ${pos.join('、')} 顆連 2 期 > 5` } : null
  }),
  mk('S7', '隔期格的值高於5/10/15均值', 1, c => {
    const slots: number[] = []
    for (let i = 0; i < 20; i++) {
      const rec = [...slotRecords[i]!, boardNow.values[i]!]
      if (rec.length < 16) continue
      const cur = boardNow.values[i]!
      if (cur > avgLast(rec, 5) && cur > avgLast(rec, 10) && cur > avgLast(rec, 15)) slots.push(i)
    }
    const s = ALL.filter(x => slots.includes(c.balls[x]!.slot))
    return s.length ? { set: s, why: `隔期 ${slots.join('、')}` } : null
  }),
  mk('S8', 'A/G/V 波段的隔期值方向', 1, c => {
    const key = `${+lineA.up()}${+lineG.up()}${+lineV.up()}`
    const fav = (by: number[] | undefined, all: number[]): boolean[] => {
      const ts = by ? by.reduce((a, b) => a + b, 0) : 0
      const ta = all.reduce((a, b) => a + b, 0)
      return all.map((a, i) => ts > 0 && by![i]! / ts > a / ta)
    }
    const gk = fav(gapByState.get(key), gapAll)
    const vk = fav(valByState.get(key), valAll)
    const s = ALL.filter(x => {
      const b = c.balls[x]!
      return gk[b.slot >= SLOTS ? GAP_BINS.length : binOf(GAP_BINS, b.slot)] && vk[b.slot >= SLOTS ? VAL_BINS.length : binOf(VAL_BINS, b.value)]
    })
    return s.length ? { set: s, why: `A${lineA.label()}、G${lineG.label()}、V${lineV.label()}` } : null
  }),
  mk('T1', '跟上一期同尾', 2, c => {
    const tails = [...new Set(draws[c.t - 1]!.map(x => x % 10))]
    return { set: ALL.filter(x => tails.includes(x % 10)), why: `上期尾數 ${tails.join('、')}` }
  }),
  mk('T2', '上一期同尾 → 開該尾', 2, c => {
    const cnt = new Array<number>(10).fill(0)
    for (const x of draws[c.t - 1]!) cnt[x % 10]! += 1
    const tails = cnt.map((k, d) => (k >= 2 ? d : -1)).filter(d => d >= 0)
    return tails.length ? { set: ALL.filter(x => tails.includes(x % 10)), why: `上期 ${tails.join('、')} 尾 ≥2 顆` } : null
  }),
  mk('T3', '上上期同尾、上期沒開 → 開該尾', 2, c => {
    const cnt = new Array<number>(10).fill(0)
    for (const x of draws[c.t - 2]!) cnt[x % 10]! += 1
    const last = new Set(draws[c.t - 1]!.map(x => x % 10))
    const tails = cnt.map((k, d) => (k >= 2 && !last.has(d) ? d : -1)).filter(d => d >= 0)
    return tails.length ? { set: ALL.filter(x => tails.includes(x % 10)), why: `上上期 ${tails.join('、')} 尾 ≥2 顆、上期沒開` } : null
  }),
  mk('T4', '尾數波段', 2, () => {
    const tails = tailWave.map((w, d) => (w.up() ? d : -1)).filter(d => d >= 0)
    return tails.length ? { set: ALL.filter(x => tails.includes(x % 10)), why: `判多的尾數 ${tails.join('、')}` } : null
  }),
  mk('Y1', 'y=1 佔多數', 2, c => ({ set: ALL.filter(x => c.balls[x]!.rank === 1), why: 'y=1' })),
  mk('Y2', 'y=2～5 等到平均間隔', 2, c => {
    const ks: number[] = []
    for (let k = 2; k <= 5; k++) {
      const gs = yGaps[k]!
      if (!gs.length || yLast[k]! < 0) continue
      const avg = gs.reduce((a, b) => a + b, 0) / gs.length
      if (c.t - yLast[k]! >= avg) ks.push(k)
    }
    return ks.length ? { set: ALL.filter(x => ks.includes(c.balls[x]!.rank)), why: `y=${ks.join('、')} 已等到平均間隔` } : null
  }),
  mk('Y3', 'y 波段', 2, c => {
    const cats = yWave.map((w, i) => (w.up() ? i : -1)).filter(i => i >= 0)
    return cats.length ? { set: ALL.filter(x => cats.includes(yCat(c.balls[x]!))), why: `判多的 y：${cats.map(i => Y_NAMES[i]).join('、')}` } : null
  })
]

interface Used { cond: Cond, set: number[], why: string, apply: boolean, line: string }
interface Decision { t: number, used: Used[], stage1: number[], final: number[] }

/** 票數最多的一層一層往下收，收到至少 min 顆 */
function collect(pool: number[], votes: (x: number) => number, min: number): number[] {
  const tiers = [...new Set(pool.map(votes))].sort((a, b) => b - a)
  const out: number[] = []
  for (const v of tiers) {
    if (out.length >= min) break
    out.push(...pool.filter(x => votes(x) === v))
  }
  return out.sort((a, b) => a - b)
}

let boardNow: Board = firstBoard(draws[0]!)
function decide(t: number): Decision {
  const ctx: Ctx = { t, balls: ballsOf(boardNow) }
  const used: Used[] = []
  for (const cond of conds) {
    const p = cond.pick(ctx)
    if (p) used.push({ cond, set: p.set, why: p.why, apply: cond.wave.up(), line: cond.wave.label() })
  }
  const vote = (stage: 1 | 2) => (x: number): number => used.filter(u => u.apply && u.cond.stage === stage && u.set.includes(x)).length
  const stage1 = collect(ALL, vote(1), MIN1)
  const final = collect(stage1, vote(2), MIN2)
  return { t, used, stage1, final }
}

interface Result extends Decision { ok: Map<string, boolean>, hit1: number, hitF: number }
const results: Result[] = []
for (let t = 1; t < n; t++) {
  const drawn = draws[t]!
  const drawnSet = new Set(drawn)
  const isTest = t >= testFrom
  let dec: Decision | null = null
  if (t >= START + 2) {
    dec = decide(t)
    // 開獎後：每個條件成不成立，記進它的成立線（用不用都記）
    const ok = new Map<string, boolean>()
    for (const u of dec.used) {
      const hits = u.set.filter(x => drawnSet.has(x)).length
      const pass = hits > u.set.length * PICK / BALLS
      ok.set(u.cond.id, pass)
      u.cond.wave.push(pass ? 1 : 0)
    }
    if (isTest) results.push({ ...dec, ok, hit1: dec.stage1.filter(x => drawnSet.has(x)).length, hitF: dec.final.filter(x => drawnSet.has(x)).length })
  }
  // 更新各條線與紀錄
  if (t >= START) {
    const balls = ballsOf(boardNow)
    const tc = new Array<number>(10).fill(0)
    const yc = new Array<number>(Y_NAMES.length).fill(0)
    for (const x of drawn) {
      tc[x % 10]! += 1
      yc[yCat(balls[x]!)]! += 1
    }
    tailWave.forEach((w, d) => w.push(tc[d]!))
    yWave.forEach((w, i) => w.push(yc[i]!))
    if (drawn.every(x => balls[x]!.slot < SLOTS)) {
      const G = drawn.reduce((a, x) => a + balls[x]!.slot, 0)
      const V = drawn.reduce((a, x) => a + balls[x]!.value, 0)
      const key = `${V >= G ? 1 : 0}${G > medG.get() ? 1 : 0}${V > medV.get() ? 1 : 0}`
      const gs = gapByState.get(key) ?? new Array<number>(GAP_BINS.length + 1).fill(0)
      const vs = valByState.get(key) ?? new Array<number>(VAL_BINS.length + 1).fill(0)
      for (const x of drawn) {
        gs[binOf(GAP_BINS, balls[x]!.slot)]! += 1
        vs[binOf(VAL_BINS, balls[x]!.value)]! += 1
        gapAll[binOf(GAP_BINS, balls[x]!.slot)]! += 1
        valAll[binOf(VAL_BINS, balls[x]!.value)]! += 1
      }
      gapByState.set(key, gs)
      valByState.set(key, vs)
      lineA.push(V >= G ? 1 : 0)
      lineG.push(G > medG.get() ? 1 : 0)
      lineV.push(V > medV.get() ? 1 : 0)
      medG.add(G)
      medV.add(V)
    }
    for (let k = 2; k <= 5; k++) {
      if (drawn.some(x => balls[x]!.rank === k)) {
        if (yLast[k]! >= 0) yGaps[k]!.push(t - yLast[k]!)
        yLast[k] = t
      }
    }
  }
  boardNow.slots.forEach((s, i) => { if (s.some(x => drawnSet.has(x))) slotRecords[i]!.push(boardNow.values[i]!) })
  boardNow = nextBoard(boardNow, drawn)
}
const next = decide(n)

// ---- 報告 ----
const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0)
const pct = (a: number, b: number): string => (b ? (100 * a / b).toFixed(1) : '—')
const m = results.length
const out: string[] = []
out.push('# 選號策略盲測：2024 年起逐期')
out.push('')
out.push(`> 由 \`scripts/blind-test.ts\` 產生。資料到第 ${rows[n - 1]![0]} 期（${rows[n - 1]![1]}）。盲測 ${m} 期：${rows[testFrom]![0]}（${rows[testFrom]![1]}）～${rows[n - 1]![0]}。`)
out.push('> 每期只用開完上一期為止的資料做決定，決定後才比對開獎，把每個條件成不成立記進它的成立線，再做下一期。')
out.push('')
out.push('## 決策條件')
out.push('')
out.push('| 代號 | 條件 | 篩 |')
out.push('|---|---|---|')
for (const c of conds) out.push(`| ${c.id} | ${c.name} | ${c.stage === 1 ? '一篩' : '二篩'} |`)
out.push('')
out.push('- 每個條件有一條成立線：這期條件挑出的球，開出的顆數多於「挑出顆數 × 5/39」就算成立（挑 1～7 顆時＝至少中 1 顆）。')
out.push('- 決定時看成立線現在上升或下降、走了幾次；歷史上同方向走到這麼長還延續的比例 ≥ 一半 → 延續。判斷下一次「成立」就採用，判斷「不成立」這期不用。')
out.push(`- 留球（你沒講怎麼合併，這是我補的）：一篩看每顆球被幾個採用的一篩條件挑到，票數最多的一層一層收，收到至少 ${MIN1} 顆；二篩在一篩的球裡用二篩條件的票數收，收到至少 ${MIN2} 顆。`)
out.push('')
out.push('## 命中')
out.push('')
const n1 = sum(results.map(r => r.stage1.length))
const nF = sum(results.map(r => r.final.length))
const h1 = sum(results.map(r => r.hit1))
const hF = sum(results.map(r => r.hitF))
out.push('| 名單 | 平均每期顆數 | 名單總顆數 | 命中顆數 | 命中率 | 中 ≥1 顆的期 | 中 ≥2 顆的期 | 中 ≥3 顆的期 |')
out.push('|---|---|---|---|---|---|---|---|')
out.push(`| 一篩 | ${(n1 / m).toFixed(1)} | ${n1} | ${h1} | ${pct(h1, n1)}% | ${results.filter(r => r.hit1 >= 1).length} | ${results.filter(r => r.hit1 >= 2).length} | ${results.filter(r => r.hit1 >= 3).length} |`)
out.push(`| 二篩 | ${(nF / m).toFixed(1)} | ${nF} | ${hF} | ${pct(hF, nF)}% | ${results.filter(r => r.hitF >= 1).length} | ${results.filter(r => r.hitF >= 2).length} | ${results.filter(r => r.hitF >= 3).length} |`)
out.push('')
out.push('| 年 | 期數 | 一篩顆數 | 一篩命中 | 一篩命中率 | 二篩顆數 | 二篩命中 | 二篩命中率 |')
out.push('|---|---|---|---|---|---|---|---|')
for (const y of [...new Set(results.map(r => rows[r.t]![1].slice(0, 4)))]) {
  const rs = results.filter(r => rows[r.t]![1].startsWith(y))
  const a = sum(rs.map(r => r.stage1.length))
  const b = sum(rs.map(r => r.final.length))
  const ha = sum(rs.map(r => r.hit1))
  const hb = sum(rs.map(r => r.hitF))
  out.push(`| ${y} | ${rs.length} | ${a} | ${ha} | ${pct(ha, a)}% | ${b} | ${hb} | ${pct(hb, b)}% |`)
}
out.push('')
out.push('## 每個條件的成績')
out.push('')
out.push('「採用」＝成立線判斷下一次成立、那期有用它；「沒用」＝成立線判斷不成立、那期跳過。成立率看週期判斷有沒有挑對時機。')
out.push('')
out.push('| 代號 | 條件 | 適用期數 | 採用期數 | 採用時成立 | 採用時成立率 | 沒用時成立 | 沒用時成立率 | 採用時平均挑幾顆 | 採用時挑中顆數／挑出顆數 |')
out.push('|---|---|---|---|---|---|---|---|---|---|')
for (const c of conds) {
  const us = results.flatMap(r => r.used.filter(u => u.cond.id === c.id).map(u => ({ u, ok: r.ok.get(c.id)!, actual: new Set(draws[r.t]!) })))
  const ap = us.filter(e => e.u.apply)
  const sk = us.filter(e => !e.u.apply)
  const picked = sum(ap.map(e => e.u.set.length))
  const hit = sum(ap.map(e => e.u.set.filter(x => e.actual.has(x)).length))
  out.push(`| ${c.id} | ${c.name} | ${us.length} | ${ap.length} | ${ap.filter(e => e.ok).length} | ${pct(ap.filter(e => e.ok).length, ap.length)}% | ${sk.filter(e => e.ok).length} | ${pct(sk.filter(e => e.ok).length, sk.length)}% | ${ap.length ? (picked / ap.length).toFixed(1) : '—'} | ${hit}／${picked}（${pct(hit, picked)}%） |`)
}
out.push('')
const usedText = (d: Decision): string[] => d.used.map(u => `${u.cond.id} ${u.cond.name}（${u.why}；挑 ${u.set.length} 顆；成立線${u.line}）${u.apply ? '→ 採用' : '→ 不用'}`)
out.push('## 下一期的決定（還沒開）')
out.push('')
out.push(`開完 ${rows[n - 1]![0]}（${rows[n - 1]![1]}）後：`)
out.push('')
for (const s of usedText(next)) out.push(`- ${s}`)
const skippedNow = conds.filter(c => !next.used.some(u => u.cond.id === c.id)).map(c => `${c.id} ${c.name}`)
if (skippedNow.length) out.push(`- 這期不適用：${skippedNow.join('、')}`)
out.push(`- 一篩 ${next.stage1.length} 顆：${next.stage1.join(' ')}`)
out.push(`- 二篩 ${next.final.length} 顆：**${next.final.join(' ')}**`)
out.push('')
out.push('## 逐期紀錄')
out.push('')
out.push('採用＝這期有用的條件；不用＝成立線判斷這期不成立而跳過。比對＝開獎後每個適用條件成立 ✓／不成立 ✗（不管有沒有用都比）。命中的號碼加粗。')
out.push('')
out.push('| 期 | 採用 | 不用 | 一篩 | 二篩 | 開出 | 比對 | 下一期改了什麼 |')
out.push('|---|---|---|---|---|---|---|---|')
results.forEach((r, i) => {
  const actual = new Set(draws[r.t]!)
  const mark = (a: number[]): string => a.map(x => (actual.has(x) ? `**${x}**` : `${x}`)).join(' ')
  const nx: Decision = i + 1 < m ? results[i + 1]! : next
  const ap = (d: Decision): string[] => d.used.filter(u => u.apply).map(u => u.cond.id)
  const was = ap(r)
  const now = ap(nx)
  const add = now.filter(x => !was.includes(x))
  const del = was.filter(x => !now.includes(x))
  const chg = [add.length ? `改用 ${add.join('、')}` : '', del.length ? `停用 ${del.join('、')}` : ''].filter(Boolean).join('；') || '採用的條件不變'
  out.push(`| ${rows[r.t]![0]} | ${was.join(' ') || '無'} | ${r.used.filter(u => !u.apply).map(u => u.cond.id).join(' ') || '無'} | ${mark(r.stage1)}（中 ${r.hit1}） | ${mark(r.final)}（中 ${r.hitF}） | ${draws[r.t]!.join(' ')} | ${r.used.map(u => `${u.cond.id}${r.ok.get(u.cond.id) ? '✓' : '✗'}`).join(' ')} | ${chg} |`)
})
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.slice(0, out.indexOf('## 逐期紀錄')).join('\n'))
