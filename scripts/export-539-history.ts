/**
 * 產生／補新 public/data/lotto539-history.json（539 歷史開獎存檔，見 shared/lotto/history-file.ts）。
 *
 * 預設「補新」：讀現有檔案，只向 Firestore 要檔案最後一期之後的期數（讀取次數 = 新期數），接在後面。
 * 只收官方完整紀錄（provisional 初步結果不進檔）。寫完逐年核對期號連號。
 *
 * 用法：
 *   pnpm dlx tsx --env-file=.env.local scripts/export-539-history.ts
 *   pnpm dlx tsx scripts/export-539-history.ts --from-json <Firestore 匯出的 JSON 陣列>   （不讀資料庫）
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { getAdminFirestore } from '../server/utils/firebase-admin'
import type { HistoryFile, HistoryRow } from '../shared/lotto/history-file'

const OUT = 'public/data/lotto539-history.json'

interface RawDraw {
  drawTerm: number
  drawDate: string
  numbers: number[]
  provisional?: string | null
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const toRow = (d: RawDraw): HistoryRow => [d.drawTerm, d.drawDate.slice(0, 10), [...d.numbers].sort((a, b) => a - b)]

async function fetchAfter(lastTerm: number): Promise<RawDraw[]> {
  const snap = await getAdminFirestore().collection('draws').doc('lotto539').collection('results')
    .where('drawTerm', '>', lastTerm).orderBy('drawTerm').get()
  return snap.docs.map(d => d.data() as RawDraw)
}

/** 每年期號必須從 001 連號（民國年 = 期號 / 1,000,000） */
function checkYears(rows: HistoryRow[]): string[] {
  const byYear = new Map<number, number[]>()
  for (const [term] of rows) {
    const y = Math.floor(term / 1_000_000)
    byYear.set(y, [...(byYear.get(y) ?? []), term % 1_000_000])
  }
  const problems: string[] = []
  for (const [y, seqs] of byYear) {
    const bad = seqs.some((s, i) => s !== i + 1)
    if (bad) problems.push(`民國 ${y} 年期號不連號（${seqs.length} 期，最後第 ${seqs.at(-1)} 期）`)
  }
  return problems
}

async function main(): Promise<void> {
  const fromJson = arg('--from-json')
  let rows: HistoryRow[]
  if (fromJson) {
    const raw = JSON.parse(readFileSync(fromJson, 'utf-8')) as RawDraw[]
    rows = raw.filter(d => !d.provisional).map(toRow).sort((a, b) => a[0] - b[0])
  } else {
    const existing: HistoryRow[] = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf-8')) as HistoryFile).rows : []
    const lastTerm = existing.at(-1)?.[0] ?? 0
    const fresh = (await fetchAfter(lastTerm)).filter(d => !d.provisional).map(toRow)
    process.stdout.write(`資料庫讀了 ${fresh.length} 期（第 ${lastTerm} 期之後）\n`)
    rows = [...existing, ...fresh]
  }

  const problems = checkYears(rows)
  if (problems.length) throw new Error(`期號核對不過，不寫檔：\n  ${problems.join('\n  ')}`)

  const last = rows.at(-1)!
  const file: HistoryFile = { game: 'lotto539', lastTerm: last[0], lastDate: last[1], count: rows.length, rows }
  // 一期一行，git diff 好讀
  const body = rows.map(r => JSON.stringify(r)).join(',\n')
  writeFileSync(OUT, `{"game":"lotto539","lastTerm":${file.lastTerm},"lastDate":"${file.lastDate}","count":${file.count},"rows":[\n${body}\n]}\n`)
  process.stdout.write(`寫入 ${OUT}：${file.count} 期，到第 ${file.lastTerm} 期（${file.lastDate}）\n`)
}

main().catch((error) => {
  process.stderr.write(`失敗：${error instanceof Error ? error.message : 'unknown'}\n`)
  process.exit(1)
})
