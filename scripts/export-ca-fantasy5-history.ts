/**
 * 補新 public/data/ca-fantasy5-history.json（美國加州天天樂歷史檔，比照 export-539-history.ts）。
 *
 * 讀現有檔案，只向 Firestore 要檔案最後一期之後的期數（讀取次數 = 新期數），接在後面。
 * 期號 = 加州開獎日 YYYYMMDD；1997 年起每天都開，寫完核對沒有缺天。
 * 第一次建檔用 scripts/backfill-ca-fantasy5.ts --write（同時寫資料庫和檔案）。
 *
 * 用法：pnpm dlx tsx --env-file=.env.local scripts/export-ca-fantasy5-history.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { getAdminFirestore } from '../server/utils/firebase-admin'
import { CA_FANTASY5_ID } from '../shared/lotto/ca-fantasy5'

const OUT = 'public/data/ca-fantasy5-history.json'
const DAILY_FROM = '1997-01-01'

type Row = [number, string, number[]]

interface CaHistoryFile {
  game: string
  lastTerm: number
  lastDate: string
  count: number
  twoSourcesFrom: string
  rows: Row[]
}

/** 1997 年起每天都開：相鄰兩期日期要剛好差 1 天 */
function missingDays(rows: Row[]): string[] {
  const missing: string[] = []
  for (let i = 1; i < rows.length; i++) {
    const [, prev] = rows[i - 1]!
    const [, cur] = rows[i]!
    if (prev < DAILY_FROM) continue
    const gap = (Date.parse(`${cur}T12:00:00Z`) - Date.parse(`${prev}T12:00:00Z`)) / 86_400_000
    if (gap !== 1) missing.push(`${prev} → ${cur}`)
  }
  return missing
}

async function main(): Promise<void> {
  const file = JSON.parse(readFileSync(OUT, 'utf-8')) as CaHistoryFile
  const snap = await getAdminFirestore().collection('draws').doc(CA_FANTASY5_ID).collection('results')
    .where('drawTerm', '>', file.lastTerm).orderBy('drawTerm').get()
  const fresh: Row[] = snap.docs.map((d) => {
    const x = d.data() as { drawTerm: number, drawDate: string, numbers: number[] }
    return [x.drawTerm, x.drawDate, [...x.numbers].sort((a, b) => a - b)]
  })
  process.stdout.write(`資料庫讀了 ${fresh.length} 期（${file.lastDate} 之後）\n`)
  if (fresh.length === 0) return

  const rows = [...file.rows, ...fresh]
  const gaps = missingDays(rows)
  if (gaps.length) throw new Error(`有缺天，不寫檔：\n  ${gaps.join('\n  ')}`)

  const last = rows.at(-1)!
  const body = rows.map(r => JSON.stringify(r)).join(',\n')
  writeFileSync(OUT, `{"game":"${CA_FANTASY5_ID}","lastTerm":${last[0]},"lastDate":"${last[1]}","count":${rows.length},"twoSourcesFrom":"${file.twoSourcesFrom}","rows":[\n${body}\n]}\n`)
  process.stdout.write(`寫入 ${OUT}：${rows.length} 期，到 ${last[1]}\n`)
}

main().catch((error) => {
  process.stderr.write(`失敗：${error instanceof Error ? error.message : 'unknown'}\n`)
  process.exit(1)
})
