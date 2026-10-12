/**
 * 美國加州天天樂（California Fantasy 5）歷史補進資料庫 + 產生歷史檔（2026-10-12 使用者：比照 539）。
 *
 * 來源見 shared/lotto/ca-fantasy5.ts：
 *   lotterycorner.com 每年一頁（1992 起）＋ lottery.net 每年一頁（2010 起）＋ lottery.net 最近 30 天 ＋ lotteryusa 最近 10 期。
 *   兩家都有的要號碼一致；不一致時，號碼跟自己前一天一模一樣的那家判定貼錯、剔掉（lottery.net 有 12 個月初這樣）。
 *   只有一家有的照收，標單一來源（2009 年以前全部、2010 年後 lottery.net 缺的天）。
 *
 * 用法：
 *   pnpm dlx tsx scripts/backfill-ca-fantasy5.ts                      試算：只抓網頁、比對、報告，不寫任何東西
 *   pnpm dlx tsx --env-file=.env.local scripts/backfill-ca-fantasy5.ts --write
 *       寫 Firestore draws/ca_fantasy5/results/{YYYYMMDD}（每期 1 次寫入）＋ latest/current，
 *       並寫 public/data/ca-fantasy5-history.json
 */
import { writeFileSync } from 'node:fs'
import {
  CA_FANTASY5_ID, caDrawTerm, mergeSources, parseDraws,
  type CaDraw, type MergedDraw
} from '../shared/lotto/ca-fantasy5'

