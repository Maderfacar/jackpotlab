/**
 * 隔期／值／位置的出現規律：只用真實資料，前段找、後段驗（2026-10-31 使用者）。
 *
 * 單位是「容器」：開完第 t 期後盤面上每一格非空的容器，看它在第 t+1 期有沒有被打中（開出至少一顆），
 * 打中的話開出的那顆是不是邊緣（y=1 或 y=x）、是不是 y=1。
 * 條件只用容器角度：隔期 g、值 v（那格位置連續幾期沒打中）、剩幾顆 x、容器自己幾期沒被打中（齡）、
 * 「連續幾期沒開出這個值」。不看號碼。
 *
 * 基準也只用真實資料：同一段時間裡、同樣 x 的容器平常被打中的比例（邊緣、y=1 也是同 x 平常的比例）。
 * 前段（FIND）把每個條件跟基準比，取最偏的；後段（CHECK）原封不動再算一次，看方向跟大小還在不在。
 *
 * 用法：node --import tsx scripts/container-rules.ts
 * 輸出：docs/container-rules.md
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { computeFeatures } from '../shared/lotto/patterns/features'
import type { HistoryFile } from '../shared/lotto/history-file'
import { SLOTS, firstBoard, nextBoard } from './lib/container-sim'
import type { Board } from './lib/container-sim'

const SRC = 'public/data/lotto539-history.json'
const OUT = 'docs/container-rules.md'
const BURN_IN = SLOTS
const SPLIT = '2021-01-01'
/** 前段一個條件至少要有這麼多次才列 */
const MIN_N = { hit: 300, ball: 200 }
const TOP = 40
const HOLD_Z = 2

type Kind = 'hit' | 'edge' | 'y1'
const KIND_LABEL: Record<Kind, string> = { hit: '被打中', edge: '開出邊緣', y1: '開出 y=1' }

const gB = (g: number): string => (g <= 5 ? String(g) : g <= 7 ? '6～7' : g <= 9 ? '8～9' : g <= 12 ? '10～12' : g <= 15 ? '13～15' : g <= 20 ? '16～20' : g <= 30 ? '21～30' : '31+')
const V_BUCKETS = ['0', '1', '2', '3', '4', '5', '6～9', '10～14', '15～19', '20～29', '30+'] as const
const vIdx = (v: number): number => (v <= 5 ? v : v <= 9 ? 6 : v <= 14 ? 7 : v <= 19 ? 8 : v <= 29 ? 9 : 10)
const vB = (v: number): string => V_BUCKETS[vIdx(v)]!
const aB = (a: number): string => (a <= 5 ? String(a) : a <= 9 ? '6～9' : a <= 14 ? '10～14' : '15+')
const sB = (s: number): string => (s <= 4 ? String(s) : '5+')

/** 開完第 t 期後的一個容器，跟它在第 t+1 期的結果 */
interface Ev {
  t: number
  late: boolean
  g: number
  x: number
  v: number
  /** 容器自己幾期沒被打中（剛開出的那格 = 0） */
  age: number
  /** 「連續幾期沒有開出值落在這格同一組的球」 */
  streak: number
  hits: number
  /** 第 t+1 期從這格開出的球各自的 y */
  ys: number[]
}

const file = JSON.parse(readFileSync(SRC, 'utf8')) as HistoryFile
const rows = file.rows
const draws = rows.map(r => [...r[2]].sort((a, b) => a - b))
const T = draws.length

// ── 逐期推盤面，並跟 computeFeatures 核對 ─────────────────
const boards: Board[] = []
const ages: number[][] = []
const streaks: number[][] = []
{
  let b = firstBoard(draws[0]!)
  let age = new Array<number>(SLOTS).fill(0)
  let streak = new Array<number>(V_BUCKETS.length).fill(0)
  boards.push(b)
  ages.push(age)
  streaks.push(streak)
  for (let t = 1; t < T; t++) {
    const drawn = new Set(draws[t]!)
    const hitSlot = b.slots.map(s => s.some(x => drawn.has(x)))
    const seen = new Set<number>()
    b.slots.forEach((s, g) => {
      if (s.some(x => drawn.has(x))) seen.add(vIdx(b.values[g]!))
    })
    streak = streak.map((s, i) => (seen.has(i) ? 0 : s + 1))
    // 容器跟著號碼往後移一格；剛開出的放第 0 格
    age = [0, ...age.slice(0, SLOTS - 1).map((a, g) => (hitSlot[g] ? 0 : a + 1))]
    b = nextBoard(b, draws[t]!)
    boards.push(b)
    ages.push(age)
    streaks.push(streak)
  }
}
const feats = computeFeatures(draws, SLOTS)
let mismatch = 0
for (let t = BURN_IN; t < T; t++) {
  feats[t]!.gaps.forEach((g, i) => {
    if (g == null) return
    const b = boards[t - 1]!
    if (b.values[g] !== feats[t]!.values[i] || b.slots[g]!.length !== feats[t]!.xs[i]) mismatch++
  })
}

