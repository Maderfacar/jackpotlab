/**
 * 使用者的選號策略，從 2024 年第一期起逐期盲測（2026-11-02 使用者）。
 *
 * 條件全部來自使用者講過的查找方向（隔期狀態、獎號關聯七點、A/G/V 三條線、尾數與 y 的走勢）：
 *   一篩（隔期、值）
 *     S1 每期 5 顆隔期配置：0～5 有 2～3 顆、6～9 有 1～2 顆、10 以上 0～1 顆（三段各一條）
 *     S2 隔期 20 以上整段剩 ≥2 顆 → 從這幾顆開出
 *     S5 值總和 < 10 → 下一期有單顆值 > 10
 *     S6 同一位置（第 1～5 顆）連 2 期以上隔期 > 5 → 下一期落在隔期 0～5
 *     S7 隔期 0～19 每格：目前的值高於最近 5、10、15 個紀錄的平均（含目前）
 *     五顆組合推理（2026-11-03 conditions-v4：總和是五顆加起來的，不能拿單顆的隔期、值直接判斷；舊的 S3、S4、S8 拿掉）
 *       值 0～9 每個（使用者 2026-11-03，conditions-v5）：各自用 VAL_RULES 的波段期數 W、近期期數 R 與方向，
 *         算最近 W 期出現的百分比、最近 R 期出現的百分比（一期有獎號來自這個值的隔期格就算出現）。
 *         方向「多→不會」：近 R 期比波段多 → 判不會；方向「少→不會」：近 R 期比波段少 → 判不會；一樣 → 判會。
 *         判不會的值，它的隔期格號碼從一篩排除（少見號碼除外）。值 10 以上不判。
 *         W、R、方向來自 scripts/value-window.ts：2007～2020 找最好的組合；使用者選「a」時看過 2021 起的驗證結果才定方向，
 *         所以 2021 起的盲測對值的判斷不算完全盲。
 *       隔期總和大小交替（上一期比前一期大 → 這期比上一期小，反之變大）；值總和 < 隔期總和。
 *       只用沒被排除的格，兩樣總和都符合的五顆組合，用到的隔期格裡的號碼納入一篩。
 *   二篩（尾數、位置 y）
 *     T1 幾乎每期都跟上一期同尾 → 上一期開出的尾數
 *     T2 上一期有 2 個以上同尾 → 下一期開出這個尾數
 *     T3 上上期有 2 個以上同尾、上一期沒開 → 這期開出
 *     T4 每個尾數自己的自然波段照週期判斷下一期多
 *     Y1 y=1 佔多數 → y=1
 *     Y2 y=2～5：距離上次出現已經等到平均間隔以上 → 這種 y
 *     Y3 y=1～5 每一種自己的自然波段（每期開出幾顆這種 y）照週期判斷下一期多（2026-11-03 改；v1 是單顆／最小／中間／最大）
 *   少見狀況（不看成立線、出現就放進一篩和二篩名單）
 *     R1 隔期 > 5 的格子還留著 5 顆
 *     R2 某一格剩的顆數，歷史上同一格剩這麼多以上的期不到 RARE（到目前為止的盤面算）
 *
 * 週期與修正：每個條件都有一條「成立線」（每期條件成立記 1、不成立記 0 的自然波段）。
 *   決定時看這條線現在在上升或下降段、走了幾次，歷史上同方向走到這麼長還延續的比例 ≥ 一半 → 延續，判多或判少。
 *   開獎後把成不成立記進線裡，下一期重新判斷。成立＝這個條件挑出的號碼至少中 1 顆（使用者 2026-11-03）。
 *   判少不表示不會開：一篩不看判多判少；二篩尾數條件判少的不投票（見下）。
 * 留球（2026-11-03 conditions-v3，使用者：不能只憑尾數選、一篩不能留 39 顆）：
 *   一篩（conditions-v6，使用者 2026-11-03）：只用隔期總和 G 與值總和 V 的關係排組合——
 *     G 的區間：上一期 G 比前一期大 → 這期變小（反之變大）；歷史上同樣交替、上一期 G 在 ±G_NEAR 內、這期也照交替走的期，這期 G 的 25%～75%。
 *     V 的模式：最近 V_RECENT 期「V 大於 G」的比例比全部歷史高 → 判這期 V 大於 G，否則回到基本面（V 小於 G）。
 *     V－G 的區間：歷史上 G 落在上面區間、而且同樣模式的期，V－G 的 25%～75%。
 *     盤面所有五顆組合裡，G、V－G 都在區間內的組合，用到的隔期格號碼（出現在至少 COMBO_MIN_SHARE 的組合裡）＋少見號碼＝一篩。
 *     各一篩條件（S1、S2、S5～S7）與值 0～9 的判斷照算、記在報告，但不進一篩。
 *   二篩把一篩的球照 y=1～5 分成五組，每組各自用尾數條件（T1～T4）的票數收：
 *     這種 y 判會多（y 波段判多、或 Y1／Y2 採用且挑到這種 y）→ 收票數最高的兩層；其他 → 只收最高的一層。
 *     尾數條件一條都沒採用時，同樣改成全部尾數條件都投票。
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
/** 判會多的 y 收幾層票數 */
const Y_TIERS_UP = 2
const RARE = 0.05
const RARE_MIN_HISTORY = 500
const GAP_BINS: [number, number][] = [[0, 0], [1, 1], [2, 3], [4, 6], [7, 10], [11, 15], [16, 25], [26, 59]]
const VAL_BINS: [number, number][] = [[0, 0], [1, 1], [2, 3], [4, 6], [7, 12], [13, 24], [25, Infinity]]
const Y_KINDS = [1, 2, 3, 4, 5]
/** 下一期 G 的範圍：用上一期 G ± 這麼多的歷史期 */
const G_NEAR = 8
/** 看最近幾期「V 大於 G」的比例 */
const V_RECENT = 30
/** 同樣狀況的歷史不到這麼多期，放寬條件 */
const PLAN_MIN_HIST = 30
/** 一篩只留出現在至少這麼多比例組合裡的隔期格（0＝有出現就留） */
const COMBO_MIN_SHARE = 0
/** 值 0～9 各自判斷 */
const VALS = 10
/** 值 0～9 各自的波段期數 w、近期期數 r、方向（1＝近期多→不會、-1＝近期少→不會），見 docs/value-window.md */
const VAL_RULES: { w: number, r: number, dir: 1 | -1 }[] = [
  { w: 10, r: 1, dir: -1 },
  { w: 20, r: 15, dir: -1 },
  { w: 25, r: 10, dir: -1 },
  { w: 30, r: 3, dir: -1 },
  { w: 10, r: 5, dir: -1 },
  { w: 80, r: 6, dir: -1 },
  { w: 60, r: 10, dir: -1 },
  { w: 15, r: 5, dir: 1 },
  { w: 60, r: 3, dir: 1 },
  { w: 30, r: 15, dir: 1 },
]

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
const yWave = Y_KINDS.map(() => new Wave())
/** 值 0～9：每期有沒有出現（1／0） */
const valSeen = Array.from({ length: VALS }, (): number[] => [])
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
  mk('Y3', 'y=1～5 各自波段', 2, c => {
    const ks = Y_KINDS.filter((_, i) => yWave[i]!.up())
    return ks.length ? { set: ALL.filter(x => ks.includes(c.balls[x]!.rank)), why: `判多的 y：${ks.map(k => `y=${k}`).join('、')}` } : null
  })
]

