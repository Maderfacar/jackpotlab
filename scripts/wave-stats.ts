/**
 * 波段均值寫檔：隔期 0～19、值與位置 y 第 1～5 顆的四種均值（5、10、15、歷史），算法見 app/utils/wave.ts。
 *
 * 只讀 public/data/lotto539-history.json，不讀資料庫。
 * 用法：pnpm dlx tsx scripts/wave-stats.ts
 * 輸出：docs/wave/gap.md、docs/wave/value.md、docs/wave/y.md、docs/wave/wave.json
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { computeWave, WAVE_RECENT, type WaveAvg, type WaveResult, type WaveRow } from '../app/utils/wave'
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
    `## 驗證用原始數字（往前 ${WAVE_RECENT} 個，左邊最新）`,
    '',
    `| ${keyName} | 目前的值 | 往前 ${WAVE_RECENT} 個 |`,
    '|---|---|---|',
    ...rows.map(r => `| ${r.key} | ${r.current} | ${r.recent.join(',')} |`),
    ''
  ].join('\n')
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(`${OUT_DIR}/gap.md`, toMarkdown(wave, '隔期 0～19 四種均值', '隔期',
  '目前的值＝這格已經幾期沒開出（記錄第一個數字，還在加）；均值＝往前已結束的 5／10／15 個數字、歷史＝第 101 期之後全部。', wave.gap))
writeFileSync(`${OUT_DIR}/value.md`, toMarkdown(wave, '值：第 1～5 顆四種均值', '球',
  '第 1～5 顆＝號碼由小到大。目前的值＝最新一期這顆的值；均值＝這之前的 5／10／15 期、歷史＝第 101 期之後全部。', wave.value))
writeFileSync(`${OUT_DIR}/y.md`, toMarkdown(wave, '位置 y：第 1～5 顆四種均值', '球',
  '第 1～5 顆＝號碼由小到大。目前的值＝最新一期這顆的 y；均值＝這之前的 5／10／15 期、歷史＝第 101 期之後全部。', wave.y))
writeFileSync(`${OUT_DIR}/wave.json`, `${JSON.stringify(wave, null, 1)}\n`)
console.log(`wrote ${OUT_DIR} for ${wave.issue}`)