const evs: Ev[] = []
for (let t = BURN_IN; t + 1 < T; t++) {
  const b = boards[t]!
  const next = new Set(draws[t + 1]!)
  b.slots.forEach((s, g) => {
    if (s.length === 0) return
    const ys = s.map((x, i) => (next.has(x) ? i + 1 : 0)).filter(y => y > 0)
    evs.push({ t, late: rows[t + 1]![1] >= SPLIT, g, x: s.length, v: b.values[g]!, age: ages[t]![g]!, streak: streaks[t]![vIdx(b.values[g]!)]!, hits: ys.length, ys })
  })
}

// ── 基準：同一段、同 x 的平常比例 ─────────────────────────
interface Rate { k: number, n: number }
const baseOf = (late: boolean): Record<Kind, Rate[]> => {
  const mk = (): Rate[] => Array.from({ length: 6 }, () => ({ k: 0, n: 0 }))
  const r = { hit: mk(), edge: mk(), y1: mk() }
  for (const e of evs) {
    if (e.late !== late) continue
    r.hit[e.x]!.n++
    if (e.hits > 0) r.hit[e.x]!.k++
    for (const y of e.ys) {
      if (e.x >= 3) {
        r.edge[e.x]!.n++
        if (y === 1 || y === e.x) r.edge[e.x]!.k++
      }
      if (e.x >= 2) {
        r.y1[e.x]!.n++
        if (y === 1) r.y1[e.x]!.k++
      }
    }
  }
  return r
}
const base = { early: baseOf(false), late: baseOf(true) }
const rate = (r: Rate): number => (r.n > 0 ? r.k / r.n : 0)

// ── 條件 ─────────────────────────────────────────────
interface Family { name: string, kinds: Kind[], key: (e: Ev) => string | null }
const FAMILIES: Family[] = [
  { name: '隔期', kinds: ['hit', 'edge', 'y1'], key: e => `隔期 ${gB(e.g)}` },
  { name: '值', kinds: ['hit', 'edge', 'y1'], key: e => `值 ${vB(e.v)}` },
  { name: '齡', kinds: ['hit', 'edge', 'y1'], key: e => (e.x === 5 ? null : `容器 ${aB(e.age)} 期沒被打中`) },
  { name: 'x×隔期', kinds: ['hit', 'edge', 'y1'], key: e => `x=${e.x}、隔期 ${gB(e.g)}` },
  { name: 'x×值', kinds: ['hit', 'edge', 'y1'], key: e => `x=${e.x}、值 ${vB(e.v)}` },
  { name: '隔期×值', kinds: ['hit', 'edge', 'y1'], key: e => `隔期 ${gB(e.g)}、值 ${vB(e.v)}` },
  { name: 'x×齡', kinds: ['hit', 'edge'], key: e => (e.x === 5 ? null : `x=${e.x}、容器 ${aB(e.age)} 期沒被打中`) },
  { name: '值×連續沒開', kinds: ['hit', 'edge'], key: e => `值 ${vB(e.v)}、已連 ${sB(e.streak)} 期沒開出值 ${vB(e.v)}` }
]

interface Cell { k: number, n: number, ex: number, va: number }
type Cells = Map<string, Cell>
const tally = (late: boolean): Cells => {
  const cells: Cells = new Map()
  const b = late ? base.late : base.early
  const add = (key: string, ok: boolean, p: number): void => {
    const c = cells.get(key) ?? { k: 0, n: 0, ex: 0, va: 0 }
    c.n++
    if (ok) c.k++
    c.ex += p
    c.va += p * (1 - p)
    cells.set(key, c)
  }
  for (const e of evs) {
    if (e.late !== late) continue
    for (const f of FAMILIES) {
      const k = f.key(e)
      if (k == null) continue
      if (f.kinds.includes('hit')) add(`hit|${f.name}|${k}`, e.hits > 0, rate(b.hit[e.x]!))
      for (const y of e.ys) {
        if (f.kinds.includes('edge') && e.x >= 3) add(`edge|${f.name}|${k}`, y === 1 || y === e.x, rate(b.edge[e.x]!))
        if (f.kinds.includes('y1') && e.x >= 2) add(`y1|${f.name}|${k}`, y === 1, rate(b.y1[e.x]!))
      }
    }
  }
  return cells
}
const early = tally(false)
const late = tally(true)
const zOf = (c: Cell | undefined): number => (c && c.va > 0 ? (c.k - c.ex) / Math.sqrt(c.va) : 0)