interface Used { cond: Cond, set: number[], why: string, apply: boolean, line: string }
interface Rare { id: 'R1' | 'R2', slot: number, balls: number[], why: string }
interface Decision { t: number, used: Used[], rare: Rare[], plan: Plan, stage1: number[], final: number[], /** 判會多的 y */ yUp: number[], /** 每顆球決定時在第幾格 */ slotOf: number[], /** 每顆球決定時的格、值、y、尾數 */ ballOf: Ball[] }
/** slotCount[i][k]：到目前為止的盤面，第 i 格剩 k 顆的期數 */
const slotCount: number[][] = Array.from({ length: SLOTS }, () => new Array<number>(6).fill(0))
let boardsSeen = 0
function rareOf(b: Board): Rare[] {
  const out: Rare[] = []
  b.slots.forEach((s, i) => {
    if (i > 5 && s.length === 5) out.push({ id: 'R1', slot: i, balls: [...s], why: `隔期 ${i} 還留 5 顆` })
    if (boardsSeen >= RARE_MIN_HISTORY && s.length > 0) {
      const ge = slotCount[i]!.slice(s.length).reduce((a, x) => a + x, 0)
      if (ge / boardsSeen < RARE) out.push({ id: 'R2', slot: i, balls: [...s], why: `隔期 ${i} 剩 ${s.length} 顆，歷史上同格剩這麼多以上 ${(100 * ge / boardsSeen).toFixed(2)}%` })
    }
  })
  return out
}

