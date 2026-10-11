/**
 * 539 早年歷史補抓（2026-10-11 使用者要求：資料庫原本只從 2024-01-01 開始，補到 539 開賣的 2007-01-01）。
 * 用台彩「按月份查」一次拿整個月，寫進 Firestore draws/lotto539/results/{期號}；已存在的期號直接覆蓋成同一份官方資料。
 * 寫完逐年核對：每年筆數必須等於該年最後一期的期數（期號連號、從 001 起），對不上就列出來。
 *
 * 用法：
 *   pnpm dlx tsx --env-file=.env.local scripts/backfill-539-history.ts --from 2007 --to 2023
 *   加 --dry-run 只抓不寫
 *
 * 環境變數：FIREBASE_SERVICE_ACCOUNT_JSON 必填。
 */

import { normalize539 } from '../shared/lotto/normalize'
import type { DrawResult } from '../shared/lotto/types'
import { upsertDraws } from '../server/utils/draw-store'
import { taiwanLottery } from '../server/utils/taiwan-lottery'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const fromYear = Number(arg('--from') ?? 2007)
const toYear = Number(arg('--to') ?? 2023)
const dryRun = process.argv.includes('--dry-run')

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const log = (m: string) => process.stdout.write(`${new Date().toISOString()} ${m}\n`)

async function fetchMonth(month: string): Promise<DrawResult[]> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raws = await taiwanLottery.fetchDaily539ByMonth(month)
      return raws.map(r => normalize539(r as unknown as Record<string, unknown>))
    } catch (error) {
      log(`${month} 第 ${attempt} 次失敗：${error instanceof Error ? error.message : 'unknown'}`)
      await sleep(1500 * attempt)
    }
  }
  throw new Error(`${month} 連續 3 次抓取失敗，停止`)
}

async function main(): Promise<void> {
  if (!(fromYear >= 2007 && toYear >= fromYear && toYear <= 2100)) throw new Error(`年份範圍不對：${fromYear}～${toYear}`)
  log(`539 補抓 ${fromYear}～${toYear}${dryRun ? '（dry-run，不寫入）' : ''}`)
  const problems: string[] = []
  let total = 0

  for (let y = fromYear; y <= toYear; y++) {
    const yearDraws: DrawResult[] = []
    for (let m = 1; m <= 12; m++) {
      const month = `${y}-${String(m).padStart(2, '0')}`
      yearDraws.push(...await fetchMonth(month))
      await sleep(250)
    }
    // 只收這一年的期號（民國年 = 西元 − 1911）
    const roc = y - 1911
    const draws = yearDraws.filter(d => Math.floor(d.drawTerm / 1_000_000) === roc)
    const seqs = draws.map(d => d.drawTerm % 1_000_000).sort((a, b) => a - b)
    const maxSeq = seqs.at(-1) ?? 0
    const unique = new Set(seqs).size
    if (unique !== draws.length || unique !== maxSeq || seqs[0] !== 1) {
      problems.push(`${y}：抓到 ${draws.length} 筆、不重複 ${unique}、期數 ${seqs[0]}～${maxSeq}`)
    }
    if (!dryRun) {
      for (let i = 0; i < draws.length; i += 100) await upsertDraws('lotto539', draws.slice(i, i + 100))
    }
    total += draws.length
    log(`${y}（民國 ${roc}）${draws.length} 期，第 ${seqs[0]}～${maxSeq} 期${dryRun ? '' : '，已寫入'}`)
  }

  log(`完成：共 ${total} 期`)
  if (problems.length) {
    log(`⚠ 有 ${problems.length} 年對不上：\n  ${problems.join('\n  ')}`)
    process.exitCode = 1
  } else {
    log('每年筆數都等於該年最後一期的期數，沒有缺號或重複')
  }
}

main().catch((error) => {
  process.stderr.write(`補抓失敗：${error instanceof Error ? error.message : 'unknown'}\n`)
  process.exit(1)
})
