/**
 * 產生／補新三星彩、四星彩歷史檔（public/data/lotto3d-history.json、lotto4d-history.json）。
 *   檔案已存在：只向 Firestore 要檔案最後一期之後的期數（讀取次數 = 新期數）。
 *   檔案不存在：讀整個 results（第一次約 6,000 次讀取）。
 *
 * 用法：pnpm dlx tsx --env-file=.env.local scripts/export-digit-history.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { getAdminFirestore } from '../server/utils/firebase-admin'
import { DIGIT_GAME_IDS, DIGIT_GAMES, type DigitGameId } from '../shared/lotto/digit-games'
import { digitHistoryPath, formatDigitHistory, parseDigitHistory, type DigitHistoryRow } from '../shared/lotto/digit-history'

async function exportOne(id: DigitGameId): Promise<void> {
  const out = `public${digitHistoryPath(id)}`
  const old: DigitHistoryRow[] = existsSync(out)
    ? parseDigitHistory(id, JSON.parse(readFileSync(out, 'utf-8'))).map(d => [Number(d.issue), d.date, d.digits])
    : []
  const after = old.at(-1)?.[0] ?? 0
  const snap = await getAdminFirestore().collection('draws').doc(id).collection('results')
    .where('drawTerm', '>', after).orderBy('drawTerm').get()
  const fresh: DigitHistoryRow[] = snap.docs.map((d) => {
    const x = d.data() as { drawTerm: number, drawDate: string, numbers: number[] }
    return [x.drawTerm, x.drawDate, [...x.numbers]]
  })
  process.stdout.write(`${DIGIT_GAMES[id].name}：資料庫讀了 ${fresh.length} 期（${after} 之後）\n`)
  if (fresh.length === 0) return
  const rows = [...old, ...fresh]
  const text = formatDigitHistory(id, rows)
  parseDigitHistory(id, JSON.parse(text))
  writeFileSync(out, text)
  process.stdout.write(`寫入 ${out}：${rows.length} 期，到 ${rows.at(-1)![1]}\n`)
}

async function main(): Promise<void> {
  for (const id of DIGIT_GAME_IDS) await exportOne(id)
}

main().catch((error) => {
  process.stderr.write(`失敗：${error instanceof Error ? error.message : 'unknown'}\n`)
  process.exit(1)
})
