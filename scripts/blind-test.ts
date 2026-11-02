/**
 * 使用者的完整選號策略，從 2024 年第一期起逐期盲測（2026-11-02 使用者）。
 *
 * 每一期只用「開完上一期為止」的資料做決定，決定完才看開獎、比對、修正，再做下一期：
 *   一篩（隔期＋值）：三條自然波段 A（值總和 ≥ 隔期總和）、G（隔期總和 > 中位）、V（值總和 > 中位）的目前方向，
 *     加上每個隔期區間、值區間自己的波段方向與走了多久，查歷史上同樣狀態時「這一區的球下一期被開出」的比例，
 *     比平常高的加分、低的扣分，選出分數最高的 STAGE1 顆。
 *   二篩（尾數＋位置 y）：每個尾數、每種 y（最小／最大／中間／單顆）自己的波段方向與走了多久，同樣查歷史比例，
 *     在一篩的球裡選分數最高的 FINAL 顆。
 *   修正：開獎後，每一類（隔期、值、尾數、y）各記一筆「這一類的判斷比平常好還是差」（對數得分，越近的越重），
 *     一直判得比平常差的那類權重降到 0、判得好的權重提高；歷史比例也把這期加進去。
 * 自然波段：事件每期記「實際 − 到目前為止的平均」累加成線，回落／回升滿 H 才算轉折（同 gap-value-waves.ts）。
 * 參數在跑之前定好、不調：H=2、STAGE1=15、FINAL=8、平滑 ALPHA=50、權重半衰期 HALF_LIFE=150 期。
 *
 * 用法：node --import tsx scripts/blind-test.ts  → docs/blind-test.md
 */
import { readFileSync, writeFileSync } from 'node:fs'
import type { HistoryFile } from '../shared/lotto/history-file'
import { BALLS, PICK, SLOTS, firstBoard, nextBoard, type Board } from './lib/container-sim'

const SRC = 'public/data/lotto539-history.json'
const OUT = 'docs/blind-test.md'
const TEST_FROM = '2024-01-01'
const H = 2
const STAGE1 = 15
const FINAL = 8
const ALPHA = 50
const HALF_LIFE = 150
const DECAY = 0.5 ** (1 / HALF_LIFE)
const BASE = PICK / BALLS
const START = SLOTS
const GAP_BINS: [number, number][] = [[0, 0], [1, 1], [2, 3], [4, 6], [7, 10], [11, 15], [16, 25], [26, 59]]
const VAL_BINS: [number, number][] = [[0, 0], [1, 1], [2, 3], [4, 6], [7, 12], [13, 24], [25, Infinity]]
const Y_NAMES = ['單顆', '最小', '中間', '最大']

const file = JSON.parse(readFileSync(SRC, 'utf8')) as HistoryFile
const rows = file.rows
const draws = rows.map(r => [...r[2]].sort((a, b) => a - b))
const n = draws.length
const testFrom = rows.findIndex(r => r[1] >= TEST_FROM)

/** 線上自然波段：每期丟進「實際值」，線 = Σ（實際 − 之前的平均）；回落／回升滿 H 才確認轉折 */
class Wave {
  private sum = 0
  private cnt = 0
  private c = 0
  private hi = 0
  private hiAt = 0
  private lo = 0
  private loAt = 0
  dir = 0
  since = 0
  private done: Record<string, number[]> = { up: [], down: [] }
  push(x: number, t: number): void {
    const mean = this.cnt ? this.sum / this.cnt : x
    this.sum += x
    this.cnt++
    this.c += x - mean
    if (this.c > this.hi) { this.hi = this.c; this.hiAt = t }
    if (this.c < this.lo) { this.lo = this.c; this.loAt = t }
    if (this.dir >= 0 && this.hi - this.c >= H) {
      if (this.dir > 0) this.done.up!.push(this.hiAt - this.since)
      this.dir = -1
      this.since = this.hiAt
      this.lo = this.c
      this.loAt = t
    } else if (this.dir <= 0 && this.c - this.lo >= H) {
      if (this.dir < 0) this.done.down!.push(this.loAt - this.since)
      this.dir = 1
      this.since = this.loAt
      this.hi = this.c
      this.hiAt = t
    }
  }
  /** 方向＋走了多久（比同方向過去波段的中位短＝前半、長＝後半） */
  key(t: number): string {
    if (this.dir === 0) return '0'
    const past = this.done[this.dir > 0 ? 'up' : 'down']!
    const med = past.length ? [...past].sort((a, b) => a - b)[past.length >> 1]! : Infinity
    return `${this.dir > 0 ? '升' : '降'}${t - this.since < med ? '前' : '後'}`
  }
  label(t: number): string {
    return this.dir === 0 ? '未定' : `${this.dir > 0 ? '上升' : '下降'}${t - this.since}期`
  }
}