/** 票數最多的一層一層往下收，收到至少 min 顆 */
const comb = (a: number, b: number): number => {
  if (b < 0 || b > a) return 0
  let r = 1
  for (let i = 0; i < b; i++) r = r * (a - i) / (i + 1)
  return r
}
interface ValJudge { v: number, w: number, r: number, dir: 1 | -1, wave: number, recent: number, appear: boolean }
/** 值 v 下一期會不會出現：照 VAL_RULES[v] 比最近 w 期與最近 r 期出現的百分比 */
function valJudge(v: number): ValJudge {
  const { w, r, dir } = VAL_RULES[v]!
  const h = valSeen[v]!
  if (h.length < w) return { v, w, r, dir, wave: 0, recent: 0, appear: true }
  const rate = (k: number): number => h.slice(-k).reduce((a, b) => a + b, 0) / k
  const wave = rate(w)
  const recent = rate(r)
  return { v, w, r, dir, wave, recent, appear: dir === 1 ? recent <= wave : recent >= wave }
}
interface Plan {
  /** 值 0～9 會不會出現（參考，不進一篩） */ vals: ValJudge[]
  /** 隔期總和區間 */ gLo: number, gHi: number, gWhy: string
  /** V 的模式：true＝判這期 V 大於 G */ above: boolean, recentAbove: number, baseAbove: number
  /** V－G 區間 */ dLo: number, dHi: number
  /** 符合的組合數、每格出現在幾成的組合、留下的格 */ combos: number, share: { sl: number, v: number, size: number, share: number }[], comboSlots: number[]
}
const GS: number[] = draws.map((_, t) => (t ? gapSum(t) : 0))
const VS: number[] = draws.map((_, t) => (t ? valSum(t) : 0))
const quant = (xs: number[], p: number): number => {
  const so = [...xs].sort((x, y) => x - y)
  return so.length ? so[Math.floor(p * (so.length - 1))]! : 0
}
function comboPlan(t: number, balls: Ball[]): Plan {
  const vals = Array.from({ length: VALS }, (_, v) => valJudge(v))
  const past: number[] = []
  for (let i = START + 2; i < t; i++) past.push(i)
  const g1 = GS[t - 1]!
  const g2 = GS[t - 2]!
  const dir = Math.sign(g1 - g2)
  const near = past.filter(i => Math.abs(GS[i - 1]! - g1) <= G_NEAR)
  const same = near.filter(i => Math.sign(GS[i - 1]! - GS[i - 2]!) === dir && (dir === 0 || Math.sign(GS[i]! - GS[i - 1]!) === -dir))
  const gHist = (same.length >= PLAN_MIN_HIST ? same : near).map(i => GS[i]!)
  const gLo = quant(gHist, 0.25)
  const gHi = quant(gHist, 0.75)
  const gWhy = dir > 0 ? `上期 ${g1} > 前期 ${g2} → 這期變小` : dir < 0 ? `上期 ${g1} < 前期 ${g2} → 這期變大` : `上期＝前期 ${g1}`
  const recent = past.slice(-V_RECENT)
  const recentAbove = recent.filter(i => VS[i]! > GS[i]!).length / (recent.length || 1)
  const baseAbove = past.filter(i => VS[i]! > GS[i]!).length / (past.length || 1)
  const above = recentAbove > baseAbove
  const inG = past.filter(i => GS[i]! >= gLo && GS[i]! <= gHi)
  const inMode = inG.filter(i => (VS[i]! > GS[i]!) === above)
  const dHist = (inMode.length >= PLAN_MIN_HIST ? inMode : inG).map(i => VS[i]! - GS[i]!)
  const dLo = quant(dHist, 0.25)
  const dHi = quant(dHist, 0.75)
  const info = [...new Set(ALL.map(x => balls[x]!.slot))].filter(sl => sl < SLOTS).sort((x, y) => x - y).map((sl) => {
    const bs = ALL.filter(x => balls[x]!.slot === sl)
    return { sl, v: balls[bs[0]!]!.value, size: bs.length }
  })
  const take = new Array<number>(info.length).fill(0)
  const use = new Array<number>(info.length).fill(0)
  let combos = 0
  const walk = (i: number, left: number, G: number, V: number): void => {
    if (G > gHi) return
    if (left === 0) {
      if (G < gLo || V - G < dLo || V - G > dHi) return
      let ways = 1
      info.forEach((o, k) => { if (take[k]) ways *= comb(o.size, take[k]!) })
      combos += ways
      info.forEach((_, k) => { if (take[k]) use[k]! += ways })
      return
    }
    if (i === info.length) return
    const o = info[i]!
    for (let k = Math.min(left, o.size); k >= 0; k--) {
      take[i] = k
      walk(i + 1, left - k, G + k * o.sl, V + k * o.v)
    }
    take[i] = 0
  }
  walk(0, PICK, 0, 0)
  const share = info.map((o, k) => ({ ...o, share: combos ? use[k]! / combos : 0 }))
  const comboSlots = share.filter(x => x.share > 0 && x.share >= COMBO_MIN_SHARE).map(x => x.sl)
  return { vals, gLo, gHi, gWhy, above, recentAbove, baseAbove, dLo, dHi, combos, share, comboSlots }
}
/** 實際開出的五顆：G 在不在區間、V－G 在不在區間 */
function fitOf(p: Plan, balls: Ball[], drawn: number[]): { g: boolean, d: boolean } {
  const G = drawn.reduce((x, y) => x + Math.min(balls[y]!.slot, SLOTS), 0)
  const V = drawn.reduce((x, y) => x + balls[y]!.value, 0)
  return { g: G >= p.gLo && G <= p.gHi, d: V - G >= p.dLo && V - G <= p.dHi }
}

