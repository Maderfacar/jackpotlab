/**
 * 「每期開出的 5 顆，值都不是 1」連續期數（2026-10-29 使用者）：
 * 連 6 期以上的每一段，對齊到第 5 期（跟現在一樣連到第 5 期的那一刻），列出前三期＋第 5 期＋第 6 期，
 * 再跟「連到第 5 期就斷」的那些段比，看盤面哪邊一樣、哪邊不一樣。
 *
 * 值、隔期、x、y 用頁面的 computeFeatures；開完一期之後的盤面（每格的值、剩幾顆）用同一套步驟自己推，
 * 並逐期核對：下一期每顆的值、x 必須等於盤面上那一格的值、剩幾顆。
 * 「值 1 的球」＝ 開完這期後，值是 1 的格子裡還剩的球；下一期要開出值 1，只能從這些球裡開。
 *
 * 用法：node --import tsx scripts/no-value1-streaks.ts [--extra 115000262,2026-10-29,2-11-14-21-22]
 *   --extra：歷史檔還沒進的最新一期（例如第三方初步結果）先接在後面算。
 * 輸出：docs/no-value1-streaks.md
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { computeFeatures } from '../shared/lotto/patterns/features'
import type { HistoryFile, HistoryRow } from '../shared/lotto/history-file'

const SRC = 'public/data/lotto539-history.json'
const OUT = 'docs/no-value1-streaks.md'
const N = 60
const BURN_IN = 60
const ALIGN = 5
const LONG = 6
const BEFORE = 3
const TOTAL = 39
const PICK = 5

const file = JSON.parse(readFileSync(SRC, 'utf8')) as HistoryFile
const extraArg = process.argv.indexOf('--extra')
const extra: HistoryRow[] = extraArg < 0
  ? []
  : [((): HistoryRow => {
      const [term, date, nums] = process.argv[extraArg + 1]!.split(',')
      return [Number(term), date!, nums!.split('-').map(Number)]
    })()]
const rows = [...file.rows, ...extra]
const draws = rows.map(r => [...r[2]].sort((a, b) => a - b))
const feats = computeFeatures(draws, N)

/** 開完第 t 期之後的盤面：每格的值、每格的球 */
interface Board { values: number[], slots: number[][] }
const boards: Board[] = []
{
  let slots: number[][] = Array.from({ length: N }, () => [])
  let values: number[] = new Array<number>(N).fill(0)
  slots[N - 1] = draws[0]!
  boards.push({ values: [...values], slots: slots.map(s => [...s]) })
  for (let t = 1; t < draws.length; t++) {
    const drawn = new Set(draws[t]!)
    values = slots.map((s, i) => (s.some(x => drawn.has(x)) ? 0 : values[i]! + 1))
    slots = [[...draws[t]!], ...slots.map(s => s.filter(x => !drawn.has(x))).slice(0, N - 1)]
    boards.push({ values: [...values], slots: slots.map(s => [...s]) })
  }
}
let mismatch = 0
for (let t = BURN_IN; t < draws.length; t++) {
  const f = feats[t]!
  const b = boards[t - 1]!
  f.gaps.forEach((g, i) => {
    if (g == null) return
    if (b.values[g] !== f.values[i] || b.slots[g]!.length !== f.xs[i]) mismatch += 1
  })
}

const pad = (x: number): string => String(x).padStart(2, '0')
const join = (xs: (number | null)[]): string => xs.map(x => (x == null ? '—' : String(x))).join(' ')
const has1 = (t: number): boolean => feats[t]!.values.some(v => v === 1)
const choose = (n: number, k: number): number => {
  let r = 1
  for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1)
  return r
}
/** 開完第 t 期後，值 1 的格子還剩幾顆球 */
const value1Balls = (t: number): number => boards[t]!.values.reduce((s, v, k) => s + (v === 1 ? boards[t]!.slots[k]!.length : 0), 0)
/** 下一期 5 顆都不從這 m 顆裡開出的機會 */
const pNone = (m: number): number => choose(TOTAL - m, PICK) / choose(TOTAL, PICK)
const bucket = (g: number): number => (g <= 5 ? 0 : g <= 9 ? 1 : 2)