const OUT = 'public/data/ca-fantasy5-history.json'
const FIRST_YEAR = 1992
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const BATCH = 400

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } })
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`)
  return r.text()
}

async function collect(urls: string[]): Promise<CaDraw[]> {
  const all: CaDraw[] = []
  for (const url of urls) {
    const draws = parseDraws(await fetchText(url))
    process.stdout.write(`  ${url} → ${draws.length} 期\n`)
    all.push(...draws)
    await sleep(800)
  }
  // 年頁與最近頁會重疊，同一天只留一筆（號碼不同交給 mergeSources 以外的檢查）
  const byDate = new Map<string, CaDraw>()
  for (const d of all) {
    const prev = byDate.get(d.date)
    if (prev && prev.nums.join(',') !== d.nums.join(',')) throw new Error(`同一家同一天號碼不一樣：${d.date}`)
    byDate.set(d.date, d)
  }
  return [...byDate.values()]
}

/** 每年缺哪幾天（天天樂每天開；早年不一定，給人看） */
function gapReport(draws: MergedDraw[]): string[] {
  const lines: string[] = []
  const byYear = new Map<string, number>()
  for (const d of draws) byYear.set(d.date.slice(0, 4), (byYear.get(d.date.slice(0, 4)) ?? 0) + 1)
  for (const [y, n] of [...byYear.entries()].sort()) {
    const sources = new Set(draws.filter(d => d.date.startsWith(y)).map(d => d.sources.join('+')))
    lines.push(`  ${y}：${n} 期（${[...sources].join('、')}）`)
  }
  return lines
}

async function writeFirestore(draws: MergedDraw[]): Promise<void> {
  const { getAdminFirestore } = await import('../server/utils/firebase-admin')
  const { Timestamp } = await import('firebase-admin/firestore')
  const db = getAdminFirestore()
  const col = db.collection('draws').doc(CA_FANTASY5_ID).collection('results')
  const toDoc = (d: MergedDraw) => ({
    gameId: CA_FANTASY5_ID,
    drawTerm: caDrawTerm(d.date),
    drawDate: d.date,
    numbers: d.nums,
    drawOrder: [],
    special: null,
    extras: { sources: d.sources, singleSource: d.sources.length < 2, droppedSources: d.dropped },
    source: d.sources.join('+'),
    fetchedAt: Timestamp.now(),
    schemaVersion: 1
  })
  for (let i = 0; i < draws.length; i += BATCH) {
    const batch = db.batch()
    for (const d of draws.slice(i, i + BATCH)) batch.set(col.doc(String(caDrawTerm(d.date))), toDoc(d))
    await batch.commit()
    process.stdout.write(`  寫入 ${Math.min(i + BATCH, draws.length)} / ${draws.length}\n`)
  }
  await db.collection('draws').doc(CA_FANTASY5_ID).collection('latest').doc('current').set(toDoc(draws.at(-1)!))
  const count = (await col.count().get()).data().count
  process.stdout.write(`資料庫 results 現在共 ${count} 期\n`)
  if (count !== draws.length) throw new Error(`資料庫筆數 ${count} 跟寫入 ${draws.length} 不一樣`)
}

function writeHistoryFile(draws: MergedDraw[]): void {
  const last = draws.at(-1)!
  const firstTwo = draws.find(d => d.sources.length >= 2)?.date ?? ''
  const body = draws.map(d => JSON.stringify([caDrawTerm(d.date), d.date, d.nums])).join(',\n')
  writeFileSync(OUT, `{"game":"${CA_FANTASY5_ID}","lastTerm":${caDrawTerm(last.date)},"lastDate":"${last.date}","count":${draws.length},"twoSourcesFrom":"${firstTwo}","rows":[\n${body}\n]}\n`)
  process.stdout.write(`寫入 ${OUT}：${draws.length} 期，到 ${last.date}\n`)
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write')
  const thisYear = new Date().getFullYear()
  const years = (from: number) => Array.from({ length: thisYear - from + 1 }, (_, i) => from + i)

  process.stdout.write('抓 lotterycorner …\n')
  const corner = await collect(years(FIRST_YEAR).map(y => `https://www.lotterycorner.com/ca/fantasy-5/${y}`))
  process.stdout.write('抓 lottery.net …\n')
  const net = await collect([
    ...years(2010).map(y => `https://www.lottery.net/california/fantasy-5/numbers/${y}`),
    'https://www.lottery.net/california/fantasy-5/numbers'
  ])
  process.stdout.write('抓 lotteryusa …\n')
  const usa = await collect(['https://www.lotteryusa.com/california/fantasy-5/'])

  const report = mergeSources({ 'lotterycorner': corner, 'lottery.net': net, 'lotteryusa': usa })
  const twoSource = report.draws.filter(d => d.sources.length >= 2).length
  const fixed = report.draws.filter(d => d.dropped.length)
  const single2010 = report.draws.filter(d => d.sources.length < 2 && d.date >= '2010-01-01')
  // 連兩天同一組號碼機率約 57 萬分之一：最後結果裡若有，表示來源還有貼錯沒抓到
  const repeatsPrev = report.draws.filter((d, i) => i > 0 && report.draws[i - 1]!.nums.join(',') === d.nums.join(','))
  process.stdout.write([
    '',
    `可收 ${report.draws.length} 期（${report.draws[0]?.date} ～ ${report.draws.at(-1)?.date}）`,
    `  兩家以上一致 ${twoSource} 期、單一來源 ${report.draws.length - twoSource} 期（其中 2010 年後 ${single2010.length} 期）`,
    `剔掉貼錯的來源 ${fixed.length} 期：`,
    ...fixed.map(d => `  ${d.date} 剔掉 ${d.dropped.join('、')}，採用 ${d.sources.join('、')} ${d.nums.join(' ')}`),
    `最後結果裡跟前一天號碼一樣的 ${repeatsPrev.length} 期${repeatsPrev.length ? '：' + repeatsPrev.map(d => d.date).join('、') : ''}`,
    `號碼不一致（不收）${report.conflicts.length} 期`,
    ...report.conflicts.map(c => `  ${c.date} ${JSON.stringify(c.bySource)}`),
    `格式不對（不收）${report.invalid.length} 筆`,
    ...report.invalid.map(x => `  ${x.source} ${JSON.stringify(x.draw)}`),
    '各年期數：',
    ...gapReport(report.draws),
    ''
  ].join('\n'))

  if (!write) {
    process.stdout.write('試算完成（沒有寫入）。要寫入加 --write。\n')
    return
  }
  if (report.conflicts.length || report.invalid.length || repeatsPrev.length) throw new Error('有不一致、格式不對或連兩天同號的期，先處理再寫')
  await writeFirestore(report.draws)
  writeHistoryFile(report.draws)
}

main().catch((error) => {
  process.stderr.write(`失敗：${error instanceof Error ? error.message : 'unknown'}\n`)
  process.exit(1)
})
