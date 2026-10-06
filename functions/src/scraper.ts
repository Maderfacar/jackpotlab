import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { GAMES, type GameId } from './games.js'
import {
  expectedLatestDrawDate,
  fetchOfficialLastNumber,
  fetchThirdParty,
  type FastDraw,
  type SlowGameId
} from './fast-sources.js'

const API_BASE = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery'

const HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (compatible; JackpotLab/1.0)',
  Accept: 'application/json',
  Referer: 'https://www.taiwanlottery.com/'
}

interface DrawResult {
  gameId: GameId
  drawTerm: number
  drawDate: string
  numbers: number[]
  drawOrder: number[]
  special: number | null
  extras: Record<string, unknown>
  source: string
  fetchedAt: Timestamp
  schemaVersion: number
  /** 初步結果：'thirdparty' 第三方兩家一致、'numbers' 官方 LastNumber（缺獎金）。官方完整紀錄沒有此欄位。 */
  provisional?: 'thirdparty' | 'numbers'
}

interface ApiEnvelope {
  rtCode: number
  rtMsg: string | null
  content?: Record<string, unknown> | null
}

async function fetchJson(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: HEADERS })
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText} - ${url}`)
  return r.json()
}

function extractArray(json: unknown, field: string): Record<string, unknown>[] {
  const env = json as ApiEnvelope
  if (env.rtCode !== 0) throw new Error(`rtCode=${env.rtCode}: ${env.rtMsg ?? ''}`)
  const arr = env.content?.[field]
  if (!Array.isArray(arr)) return []
  return arr as Record<string, unknown>[]
}

function isoDate(s: string): string {
  return s.slice(0, 10)
}

function nowTs(): Timestamp {
  return Timestamp.now()
}

function validateNumbers(gameId: GameId, mains: number[], expected: number): void {
  const g = GAMES[gameId]
  if (mains.length !== expected) {
    throw new Error(`${gameId} expected ${expected} numbers, got ${mains.length}`)
  }
  for (const n of mains) {
    if (n < g.numberMin || n > g.numberMax) {
      throw new Error(`${gameId} ${n} out of range`)
    }
  }
  if (new Set(mains).size !== mains.length) {
    throw new Error(`${gameId} duplicates: ${mains.join(',')}`)
  }
}

function validateSpecial(gameId: GameId, s: number): void {
  const g = GAMES[gameId]
  if (!g.hasSpecial || g.specialMin == null || g.specialMax == null) return
  if (s < g.specialMin || s > g.specialMax) {
    throw new Error(`${gameId} special ${s} out of range`)
  }
}

function normalizeDaily(gameId: GameId, raw: Record<string, unknown>): DrawResult {
  const period = raw.period as number
  const lotteryDate = raw.lotteryDate as string
  const drawNumberSize = raw.drawNumberSize as number[]
  const drawNumberAppear = raw.drawNumberAppear as number[]

  let mains: number[]
  let special: number | null = null
  if (gameId === 'lotto539') {
    mains = drawNumberSize
  } else {
    if (drawNumberSize.length !== 7) {
      throw new Error(`${gameId} drawNumberSize length expected 7`)
    }
    mains = drawNumberSize.slice(0, 6)
    special = drawNumberSize[6] ?? null
    if (special != null) validateSpecial(gameId, special)
  }
  validateNumbers(gameId, mains, GAMES[gameId].numbersCount)

  const {
    period: _p, lotteryDate: _l,
    drawNumberSize: _s, drawNumberAppear: _a,
    ...extras
  } = raw

  return {
    gameId,
    drawTerm: period,
    drawDate: isoDate(lotteryDate),
    numbers: [...mains].sort((a, b) => a - b),
    drawOrder: gameId === 'lotto539' ? drawNumberAppear : drawNumberAppear.slice(0, 6),
    special,
    extras,
    source: 'taiwanlottery.com',
    fetchedAt: nowTs(),
    schemaVersion: 1
  }
}

function normalizeBingo(raw: Record<string, unknown>, queryDate: string): DrawResult {
  const drawTerm = raw.drawTerm as number
  const bigShowOrder = (raw.bigShowOrder as string[]).map(Number)
  const openShowOrder = (raw.openShowOrder as string[]).map(Number)
  const bullEyeStr = raw.bullEyeTop as string | null | undefined
  const bullEye = bullEyeStr != null && bullEyeStr !== '' && bullEyeStr !== '－'
    ? Number(bullEyeStr) : null

  validateNumbers('bingo_bingo', bigShowOrder, 20)

  const {
    drawTerm: _t, bigShowOrder: _b, openShowOrder: _o,
    bullEyeTop: _be, dDate: _d, ...extras
  } = raw

  return {
    gameId: 'bingo_bingo',
    drawTerm,
    drawDate: queryDate,
    numbers: [...bigShowOrder].sort((a, b) => a - b),
    drawOrder: openShowOrder,
    special: bullEye,
    extras,
    source: 'taiwanlottery.com',
    fetchedAt: nowTs(),
    schemaVersion: 1
  }
}

/**
 * 慢彩種用「期號」直接查單筆 — byPeriod。
 * 比 LatestResult 聚合表更新即時、是 LatestResult 失效時的主動 fallback。
 */
async function fetchSlowByPeriod(
  gameId: Exclude<GameId, 'bingo_bingo'>,
  period: number
): Promise<Record<string, unknown> | null> {
  const url = `${API_BASE}/${GAMES[gameId].endpoint}?period=${period}`
  const json = await fetchJson(url)
  const arr = extractArray(json, GAMES[gameId].resultField)
  return arr[0] ?? null
}

/**
 * 從 Firestore latest mirror 讀目前已存的最高一期 drawTerm。
 * 用來算「下一期 = drawTerm + 1」當 byPeriod 查詢的 candidate。
 */
async function getCurrentLatestTerm(gameId: GameId): Promise<number | null> {
  return (await getCurrentLatest(gameId))?.drawTerm ?? null
}

async function getCurrentLatest(gameId: GameId): Promise<Pick<DrawResult, 'drawTerm' | 'drawDate' | 'provisional'> | null> {
  const snap = await getFirestore()
    .collection('draws').doc(gameId)
    .collection('latest').doc('current')
    .get()
  if (!snap.exists) return null
  const data = snap.data()
  if (typeof data?.drawTerm !== 'number') return null
  return { drawTerm: data.drawTerm, drawDate: data.drawDate as string, provisional: data.provisional }
}

/**
 * 慢彩種抓取主邏輯：
 *   Path 1: LatestResult 聚合表
 *   Path 2: 若 LatestResult 還沒 update，用 byPeriod 算下一期主動查
 *
 * 兩 path 都 try、取最高一期；都失敗回 []。
 */
async function fetchSlowGameLatestDraws(
  slowGameId: Exclude<GameId, 'bingo_bingo'>
): Promise<DrawResult[]> {
  const candidates: DrawResult[] = []

  // Path 1: LatestResult
  try {
    const json = await fetchJson(`${API_BASE}/LatestResult`)
    const env = json as ApiEnvelope
    if (env.rtCode === 0) {
      const content = env.content as Record<string, unknown> | undefined
      const fieldMap: Record<Exclude<GameId, 'bingo_bingo'>, string> = {
        lotto539: 'daily539Result',
        lotto649: 'lotto649Result',
        super_lotto638: 'superLotto638Result'
      }
      const raw = content?.[fieldMap[slowGameId]]
      if (raw && typeof raw === 'object') {
        candidates.push(normalizeDaily(slowGameId, raw as Record<string, unknown>))
      }
    }
  } catch {
    // LatestResult 掛掉不阻止 byPeriod fallback
  }

  // Path 2: byPeriod 算下一期主動查（只在 LatestResult 沒給更新一期時）；
  // latest 還是初步結果時查同一期拿官方完整版
  const current = await getCurrentLatest(slowGameId)
  const fromLatestResult = candidates[0]?.drawTerm ?? null
  const candidateTerm = current == null
    ? null
    : current.provisional ? current.drawTerm : current.drawTerm + 1
  const needByPeriod = candidateTerm != null
    && (fromLatestResult == null || fromLatestResult < candidateTerm)
  if (needByPeriod && candidateTerm != null) {
    try {
      const raw = await fetchSlowByPeriod(slowGameId, candidateTerm)
      if (raw) {
        const draw = normalizeDaily(slowGameId, raw)
        if (fromLatestResult == null || draw.drawTerm > fromLatestResult) {
          candidates.push(draw)
        }
      }
    } catch {
      // byPeriod 也失敗就放棄這輪、下次 cron 再試
    }
  }

  if (candidates.length === 0) return []
  return [candidates.reduce((a, b) => (b.drawTerm > a.drawTerm ? b : a))]
}

/**
 * 慢彩種完整流程：官方完整 → 官方 LastNumber → 第三方（pilio+i539 一致），
 * 拿到「應開獎日」那期就停。已是官方完整的最新一期 → 不打上游（每輪只 1 讀）。
 */
async function fetchSlowWithFastSources(slowGameId: SlowGameId): Promise<DrawResult[]> {
  const expected = expectedLatestDrawDate(slowGameId)
  const current = await getCurrentLatest(slowGameId)
  const haveExpected = current != null && current.drawDate >= expected
  if (haveExpected && !current?.provisional) return []

  const full = await fetchSlowGameLatestDraws(slowGameId)
  if (full.some(d => d.drawDate >= expected)) return full
  if (haveExpected && current?.provisional === 'numbers') return full

  const official = await fetchOfficialLastNumber(slowGameId, expected).catch(() => null)
  if (official) return [...full, fromFast(official)]
  if (haveExpected || current == null) return full

  const thirdParty = await fetchThirdParty(slowGameId, expected, current.drawTerm, current.drawDate).catch(() => null)
  return thirdParty ? [...full, fromFast(thirdParty)] : full
}

function fromFast(fast: FastDraw): DrawResult {
  return { ...fast, extras: {}, fetchedAt: nowTs(), schemaVersion: 1 }
}

function todayInTaipei(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
}

export function yesterdayInTaipei(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(Date.now() - 24 * 60 * 60 * 1000))
}

/**
 * 補一整天賓果（整批 upsert，doc id = drawTerm 自然去重）。
 * 每日自癒 cron 用：盤中漏抓的期、23:55 尾期都靠這條收乾淨。
 */
export async function scrapeBingoDay(date: string): Promise<ScrapeOutcome> {
  const startedAt = Date.now()
  try {
    const records = await fetchJson(`${API_BASE}/${GAMES.bingo_bingo.endpoint}?openDate=${date}&pageNum=1&pageSize=500`)
    const arr = extractArray(records, GAMES.bingo_bingo.resultField)
    const draws = arr.map(r => normalizeBingo(r, date))
    await writeDrawsBatch(draws)
    const top = draws.reduce<DrawResult | null>(
      (a, b) => (a == null || b.drawTerm > a.drawTerm ? b : a),
      null
    )
    const outcome: ScrapeOutcome = {
      gameId: 'bingo_bingo',
      written: draws.length,
      durationMs: Date.now() - startedAt,
      topDrawTerm: top?.drawTerm ?? null,
      topDrawDate: top?.drawDate ?? null
    }
    await writeHeartbeat('bingo_bingo', {
      status: 'ok',
      lastHealDate: date,
      lastHealWritten: outcome.written,
      lastHealAt: nowTs()
    })
    return outcome
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    await writeHeartbeat('bingo_bingo', {
      status: 'error',
      lastErrorAt: nowTs(),
      lastErrorMessage: `heal ${date}: ${message}`
    }).catch(() => { /* swallow */ })
    throw error
  }
}

async function writeDrawsBatch(draws: DrawResult[]): Promise<void> {
  if (draws.length === 0) return
  const gameId = draws[0]!.gameId
  const db = getFirestore()
  const batch = db.batch()
  const col = db.collection('draws').doc(gameId).collection('results')
  for (const d of draws) {
    if (d.provisional) continue
    batch.set(col.doc(d.drawTerm.toString()), d)
  }
  await batch.commit()

  // 初步結果不可蓋掉已存在的更可靠紀錄（cron 與開站補抓可能同時寫）
  for (const d of draws.filter(x => x.provisional)) {
    const ref = col.doc(d.drawTerm.toString())
    await db.runTransaction(async (t) => {
      const snap = await t.get(ref)
      if (snap.exists && rank(snap.data() as DrawResult) > rank(d)) return
      t.set(ref, d)
    })
  }

  // latest 只在新批次最高期 > 現存時更新（避免被 backfill 舊批次蓋過）；
  // 同一期只允許往更可靠的等級升級（第三方 → 官方號碼 → 官方完整）
  const top = draws.reduce((a, b) => (a.drawTerm > b.drawTerm ? a : b))
  const latestRef = db.collection('draws').doc(gameId).collection('latest').doc('current')
  await db.runTransaction(async (t) => {
    const snap = await t.get(latestRef)
    const existing = snap.exists ? (snap.data() as DrawResult) : null
    const existingTerm = existing?.drawTerm ?? 0
    const upgradesSameTerm = existing != null && top.drawTerm === existingTerm && rank(top) > rank(existing)
    if (top.drawTerm > existingTerm || upgradesSameTerm) {
      t.set(latestRef, top)
    }
  })
}

/** 資料可靠度：官方完整 2 > 官方號碼 1 > 第三方 0。 */
function rank(d: Pick<DrawResult, 'provisional'>): number {
  if (d.provisional === 'thirdparty') return 0
  if (d.provisional === 'numbers') return 1
  return 2
}

async function writeHeartbeat(gameId: GameId, payload: Record<string, unknown>): Promise<void> {
  await getFirestore().collection('health').doc(gameId).set({
    gameId,
    lastRunAt: nowTs(),
    ...payload
  }, { merge: true })
}

export interface ScrapeOutcome {
  gameId: GameId
  written: number
  durationMs: number
  topDrawTerm: number | null
  topDrawDate: string | null
}

/**
 * 拉一個彩種最新一期，寫 Firestore，更新心跳。
 * 慢彩種 (539/大樂透/威力彩) 用 LatestResult endpoint 一次抓三個。
 * 賓果賓果用今日 openDate 整批寫入（dedupe 由 doc id 處理）。
 */
export async function scrapeAndStore(gameId: GameId): Promise<ScrapeOutcome> {
  const startedAt = Date.now()
  let draws: DrawResult[] = []

  try {
    if (gameId === 'bingo_bingo') {
      const today = todayInTaipei()
      const records = await fetchJson(`${API_BASE}/${GAMES.bingo_bingo.endpoint}?openDate=${today}&pageNum=1&pageSize=500`)
      const arr = extractArray(records, GAMES.bingo_bingo.resultField)
      const all = arr.map(r => normalizeBingo(r, today))
      // 增量：只寫比現存最新期更新的 → 每輪 1 讀 + 1~2 寫。
      // （舊版每輪整批重寫當日 ~220 筆，是 2026-07-19 因用量停用的主因。
      //   當日中途漏掉的期由 scrapeBingoDay 的每日自癒補齊。）
      const latest = await getCurrentLatestTerm('bingo_bingo')
      draws = latest == null ? all : all.filter(d => d.drawTerm > latest)
    } else {
      draws = await fetchSlowWithFastSources(gameId)
    }

    await writeDrawsBatch(draws)
    const top = draws.reduce<DrawResult | null>(
      (a, b) => (a == null || b.drawTerm > a.drawTerm ? b : a),
      null
    )
    const outcome: ScrapeOutcome = {
      gameId,
      written: draws.length,
      durationMs: Date.now() - startedAt,
      topDrawTerm: top?.drawTerm ?? null,
      topDrawDate: top?.drawDate ?? null
    }
    await writeHeartbeat(gameId, {
      status: 'ok',
      lastSuccessAt: nowTs(),
      lastWritten: outcome.written,
      lastTopDrawTerm: outcome.topDrawTerm,
      lastTopDrawDate: outcome.topDrawDate,
      lastDurationMs: outcome.durationMs
    })
    return outcome
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    await writeHeartbeat(gameId, {
      status: 'error',
      lastErrorAt: nowTs(),
      lastErrorMessage: message
    }).catch(() => { /* swallow */ })
    throw error
  }
}