let boardNow: Board = firstBoard(draws[0]!)
function decide(t: number): Decision {
  const ctx: Ctx = { t, balls: ballsOf(boardNow) }
  const used: Used[] = []
  for (const cond of conds) {
    const p = cond.pick(ctx)
    if (p) used.push({ cond, set: p.set, why: p.why, apply: cond.wave.up(), line: cond.wave.label() })
  }
  /** 這組條件有採用的就只用採用的；一條都沒採用 → 全部都投票 */
  const voter = (pick: (u: Used) => boolean) => {
    const group = used.filter(pick)
    const voters = group.some(u => u.apply) ? group.filter(u => u.apply) : group
    return (x: number): number => voters.filter(u => u.set.includes(x)).length
  }
  const rare = rareOf(boardNow)
  const rareBalls = [...new Set(rare.flatMap(r => r.balls))]
  const plan = comboPlan(t, ctx.balls)
  const comboBalls = plan.combos ? ALL.filter(x => plan.comboSlots.includes(ctx.balls[x]!.slot)) : ALL
  const stage1 = [...new Set([...comboBalls, ...rareBalls])].sort((a, b) => a - b)
  const tailVote = voter(u => u.cond.id.startsWith('T'))
  const yUp = Y_KINDS.filter((k, i) => yWave[i]!.up()
    || used.some(u => u.apply && (u.cond.id === 'Y1' || u.cond.id === 'Y2') && u.set.some(x => ctx.balls[x]!.rank === k)))
  const byY = Y_KINDS.flatMap((k) => {
    const pool = stage1.filter(x => ctx.balls[x]!.rank === k)
    const tiers = [...new Set(pool.map(tailVote))].sort((a, b) => b - a).slice(0, yUp.includes(k) ? Y_TIERS_UP : 1)
    return pool.filter(x => tiers.includes(tailVote(x)))
  })
  const final = [...new Set([...byY, ...rareBalls])].sort((a, b) => a - b)
  return { t, used, rare, plan, stage1, final, yUp, slotOf: ctx.balls.map(b => b?.slot ?? -1), ballOf: ctx.balls }
}

