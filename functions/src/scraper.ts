import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { GAMES, type GameId } from './games.js'

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

function todayInTaipei(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
}

async function writeDrawsBatch(draws: DrawResult[]): Promise<void> {
  if (draws.length === 0) return
  const gameId = draws[0]!.gameId
  const db = getFirestore()
  const batch = db.batch()
  const col = db.collection('draws').doc(gameId).collection('results')
  for (const d of draws) {
    batch.set(col.doc(d.drawTerm.toString()), d)
  }
  await batch.commit()

  // latest 只在新批次最高期 > 現存時更新（避免被 backfill 舊批次蓋過）
  const top = draws.reduce((a, b) => (a.drawTerm > b.drawTerm ? a : b))
  const latestRef = db.collection('draws').doc(gameId).collection('latest').doc('current')
  await db.runTransaction(async (t) => {
    const snap = await t.get(latestRef)
    const existing = snap.exists ? ((snap.data()!.drawTerm as number) ?? 0) : 0
    if (top.drawTerm > existing) {
      t.set(latestRef, top)
    }
  })
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
      draws = arr.map(r => normalizeBingo(r, today))
    } else {
      const json = await fetchJson(`${API_BASE}/LatestResult`)
      const env = json as ApiEnvelope
      if (env.rtCode !== 0) throw new Error(`LatestResult rtCode=${env.rtCode}`)
      const content = env.content as Record<string, unknown> | undefined
      const fieldMap: Record<Exclude<GameId, 'bingo_bingo'>, string> = {
        lotto539: 'daily539Result',
        lotto649: 'lotto649Result',
        super_lotto638: 'superLotto638Result'
      }
      const raw = content?.[fieldMap[gameId]]
      if (raw && typeof raw === 'object') {
        draws = [normalizeDaily(gameId, raw as Record<string, unknown>)]
      }
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