interface Rule { id: string, kind: Kind, family: string, label: string, e: Cell, l: Cell | undefined, ze: number, zl: number }
const rules: Rule[] = [...early].flatMap(([id, c]) => {
  const [kind, family, label] = id.split('|') as [Kind, string, string]
  if (c.n < (kind === 'hit' ? MIN_N.hit : MIN_N.ball)) return []
  const l = late.get(id)
  return [{ id, kind, family, label, e: c, l, ze: zOf(c), zl: zOf(l) }]
}).sort((a, b) => Math.abs(b.ze) - Math.abs(a.ze))
const top = rules.slice(0, TOP)
const same = (r: Rule): boolean => Math.sign(r.zl) === Math.sign(r.ze) && r.zl !== 0
const held = (r: Rule): boolean => same(r) && Math.abs(r.zl) >= HOLD_Z
const strong = rules.filter(r => Math.abs(r.ze) >= 3)
// 後段單獨看最偏的，看看有沒有前段沒有、後段才冒出來的
const lateOnly = [...late].flatMap(([id, c]) => {
  const [kind, family, label] = id.split('|') as [Kind, string, string]
  if (c.n < (kind === 'hit' ? MIN_N.hit : MIN_N.ball) / 2) return []
  return [{ id, kind, family, label, e: early.get(id)!, l: c, ze: zOf(early.get(id)), zl: zOf(c) }]
}).sort((a, b) => Math.abs(b.zl) - Math.abs(a.zl)).slice(0, 15)

// ── 格式 ─────────────────────────────────────────────
const pct = (x: number): string => `${(100 * x).toFixed(1)}%`
const sg = (x: number): string => (x >= 0 ? `+${x.toFixed(2)}` : x.toFixed(2))
const pad = (x: number): string => String(x).padStart(2, '0')
const cellText = (c: Cell | undefined): string => (c ? `${c.k}/${c.n} ${pct(c.k / c.n)}（平常 ${pct(c.ex / c.n)}）` : '—')
const ruleRow = (r: Rule, i: number): string =>
  `| ${i + 1} | ${KIND_LABEL[r.kind]} | ${r.label} | ${cellText(r.e)} | ${sg(r.ze)} | ${cellText(r.l)} | ${sg(r.zl)} | ${held(r) ? '**成立**' : same(r) ? '同方向' : '反過來'} |`
const RULE_HEAD = ['| # | 結果 | 條件 | 前段 次數／比例 | 前段 z | 後段 次數／比例 | 後段 z | 後段 |', '|---|---|---|---|---|---|---|---|']

// 套到最新盤面：後段也成立的規律，現在哪些容器符合
const tNow = T - 1
const now = boards[tNow]!
const nowEvs: Ev[] = now.slots.flatMap((s, g) => (s.length === 0
  ? []
  : [{ t: tNow, late: true, g, x: s.length, v: now.values[g]!, age: ages[tNow]![g]!, streak: streaks[tNow]![vIdx(now.values[g]!)]!, hits: 0, ys: [] }]))
const passed = rules.filter(r => Math.abs(r.ze) >= 3 && held(r))
const applies = nowEvs.flatMap(e => passed.filter(r => FAMILIES.find(f => f.name === r.family)!.key(e) === r.label && (r.kind === 'hit' || e.x >= (r.kind === 'edge' ? 3 : 2)))
  .map(r => ({ e, r })))