interface Result extends Decision { ok: Map<string, boolean>, hit1: number, hitF: number, fit: { g: boolean, d: boolean } }
const results: Result[] = []
/** 每一期（不只盲測期）的決定，給其他腳本用 */
export const allDecisions: Decision[] = []
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
      const pass = hits >= 1
      ok.set(u.cond.id, pass)
      u.cond.wave.push(pass ? 1 : 0)
    }
    allDecisions.push(dec)
    if (isTest) results.push({ ...dec, ok, fit: fitOf(dec.plan, dec.ballOf, drawn), hit1: dec.stage1.filter(x => drawnSet.has(x)).length, hitF: dec.final.filter(x => drawnSet.has(x)).length })
  }
  // 更新各條線與紀錄
  if (t >= START) {
    const balls = ballsOf(boardNow)
    const tc = new Array<number>(10).fill(0)
    const yc = new Array<number>(Y_KINDS.length).fill(0)
    for (const x of drawn) {
      tc[x % 10]! += 1
      yc[balls[x]!.rank - 1]! += 1
    }
    tailWave.forEach((w, d) => w.push(tc[d]!))
    yWave.forEach((w, i) => w.push(yc[i]!))
    for (let v = 0; v < VALS; v++) valSeen[v]!.push(drawn.some(x => balls[x]!.slot < SLOTS && balls[x]!.value === v) ? 1 : 0)
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
  if (t >= START) {
    boardNow.slots.forEach((s, i) => { slotCount[i]![s.length]! += 1 })
    boardsSeen++
  }
}
export const next = decide(n)
export { draws, rows, conds, Wave }
export type { Ball, Decision }