/** 對齊點 t（連到第 5 期那一期）往前 3 期共 4 期的摘要 */
interface Window {
  t: number
  m: number
  value0: number
  value10: number
  shape: number[]
  y1: number
  full5: string
  valueSum: number
}
function windowOf(t: number): Window {
  const span = Array.from({ length: BEFORE + 1 }, (_, k) => feats[t - BEFORE + k]!)
  const all = <K extends keyof (typeof span)[number]>(key: K): number[] => span.flatMap(f => f[key].filter((x): x is number => x != null))
  const shape = [0, 0, 0]
  for (const g of all('gaps')) shape[bucket(g)]! += 1
  const b = boards[t]!
  const full5 = b.slots.flatMap((s, k) => (k >= 6 && s.length === PICK ? [`隔期 ${k}`] : [])).join('、') || '—'
  return {
    t,
    m: value1Balls(t),
    value0: all('values').filter(v => v === 0).length,
    value10: all('values').filter(v => v >= 10).length,
    shape,
    y1: all('ys').filter(y => y === 1).length,
    full5,
    valueSum: all('values').reduce((s, v) => s + v, 0)
  }
}

// 找出每一段連續沒有值 1
interface Run { start: number, len: number }
const runs: Run[] = []
let start = -1
for (let t = BURN_IN; t < draws.length; t++) {
  if (!has1(t)) {
    if (start < 0) start = t
  } else if (start >= 0) {
    runs.push({ start, len: t - start })
    start = -1
  }
}
const current: Run | null = start >= 0 ? { start, len: draws.length - start } : null

const long = runs.filter(r => r.len >= LONG)
const stopped = runs.filter(r => r.len === ALIGN)
const reachedAlign = runs.filter(r => r.len >= ALIGN)

function drawRow(label: string, t: number): string {
  const f = feats[t]!
  return `| ${label} | ${rows[t]![0]}（${rows[t]![1]}） | ${draws[t]!.map(pad).join(' ')} | ${join(f.gaps)} | ${join(f.values)} | ${join(f.xs)} | ${join(f.ys)} |`
}
const HEAD = ['| | 期號 | 獎號 | 隔期 | 值 | x | y |', '|---|---|---|---|---|---|---|']
const pct = (x: number): string => `${(x * 100).toFixed(0)}%`

function summaryRow(label: string, w: Window): string {
  return `| ${label} | ${rows[w.t]![0]} | ${w.m} | ${pct(1 - pNone(w.m))} | ${w.shape.join('·')} | ${w.value0} | ${w.value10} | ${w.valueSum} | ${w.y1} | ${w.full5} |`
}
const avg = (ws: Window[], f: (w: Window) => number): string => (ws.reduce((s, w) => s + f(w), 0) / ws.length).toFixed(1)
function avgRow(label: string, ws: Window[]): string {
  const shape = [0, 1, 2].map(i => avg(ws, w => w.shape[i]!)).join('·')
  const p = ws.reduce((s, w) => s + 1 - pNone(w.m), 0) / ws.length
  return `| ${label}（${ws.length} 次平均） | | ${avg(ws, w => w.m)} | ${pct(p)} | ${shape} | ${avg(ws, w => w.value0)} | ${avg(ws, w => w.value10)} | ${avg(ws, w => w.valueSum)} | ${avg(ws, w => w.y1)} | ${ws.filter(w => w.full5 !== '—').length} 次有 |`
}

const longW = long.map(r => windowOf(r.start + ALIGN - 1))
const stoppedW = stopped.map(r => windowOf(r.start + ALIGN - 1))
const curW = current && current.len >= ALIGN ? windowOf(draws.length - 1) : null

const sections = long.map((r, i) => {
  const t = r.start + ALIGN - 1
  return [
    `### ${i + 1}. 連 ${r.len} 期：${rows[r.start]![0]} ～ ${rows[r.start + r.len - 1]![0]}，斷在 ${rows[r.start + r.len]?.[0] ?? '—'}`,
    '',
    ...HEAD,
    ...Array.from({ length: BEFORE }, (_, k) => drawRow(`前${BEFORE - k}期`, t - BEFORE + k)),
    drawRow(`第 ${ALIGN} 期`, t),
    drawRow(`第 ${ALIGN + 1} 期`, t + 1),
    '',
    `開完第 ${ALIGN} 期，值 1 的格子還剩 **${value1Balls(t)} 顆**（${boards[t]!.values.flatMap((v, k) => (v === 1 && boards[t]!.slots[k]!.length ? [`隔期 ${k}：${boards[t]!.slots[k]!.map(pad).join(' ')}`] : [])).join('；') || '沒有'}）。`,
    ''
  ].join('\n')
})

