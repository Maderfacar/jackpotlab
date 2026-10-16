/**
 * 539 近期波段：位置 y=1～5、值 0～5（使用者固定問法，2026-10-16 定案）。
 * 算法與文字都在 app/utils/recent-wave.ts、recent-wave-text.ts，和 /trend 頁同一套，印出來的就是頁面上的字。
 *
 * 用法（先補歷史檔再算）：
 *   node --import tsx --env-file=.env.local scripts/export-539-history.ts
 *   node --import tsx scripts/y-wave.ts          # 位置 y=1～5
 *   node --import tsx scripts/y-wave.ts value    # 值 0～5
 */
import { readFileSync } from 'node:fs'
import { analyzeRecentWave, RECENT_WAVE_KEYS, recentWaveDraws, type RecentWaveKind } from '../app/utils/recent-wave'
import { recentWaveText, unitName } from '../app/utils/recent-wave-text'
import type { HistoryFile } from '../shared/lotto/history-file'

const kind: RecentWaveKind = process.argv[2] === 'value' ? 'value' : 'y'
const file = JSON.parse(readFileSync('public/data/lotto539-history.json', 'utf8')) as HistoryFile
const draws = recentWaveDraws(file.rows.map(([drawTerm, drawDate, prizes]) => ({ drawTerm, drawDate, prizes })))
const latest = draws.at(-1)!
console.log(`資料到第 ${latest.issue} 期（${latest.date}）\n`)

for (const key of RECENT_WAVE_KEYS[kind]) {
  const r = analyzeRecentWave(draws, kind, key)
  if (!r) {
    console.log(`${kind}=${key}：今年資料不夠\n`)
    continue
  }
  console.log(`■ ${unitName(r)}（今年平均每期 ${r.mean.toFixed(2)} 顆，看 ${r.w} 期合計）`)
  for (const s of recentWaveText(r)) {
    console.log(`  ${s.forecast ? '【推估】' : ''}${s.title}`)
    for (const line of s.lines) console.log(`    ${line.replaceAll('**', '')}`)
    for (const b of s.bullets) console.log(`    • ${b}`)
    for (const line of s.after) console.log(`    ${line}`)
  }
  console.log('')
}