/** 中位數：值可能很大，用計數陣列（上限 MAXV） */
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

type Fam = 'gap' | 'val' | 'tail' | 'y'
const FAMS: Fam[] = ['gap', 'val', 'tail', 'y']
const FAM_NAME: Record<Fam, string> = { gap: '隔期', val: '值', tail: '尾數', y: '位置y' }
const CATS: Record<Fam, string[]> = {
  gap: [...GAP_BINS.map(([a, b]) => (a === b ? `${a}` : `${a}～${b}`)), '60+'],
  val: [...VAL_BINS.map(([a, b]) => (a === b ? `${a}` : `${a}～${b === Infinity ? '' : b}`)), '—'],
  tail: Array.from({ length: 10 }, (_, d) => `${d}`),
  y: Y_NAMES
}
const binOf = (bins: [number, number][], x: number): number => bins.findIndex(([a, b]) => x >= a && x <= b)

interface BallFeat { gap: number, val: number, tail: number, y: number, slot: number }
function ballFeats(b: Board): BallFeat[] {
  const out: BallFeat[] = new Array(BALLS + 1)
  for (let x = 1; x <= BALLS; x++) out[x] = { gap: GAP_BINS.length, val: VAL_BINS.length, tail: x % 10, y: 0, slot: -1 }
  b.slots.forEach((s, i) => s.forEach((x, k) => {
    out[x] = {
      gap: binOf(GAP_BINS, i),
      val: binOf(VAL_BINS, b.values[i]!),
      tail: x % 10,
      y: s.length === 1 ? 0 : k === 0 ? 1 : k === s.length - 1 ? 3 : 2,
      slot: i
    }
  }))
  return out
}

// 歷史比例：每類每格，三層（只看自己方向 → 加走了多久 → 再加 A/G/V 狀態）
const stats = new Map<string, [number, number]>()
const bump = (k: string, hit: number): void => {
  const e = stats.get(k) ?? [0, 0]
  e[0] += hit
  e[1] += 1
  stats.set(k, e)
}
function rate(f: Fam, c: number, own: string, s: string): number {
  const get = (k: string): [number, number] => stats.get(k) ?? [0, 0]
  const [h1, o1] = get(`${f}|${c}|${own[0]}`)
  const r1 = (h1 + ALPHA * BASE) / (o1 + ALPHA)
  const [h2, o2] = get(`${f}|${c}|${own}`)
  const r2 = (h2 + ALPHA * r1) / (o2 + ALPHA)
  if (f === 'tail' || f === 'y') return r2
  const [h3, o3] = get(`${f}|${c}|${own}|${s}`)
  return (h3 + ALPHA * r2) / (o3 + ALPHA)
}

// 狀態
const lineA = new Wave()
const lineG = new Wave()
const lineV = new Wave()
const medG = new RunMedian(400)
const medV = new RunMedian(5000)
const catWave: Record<Fam, Wave[]> = {
  gap: CATS.gap.map(() => new Wave()),
  val: CATS.val.map(() => new Wave()),
  tail: CATS.tail.map(() => new Wave()),
  y: CATS.y.map(() => new Wave())
}
const gain: Record<Fam, number> = { gap: 0, val: 0, tail: 0, y: 0 }
const weights = (): Record<Fam, number> => {
  const w = Object.fromEntries(FAMS.map(f => [f, Math.max(0, gain[f])])) as Record<Fam, number>
  const tot = FAMS.reduce((s, f) => s + w[f], 0)
  if (tot === 0) return { gap: 1, val: 1, tail: 1, y: 1 }
  return Object.fromEntries(FAMS.map(f => [f, w[f] * 4 / tot])) as Record<Fam, number>
}

