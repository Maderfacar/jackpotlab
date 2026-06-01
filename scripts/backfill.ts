/**
 * 近 3 年歷史 backfill。從本機跑，直接寫 Firestore。
 *
 * 用法（需先 pnpm add -D tsx，或用 node --experimental-strip-types）：
 *   pnpm dlx tsx --env-file=.env.local scripts/backfill.ts --game lotto539
 *   pnpm dlx tsx --env-file=.env.local scripts/backfill.ts --game all --years 3
 *
 * 環境變數：FIREBASE_SERVICE_ACCOUNT_JSON 必填。
 */

import { GAME_IDS, GAMES, type GameId } from '../shared/lotto/games'
import {
  normalize539,
  normalize649,
  normalizeBingo,
  normalizeSuperLotto
} from '../shared/lotto/normalize'
import type { DrawResult } from '../shared/lotto/types'
import { upsertDraws } from '../server/utils/draw-store'
import {
  taiwanLottery,
  rocYearOf
} from '../server/utils/taiwan-lottery'

interface Args {
  game: GameId | 'all'
  years: number
  startDate?: string
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  let game: Args['game'] = 'all'
  let years = 3
  let startDate: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--game' && argv[i + 1]) {
      const v = argv[i + 1]
      if (v === 'all' || (GAME_IDS as readonly string[]).includes(v!)) {
        game = v as Args['game']
      } else {
        throw new Error(`unknown game: ${v}`)
      }
      i++
    } else if (a === '--years' && argv[i + 1]) {
      years = Number.parseInt(argv[i + 1]!, 10)
      i++
    } else if (a === '--from' && argv[i + 1]) {
      startDate = argv[i + 1]
      i++
    }
  }
  return { game, years, startDate }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function log(message: string): void {
  process.stdout.write(`${new Date().toISOString()} ${message}\n`)
}

/**
 * 慢彩種 backfill：用「年×期數」掃描。
 * 每年從 sequence 999 往下掃，連續 N 個 miss 就跳到上一年。
 * 比起跨年掃 period 數字，這樣不會浪費請求在年邊界的空隙上。
 */
async function backfillDailyGame(gameId: GameId, years: number): Promise<void> {
  log(`[${gameId}] start — ${years} years`)
  const meta = GAMES[gameId]

  const currentRocYear = rocYearOf(new Date().getFullYear())
  const oldestYear = currentRocYear - (years - 1)
  const buffer: DrawResult[] = []
  let totalSaved = 0

  // 每年 sequence 從 SCAN_START 往下掃，足以涵蓋每日彩種（365）+ 緩衝
  const SCAN_START = 400
  for (let rocYear = currentRocYear; rocYear >= oldestYear; rocYear--) {
    log(`[${gameId}] scanning ROC year ${rocYear} from seq ${SCAN_START}`)
    let consecutiveMisses = 0
    const MAX_MISSES_TO_START = SCAN_START  // 還沒找到時就掃完整年
    const MAX_MISSES_AFTER = 10              // 找到後 10 個 miss = 年底
    let foundFirst = false

    for (let seq = SCAN_START; seq >= 1; seq--) {
      const period = rocYear * 1_000_000 + seq
      let raw: unknown
      try {
        raw = await fetchOne(gameId, period)
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'unknown'
        log(`[${gameId}] fetch ${period} failed: ${msg}`)
        await sleep(500)
        continue
      }

      if (!raw) {
        consecutiveMisses++
        const limit = foundFirst ? MAX_MISSES_AFTER : MAX_MISSES_TO_START
        if (consecutiveMisses >= limit) {
          if (!foundFirst) {
            log(`[${gameId}] year ${rocYear} miss limit @ seq ${seq} — skip year`)
          } else {
            log(`[${gameId}] year ${rocYear} ended @ seq ${seq + limit} — flush`)
          }
          break
        }
        continue
      }

      consecutiveMisses = 0
      foundFirst = true
      try {
        const normalized = normalizeOne(gameId, raw as Record<string, unknown>)
        buffer.push(normalized)
        if (buffer.length >= 50) {
          await upsertDraws(gameId, buffer)
          totalSaved += buffer.length
          log(`[${gameId}] saved ${buffer.length} (total ${totalSaved}), latest=${meta.shortName} ${buffer[0]!.drawTerm}`)
          buffer.length = 0
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'unknown'
        log(`[${gameId}] normalize ${period} failed: ${msg}`)
      }
      await sleep(120)
    }
  }

  if (buffer.length > 0) {
    await upsertDraws(gameId, buffer)
    totalSaved += buffer.length
    log(`[${gameId}] final saved ${buffer.length} (total ${totalSaved})`)
  }
  log(`[${gameId}] done — total ${totalSaved} records`)
}

/**
 * 賓果賓果 backfill：逐日。
 */
async function backfillBingo(years: number, startDate?: string): Promise<void> {
  const log_ = (m: string) => log(`[bingo_bingo] ${m}`)
  log_(`start — ${years} years`)

  const today = new Date()
  const earliest = new Date(today)
  earliest.setFullYear(today.getFullYear() - years)

  const cursor = startDate ? new Date(startDate) : new Date(today)
  while (cursor >= earliest) {
    const iso = cursor.toISOString().slice(0, 10)
    try {
      const records = await taiwanLottery.fetchBingoByDate(iso)
      if (records.length === 0) {
        log_(`${iso} — no records`)
      } else {
        const normalized = records.map(r => normalizeBingo(r as unknown as Record<string, unknown>, iso))
        await upsertDraws('bingo_bingo', normalized)
        log_(`${iso} — saved ${normalized.length}`)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'unknown'
      log_(`${iso} — failed: ${msg}`)
    }
    cursor.setDate(cursor.getDate() - 1)
    await sleep(300)
  }
  log_('done')
}

function normalizeOne(gameId: GameId, raw: Record<string, unknown>): DrawResult {
  switch (gameId) {
    case 'lotto539': return normalize539(raw)
    case 'lotto649': return normalize649(raw)
    case 'super_lotto638': return normalizeSuperLotto(raw)
    case 'bingo_bingo': throw new Error('use normalizeBingo path')
  }
}

async function fetchOne(gameId: GameId, period: number): Promise<unknown | null> {
  switch (gameId) {
    case 'lotto539': return taiwanLottery.fetchDaily539ByPeriod(period)
    case 'lotto649': return taiwanLottery.fetchLotto649ByPeriod(period)
    case 'super_lotto638': return taiwanLottery.fetchSuperLotto638ByPeriod(period)
    case 'bingo_bingo': throw new Error('bingo backfill uses date path')
  }
}

async function main(): Promise<void> {
  const args = parseArgs()
  log(`backfill start — game=${args.game} years=${args.years}`)

  if (args.game === 'all') {
    await backfillDailyGame('lotto539', args.years)
    await backfillDailyGame('lotto649', args.years)
    await backfillDailyGame('super_lotto638', args.years)
    await backfillBingo(args.years, args.startDate)
  } else if (args.game === 'bingo_bingo') {
    await backfillBingo(args.years, args.startDate)
  } else {
    await backfillDailyGame(args.game, args.years)
  }

  log('all done')
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : 'unknown'
  process.stderr.write(`backfill failed: ${msg}\n`)
  process.exit(1)
})
