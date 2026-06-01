import { z } from 'zod'
import {
  apiEnvelopeSchema,
  bingoBingoRecordSchema,
  daily539RecordSchema,
  latestResultSchema,
  lotto649RecordSchema,
  superLotto638RecordSchema,
  type BingoBingoRecord,
  type Daily539Record,
  type Lotto649Record,
  type SuperLotto638Record
} from '../../shared/lotto/schemas'
import { GAMES, type GameId } from '../../shared/lotto/games'

const API_BASE = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery'

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (compatible; JackpotLab/1.0)',
  Accept: 'application/json',
  Referer: 'https://www.taiwanlottery.com/'
}

class TaiwanLotteryApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'TaiwanLotteryApiError'
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: DEFAULT_HEADERS })
  if (!response.ok) {
    throw new TaiwanLotteryApiError(response.status, `${response.status} ${response.statusText} — ${url}`)
  }
  return response.json()
}

function extractContent(json: unknown): Record<string, unknown> | null {
  const env = apiEnvelopeSchema.parse(json)
  if (env.rtCode !== 0) {
    throw new TaiwanLotteryApiError(500, `Taiwan Lottery rtCode=${env.rtCode}: ${env.rtMsg ?? 'unknown'}`)
  }
  return (env.content as Record<string, unknown> | null | undefined) ?? null
}

function extractArray<T>(json: unknown, field: string, schema: z.ZodType<T>): T[] {
  const content = extractContent(json)
  if (!content) return []
  const arr = content[field]
  if (arr == null) return []
  return z.array(schema).parse(arr)
}

/**
 * 539 — 用期號查單筆。
 * @param period e.g. 115000132 (民國年 3 + "000" + 期數 3)
 */
export async function fetchDaily539ByPeriod(period: number): Promise<Daily539Record | null> {
  const url = `${API_BASE}/${GAMES.lotto539.endpoint}?period=${period}`
  const records = extractArray(await fetchJson(url), GAMES.lotto539.resultField, daily539RecordSchema)
  return records[0] ?? null
}

/**
 * 大樂透 — 用期號查單筆。
 */
export async function fetchLotto649ByPeriod(period: number): Promise<Lotto649Record | null> {
  const url = `${API_BASE}/${GAMES.lotto649.endpoint}?period=${period}`
  const records = extractArray(await fetchJson(url), GAMES.lotto649.resultField, lotto649RecordSchema)
  return records[0] ?? null
}

/**
 * 威力彩 — 用期號查單筆。
 */
export async function fetchSuperLotto638ByPeriod(period: number): Promise<SuperLotto638Record | null> {
  const url = `${API_BASE}/${GAMES.super_lotto638.endpoint}?period=${period}`
  const records = extractArray(await fetchJson(url), GAMES.super_lotto638.resultField, superLotto638RecordSchema)
  return records[0] ?? null
}

/**
 * 賓果賓果 — 用日期查當日全部期數（通常 200+ 筆）。
 * 注意：API 預設 pageSize=10，必須明指 pageSize 才能拿全部。
 * @param date YYYY-MM-DD (台北時區)
 */
export async function fetchBingoByDate(date: string): Promise<BingoBingoRecord[]> {
  const url = `${API_BASE}/${GAMES.bingo_bingo.endpoint}?openDate=${date}&pageNum=1&pageSize=500`
  return extractArray(await fetchJson(url), GAMES.bingo_bingo.resultField, bingoBingoRecordSchema)
}

interface LatestSnapshot {
  daily539: Daily539Record | null
  lotto649: Lotto649Record | null
  superLotto638: SuperLotto638Record | null
}

/**
 * LatestResult — 一次回 539 / 大樂透 / 威力彩 最新一期（不含賓果賓果）。
 * 這是抓「最新」最省的方法 — 一次 HTTP 就拿到三個彩種。
 */
export async function fetchLatestSnapshot(): Promise<LatestSnapshot> {
  const json = await fetchJson(`${API_BASE}/LatestResult`)
  const parsed = latestResultSchema.parse(json)
  if (parsed.rtCode !== 0) {
    throw new TaiwanLotteryApiError(500, `LatestResult rtCode=${parsed.rtCode}`)
  }
  return {
    daily539: parsed.content.daily539Result ?? null,
    lotto649: parsed.content.lotto649Result ?? null,
    superLotto638: parsed.content.superLotto638Result ?? null
  }
}

/** 期號編碼: 民國年 × 1_000_000 + 期數 */
export function encodePeriod(rocYear: number, sequence: number): number {
  if (rocYear < 100 || rocYear > 999) throw new Error(`rocYear out of range: ${rocYear}`)
  if (sequence < 1 || sequence > 999) throw new Error(`sequence out of range: ${sequence}`)
  return rocYear * 1_000_000 + sequence
}

/** 期號解碼回 (rocYear, sequence) */
export function decodePeriod(period: number): { rocYear: number, sequence: number } {
  return { rocYear: Math.floor(period / 1_000_000), sequence: period % 1_000_000 }
}

/** 西元年 → 民國年 */
export function rocYearOf(gregorianYear: number): number {
  return gregorianYear - 1911
}

export { TaiwanLotteryApiError }
export type { LatestSnapshot }

/**
 * 統一抽象 — 給 service / scraper 層用。
 * gameId + 查詢條件 → normalized DrawResult array.
 *
 * 不引入 normalize 是為了讓這個檔保持「純抓取 + 結構驗證」。
 * 正規化交給 draw-service.ts。
 */
export const taiwanLottery = {
  fetchDaily539ByPeriod,
  fetchLotto649ByPeriod,
  fetchSuperLotto638ByPeriod,
  fetchBingoByDate,
  fetchLatestSnapshot
} as const

export type GameRecord<G extends GameId> =
  G extends 'lotto539' ? Daily539Record
    : G extends 'lotto649' ? Lotto649Record
      : G extends 'super_lotto638' ? SuperLotto638Record
        : G extends 'bingo_bingo' ? BingoBingoRecord
          : never
