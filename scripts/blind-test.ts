/**
 * 使用者的選號策略，從 2024 年第一期起逐期盲測（2026-11-02 使用者）。只照使用者講的步驟，不另加規則：
 *
 *   一篩（隔期、值）：「目前上升中，再對照當前單獨隔期總和波動和值的總和波動，就可以大致抓出最新一期獎號的隔期方向」
 *     → 三條自然波段 A（值總和 ≥ 隔期總和）、G（隔期總和 > 中位）、V（值總和 > 中位）目前的方向；
 *       歷史上三條線方向跟現在一樣的期，下一期 5 顆的隔期、值落在各區的比例，比全部期高的區＝方向（同 gap-direction.ts）。
 *       球的隔期在方向內、值也在方向內，才留下。
 *   二篩（尾數、位置 y）：「從尾數、位置 y 來判斷更進一步的明確獎號名單」，一樣參照過往走勢
 *     → 每個尾數、每種 y（最小／中間／最大／單顆）自己的自然波段目前方向；
 *       歷史上這條線方向跟現在一樣時，下一期這個尾數（這種 y）的球被開出的比例比平常高，就留下。
 *   比對與修正：每期開獎後比對命中，並把這一期加進歷史，下一期的方向就用更新後的歷史重新判斷。
 *
 * 每一期只用「開完上一期為止」的資料；波段方向只用當時已確認的轉折。名單幾顆由篩選結果決定，不固定。
 * 自然波段：事件每期記「實際 − 到目前為止的平均」累加成線，回落／回升滿 H 才算轉折（同 gap-value-waves.ts、gap-direction.ts）。
 *
 * 用法：node --import tsx scripts/blind-test.ts  → docs/blind-test.md（約 10 秒）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import type { HistoryFile } from '../shared/lotto/history-file'
import { BALLS, PICK, firstBoard, nextBoard, type Board } from './lib/container-sim'

const SRC = 'public/data/lotto539-history.json'
const OUT = 'docs/blind-test.md'
const TEST_FROM = '2024-01-01'
const H = 2
const START = 60
const GAP_BINS: [number, number][] = [[0, 0], [1, 1], [2, 3], [4, 6], [7, 10], [11, 15], [16, 25], [26, 59]]
const VAL_BINS: [number, number][] = [[0, 0], [1, 1], [2, 3], [4, 6], [7, 12], [13, 24], [25, Infinity]]
const GAP_NAMES = [...GAP_BINS.map(([a, b]) => (a === b ? `${a}` : `${a}～${b}`)), '60+']
const VAL_NAMES = [...VAL_BINS.map(([a, b]) => (a === b ? `${a}` : `${a}～${b === Infinity ? '' : b}`)), '—']
const Y_NAMES = ['單顆', '最小', '中間', '最大']

const file = JSON.parse(readFileSync(SRC, 'utf8')) as HistoryFile
const rows = file.rows
const draws = rows.map(r => [...r[2]].sort((a, b) => a - b))
const n = draws.length
const testFrom = rows.findIndex(r => r[1] >= TEST_FROM)

/** 線上自然波段：線 = Σ（實際 − 之前的平均）；回落／回升滿 H 才確認轉折 */
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
  push(x: number, t: number): void {
    const mean = this.cnt ? this.sum / this.cnt : x
    this.sum += x
    this.cnt++
    this.c += x - mean
    if (this.c > this.hi) { this.hi = this.c; this.hiAt = t }
    if (this.c < this.lo) { this.lo = this.c; this.loAt = t }
    if (this.dir >= 0 && this.hi - this.c >= H) {
      this.dir = -1
      this.since = this.hiAt
      this.lo = this.c
      this.loAt = t
    } else if (this.dir <= 0 && this.c - this.lo >= H) {
      this.dir = 1
      this.since = this.loAt
      this.hi = this.c
      this.hiAt = t
    }
  }
  label(t: number): string {
    return this.dir === 0 ? '未定' : `${this.dir > 0 ? '上升' : '下降'}${t - this.since}期`
  }
}