// ---- 報告（直接執行這支才寫；被別的腳本 import 時不寫）----
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/blind-test.ts')) {
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
out.push('- 每個條件有一條成立線：這期條件挑出的號碼至少中 1 顆就算成立。')
out.push('- 決定時看成立線現在上升或下降、走了幾次；歷史上同方向走到這麼長還延續的比例 ≥ 一半 → 延續，判多或判少。判少不表示不會開。')
out.push(`- 一篩（v6）：隔期總和 G 的區間（交替＋同狀況歷史 25%～75%）、V 的模式（最近 ${V_RECENT} 期 V 大於 G 的比例比全部歷史高 → V 大於 G，否則 V 小於 G）、V－G 的區間（同 G、同模式歷史 25%～75%）；盤面五顆組合兩樣都符合的，用到的隔期格號碼${COMBO_MIN_SHARE ? `（出現在至少 ${100 * COMBO_MIN_SHARE}% 的組合裡）` : ''}＋少見號碼＝一篩。各一篩條件與值的判斷不進一篩。`)
out.push(`- 值 0～9 每個用自己的組合（${VAL_RULES.map((x, v) => `值${v}：${x.w}／${x.r} ${x.dir === 1 ? '多→不會' : '少→不會'}`).join('、')}）：最近 W 期 vs 最近 R 期出現的百分比，判不會的值，它的隔期格號碼從一篩排除（少見號碼除外）。組合方向是看過 2021 起的結果才定，2021 起對值的判斷不算完全盲。`)
out.push('- 五顆組合推理：只用沒被排除的格，隔期總和大小交替、值總和 < 隔期總和都符合的五顆組合，用到的隔期格號碼納入。')
out.push(`- 二篩：一篩的球照 y=1～5 分五組，每組用尾數條件（T1～T4）的票數收；判會多的 y 收最高 ${Y_TIERS_UP} 層，其他只收最高 1 層。尾數條件一條都沒採用時改成全部投票。`)
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
out.push('## 一篩組合推理：實際開出的五顆符不符合')
out.push('')
out.push('| 項目 | 符合期數 | 比例 |')
out.push('|---|---|---|')
const fitRow = (name: string, f: (r: Result) => boolean): void => { const k = results.filter(f).length; out.push(`| ${name} | ${k} | ${pct(k, m)}% |`) }
fitRow('隔期總和 G 在區間內', r => r.fit.g)
fitRow('V－G 在區間內', r => r.fit.d)
fitRow('兩樣都符合', r => r.fit.g && r.fit.d)
fitRow('判 V 大於 G 的期', r => r.plan.above)
out.push('')
out.push(`平均每期一篩用到 ${(sum(results.map(r => r.plan.comboSlots.length)) / m).toFixed(1)} 個隔期格。`)
out.push('')
out.push('### 值 0～9 判會／不會出現，實際有沒有開出（參考，v6 一篩沒有用）')
out.push('')
out.push('| 值 | 判會出現 | 其中實際開出 | 判不會出現 | 其中實際開出 |')
out.push('|---|---|---|---|---|')
for (let v = 0; v < VALS; v++) {
  const has = (r: Result): boolean => draws[r.t]!.some(x => r.ballOf[x]!.slot < SLOTS && r.ballOf[x]!.value === v)
  const yes = results.filter(r => r.plan.vals[v]!.appear)
  const no = results.filter(r => !r.plan.vals[v]!.appear)
  out.push(`| ${v} | ${yes.length} | ${yes.filter(has).length}（${pct(yes.filter(has).length, yes.length)}%） | ${no.length} | ${no.filter(has).length}（${pct(no.filter(has).length, no.length)}%） |`)
}
out.push('')
out.push('## 少見狀況')
out.push('')
out.push('| 代號 | 狀況 | 出現期數 | 下一期至少開出 1 顆 | 比例 | 挑中顆數／挑出顆數 |')
out.push('|---|---|---|---|---|---|')
for (const id of ['R1', 'R2'] as const) {
  const ev = results.flatMap(r => r.rare.filter(x => x.id === id).map(x => ({ x, actual: new Set(draws[r.t]!) })))
  const hitAny = ev.filter(e => e.x.balls.some(b => e.actual.has(b))).length
  const picked = sum(ev.map(e => e.x.balls.length))
  const hit = sum(ev.map(e => e.x.balls.filter(b => e.actual.has(b)).length))
  out.push(`| ${id} | ${id === 'R1' ? '隔期 > 5 還留 5 顆' : `某格剩的顆數歷史上不到 ${100 * RARE}%`} | ${ev.length} | ${hitAny} | ${pct(hitAny, ev.length)}% | ${hit}／${picked}（${pct(hit, picked)}%） |`)
}
out.push('')
// ---- 一篩名單立柱：同一隔期格的號碼放同一柱（同柱不互碰）----
const ODDS: Record<number, number> = { 2: 70, 3: 800, 4: 12500 }
/** 各柱顆數的 k 階基本對稱多項式＝立柱 k 星碰數 */
const esym = (sizes: number[], k: number): number => {
  const e = new Array<number>(k + 1).fill(0)
  e[0] = 1
  for (const x of sizes) for (let j = k; j >= 1; j--) e[j]! += e[j - 1]! * x
  return e[k]!
}
const columnsOf = (d: Decision): Map<number, number[]> => {
  const g = new Map<number, number[]>()
  for (const x of d.stage1) g.set(d.slotOf[x]!, [...(g.get(d.slotOf[x]!) ?? []), x])
  return g
}
let sameList = 0
let allList = 0
let sameWin = 0
let allWin = 0
const bet = { 連碰: {} as Record<number, { cost: number, win: number, back: number, drawsWon: number }>, 立柱: {} as Record<number, { cost: number, win: number, back: number, drawsWon: number }> }
for (const k of [2, 3, 4]) {
  bet.連碰[k] = { cost: 0, win: 0, back: 0, drawsWon: 0 }
  bet.立柱[k] = { cost: 0, win: 0, back: 0, drawsWon: 0 }
}
let colCount = 0
for (const r of results) {
  const actual = new Set(draws[r.t]!)
  const cols = [...columnsOf(r).values()]
  colCount += cols.length
  const sizes = cols.map(c => c.length)
  const hits = cols.map(c => c.filter(x => actual.has(x)).length)
  const N = r.stage1.length
  const Hn = sum(hits)
  sameList += sum(sizes.map(x => choose(x, 2)))
  allList += choose(N, 2)
  sameWin += sum(hits.map(x => choose(x, 2)))
  allWin += choose(Hn, 2)
  for (const k of [2, 3, 4]) {
    const a = choose(Hn, k)
    const b = esym(hits, k)
    const L = bet.連碰[k]!
    const C = bet.立柱[k]!
    L.cost += choose(N, k); L.win += a; L.back += a * (ODDS[k]! + 1); if (a) L.drawsWon++
    C.cost += esym(sizes, k); C.win += b; C.back += b * (ODDS[k]! + 1); if (b) C.drawsWon++
  }
}
function choose(a: number, b: number): number {
  if (b > a) return 0
  let r = 1
  for (let i = 0; i < b; i++) r = r * (a - i) / (i + 1)
  return r
}
out.push('## 一篩名單立柱（同一隔期格的號碼放同一柱）')
out.push('')
out.push(`- 一篩名單平均 ${(sum(results.map(r => r.stage1.length)) / m).toFixed(1)} 顆，分在平均 ${(colCount / m).toFixed(1)} 柱。`)
out.push(`- 名單裡兩兩一對、同一格的佔 ${pct(sameList, allList)}%（${sameList}／${allList} 對）；開出的獎號兩兩一對、同一格的佔 ${pct(sameWin, allWin)}%（${sameWin}／${allWin} 對）。`)
out.push('')
out.push('| 玩法 | 下法 | 每期平均碰數（每碰 1 元） | 894 期投入 | 中獎碰數 | 有中獎的期 | 有中獎的期比例 | 拿回（含退本金） | 拿回率 |')
out.push('|---|---|---|---|---|---|---|---|---|')
for (const k of [2, 3, 4]) {
  for (const way of ['連碰', '立柱'] as const) {
    const e = bet[way][k]!
    out.push(`| ${k} 星 ${ODDS[k]} 倍 | ${way} | ${(e.cost / m).toFixed(0)} | ${e.cost.toFixed(0)} | ${e.win} | ${e.drawsWon} | ${pct(e.drawsWon, m)}% | ${e.back} | ${pct(e.back, e.cost)}% |`)
  }
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
for (const r of next.rare) out.push(`- ${r.id} 少見：${r.why}（${r.balls.join(' ')}）→ 放進名單`)
const skippedNow = conds.filter(c => !next.used.some(u => u.cond.id === c.id)).map(c => `${c.id} ${c.name}`)
if (skippedNow.length) out.push(`- 這期不適用：${skippedNow.join('、')}`)
out.push(`- 一篩 ${next.stage1.length} 顆：${next.stage1.join(' ')}`)
out.push(`- 二篩 ${next.final.length} 顆：**${next.final.join(' ')}**`)
{
  const cols = [...columnsOf(next).entries()].sort((a, b) => a[0] - b[0])
  const sizes = cols.map(([, c]) => c.length)
  out.push(`- 一篩立柱（${cols.length} 柱）：${cols.map(([slot, c]) => `隔期${slot}［${c.join(' ')}］`).join(' ')}`)
  out.push(`- 碰數：二星 ${esym(sizes, 2)}（連碰 ${choose(next.stage1.length, 2)}）、三星 ${esym(sizes, 3)}（連碰 ${choose(next.stage1.length, 3)}）、四星 ${esym(sizes, 4)}（連碰 ${choose(next.stage1.length, 4)}）`)
}
out.push('')
out.push('## 逐期紀錄')
out.push('')
out.push('採用＝這期有用的條件；不用＝成立線判斷這期不成立而跳過。比對＝開獎後每個適用條件成立 ✓／不成立 ✗（不管有沒有用都比）。命中的號碼加粗。')
out.push('')
out.push('| 期 | 採用 | 不用 | 少見 | 一篩 | 二篩 | 開出 | 比對 | 下一期改了什麼 |')
out.push('|---|---|---|---|---|---|---|---|---|')
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
  out.push(`| ${rows[r.t]![0]} | ${was.join(' ') || '無'} | ${r.used.filter(u => !u.apply).map(u => u.cond.id).join(' ') || '無'} | ${r.rare.map(x => `${x.id} 隔期${x.slot}：${mark(x.balls)}`).join('；') || '無'} | ${mark(r.stage1)}（中 ${r.hit1}） | ${mark(r.final)}（中 ${r.hitF}） | ${draws[r.t]!.join(' ')} | ${r.used.map(u => `${u.cond.id}${r.ok.get(u.cond.id) ? '✓' : '✗'}`).join(' ')} | ${chg} |`)
})
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.slice(0, out.indexOf('## 逐期紀錄')).join('\n'))
}
