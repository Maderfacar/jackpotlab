/**
 * 隔期 > 5 仍留著 5 顆獎號的容器（2026-10-29 使用者）：下一期有從裡面開出的每一次，
 * 列出那一期和前三期的獎號、隔期、隔期分佈（0～5·6～9·10+）、值、位置 x／y。
 *
 * 隔期、值、x、y 都直接用頁面的 computeFeatures（容器觀念：值 = 這個隔期格連續幾期沒開出獎號）。
 * 只讀 public/data/lotto539-history.json，前 60 期容器還沒裝滿不算。
 * 用法：node --import tsx scripts/full5-containers.ts
 * 輸出：docs/full5-containers.md
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { computeFeatures } from '../shared/lotto/patterns/features'
import type { HistoryFile } from '../shared/lotto/history-file'

const SRC = 'public/data/lotto539-history.json'
const OUT = 'docs/full5-containers.md'
const BURN_IN = 60
const MIN_GAP = 6
const FULL = 5
const BEFORE = 3

const file = JSON.parse(readFileSync(SRC, 'utf8')) as HistoryFile
const draws = file.rows.map(r => [...r[2]].sort((a, b) => a - b))
const feats = computeFeatures(draws)

const pad = (x: number): string => String(x).padStart(2, '0')
const join = (xs: (number | null)[]): string => xs.map(x => (x == null ? '—' : String(x))).join(' ')
function shape(gaps: (number | null)[]): string {
  const s = [0, 0, 0]
  for (const g of gaps) {
    if (g != null) s[g <= 5 ? 0 : g <= 9 ? 1 : 2]! += 1
  }
  return s.join('·')
}

function drawRow(label: string, t: number, hits: Set<number>): string {
  const f = feats[t]!
  const nums = draws[t]!.map(x => (hits.has(x) ? `**${pad(x)}**` : pad(x))).join(' ')
  return `| ${label} | ${file.rows[t]![0]}（${file.rows[t]![1]}） | ${nums} | ${join(f.gaps)} | ${shape(f.gaps)} | ${join(f.values)} | ${join(f.xs)} | ${join(f.ys)} |`
}

const sections: string[] = []
let count = 0
feats.forEach((f, t) => {
  if (t < BURN_IN) return
  const idx = f.gaps.flatMap((g, i) => (g != null && g >= MIN_GAP && f.xs[i] === FULL ? [i] : []))
  if (!idx.length) return
  const gap = f.gaps[idx[0]!]!
  const src = t - gap - 1
  const hits = new Set(idx.map(i => draws[t]![i]!))
  count += 1
  sections.push(
    `### ${count}. ${file.rows[t]![0]}：隔期 ${gap} 的 5 顆 ${draws[src]!.map(pad).join(' ')}（${file.rows[src]![0]} 開出），開出 ${[...hits].map(pad).join(' ')}`,
    '',
    '| | 期號 | 獎號 | 隔期 | 0～5·6～9·10+ | 值 | x | y |',
    '|---|---|---|---|---|---|---|---|',
    ...Array.from({ length: BEFORE }, (_, k) => drawRow(`前${BEFORE - k}期`, t - BEFORE + k, new Set())),
    drawRow('這期', t, hits),
    ''
  )
})

writeFileSync(OUT, [
  '# 隔期 > 5 仍留著 5 顆的容器，下一期開出時的前三期',
  '',
  `由 \`scripts/full5-containers.ts\` 產生。資料：\`${SRC}\`，${file.count} 期，到 ${file.lastTerm}（${file.lastDate}）；前 ${BURN_IN} 期不算。`,
  '',
  `共 ${count} 次。每格的五個數字依序是第 1～5 顆（號碼由小到大）。粗體 = 從那個 5 顆容器開出的獎號。`,
  '隔期 = 從第幾格出來；值 = 那一格連續幾期沒開出獎號；x = 那一格當時剩幾顆；y = 這顆在那一格裡由小到大排第幾。',
  '',
  ...sections
].join('\n'))
process.stdout.write(`${OUT} 已寫入，${count} 次\n`)