const shifts = (['hit', 'edge', 'y1'] as Kind[]).flatMap(kind => [1, 2, 3, 4, 5].flatMap((x) => {
  const e = base.early[kind][x]!
  const l = base.late[kind][x]!
  if (e.n === 0 || l.n === 0) return []
  const pool = (e.k + l.k) / (e.n + l.n)
  const z = (rate(l) - rate(e)) / Math.sqrt(pool * (1 - pool) * (1 / e.n + 1 / l.n))
  return [{ kind, x, e, l, z }]
}))
const earlyDraws = rows.filter((r, t) => t > BURN_IN && r[1] < SPLIT).length
const lateDraws = rows.filter(r => r[1] >= SPLIT).length
const lines = [
  '# 隔期／值／位置的出現規律（前段找、後段驗）',
  '',
  `由 \`scripts/container-rules.ts\` 產生。資料：\`${SRC}\` 到 ${file.lastTerm}（${file.lastDate}）。盤面推法跟 computeFeatures 逐期核對，不一致 ${mismatch} 處。`,
  '',
  `- 前段（找）：${rows[BURN_IN + 1]![1]} ～ ${SPLIT} 前，${earlyDraws} 期。後段（驗）：${SPLIT} ～ ${file.lastDate}，${lateDraws} 期。`,
  '- 單位：開完一期後盤面上每個非空容器，看下一期它有沒有被打中；打中的話開出的那顆是不是邊緣（y=1 或 y=x，x≥3）、是不是 y=1（x≥2）。',
  '- 基準只用真實資料：同一段時間、同樣 x 的容器平常的比例。z＝（實際 − 依 x 算的平常次數）／√變異。',
  `- 前段條件至少 ${MIN_N.hit} 次（被打中）或 ${MIN_N.ball} 顆（邊緣、y=1）才列；共 ${rules.length} 個條件。`,
  '',
  '## 平常的比例（基準）',
  '',
  '| x | 被打中 前段 | 後段 | 邊緣 前段 | 後段 | y=1 前段 | 後段 |',
  '|---|---|---|---|---|---|---|',
  ...[1, 2, 3, 4, 5].map(x => `| ${x} | ${pct(rate(base.early.hit[x]!))} | ${pct(rate(base.late.hit[x]!))} | ${x >= 3 ? pct(rate(base.early.edge[x]!)) : '—'} | ${x >= 3 ? pct(rate(base.late.edge[x]!)) : '—'} | ${x >= 2 ? pct(rate(base.early.y1[x]!)) : '—'} | ${x >= 2 ? pct(rate(base.late.y1[x]!)) : '—'} |`),
  '',
  '## 平常的比例本身，前後段有沒有變',
  '',
  '兩段比例差的 z（兩比例檢定）：',
  '',
  '| 結果 | x | 前段 | 後段 | 差 | z |',
  '|---|---|---|---|---|---|',
  ...shifts.map(r => `| ${KIND_LABEL[r.kind]} | ${r.x} | ${r.e.k}/${r.e.n} ${pct(rate(r.e))} | ${r.l.k}/${r.l.n} ${pct(rate(r.l))} | ${sg(100 * (rate(r.l) - rate(r.e)))} 個百分點 | ${sg(r.z)} |`),
  '',
  `## 前段最偏的 ${TOP} 個條件，拿到後段原封不動再算`,
  '',
  `後段「成立」＝同方向且 |z| ≥ ${HOLD_Z}；「同方向」＝方向一樣但沒那麼強；「反過來」＝後段方向相反。`,
  '',
  ...RULE_HEAD,
  ...top.map(ruleRow),
  '',
  `- 前 ${TOP} 名：後段成立 **${top.filter(held).length}**、同方向 ${top.filter(r => same(r) && !held(r)).length}、反過來 ${top.filter(r => !same(r)).length}。`,
  `- 前段 |z| ≥ 3 的全部 ${strong.length} 個：後段成立 **${strong.filter(held).length}**、同方向 ${strong.filter(r => same(r) && !held(r)).length}、反過來 ${strong.filter(r => !same(r)).length}。`,
  '',
  '## 後段才冒出來的（後段最偏的 15 個，對照它在前段的樣子）',
  '',
  ...RULE_HEAD,
  ...lateOnly.map(ruleRow),
  '',
  `## 套到最新盤面（開完 ${rows[tNow]![0]}，${rows[tNow]![1]}）`,
  '',
  '前段 |z| ≥ 3、後段也成立的條件，現在符合的容器：',
  '',
  ...(applies.length
    ? ['| 隔期 | 容器裡的號碼 | x | 值 | 符合的條件 | 結果 | 後段比例 |', '|---|---|---|---|---|---|---|',
        ...applies.map(({ e, r }) => `| ${e.g} | ${now.slots[e.g]!.map(pad).join(' ')} | ${e.x} | ${e.v} | ${r.label} | ${KIND_LABEL[r.kind]} | ${cellText(r.l)} |`)]
    : ['（現在沒有容器符合）']),
  ''
]
writeFileSync(OUT, lines.join('\n') + '\n')
process.stdout.write(`mismatch ${mismatch}, rules ${rules.length}, top held ${top.filter(held).length}/${TOP}, strong ${strong.length} held ${strong.filter(held).length} same ${strong.filter(same).length}, applies ${applies.length}\n`)
