/**
 * 波段均值：以「最新一期開完的盤面」為基礎，寫出隔期、值、位置 y 的四種均值（5、10、15、歷史）。
 *
 * - 隔期 0～19：每格的記錄（/draws 的 record，最左最新）。目前的值 = 第一個數字（還在加）；
 *   均值 = 往前已結束的 5／10／15 個數字、歷史 = 第 101 期之後全部已結束的數字。
 * - 值、位置 y：第 1～5 顆（號碼由小到大）各自一串，每期一個數字。目前的值 = 最新一期那顆；
 *   均值 = 最新一期之前的 5／10／15 期、歷史 = 第 101 期之後全部（不含最新一期）。
 * - 目前的值大於均值 → 標「高於」。
 * - 前 100 期是引擎剛開始累積的期間（第 1 期號碼不進任何格），不算進歷史。
 *
 * 只讀 public/data/lotto539-history.json，不讀資料庫。
 * 用法：pnpm dlx tsx scripts/wave-stats.ts
 * 輸出：docs/wave/gap.md、docs/wave/value.md、docs/wave/y.md、docs/wave/wave.json
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { hydrateFromDraws } from '../app/utils/analysis'
import type { HistoryFile } from '../shared/lotto/history-file'

const WARM = 100
const GAP_SLOTS = 20
const BALLS = 5
const RECENT = 15
const LENGTHS = [5, 10, 15] as const
const OUT_DIR = 'docs/wave'

interface Avg {
  label: string
  avg: number
  above: boolean
}

interface WaveRow {
  key: string
  current: number
  avgs: Avg[]
  recent: number[]
}

const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0)

/** current 與往前已結束的數字（newest-first）→ 四種均值。比較用整數乘法，避免小數誤差。 */
function buildRow(key: string, current: number, done: number[], history: number[]): WaveRow {
  const avgs: Avg[] = LENGTHS.map((n) => {
    const part = done.slice(0, n)
    return { label: String(n), avg: sum(part) / part.length, above: current * part.length > sum(part) }
  })
  const total = sum(history)
  avgs.push({ label: '歷史', avg: total / history.length, above: current * history.length > total })
  return { key, current, avgs, recent: done.slice(0, RECENT) }
}

const parseCsv = (csv: string | undefined): string[] => (csv ?? '').split(',')

const file = JSON.parse(readFileSync('public/data/lotto539-history.json', 'utf8')) as HistoryFile
const draws = file.rows.map(([drawTerm, drawDate, prizes]) => ({ drawTerm, drawDate, prizes }))
const state = hydrateFromDraws('lotto539', 60, draws)
const warm = hydrateFromDraws('lotto539', 60, draws.slice(0, WARM))

function gapRows(): WaveRow[] {
  return Array.from({ length: GAP_SLOTS }, (_, k) => {
    const rec = state.periods[k]!.record.split(',').filter(x => x !== '').map(Number)
    const warmLen = warm.periods[k]!.record.split(',').filter(x => x !== '').length
    const done = rec.slice(1)
    return buildRow(String(k), rec[0]!, done, done.slice(0, done.length - warmLen))
  })
}

/** 某一顆的每期數字（newest-first，略過找不到來源格的空白），pick 從 values/positions 取值。 */
function ballSeries(pick: (h: (typeof state.history)[number]) => string | undefined): { newest: number[], fromWarm: number } {
  const newest: number[] = []
  let fromWarm = 0
  for (let i = state.history.length - 1; i >= 0; i--) {
    const raw = pick(state.history[i]!)
    if (raw === undefined || raw === '') continue
    newest.push(Number(raw))
    if (i >= WARM) fromWarm = newest.length
  }
  return { newest, fromWarm }
}

function ballRows(pick: (h: (typeof state.history)[number], ball: number) => string | undefined): WaveRow[] {
  return Array.from({ length: BALLS }, (_, b) => {
    const { newest, fromWarm } = ballSeries(h => pick(h, b))
    const done = newest.slice(1)
    return buildRow(`第 ${b + 1} 顆`, newest[0]!, done, done.slice(0, fromWarm - 1))
  })
}

const valueRows = ballRows((h, b) => parseCsv(h.values)[b])
const yRows = ballRows((h, b) => parseCsv(h.positions)[b]?.split('-')[1])

const latest = state.history[state.history.length - 1]!
const header = (title: string, keyName: string, note: string): string => [
  `# ${title}`,
  '',
  `盤面：第 ${latest.issue} 期（${latest.date}）開完，開出 ${latest.prizes}。`,
  `資料：public/data/lotto539-history.json，共 ${file.count} 期。由 scripts/wave-stats.ts 產生。`,
  '',
  note,
  '目前的值大於均值的，標「**高於**」。',
  '',
  `| ${keyName} | 目前的值 | 5 個平均 | 10 個平均 | 15 個平均 | 歷史平均 | 高於幾種 |`,
  '|---|---|---|---|---|---|---|'
].join('\n')

const cell = (a: Avg): string => a.above ? `**${a.avg.toFixed(2)} 高於**` : a.avg.toFixed(2)

function toMarkdown(title: string, keyName: string, note: string, rows: WaveRow[]): string {
  const table = rows.map(r =>
    `| ${r.key} | ${r.current} | ${r.avgs.map(cell).join(' | ')} | ${r.avgs.filter(a => a.above).length} |`)
  const raw = rows.map(r => `| ${r.key} | ${r.current} | ${r.recent.join(',')} |`)
  return [
    header(title, keyName, note),
    ...table,
    '',
    `## 驗證用原始數字（往前 ${RECENT} 個，左邊最新）`,
    '',
    `| ${keyName} | 目前的值 | 往前 ${RECENT} 個 |`,
    '|---|---|---|',
    ...raw,
    ''
  ].join('\n')
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(`${OUT_DIR}/gap.md`, toMarkdown('隔期 0～19 四種均值', '隔期',
  '目前的值＝這格已經幾期沒開出（記錄第一個數字，還在加）；均值＝往前已結束的 5／10／15 個數字、歷史＝第 101 期之後全部。', gapRows()))
writeFileSync(`${OUT_DIR}/value.md`, toMarkdown('值：第 1～5 顆四種均值', '球',
  '第 1～5 顆＝號碼由小到大。目前的值＝最新一期這顆的值；均值＝這之前的 5／10／15 期、歷史＝第 101 期之後全部。', valueRows))
writeFileSync(`${OUT_DIR}/y.md`, toMarkdown('位置 y：第 1～5 顆四種均值', '球',
  '第 1～5 顆＝號碼由小到大。目前的值＝最新一期這顆的 y；均值＝這之前的 5／10／15 期、歷史＝第 101 期之後全部。', yRows))
writeFileSync(`${OUT_DIR}/wave.json`, `${JSON.stringify({
  issue: latest.issue,
  date: latest.date,
  prizes: latest.prizes,
  gap: gapRows(),
  value: valueRows,
  y: yRows
}, null, 1)}\n`)
console.log(`wrote ${OUT_DIR} for ${latest.issue}`)