/** 到目前為止的中位數（計數陣列，上限 max） */
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
interface BallFeat { gap: number, val: number, tail: number, y: number, slot: number }
function ballFeats(b: Board): BallFeat[] {
  const out: BallFeat[] = new Array(BALLS + 1)
  for (let x = 1; x <= BALLS; x++) out[x] = { gap: GAP_BINS.length, val: VAL_BINS.length, tail: x % 10, y: -1, slot: -1 }
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

// 一篩：三條線狀態 → 下一期隔期、值各區的顆數
const lineA = new Wave()
const lineG = new Wave()
const lineV = new Wave()
const medG = new RunMedian(400)
const medV = new RunMedian(5000)
const stateKey = (): string => `${lineA.dir}${lineG.dir}${lineV.dir}`
const gapByState = new Map<string, number[]>()
const valByState = new Map<string, number[]>()
const gapAll = new Array<number>(GAP_NAMES.length).fill(0)
const valAll = new Array<number>(VAL_NAMES.length).fill(0)
/** 同狀態比例 > 全部比例的區 */
function favored(byState: number[] | undefined, all: number[]): boolean[] {
  const ts = byState ? byState.reduce((a, b) => a + b, 0) : 0
  const ta = all.reduce((a, b) => a + b, 0)
  return all.map((a, i) => ts > 0 && ta > 0 && byState![i]! / ts > a / ta)
}

// 二篩：每個尾數、每種 y 自己的波段；方向 → 下一期這類球被開出的次數／機會
const tailWave = Array.from({ length: 10 }, () => new Wave())
const yWave = Y_NAMES.map(() => new Wave())
const tailStat = new Map<string, [number, number]>()
const yStat = new Map<string, [number, number]>()
const tailBase: [number, number][] = Array.from({ length: 10 }, () => [0, 0])
const yBase: [number, number][] = Y_NAMES.map(() => [0, 0])
const bump = (m: Map<string, [number, number]>, k: string, hit: number): void => {
  const e = m.get(k) ?? [0, 0]
  e[0] += hit
  e[1] += 1
  m.set(k, e)
}
/** 這條線方向跟現在一樣時，這類球下一期被開出的比例 > 這類球平常被開出的比例 */
function keep(stat: Map<string, [number, number]>, base: [number, number], k: string): boolean {
  const e = stat.get(k)
  if (!e || e[1] === 0 || base[1] === 0) return false
  return e[0] / e[1] > base[0] / base[1]
}

interface Decision {
  t: number
  state: string
  gapDir: string[]
  valDir: string[]
  tailDir: string[]
  yDir: string[]
  stage1: number[]
  final: number[]
}
interface Result extends Decision { hit1: number, hitF: number }

function decide(t: number, feats: BallFeat[]): Decision {
  const s = stateKey()
  const gk = favored(gapByState.get(s), gapAll)
  const vk = favored(valByState.get(s), valAll)
  const tk = tailWave.map((w, d) => keep(tailStat, tailBase[d]!, `${d}|${w.dir}`))
  const yk = yWave.map((w, c) => keep(yStat, yBase[c]!, `${c}|${w.dir}`))
  const all = Array.from({ length: BALLS }, (_, i) => i + 1)
  const stage1 = all.filter(x => gk[feats[x]!.gap] && vk[feats[x]!.val])
  const final = stage1.filter(x => tk[feats[x]!.tail] && feats[x]!.y >= 0 && yk[feats[x]!.y])
  return {
    t,
    state: `A${lineA.label(t - 1)} G${lineG.label(t - 1)} V${lineV.label(t - 1)}`,
    gapDir: GAP_NAMES.filter((_, i) => gk[i]),
    valDir: VAL_NAMES.filter((_, i) => vk[i]),
    tailDir: tk.map((k, d) => (k ? `${d}` : '')).filter(Boolean),
    yDir: Y_NAMES.filter((_, i) => yk[i]),
    stage1,
    final
  }
}

const results: Result[] = []
let board: Board = firstBoard(draws[0]!)
for (let t = 1; t < n; t++) {
  const feats = ballFeats(board)
  if (t >= testFrom) {
    const d = decide(t, feats)
    const actual = new Set(draws[t]!)
    results.push({ ...d, hit1: d.stage1.filter(x => actual.has(x)).length, hitF: d.final.filter(x => actual.has(x)).length })
  }
  // 開獎後：把這期加進歷史（下一期就用更新後的歷史判斷）
  if (t >= START) {
    const drawn = draws[t]!
    const s = stateKey()
    const gs = gapByState.get(s) ?? new Array<number>(GAP_NAMES.length).fill(0)
    const vs = valByState.get(s) ?? new Array<number>(VAL_NAMES.length).fill(0)
    for (const x of drawn) {
      gs[feats[x]!.gap]! += 1
      vs[feats[x]!.val]! += 1
      gapAll[feats[x]!.gap]! += 1
      valAll[feats[x]!.val]! += 1
    }
    gapByState.set(s, gs)
    valByState.set(s, vs)
    const drawnSet = new Set(drawn)
    for (let x = 1; x <= BALLS; x++) {
      const hit = drawnSet.has(x) ? 1 : 0
      const f = feats[x]!
      bump(tailStat, `${f.tail}|${tailWave[f.tail]!.dir}`, hit)
      tailBase[f.tail]![0] += hit
      tailBase[f.tail]![1] += 1
      if (f.y >= 0) {
        bump(yStat, `${f.y}|${yWave[f.y]!.dir}`, hit)
        yBase[f.y]![0] += hit
        yBase[f.y]![1] += 1
      }
    }
    const tc = new Array<number>(10).fill(0)
    const yc = new Array<number>(Y_NAMES.length).fill(0)
    for (const x of drawn) {
      tc[feats[x]!.tail]! += 1
      if (feats[x]!.y >= 0) yc[feats[x]!.y]! += 1
    }
    tailWave.forEach((w, d) => w.push(tc[d]!, t))
    yWave.forEach((w, c) => w.push(yc[c]!, t))
    if (drawn.every(x => feats[x]!.slot >= 0)) {
      const G = drawn.reduce((a, x) => a + feats[x]!.slot, 0)
      const V = drawn.reduce((a, x) => a + board.values[feats[x]!.slot]!, 0)
      lineA.push(V >= G ? 1 : 0, t)
      lineG.push(G > medG.get() ? 1 : 0, t)
      lineV.push(V > medV.get() ? 1 : 0, t)
      medG.add(G)
      medV.add(V)
    }
  }
  board = nextBoard(board, draws[t]!)
}
const next = decide(n, ballFeats(board))

// ---- 統計：名單顆數每期不同，期望與變異逐期加總 ----
const choose = (a: number, b: number): number => {
  let r = 1
  for (let i = 0; i < b; i++) r = r * (a - i) / (i + 1)
  return r
}
const hyper = (k: number, h: number): number => (h > k ? 0 : choose(PICK, h) * choose(BALLS - PICK, k - h) / choose(BALLS, k))
const momentsOf = (k: number): [number, number] => {
  const mean = k * PICK / BALLS
  return [mean, Array.from({ length: PICK + 1 }, (_, h) => hyper(k, h) * (h - mean) ** 2).reduce((a, b) => a + b, 0)]
}
function erfc(x: number): number {
  const t = 1 / (1 + 0.5 * Math.abs(x))
  const y = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
    t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))))
  return x >= 0 ? y : 2 - y
}
const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0)
function score(rs: Result[], size: (r: Result) => number, hit: (r: Result) => number): { k: number, hits: number, exp: number, z: number, p: number } {
  let e = 0
  let v = 0
  for (const r of rs) {
    const [m1, v1] = momentsOf(size(r))
    e += m1
    v += v1
  }
  const hits = sum(rs.map(hit))
  const z = v > 0 ? (hits - e) / Math.sqrt(v) : 0
  return { k: sum(rs.map(size)), hits, exp: e, z, p: 0.5 * erfc(z / Math.SQRT2) }
}
const m = results.length
const s1 = score(results, r => r.stage1.length, r => r.hit1)
const sF = score(results, r => r.final.length, r => r.hitF)
const expF2 = sum(results.map(r => (r.stage1.length ? r.hit1 * r.final.length / r.stage1.length : 0)))
const pct = (a: number, b: number): string => (b ? (100 * a / b).toFixed(1) : '—')

