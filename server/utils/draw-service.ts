import { BINGO_LIVE_ENABLED, GAMES, type GameId } from '../../shared/lotto/games'
import {
  normalize539,
  normalize649,
  normalizeBingo,
  normalizeSuperLotto
} from '../../shared/lotto/normalize'
import {
  expectedLatestDrawDate,
  fetchOfficialLastNumber,
  fetchThirdParty,
  type FastDraw,
  type SlowGameId
} from '../../shared/lotto/fast-sources'
import type { DrawResult } from '../../shared/lotto/types'
import { getByDate, getLatest, getRecent, upsertDraws } from './draw-store'
import { taiwanLottery } from './taiwan-lottery'

/**
 * 把 taiwanlottery API 的原始 record 包成 normalized DrawResult。
 * 賓果賓果需要 queryDate 因為它的 dDate 是垃圾值。
 */
function normalizeOne(gameId: GameId, raw: Record<string, unknown>, queryDate?: string): DrawResult {
  switch (gameId) {
    case 'lotto539':
      return normalize539(raw)
    case 'lotto649':
      return normalize649(raw)
    case 'super_lotto638':
      return normalizeSuperLotto(raw)
    case 'bingo_bingo':
      if (!queryDate) throw new Error('bingo_bingo requires queryDate')
      return normalizeBingo(raw, queryDate)
  }
}

/**
 * 抓「最新一期」：先看 Firestore，太舊就現抓 + 寫回快取。
 *
 *  - 539/大樂透/威力彩：用 LatestResult 一次拿 3 個彩種，每個都 upsert
 *  - 賓果賓果：抓今日 (台北時區) 整批，回最高 drawTerm 那一筆
 *
 * maxAgeMinutes: 超過這個年齡視為過期，現抓一次。預設 5 分鐘（只用於賓果）。
 *
 * 慢彩種（539/大樂透/威力彩）不看年齡，改看「該開的那期有沒有到、是不是官方完整版」：
 *   已存最新一期的開獎日 < 最近一個應開獎日，或還是初步結果 → 現抓。
 *   現抓順序：官方完整（LatestResult/byPeriod）→ 官方 LastNumber → 第三方（pilio+i539 一致）。
 *   已經是官方完整的最新一期就完全不打上游。同一彩種 60 秒內最多打一次上游。
 */
export async function getLatestDraw(
  gameId: GameId,
  options: { maxAgeMinutes?: number, forceFresh?: boolean } = {}
): Promise<{ draw: DrawResult | null, fromCache: boolean }> {
  const maxAgeMinutes = options.maxAgeMinutes ?? 5
  const forceFresh = options.forceFresh ?? false

  const cached = await getLatest(gameId)
  // 賓果關閉時只讀已存資料，不打上游、不寫 Firestore
  if (gameId === 'bingo_bingo' && !BINGO_LIVE_ENABLED && !forceFresh) {
    return { draw: cached, fromCache: true }
  }
  if (!forceFresh && cached) {
    const upToDate = gameId === 'bingo_bingo'
      ? !isStale(cached.fetchedAt, maxAgeMinutes)
      : cached.drawDate >= expectedLatestDrawDate(gameId) && !cached.provisional
    if (upToDate || isThrottled(gameId)) {
      return { draw: cached, fromCache: true }
    }
  }

  lastUpstreamAttempt.set(gameId, Date.now())
  const fresh = gameId === 'bingo_bingo'
    ? await fetchLatestFromApi(gameId)
    : await fetchSlowLatest(gameId, cached)
  if (fresh.length > 0) {
    await upsertDraws(gameId, fresh)
  }
  const top = fresh.reduce<DrawResult | null>(
    (acc, cur) => (acc == null || cur.drawTerm > acc.drawTerm ? cur : acc),
    null
  )
  return { draw: top != null && (cached == null || top.drawTerm >= cached.drawTerm) ? top : cached, fromCache: false }
}

/**
 * 慢彩種：官方完整 → 官方 LastNumber → 第三方，拿到「應開獎日」那期就停。
 * 已存的初步結果只會被更可靠的等級取代（見 draw-store upsertDraws）。
 */