interface Pick {
  t: number
  stateLabel: string
  w: Record<Fam, number>
  favored: string
  stage1: number[]
  final: number[]
  hit1: number
  hitF: number
  /** 只用單一類排名取前 FINAL 顆的命中 */
  solo: Record<Fam, number>
}
const picks: Pick[] = []

let board: Board = firstBoard(draws[0]!)
for (let t = 1; t < n; t++) {
  const feats = ballFeats(board)
  const s = `${lineA.key(t - 1)[0]}${lineG.key(t - 1)[0]}${lineV.key(t - 1)[0]}`
  const ownKey = (f: Fam, c: number): string => catWave[f][c]!.key(t - 1)
  // 每顆球各類的對數加分
  const logLift = (x: number, f: Fam): number => {
    const c = feats[x]![f]
    return Math.log(rate(f, c, ownKey(f, c), s) / BASE)
  }

  if (t >= testFrom) {
    const w = weights()
    const all = Array.from({ length: BALLS }, (_, i) => i + 1)
    const s1 = (x: number): number => w.gap * logLift(x, 'gap') + w.val * logLift(x, 'val')
    const s2 = (x: number): number => w.tail * logLift(x, 'tail') + w.y * logLift(x, 'y')
    const stage1 = [...all].sort((a, b) => s1(b) - s1(a) || a - b).slice(0, STAGE1)
    const final = [...stage1].sort((a, b) => s2(b) - s2(a) || s1(b) - s1(a) || a - b).slice(0, FINAL).sort((a, b) => a - b)
    const actual = new Set(draws[t]!)
    // 記下這期判斷偏多的區間（一篩兩類、二篩兩類，各取加分最高的一格）
    const top = (f: Fam): string => {
      let best = -Infinity
      let at = 0
      CATS[f].forEach((_, c) => {
        const v = Math.log(rate(f, c, ownKey(f, c), s) / BASE)
        if (v > best) { best = v; at = c }
      })
      return `${FAM_NAME[f]}${CATS[f][at]}(${best >= 0 ? '+' : ''}${(100 * (Math.exp(best) - 1)).toFixed(0)}%)`
    }
    picks.push({
      t,
      stateLabel: `A${lineA.label(t - 1)} G${lineG.label(t - 1)} V${lineV.label(t - 1)}`,
      w,
      favored: FAMS.map(top).join(' '),
      stage1: [...stage1].sort((a, b) => a - b),
      final,
      hit1: stage1.filter(x => actual.has(x)).length,
      hitF: final.filter(x => actual.has(x)).length,
      solo: Object.fromEntries(FAMS.map(f => [f, [...all].sort((a, b) => logLift(b, f) - logLift(a, f) || a - b).slice(0, FINAL).filter(x => actual.has(x)).length])) as Record<Fam, number>
    })
  }

  // 開獎後：每類判斷得分（修正權重用）、歷史比例、各條波段
  const drawn = new Set(draws[t]!)
  if (t > START) {
    for (const f of FAMS) {
      let g = 0
      let norm = 0
      const p: number[] = []
      for (let x = 1; x <= BALLS; x++) {
        const c = feats[x]![f]
        p[x] = rate(f, c, ownKey(f, c), s)
        norm += p[x]!
      }
      for (let x = 1; x <= BALLS; x++) {
        const q = Math.min(0.99, p[x]! * PICK / norm)
        g += drawn.has(x) ? Math.log(q / BASE) : Math.log((1 - q) / (1 - BASE))
      }
      gain[f] = gain[f] * DECAY + g
    }
  }
  if (t >= START) {
    for (let x = 1; x <= BALLS; x++) {
      const hit = drawn.has(x) ? 1 : 0
      for (const f of FAMS) {
        const c = feats[x]![f]
        const own = ownKey(f, c)
        bump(`${f}|${c}|${own[0]}`, hit)
        bump(`${f}|${c}|${own}`, hit)
        bump(`${f}|${c}|${own}|${s}`, hit)
      }
    }
    for (const f of FAMS) {
      const cnt = new Array<number>(CATS[f].length).fill(0)
      for (const x of draws[t]!) cnt[feats[x]![f]]! += 1
      catWave[f].forEach((wv, c) => wv.push(cnt[c]!, t))
    }
    const onBoard = draws[t]!.every(x => feats[x]!.slot >= 0)
    if (onBoard) {
      const G = draws[t]!.reduce((a, x) => a + feats[x]!.slot, 0)
      const V = draws[t]!.reduce((a, x) => a + board.values[feats[x]!.slot]!, 0)
      lineA.push(V >= G ? 1 : 0, t)
      const mg = medG.get()
      const mv = medV.get()
      lineG.push(G > mg ? 1 : 0, t)
      lineV.push(V > mv ? 1 : 0, t)
      medG.add(G)
      medV.add(V)
    }
  }
  board = nextBoard(board, draws[t]!)
}

