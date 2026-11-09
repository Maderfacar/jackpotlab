/**
 * 三星彩、四星彩歷史補進資料庫（2026-11-09 使用者要求）。
 *   官方 API 依月份抓，2007-01 起到這個月；格式見 shared/lotto/digit-games.ts。
 *   檢查：每期數字個數與 0～9、期號不重複、三星和四星的期號／日期要一樣、跟 539 歷史檔的期號對照。
 *
 * 用法：
 *   pnpm dlx tsx scripts/backfill-digit-games.ts            試算：只抓、檢查、報告，不寫
 *   pnpm dlx tsx --env-file=.env.local scripts/backfill-digit-games.ts --write
 *       寫 Firestore draws/{lotto3d|lotto4d}/results/{期號}（每期 1 次寫入）＋ latest/current
 */
import { readFileSync } from 'node:fs'
import { DIGIT_GAMES, DIGIT_GAME_IDS, normalizeDigitDraw, type DigitDraw, type DigitGameId } from '../shared/lotto/digit-games'

const API = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery'
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; JackpotLab/1.0)', 'Accept': 'application/json', 'Referer': 'https://www.taiwanlottery.com/' }
const FIRST_MONTH = '2007-01'
const PAGE_SIZE = 50
const BATCH = 400
const HISTORY_539 = 'public/data/lotto539-history.json'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function monthsFrom(first: string): string[] {
  const out: string[] = []
  const now = new Date()
  let [y, m] = first.split('-').map(Number) as [number, number]
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

async function fetchMonth(gameId: DigitGameId, month: string): Promise<DigitDraw[]> {
  const g = DIGIT_GAMES[gameId]
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(`${API}/${g.endpoint}?month=${month}&pageNum=1&pageSize=${PAGE_SIZE}`, { headers: HEADERS })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = await r.json() as { rtCode: number, content?: Record<string, unknown> & { totalSize?: number } }
      if (json.rtCode !== 0) throw new Error(`rtCode=${json.rtCode}`)
      const arr = (json.content?.[g.listField] ?? []) as Record<string, unknown>[]
      if ((json.content?.totalSize ?? 0) > arr.length) throw new Error(`一頁裝不下：${json.content?.totalSize} > ${arr.length}`)
      return arr.map(x => normalizeDigitDraw(gameId, x))
    } catch (error) {
      if (attempt >= 3) throw new Error(`${g.name} ${month}：${error instanceof Error ? error.message : 'unknown'}`)
      await sleep(2000 * attempt)
    }
  }
}

async function collect(gameId: DigitGameId): Promise<DigitDraw[]> {
  const byTerm = new Map<number, DigitDraw>()
  for (const month of monthsFrom(FIRST_MONTH)) {
    for (const d of await fetchMonth(gameId, month)) {
      if (byTerm.has(d.drawTerm)) throw new Error(`${gameId} 期號重複：${d.drawTerm}`)
      if (!d.drawDate.startsWith(month)) throw new Error(`${gameId} ${d.drawTerm} 日期 ${d.drawDate} 不在 ${month}`)
      byTerm.set(d.drawTerm, d)
    }
    await sleep(300)
  }
  const draws = [...byTerm.values()].sort((a, b) => a.drawTerm - b.drawTerm)
  process.stdout.write(`${DIGIT_GAMES[gameId].name}：${draws.length} 期（${draws[0]?.drawDate} ～ ${draws.at(-1)?.drawDate}）\n`)
  return draws
}

function check(all: Record<DigitGameId, DigitDraw[]>): string[] {
  const issues: string[] = []
  const d3 = new Map(all.lotto3d.map(d => [d.drawTerm, d.drawDate]))
  const d4 = new Map(all.lotto4d.map(d => [d.drawTerm, d.drawDate]))
  for (const [t, date] of d3) if (d4.get(t) !== date) issues.push(`三星 ${t}（${date}）四星是 ${d4.get(t) ?? '沒有'}`)
  for (const [t] of d4) if (!d3.has(t)) issues.push(`四星 ${t} 三星沒有`)
  const h539 = JSON.parse(readFileSync(HISTORY_539, 'utf8')) as { rows: [number, string, number[]][] }
  const t539 = new Map(h539.rows.map(r => [r[0], r[1]]))
  const from539 = h539.rows[0]![1]
  const only539 = h539.rows.filter(r => !d3.has(r[0])).map(r => r[0])
  const onlyDigit = [...d3].filter(([t, date]) => date >= from539 && !t539.has(t)).map(([t]) => t)
  const dateDiff = [...d3].filter(([t, date]) => t539.has(t) && t539.get(t) !== date).map(([t]) => t)
  process.stdout.write(`對照 539 歷史檔（${from539} 起 ${h539.rows.length} 期）：539 有、三星沒有 ${only539.length} 期${only539.length ? '：' + only539.slice(0, 20).join(' ') : ''}；三星有、539 沒有 ${onlyDigit.length} 期${onlyDigit.length ? '：' + onlyDigit.slice(0, 20).join(' ') : ''}；同期日期不同 ${dateDiff.length} 期\n`)
  if (dateDiff.length) issues.push(`跟 539 同期日期不同：${dateDiff.slice(0, 20).join(' ')}`)
  return issues
}

async function writeFirestore(gameId: DigitGameId, draws: DigitDraw[]): Promise<void> {
  const { getAdminFirestore } = await import('../server/utils/firebase-admin')
  const { Timestamp } = await import('firebase-admin/firestore')
  const db = getAdminFirestore()
  const col = db.collection('draws').doc(gameId).collection('results')
  for (let i = 0; i < draws.length; i += BATCH) {
    const batch = db.batch()
    for (const d of draws.slice(i, i + BATCH)) batch.set(col.doc(String(d.drawTerm)), { ...d, fetchedAt: Timestamp.now() })
    await batch.commit()
    process.stdout.write(`  ${gameId} 寫入 ${Math.min(i + BATCH, draws.length)} / ${draws.length}\n`)
  }
  await db.collection('draws').doc(gameId).collection('latest').doc('current').set({ ...draws.at(-1)!, fetchedAt: Timestamp.now() })
  const count = (await col.count().get()).data().count
  process.stdout.write(`  ${gameId} 資料庫現在共 ${count} 期\n`)
  if (count !== draws.length) throw new Error(`${gameId} 資料庫筆數 ${count} 跟寫入 ${draws.length} 不一樣`)
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write')
  const all = {} as Record<DigitGameId, DigitDraw[]>
  for (const id of DIGIT_GAME_IDS) all[id] = await collect(id)
  const issues = check(all)
  for (const id of DIGIT_GAME_IDS) {
    const last = all[id].at(-1)!
    process.stdout.write(`${DIGIT_GAMES[id].name}最新：${last.drawTerm} ${last.drawDate} ${last.numbers.join(' ')}\n`)
  }
  if (issues.length) {
    process.stdout.write(`有問題 ${issues.length} 筆：\n${issues.slice(0, 50).map(x => `  ${x}`).join('\n')}\n`)
    throw new Error('有不一致，先處理再寫')
  }
  if (!write) {
    process.stdout.write('試算完成（沒有寫入）。要寫入加 --write。\n')
    return
  }
  for (const id of DIGIT_GAME_IDS) await writeFirestore(id, all[id])
}

main().catch((error) => {
  process.stderr.write(`失敗：${error instanceof Error ? error.message : 'unknown'}\n`)
  process.exit(1)
})