const curSection = curW
  ? [
      `## 現在：連 ${current!.len} 期（${rows[current!.start]![0]} 起）`,
      '',
      ...HEAD,
      ...Array.from({ length: BEFORE }, (_, k) => drawRow(`前${BEFORE - k}期`, curW.t - BEFORE + k)),
      drawRow(`第 ${current!.len} 期`, curW.t),
      '',
      `開完這期，值 1 的格子還剩 **${curW.m} 顆**（${boards[curW.t]!.values.flatMap((v, k) => (v === 1 && boards[curW.t]!.slots[k]!.length ? [`隔期 ${k}：${boards[curW.t]!.slots[k]!.map(pad).join(' ')}`] : [])).join('；') || '沒有'}）。`,
      ''
    ].join('\n')
  : '## 現在：沒有連到 5 期\n'

// 所有連到第 5 期的：開完第 5 期時值 1 剩幾顆 → 第 6 期有沒有值 1
const byM = new Map<number, { n: number, cont: number }>()
for (const r of reachedAlign) {
  const m = value1Balls(r.start + ALIGN - 1)
  const e = byM.get(m) ?? { n: 0, cont: 0 }
  byM.set(m, { n: e.n + 1, cont: e.cont + (r.len >= LONG ? 1 : 0) })
}

writeFileSync(OUT, [
  '# 連 6 期以上「開出的 5 顆值都不是 1」，跟現在的盤面比',
  '',
  `由 \`scripts/no-value1-streaks.ts\` 產生。資料：\`${SRC}\` 到 ${file.lastTerm}（${file.lastDate}）${extra.length ? `，另接 ${extra.map(r => `${r[0]}（${r[1]}，${r[2].map(pad).join(' ')}）`).join('、')}` : ''}；前 ${BURN_IN} 期不算。`,
  '',
  `盤面核對：下一期每顆的值、x 跟盤面上那一格逐顆比對，不一致 ${mismatch} 顆。`,
  '',
  `連到第 ${ALIGN} 期的有 ${reachedAlign.length} 段：${long.length} 段撐到第 ${LONG} 期以上、${stopped.length} 段第 ${LONG} 期就有值 1。`,
  '',
  '## 對齊到第 5 期的摘要',
  '',
  `每一列都是「連到第 ${ALIGN} 期那一期」往前共 4 期（前三期＋第 ${ALIGN} 期）加起來。`,
  '- 值 1 剩幾顆：開完第 5 期後，值是 1 的格子裡還剩的球。下一期要開出值 1 只能從這些球裡開。',
  '- 下期會有值 1：照剩幾顆算，下一期 5 顆裡至少一顆是它們的機會（1 − C(39−m,5)/C(39,5)）。',
  '- 0～5·6～9·10+、值 0、值 ≥10、值合計、y=1：4 期共 20 顆裡各幾顆。',
  '- 隔期 ≥6 還留 5 顆：開完第 5 期時，盤面上有沒有這種格子。',
  '',
  '| | 對齊期 | 值 1 剩幾顆 | 下期會有值 1 | 0～5·6～9·10+ | 值 0 | 值 ≥10 | 值合計 | y=1 | 隔期 ≥6 還留 5 顆 |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...longW.map((w, i) => summaryRow(`${i + 1}（連 ${long[i]!.len}）`, w)),
  avgRow(`連 ${LONG} 期以上`, longW),
  avgRow(`第 ${LONG} 期就斷`, stoppedW),
  ...(curW ? [summaryRow('**現在**', curW)] : []),
  '',
  `## 開完第 ${ALIGN} 期時值 1 剩幾顆 → 有沒有撐到第 ${LONG} 期`,
  '',
  '| 值 1 剩幾顆 | 幾段 | 撐到第 6 期 | 照公式算撐到的機會 |',
  '|---|---|---|---|',
  ...[...byM.entries()].sort((a, b) => a[0] - b[0]).map(([m, e]) => `| ${m} | ${e.n} | ${e.cont} | ${pct(pNone(m))} |`),
  '',
  curSection,
  `## 連 ${LONG} 期以上的 ${long.length} 段`,
  '',
  ...sections
].join('\n'))
process.stdout.write(`${OUT} 已寫入；連 ${LONG}+ 有 ${long.length} 段、停在 ${ALIGN} 有 ${stopped.length} 段；盤面核對不一致 ${mismatch}\n`)
