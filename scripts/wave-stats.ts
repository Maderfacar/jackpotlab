/**
 * 波段均值寫檔：隔期 0～19、隔期／值 第 1～5 顆的四種均值（5、10、15、歷史）、位置 y 次數、值盤面，算法見 app/utils/wave.ts。
 *
 * 只讀 public/data/lotto539-history.json，不讀資料庫。
 * 用法：pnpm dlx tsx scripts/wave-stats.ts
 * 輸出：docs/wave/gap.md、docs/wave/gap-ball.md、docs/wave/value-board.md、docs/wave/value.md、docs/wave/y.md、docs/wave/wave.json
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { computeWave, WAVE_RECENT, Y_BINS, type WaveAvg, type WaveResult, type WaveRow } from '../app/utils/wave'
import type { HistoryFile } from '../shared/lotto/history-file'

const OUT_DIR = 'docs/wave'

const file = JSON.parse(readFileSync('public/data/lotto539-history.json', 'utf8')) as HistoryFile
const wave = computeWave(file.rows.map(([drawTerm, drawDate, prizes]) => ({ drawTerm, drawDate, prizes })))
if (!wave) throw new Error('歷史期數不夠')

const cell = (a: WaveAvg): string => a.above ? `**${a.avg.toFixed(2)} 高於**` : a.avg.toFixed(2)

function toMarkdown(w: WaveResult, title: string, keyName: string, note: string, rows: WaveRow[]): string {
  return [
    `# ${title}`,
    '',
    `盤面：第 ${w.issue} 期（${w.date}）開完，開出 ${w.prizes}。`,
    `資料：public/data/lotto539-history.json，共 ${file.count} 期。由 scripts/wave-stats.ts 產生。`,
    '',
    note,
    '目前的值大於均值的，標「**高於**」。',
    '',
    `| ${keyName} | 目前的值 | 5 個平均 | 10 個平均 | 15 個平均 | 歷史平均 | 高於幾種 |`,
    '|---|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.key} | ${r.current} | ${r.avgs.map(cell).join(' | ')} | ${r.avgs.filter(a => a.above).length} |`),
    '',
    `## 驗證用原始數字（最近 ${WAVE_RECENT} 個，左邊最新，第一個就是目前）`,
    '',
    `| ${keyName} | 目前的值 | 最近 ${WAVE_RECENT} 個 |`,
    '|---|---|---|',
    ...rows.map(r => `| ${r.key} | ${r.current} | ${r.recent.join(',')} |`),
    ''
  ].join('\n')
}

const pageHead = (w: WaveResult, title: string): string[] => [
  `# ${title}`,
  '',
  `盤面：第 ${w.issue} 期（${w.date}）開完，開出 ${w.prizes}。由 scripts/wave-stats.ts 產生。`,
  ''
]

function yMarkdown(w: WaveResult): string {
  const lines = [...pageHead(w, '位置 y：第 1～5 顆各 y 出現次數'),
    '最近 5／10／15 期含最新一期；歷史＝第 101 期之後全部。比例比歷史高的標「**多**」。', '']
  for (const r of w.yCounts) {
    lines.push(`## ${r.key}（最新一期 y=${r.latest}）`, '', `| 範圍 | ${Y_BINS.map(b => `y=${b}`).join(' | ')} |`, `|---|${Y_BINS.map(() => '---').join('|')}|`)
    for (const win of r.windows) {
      const cells = win.counts.map((c, k) => `${c} 次（${Math.round((c / win.total) * 100)}%）${win.above[k] ? ' **多**' : ''}`)
      lines.push(`| ${win.label === '歷史' ? '歷史' : `最近 ${win.label} 期`}（${win.total}） | ${cells.join(' | ')} |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function valueBoardMarkdown(w: WaveResult): string {
  return [...pageHead(w, '下一期：每種值有幾顆號碼帶著'),
    '同一格的號碼值一定相同。下一期開出的值，只可能是下面這幾種。', '',
    '| 值 | 來自隔期 | 幾顆 | 號碼 |', '|---|---|---|---|',
    ...w.valueBoard.map(g => `| ${g.value} | ${g.slots.join('、')} | ${g.numbers.length} | ${g.numbers.map(n => String(n).padStart(2, '0')).join(' ')} |`),
    ''].join('\n')
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(`${OUT_DIR}/gap.md`, toMarkdown(wave, '隔期 0～19 四種均值', '隔期',
  '目前的值＝這格已經幾期沒開出（記錄第一個數字，還在加）；均值＝含目前在內的最近 5／10／15 個數字、歷史＝第 101 期之後全部（含目前）。', wave.gap))
writeFileSync(`${OUT_DIR}/gap-ball.md`, toMarkdown(wave, '隔期：第 1～5 顆四種均值', '球',
  '第 1～5 顆＝號碼由小到大。目前的值＝最新一期這顆的隔期；均值＝含最新一期在內的最近 5／10／15 期、歷史＝第 101 期之後全部。', wave.gapBall))
writeFileSync(`${OUT_DIR}/value.md`, toMarkdown(wave, '值：第 1～5 顆四種均值', '球',
  '第 1～5 顆＝號碼由小到大。目前的值＝最新一期這顆的值；均值＝含最新一期在內的最近 5／10／15 期、歷史＝第 101 期之後全部。', wave.value))
writeFileSync(`${OUT_DIR}/y.md`, yMarkdown(wave))
writeFileSync(`${OUT_DIR}/value-board.md`, valueBoardMarkdown(wave))
writeFileSync(`${OUT_DIR}/wave.json`, `${JSON.stringify(wave, null, 1)}\n`)
console.log(`wrote ${OUT_DIR} for ${wave.issue}`)