async function fetchSlowLatest(gameId: SlowGameId, cached: DrawResult | null): Promise<DrawResult[]> {
  const expected = expectedLatestDrawDate(gameId)

  const full = await fetchLatestFromApi(gameId).catch(() => [] as DrawResult[])
  if (full.some(d => d.drawDate >= expected)) return full

  const haveExpected = cached != null && cached.drawDate >= expected
  if (haveExpected && cached?.provisional === 'numbers') return full

  const official = await fetchOfficialLastNumber(gameId, expected).catch(() => null)
  if (official) return [...full, fromFast(official)]
  if (haveExpected || cached == null) return full

  const thirdParty = await fetchThirdParty(gameId, expected, cached.drawTerm, cached.drawDate).catch(() => null)
  return thirdParty ? [...full, fromFast(thirdParty)] : full
}

function fromFast(fast: FastDraw): DrawResult {
  return {
    ...fast,
    extras: {},
    fetchedAt: new Date().toISOString(),
    schemaVersion: 1
  }
}

/**
 * 用日期查開獎。
 *
 *  - 539/大樂透/威力彩：同日最多 1 期。Firestore 沒有就現抓對應期數。
 *  - 賓果賓果：同日 ~226 期。Firestore 沒有完整就現抓整日。
 */
export async function getDrawsByDate(
  gameId: GameId,
  drawDate: string,
  options: { forceFresh?: boolean } = {}
): Promise<{ draws: DrawResult[], fromCache: boolean }> {
  const forceFresh = options.forceFresh ?? false

  if (!forceFresh) {
    const cached = await getByDate(gameId, drawDate)
    // 賓果關閉時只讀已存資料（原本當天每次都重抓整天再整批重寫，是費用主因）
    if (gameId === 'bingo_bingo' && !BINGO_LIVE_ENABLED) {
      return { draws: cached, fromCache: true }
    }
    if (cached.length > 0 && isCacheCompleteFor(gameId, cached, drawDate)) {
      return { draws: cached, fromCache: true }
    }
  }

  const fresh = await fetchByDateFromApi(gameId, drawDate)
  if (fresh.length > 0) {
    await upsertDraws(gameId, fresh)
  }
  return { draws: fresh, fromCache: false }
}

/** 抓最近 N 期 — 純讀 Firestore，不打 taiwanlottery（避免 N 次 HTTP）。
 *  上限 7000：涵蓋賓果 days=30（30 × 230 期）。 */
export async function getRecentDraws(gameId: GameId, limit: number): Promise<DrawResult[]> {
  return getRecent(gameId, Math.min(limit, 7000))
}

// ---------- internal helpers ----------

const UPSTREAM_THROTTLE_MS = 60 * 1000
const lastUpstreamAttempt = new Map<GameId, number>()

function isThrottled(gameId: GameId): boolean {
  const last = lastUpstreamAttempt.get(gameId)
  return last != null && Date.now() - last < UPSTREAM_THROTTLE_MS
}

function isStale(fetchedAtIso: string, maxAgeMinutes: number): boolean {
  const ageMs = Date.now() - new Date(fetchedAtIso).getTime()
  return ageMs > maxAgeMinutes * 60 * 1000
}

/**
 * 賓果賓果這天我們存了 226 筆才算「完整」，少於這個門檻就再抓一輪。
 * 慢彩種 1 筆就夠。
 */
function isCacheCompleteFor(gameId: GameId, cached: DrawResult[], drawDate: string): boolean {
  if (gameId !== 'bingo_bingo') return cached.length >= 1
  const today = todayInTaipei()
  // 當日尚未結束 → 不可能完整，每次都重抓最後一段
  if (drawDate >= today) return false
  return cached.length >= 200
}

