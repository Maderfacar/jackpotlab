import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { expectedLatestDrawDate } from './fast-sources.js'

/**
 * 三星彩、四星彩每天抓（2026-11-09 使用者要求放資料庫）。
 * 開獎日、時間跟 539 一樣（週一～六 20:30），所以掛在 scrape539 同一個排程裡，不另開排程。
 *
 * 複本：解析與 jackpotlab/shared/lotto/digit-games.ts 同義（functions 必須自包），改動要同步。
 */

const API_BASE = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery'
const HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (compatible; JackpotLab/1.0)',
  'Accept': 'application/json',
  'Referer': 'https://www.taiwanlottery.com/'
}

const DIGIT_GAMES = {
  lotto3d: { endpoint: '3DResult', listField: 'lotto3DRes', latestField: 'lotto3DResult', digits: 3 },
  lotto4d: { endpoint: '4DResult', listField: 'lotto4DRes', latestField: 'lotto4DResult', digits: 4 }
} as const

export type DigitGameId = keyof typeof DIGIT_GAMES
export const DIGIT_GAME_IDS = Object.keys(DIGIT_GAMES) as DigitGameId[]

interface DigitDraw {
  gameId: DigitGameId
  drawTerm: number
  drawDate: string
  numbers: number[]
  drawOrder: number[]
  special: null
  extras: Record<string, unknown>
  source: 'taiwanlottery.com'
  schemaVersion: 1
}

function normalizeDigitDraw(gameId: DigitGameId, raw: Record<string, unknown>): DigitDraw {
  const { digits } = DIGIT_GAMES[gameId]
  const { period, lotteryDate, drawNumberAppear, ...extras } = raw
  if (typeof period !== 'number' || !Number.isInteger(period)) throw new Error(`${gameId} 期號不對：${String(period)}`)
  if (typeof lotteryDate !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(lotteryDate)) throw new Error(`${gameId} ${period} 日期不對：${String(lotteryDate)}`)
  if (!Array.isArray(drawNumberAppear) || drawNumberAppear.length !== digits) throw new Error(`${gameId} ${period} 要 ${digits} 個數字`)
  const nums = drawNumberAppear.map(Number)
  if (nums.some(n => !Number.isInteger(n) || n < 0 || n > 9)) throw new Error(`${gameId} ${period} 數字要 0～9：${nums.join(',')}`)
  return {
    gameId,
    drawTerm: period,
    drawDate: lotteryDate.slice(0, 10),
    numbers: nums,
    drawOrder: [...nums],
    special: null,
    extras,
    source: 'taiwanlottery.com',
    schemaVersion: 1
  }
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  const r = await fetch(url, { headers: HEADERS })
  if (!r.ok) throw new Error(`HTTP ${r.status} - ${url}`)
  const json = await r.json() as { rtCode: number, rtMsg: string | null, content?: Record<string, unknown> | null }
  if (json.rtCode !== 0) throw new Error(`rtCode=${json.rtCode}: ${json.rtMsg ?? ''}`)
  return json.content ?? null
}

/** 官方最新一期：先看 LatestResult，比現存還舊就用期號查下一期 */
async function fetchNewer(gameId: DigitGameId, currentTerm: number): Promise<DigitDraw | null> {
  const g = DIGIT_GAMES[gameId]
  let best: DigitDraw | null = null
  try {
    const raw = (await fetchJson(`${API_BASE}/LatestResult`))?.[g.latestField]
    if (raw && typeof raw === 'object') best = normalizeDigitDraw(gameId, raw as Record<string, unknown>)
  } catch {
    // LatestResult 掛掉就改用期號查
  }
  if (best == null || best.drawTerm <= currentTerm) {
    const arr = (await fetchJson(`${API_BASE}/${g.endpoint}?period=${currentTerm + 1}`))?.[g.listField]
    const raw = Array.isArray(arr) ? arr[0] : null
    if (raw) best = normalizeDigitDraw(gameId, raw as Record<string, unknown>)
  }
  return best != null && best.drawTerm > currentTerm ? best : null
}

export interface DigitOutcome {
  gameId: DigitGameId
  written: number
  topDrawTerm: number | null
}

/** 抓一個星彩的最新一期；已存到「應開獎日」就只讀 1 次、不打官方 */
export async function scrapeDigitGame(gameId: DigitGameId): Promise<DigitOutcome> {
  const db = getFirestore()
  const latestRef = db.collection('draws').doc(gameId).collection('latest').doc('current')
  const snap = await latestRef.get()
  const current = snap.exists ? snap.data() as { drawTerm?: number, drawDate?: string } : null
  if (typeof current?.drawTerm !== 'number') throw new Error(`${gameId} 資料庫還沒有 latest，先跑 scripts/backfill-digit-games.ts --write`)
  if ((current.drawDate ?? '') >= expectedLatestDrawDate('lotto539')) return { gameId, written: 0, topDrawTerm: current.drawTerm }

  const draw = await fetchNewer(gameId, current.drawTerm)
  if (draw == null) return { gameId, written: 0, topDrawTerm: current.drawTerm }
  // 中間漏掉的期（排程某天沒跑成）用期號補，最多補 MAX_GAP 期
  const draws = [draw]
  // 期號前 3 碼是民國年，跨年時新年度從 001 起
  const yearStart = Math.floor(draw.drawTerm / 1e6) * 1e6 + 1
  for (let t = Math.max(current.drawTerm + 1, draw.drawTerm - MAX_GAP, yearStart); t < draw.drawTerm; t++) {
    const arr = (await fetchJson(`${API_BASE}/${DIGIT_GAMES[gameId].endpoint}?period=${t}`))?.[DIGIT_GAMES[gameId].listField]
    if (Array.isArray(arr) && arr[0]) draws.push(normalizeDigitDraw(gameId, arr[0] as Record<string, unknown>))
  }
  const col = db.collection('draws').doc(gameId).collection('results')
  const batch = db.batch()
  for (const d of draws) batch.set(col.doc(String(d.drawTerm)), { ...d, fetchedAt: Timestamp.now() })
  await batch.commit()
  const doc = { ...draw, fetchedAt: Timestamp.now() }
  await db.runTransaction(async (t) => {
    const s = await t.get(latestRef)
    if ((s.data()?.drawTerm ?? 0) < draw.drawTerm) t.set(latestRef, doc)
  })
  return { gameId, written: draws.length, topDrawTerm: draw.drawTerm }
}

/** 一次最多往回補幾期 */
const MAX_GAP = 12
