/**
 * 目前盤面的少見狀況（2026-11-02 使用者）：
 * 1. 還留著 5 顆的容器：歷史上走到第 i 格還是 5 顆的次數，下一期至少開出 1 顆的比例，之後再等幾期才開
 * 2. 開完最新一期的盤面上，每一格「剩幾顆」在歷史上同一格有多常見（剩這麼多以上的比例）
 * 只用真實資料，盤面步驟同 container-sim。
 * 用法：node --import tsx scripts/rare-board.ts
 */
import { readFileSync } from 'node:fs'
import type { HistoryFile } from '../shared/lotto/history-file'
import { SLOTS, firstBoard, nextBoard, type Board } from './lib/container-sim'

const file = JSON.parse(readFileSync('public/data/lotto539-history.json', 'utf8')) as HistoryFile
const rows = file.rows
const draws = rows.map(r => [...r[2]].sort((a, b) => a - b))
const n = draws.length
const boards: Board[] = []
let b = firstBoard(draws[0]!)
boards.push(b)
for (let t = 1; t < n; t++) { b = nextBoard(b, draws[t]!); boards.push(b) }

// 1. 5 顆容器
const full: Record<number, { cnt: number, hitNext: number, more: number[] }> = {}
for (let t = SLOTS; t < n - 1; t++) {
  boards[t]!.slots.forEach((s, i) => {
    if (s.length !== 5 || i < 6) return
    const e = (full[i] ??= { cnt: 0, hitNext: 0, more: [] })
    e.cnt++
    const nx = new Set(draws[t + 1]!)
    if (s.some(x => nx.has(x))) e.hitNext++
    // 之後第幾期開出第一顆（不超過 60 格）
    for (let k = 1; t + k < n && i + k <= SLOTS; k++) {
      if (s.some(x => draws[t + k]!.includes(x))) { e.more.push(k); break }
    }
  })
}
console.log('## 還留 5 顆的容器（第 6 格起）')
console.log('格 | 次數 | 下一期至少開 1 顆 | 比例 | 之後第幾期開出（中位）')
for (const i of Object.keys(full).map(Number).sort((a, c) => a - c)) {
  const e = full[i]!
  const med = [...e.more].sort((a, c) => a - c)[e.more.length >> 1]
  console.log(`${i} | ${e.cnt} | ${e.hitNext} | ${(100 * e.hitNext / e.cnt).toFixed(1)}% | ${med ?? '—'}`)
}
const deepest = Math.max(...Object.keys(full).map(Number))
const atDeep = []
for (let t = SLOTS; t < n; t++) boards[t]!.slots.forEach((s, i) => { if (s.length === 5 && i === deepest) atDeep.push(rows[t]![0]) })
console.log(`最深到第 ${deepest} 格：${atDeep.join('、')}`)

// 2. 目前盤面每格剩幾顆的少見程度
const last = boards[n - 1]!
console.log(`\n## 開完 ${rows[n - 1]![0]}（${rows[n - 1]![1]}）的盤面：每格剩幾顆，歷史上同一格剩這麼多以上的比例`)
console.log('格 | 值 | 剩幾顆 | 球 | 同格剩 ≥ 這麼多的比例')
last.slots.forEach((s, i) => {
  if (!s.length) return
  let ge = 0
  let tot = 0
  for (let t = SLOTS; t < n; t++) {
    tot++
    if (boards[t]!.slots[i]!.length >= s.length) ge++
  }
  console.log(`${i} | ${last.values[i]} | ${s.length} | ${s.join(' ')} | ${(100 * ge / tot).toFixed(2)}%`)
})