async function fetchLatestFromApi(gameId: GameId): Promise<DrawResult[]> {
  if (gameId === 'bingo_bingo') {
    const today = todayInTaipei()
    const records = await taiwanLottery.fetchBingoByDate(today)
    return records.map(r => normalizeOne('bingo_bingo', r as unknown as Record<string, unknown>, today))
  }

  // 慢彩種雙路徑：LatestResult（聚合表）+ byPeriod（主動算下期）
  // LatestResult cache lag 時、byPeriod 通常能更早拿到新一期。
  const slowGameId = gameId as Exclude<GameId, 'bingo_bingo'>
  const candidates: DrawResult[] = []

  try {
    const snapshot = await taiwanLottery.fetchLatestSnapshot()
    let raw: unknown = null
    if (slowGameId === 'lotto539') raw = snapshot.daily539
    if (slowGameId === 'lotto649') raw = snapshot.lotto649
    if (slowGameId === 'super_lotto638') raw = snapshot.superLotto638
    if (raw && typeof raw === 'object') {
      candidates.push(normalizeOne(slowGameId, raw as Record<string, unknown>))
    }
  } catch {
    // LatestResult 掛掉不阻止 byPeriod fallback
  }

  // byPeriod 用 Firestore latest mirror 的 drawTerm + 1 主動查；
  // 若 latest 還是初步結果，就查同一期拿官方完整版
  const cachedLatest = await getLatest(slowGameId)
  const fromLatestResult = candidates[0]?.drawTerm ?? null
  const candidateTerm = cachedLatest == null
    ? null
    : cachedLatest.provisional ? cachedLatest.drawTerm : cachedLatest.drawTerm + 1
  const needByPeriod = candidateTerm != null
    && (fromLatestResult == null || fromLatestResult < candidateTerm)
  if (needByPeriod && candidateTerm != null) {
    try {
      const raw = await fetchByPeriod(slowGameId, candidateTerm)
      if (raw && typeof raw === 'object') {
        const draw = normalizeOne(slowGameId, raw as Record<string, unknown>)
        if (fromLatestResult == null || draw.drawTerm > fromLatestResult) {
          candidates.push(draw)
        }
      }
    } catch {
      // byPeriod 也失敗、就放棄這輪
    }
  }

  if (candidates.length === 0) return []
  return [candidates.reduce((a, b) => (b.drawTerm > a.drawTerm ? b : a))]
}

async function fetchByDateFromApi(gameId: GameId, drawDate: string): Promise<DrawResult[]> {
  if (gameId === 'bingo_bingo') {
    const records = await taiwanLottery.fetchBingoByDate(drawDate)
    return records.map(r => normalizeOne('bingo_bingo', r as unknown as Record<string, unknown>, drawDate))
  }

  // 慢彩種沒有直接「按日期」的 endpoint。
  // 策略：先抓最新一期，往回掃描期數找該日期。
  // 為避免無界 loop，限制最多回掃 30 期。
  const snapshot = await taiwanLottery.fetchLatestSnapshot()
  let topPeriod: number | null = null
  if (gameId === 'lotto539' && snapshot.daily539) topPeriod = snapshot.daily539.period
  if (gameId === 'lotto649' && snapshot.lotto649) topPeriod = snapshot.lotto649.period
  if (gameId === 'super_lotto638' && snapshot.superLotto638) topPeriod = snapshot.superLotto638.period
  if (topPeriod == null) return []

  const found: DrawResult[] = []
  const MAX_SCAN = 30
  for (let i = 0; i < MAX_SCAN; i++) {
    const p = topPeriod - i
    const raw = await fetchByPeriod(gameId, p)
    if (!raw) continue
    const normalized = normalizeOne(gameId, raw as unknown as Record<string, unknown>)
    if (normalized.drawDate === drawDate) {
      found.push(normalized)
      // 慢彩種同日通常只 1 期，找到就跳
      break
    }
    if (normalized.drawDate < drawDate) {
      // 已經早於目標日期就停掃
      break
    }
  }
  return found
}

async function fetchByPeriod(gameId: GameId, period: number): Promise<unknown | null> {
  switch (gameId) {
    case 'lotto539':
      return taiwanLottery.fetchDaily539ByPeriod(period)
    case 'lotto649':
      return taiwanLottery.fetchLotto649ByPeriod(period)
    case 'super_lotto638':
      return taiwanLottery.fetchSuperLotto638ByPeriod(period)
    case 'bingo_bingo':
      throw new Error('bingo_bingo does not support period-based fetch')
  }
}

/** 當前台北日期 YYYY-MM-DD。 */
export function todayInTaipei(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit'
  })
  return fmt.format(new Date())
}

export { GAMES }