const out: string[] = []
out.push('# 選號策略盲測：2024 年起逐期')
out.push('')
out.push(`> 由 \`scripts/blind-test.ts\` 產生。資料到第 ${rows[n - 1]![0]} 期（${rows[n - 1]![1]}）。盲測 ${m} 期：${rows[testFrom]![0]}（${rows[testFrom]![1]}）～${rows[n - 1]![0]}。`)
out.push('> 每期只用開完上一期為止的資料做決定，決定後才比對開獎，再把這期加進歷史。名單幾顆由篩選結果決定。')
out.push('')
out.push('## 步驟（照使用者的話）')
out.push('')
out.push('1. 一篩：A 線（值總和 ≥ 隔期總和）、G 線（隔期總和）、V 線（值總和）目前的波段方向；歷史上三條線方向一樣的期，下一期隔期、值落在哪些區比平常多 → 隔期方向、值方向。隔期和值都在方向內的球留下。')
out.push('2. 二篩：每個尾數、每種 y 自己的波段方向；歷史上方向一樣時，下一期這類球比平常多開 → 留下。')
out.push('3. 開獎後比對，把這期加進歷史，下一期重新判斷。')
out.push('')
out.push('## 命中')
out.push('')
out.push('| 名單 | 平均每期顆數 | 命中 | 同樣顆數隨便挑的期望 | 命中率（命中／名單顆數） | 隨便挑命中率 | z | 比隨便挑多的 p（單尾） |')
out.push('|---|---|---|---|---|---|---|---|')
out.push(`| 一篩（隔期、值） | ${(s1.k / m).toFixed(1)} | ${s1.hits} | ${s1.exp.toFixed(1)} | ${pct(s1.hits, s1.k)}% | ${pct(PICK, BALLS)}% | ${s1.z.toFixed(2)} | ${s1.p.toFixed(3)} |`)
out.push(`| 二篩（尾數、y） | ${(sF.k / m).toFixed(1)} | ${sF.hits} | ${sF.exp.toFixed(1)} | ${pct(sF.hits, sF.k)}% | ${pct(PICK, BALLS)}% | ${sF.z.toFixed(2)} | ${sF.p.toFixed(3)} |`)
out.push('')
out.push(`二篩自己的貢獻：一篩命中的球，照二篩留下的比例隨便留，平均會留下 ${expF2.toFixed(1)} 顆；二篩實際留下 ${sF.hits} 顆。`)
out.push(`一篩名單是空的：${results.filter(r => r.stage1.length === 0).length} 期；二篩名單是空的：${results.filter(r => r.final.length === 0).length} 期。`)
out.push('')
out.push('### 每期命中幾顆')
out.push('')
out.push('| 命中 | 一篩期數 | 二篩期數 |')
out.push('|---|---|---|')
for (let h = 0; h <= PICK; h++) out.push(`| ${h} | ${results.filter(r => r.hit1 === h).length} | ${results.filter(r => r.hitF === h).length} |`)
out.push('')
out.push('### 名單顆數分佈（二篩）')
out.push('')
const sizes = [...new Set(results.map(r => r.final.length))].sort((a, b) => a - b)
out.push('| 顆數 | 期數 | 命中 | 期望 |')
out.push('|---|---|---|---|')
for (const k of sizes) {
  const rs = results.filter(r => r.final.length === k)
  out.push(`| ${k} | ${rs.length} | ${sum(rs.map(r => r.hitF))} | ${(rs.length * k * PICK / BALLS).toFixed(1)} |`)
}
out.push('')
out.push('## 各年')
out.push('')
out.push('| 年 | 期數 | 一篩平均顆數 | 一篩命中／期望 | 二篩平均顆數 | 二篩命中／期望 |')
out.push('|---|---|---|---|---|---|')
for (const y of [...new Set(results.map(r => rows[r.t]![1].slice(0, 4)))]) {
  const rs = results.filter(r => rows[r.t]![1].startsWith(y))
  const a = score(rs, r => r.stage1.length, r => r.hit1)
  const b = score(rs, r => r.final.length, r => r.hitF)
  out.push(`| ${y} | ${rs.length} | ${(a.k / rs.length).toFixed(1)} | ${a.hits}／${a.exp.toFixed(1)} | ${(b.k / rs.length).toFixed(1)} | ${b.hits}／${b.exp.toFixed(1)} |`)
}
out.push('')
out.push('## 下一期的決定（還沒開）')
out.push('')
out.push(`- 開完 ${rows[n - 1]![0]}（${rows[n - 1]![1]}）後：${next.state}`)
out.push(`- 隔期方向：${next.gapDir.join('、') || '無'}；值方向：${next.valDir.join('、') || '無'}`)
out.push(`- 尾數留：${next.tailDir.join('、') || '無'}；y 留：${next.yDir.join('、') || '無'}`)
out.push(`- 一篩 ${next.stage1.length} 顆：${next.stage1.join(' ') || '無'}`)
out.push(`- 二篩 ${next.final.length} 顆：**${next.final.join(' ') || '無'}**`)
out.push('')
out.push('## 逐期紀錄')
out.push('')
out.push('命中的號碼加粗。')
out.push('')
out.push('| 期 | 開完上一期的三條線 | 隔期方向 | 值方向 | 尾數留 | y 留 | 一篩 | 二篩 | 開出 | 一篩中 | 二篩中 |')
out.push('|---|---|---|---|---|---|---|---|---|---|---|')
for (const r of results) {
  const actual = new Set(draws[r.t]!)
  const mark = (a: number[]): string => a.map(x => (actual.has(x) ? `**${x}**` : `${x}`)).join(' ') || '無'
  out.push(`| ${rows[r.t]![0]} | ${r.state} | ${r.gapDir.join('、')} | ${r.valDir.join('、')} | ${r.tailDir.join('、')} | ${r.yDir.join('、')} | ${mark(r.stage1)} | ${mark(r.final)} | ${draws[r.t]!.join(' ')} | ${r.hit1}/${r.stage1.length} | ${r.hitF}/${r.final.length} |`)
}
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.slice(0, out.indexOf('## 逐期紀錄')).join('\n'))