// 下一期（還沒開）的決定
const nextPick = ((): Omit<Pick, 'hit1' | 'hitF' | 'solo'> => {
  const t = n
  const feats = ballFeats(board)
  const s = `${lineA.key(t - 1)[0]}${lineG.key(t - 1)[0]}${lineV.key(t - 1)[0]}`
  const ownKey = (f: Fam, c: number): string => catWave[f][c]!.key(t - 1)
  const logLift = (x: number, f: Fam): number => Math.log(rate(f, feats[x]![f], ownKey(f, feats[x]![f]), s) / BASE)
  const w = weights()
  const all = Array.from({ length: BALLS }, (_, i) => i + 1)
  const s1 = (x: number): number => w.gap * logLift(x, 'gap') + w.val * logLift(x, 'val')
  const s2 = (x: number): number => w.tail * logLift(x, 'tail') + w.y * logLift(x, 'y')
  const stage1 = [...all].sort((a, b) => s1(b) - s1(a) || a - b).slice(0, STAGE1)
  const final = [...stage1].sort((a, b) => s2(b) - s2(a) || s1(b) - s1(a) || a - b).slice(0, FINAL).sort((a, b) => a - b)
  const top = (f: Fam): string => CATS[f].map((name, c) => ({ name, v: rate(f, c, ownKey(f, c), s) / BASE - 1 }))
    .sort((a, b) => b.v - a.v).slice(0, 3).map(e => `${e.name}(${e.v >= 0 ? '+' : ''}${(100 * e.v).toFixed(0)}%)`).join('、')
  return {
    t,
    stateLabel: `A${lineA.label(t - 1)} G${lineG.label(t - 1)} V${lineV.label(t - 1)}`,
    w,
    favored: FAMS.map(f => `${FAM_NAME[f]}：${top(f)}`).join('；'),
    stage1: [...stage1].sort((a, b) => a - b),
    final
  }
})()

// ---- 統計 ----
const choose = (a: number, b: number): number => {
  let r = 1
  for (let i = 0; i < b; i++) r = r * (a - i) / (i + 1)
  return r
}
/** 從 39 顆挑 k 顆、開 5 顆，命中 h 顆的機率 */
const hyper = (k: number, h: number): number => choose(PICK, h) * choose(BALLS - PICK, k - h) / choose(BALLS, k)
const m = picks.length
const lines: string[] = []
const zOf = (hits: number, k: number): { exp: number, z: number, p: number } => {
  const mean = k * PICK / BALLS
  const v = Array.from({ length: PICK + 1 }, (_, h) => hyper(k, h) * (h - mean) ** 2).reduce((a, b) => a + b, 0)
  const z = (hits - m * mean) / Math.sqrt(m * v)
  // 單尾：命中比隨便挑還多的機率
  const p = 0.5 * erfc(z / Math.SQRT2)
  return { exp: m * mean, z, p }
}
function erfc(x: number): number {
  const t = 1 / (1 + 0.5 * Math.abs(x))
  const y = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
    t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))))
  return x >= 0 ? y : 2 - y
}
const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0)
const h1 = sum(picks.map(p => p.hit1))
const hF = sum(picks.map(p => p.hitF))
const z1 = zOf(h1, STAGE1)
const zF = zOf(hF, FINAL)
// 二篩有沒有幫上忙：一篩 15 顆裡命中的，隨便留 8 顆平均留下 8/15
const expF2 = sum(picks.map(p => p.hit1 * FINAL / STAGE1))
const twoStar = (h: number): number => choose(h, 2)
const threeStar = (h: number): number => choose(h, 3)
const cost2 = choose(FINAL, 2)
const cost3 = choose(FINAL, 3)
const back2 = sum(picks.map(p => twoStar(p.hitF) * 71))
const back3 = sum(picks.map(p => threeStar(p.hitF) * 801))

lines.push('# 完整策略盲測：2024 年起逐期')
lines.push('')
lines.push(`> 由 \`scripts/blind-test.ts\` 產生。資料到第 ${rows[n - 1]![0]} 期（${rows[n - 1]![1]}）。盲測 ${m} 期：${rows[testFrom]![0]}（${rows[testFrom]![1]}）～${rows[n - 1]![0]}。`)
lines.push('> 每期只用開完上一期為止的資料做決定，決定後才比對開獎、再修正。參數跑之前定好、沒有調：')
lines.push(`> 波段轉折滿 ${H}、一篩留 ${STAGE1} 顆、二篩留 ${FINAL} 顆、歷史比例平滑 ${ALPHA}、修正權重半衰期 ${HALF_LIFE} 期。`)
lines.push('')
lines.push('## 命中')
lines.push('')
lines.push('| 名單 | 每期顆數 | 實際命中 | 隨便挑的期望 | 每期平均 | z | 比隨便挑多的 p（單尾） |')
lines.push('|---|---|---|---|---|---|---|')
lines.push(`| 一篩（隔期＋值） | ${STAGE1} | ${h1} | ${z1.exp.toFixed(1)} | ${(h1 / m).toFixed(3)} vs ${(STAGE1 * PICK / BALLS).toFixed(3)} | ${z1.z.toFixed(2)} | ${z1.p.toFixed(3)} |`)
lines.push(`| 二篩（＋尾數、y） | ${FINAL} | ${hF} | ${zF.exp.toFixed(1)} | ${(hF / m).toFixed(3)} vs ${(FINAL * PICK / BALLS).toFixed(3)} | ${zF.z.toFixed(2)} | ${zF.p.toFixed(3)} |`)
lines.push('')
lines.push(`二篩自己的貢獻：一篩命中的球裡，隨便留 ${FINAL}/${STAGE1} 平均會留下 ${expF2.toFixed(1)} 顆，二篩實際留下 ${hF} 顆。`)
lines.push('')
lines.push('### 每期命中幾顆')
lines.push('')
lines.push(`| 命中 | 一篩 ${STAGE1} 顆：期數 | 隨便挑期望 | 二篩 ${FINAL} 顆：期數 | 隨便挑期望 |`)
lines.push('|---|---|---|---|---|')
for (let h = 0; h <= PICK; h++) {
  lines.push(`| ${h} | ${picks.filter(p => p.hit1 === h).length} | ${(m * hyper(STAGE1, h)).toFixed(1)} | ${picks.filter(p => p.hitF === h).length} | ${(m * hyper(FINAL, h)).toFixed(1)} |`)
}
lines.push('')
lines.push(`### 拿二篩 ${FINAL} 顆連碰（每碰 1 元、中獎另退本金）`)
lines.push('')
lines.push('| 玩法 | 每期碰數 | 投入 | 拿回 | 拿回率 | 隨便挑的期望拿回率 |')
lines.push('|---|---|---|---|---|---|')
lines.push(`| 二星 70 倍 | ${cost2} | ${cost2 * m} | ${back2} | ${(100 * back2 / (cost2 * m)).toFixed(1)}% | ${(100 * choose(PICK, 2) / choose(BALLS, 2) * 71).toFixed(1)}% |`)
lines.push(`| 三星 800 倍 | ${cost3} | ${cost3 * m} | ${back3} | ${(100 * back3 / (cost3 * m)).toFixed(1)}% | ${(100 * choose(PICK, 3) / choose(BALLS, 3) * 801).toFixed(1)}% |`)
lines.push('')
lines.push(`### 只用單一類排名、取前 ${FINAL} 顆（看哪一類拖累或幫忙）`)
lines.push('')
lines.push(`| 類 | 命中 | 隨便挑期望 | z | 盲測結束時的累積得分（>0 才比平常準） |`)
lines.push('|---|---|---|---|---|')
for (const f of FAMS) {
  const hs = sum(picks.map(p => p.solo[f]))
  const zz = zOf(hs, FINAL)
  lines.push(`| ${FAM_NAME[f]} | ${hs} | ${zz.exp.toFixed(1)} | ${zz.z.toFixed(2)} | ${gain[f].toFixed(2)} |`)
}
lines.push('')
lines.push('## 各年')
lines.push('')
lines.push(`| 年 | 期數 | 一篩平均命中（期望 ${(STAGE1 * PICK / BALLS).toFixed(2)}） | 二篩平均命中（期望 ${(FINAL * PICK / BALLS).toFixed(2)}） | 二篩 ≥2 顆的期 |`)
lines.push('|---|---|---|---|---|')
for (const y of [...new Set(picks.map(p => rows[p.t]![1].slice(0, 4)))]) {
  const ps = picks.filter(p => rows[p.t]![1].startsWith(y))
  lines.push(`| ${y} | ${ps.length} | ${(sum(ps.map(p => p.hit1)) / ps.length).toFixed(2)} | ${(sum(ps.map(p => p.hitF)) / ps.length).toFixed(2)} | ${ps.filter(p => p.hitF >= 2).length}（期望 ${(ps.length * sum([2, 3, 4, 5].map(h => hyper(FINAL, h)))).toFixed(1)}） |`)
}
lines.push('')
lines.push('## 修正：四類權重怎麼變（每季第一期）')
lines.push('')
lines.push('權重 4 類加起來 = 4；某類一直判得比平常差就降到 0。')
lines.push('')
lines.push('| 期 | 隔期 | 值 | 尾數 | 位置y |')
lines.push('|---|---|---|---|---|')
let lastQ = ''
for (const p of picks) {
  const d = rows[p.t]![1]
  const qk = `${d.slice(0, 4)}Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}`
  if (qk === lastQ) continue
  lastQ = qk
  lines.push(`| ${qk} ${rows[p.t]![0]} | ${FAMS.map(f => p.w[f].toFixed(2)).join(' | ')} |`)
}
lines.push('')
lines.push('## 下一期的決定（還沒開）')
lines.push('')
lines.push(`- 開完 ${rows[n - 1]![0]}（${rows[n - 1]![1]}）後：${nextPick.stateLabel}`)
lines.push(`- 權重：${FAMS.map(f => `${FAM_NAME[f]} ${nextPick.w[f].toFixed(2)}`).join('、')}`)
lines.push(`- 各類最偏多的三格（歷史上同狀態時，比平常多開的比例）：${nextPick.favored}`)
lines.push(`- 一篩 ${STAGE1} 顆：${nextPick.stage1.join(' ')}`)
lines.push(`- 二篩 ${FINAL} 顆：**${nextPick.final.join(' ')}**`)
lines.push('')
lines.push('## 逐期紀錄')
lines.push('')
lines.push('偏多＝四類各自加分最高的一格（括號是歷史上同狀態時比平常多開的比例）。命中的號碼加粗。')
lines.push('')
lines.push('| 期 | 開完上一期的波段 | 偏多 | 一篩 | 二篩 | 開出 | 一篩中 | 二篩中 |')
lines.push('|---|---|---|---|---|---|---|---|')
for (const p of picks) {
  const actual = new Set(draws[p.t]!)
  const mark = (a: number[]): string => a.map(x => (actual.has(x) ? `**${x}**` : `${x}`)).join(' ')
  lines.push(`| ${rows[p.t]![0]} | ${p.stateLabel} | ${p.favored} | ${mark(p.stage1)} | ${mark(p.final)} | ${draws[p.t]!.join(' ')} | ${p.hit1} | ${p.hitF} |`)
}
writeFileSync(OUT, lines.join('\n') + '\n')
console.log(lines.slice(0, 60).join('\n'))
