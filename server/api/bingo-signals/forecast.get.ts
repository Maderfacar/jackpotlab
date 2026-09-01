/**
 * GET /api/bingo-signals/forecast — 賓果「預期 vs 實際」帳本（2026-09-02 拍板）。
 *
 * 與 539 版（/api/signals/forecast）同一套流程：server 自算自存自對帳。
 *   1. 最近 7 天資料（台北時區）→ 賓果相似引擎（窮舉計分）算當下預期
 *   2. 該基準期尚無快照 → 寫入（同期只寫一次、不覆蓋）
 *   3. 未結帳快照的下一期已開出 → 自動對帳（賓果 5 分鐘一期、結得很快）
 *   4. 回傳今日預期 + 歷史帳 + 累積打擊率（10 顆候選對照隨機基準 2.5 顆）
 *
 * Firestore 路徑：signals/bingo_bingo/forecasts/{baseIssue}
 * forecast / outcome 以 JSON 字串存（避開巢狀陣列限制）；client 只讀。
 */

import { getLatestDraw, getRecentDraws } from '../../utils/draw-service'
import { tryGetAdminFirestore } from '../../utils/firebase-admin'
import { hydrateFromDraws, type AnalysisDrawInput } from '../../../app/utils/analysis'
import { toBingoSignalRows } from '../../../app/bingosignals/history'
import {
  buildBingoForecast, settleBingoForecast,
  type BingoForecast, type BingoForecastOutcome
} from '../../../app/bingosignals/forecast'

const GAME_ID = 'bingo_bingo'
const POOL_DAYS = 7
const PER_DAY_MAX = 230
const N = 60
const MAX_DOCS = 600
const HISTORY_LIMIT = 30

interface ForecastDoc {
  baseIssue: string
  baseDate: string
  createdAt: string
  settled: boolean | 'stale'
  payload: string
  outcome?: string
  settledAt?: string
}

export interface BingoSettledEntry {
  forecast: BingoForecast
  outcome: BingoForecastOutcome
}

function rate(hit: number, n: number): number | null {
  return n > 0 ? hit / n : null
}

function taipeiDateNDaysAgo(n: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(Date.now() - n * 24 * 60 * 60 * 1000))
}

export default defineEventHandler(async () => {
  try {
    await getLatestDraw(GAME_ID)
  } catch {
    // 上游掛掉 → 用 Firestore 既有資料照算
  }

  const cutoff = taipeiDateNDaysAgo(POOL_DAYS - 1)
  const draws = (await getRecentDraws(GAME_ID, POOL_DAYS * PER_DAY_MAX))
    .filter(r => r.drawDate >= cutoff)
  const drawsAsc = [...draws].sort((a, b) => a.drawTerm - b.drawTerm)
  const inputs: AnalysisDrawInput[] = drawsAsc.map(r => ({
    drawTerm: r.drawTerm,
    drawDate: r.drawDate,
    prizes: [...new Set(r.special != null ? [...r.numbers, r.special] : r.numbers)]
  }))
  if (inputs.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'No bingo draw data available' })
  }

  const state = hydrateFromDraws(GAME_ID, N, inputs)
  const rows = toBingoSignalRows(state)
  const rowIndexByIssue = new Map(rows.map((r, i) => [r.issue, i]))
  const now = new Date()

  const forecast = buildBingoForecast(rows, state, now)

  const db = tryGetAdminFirestore()
  if (!db) {
    return {
      storage: 'disabled' as const,
      today: forecast ? { forecast, isNew: false } : null,
      pending: 0,
      history: [],
      stats: null
    }
  }

  const coll = db.collection('signals').doc(GAME_ID).collection('forecasts')

  let isNew = false
  let todayForecast: BingoForecast | null = forecast
  if (forecast) {
    const docRef = coll.doc(forecast.baseIssue)
    const snap = await docRef.get()
    if (snap.exists) {
      const stored = snap.data() as ForecastDoc
      todayForecast = JSON.parse(stored.payload) as BingoForecast
    } else {
      try {
        const doc: ForecastDoc = {
          baseIssue: forecast.baseIssue,
          baseDate: forecast.baseDate,
          createdAt: forecast.createdAt,
          settled: false,
          payload: JSON.stringify(forecast)
        }
        await docRef.create(doc)
        isNew = true
      } catch {
        // 併發已寫入 — 沿用本次計算結果
      }
    }
  }

  const listSnap = await coll
    .orderBy('baseIssue', 'desc')
    .limit(MAX_DOCS)
    .get()

  let pendingCount = 0
  const settledEntries: BingoSettledEntry[] = []

  for (const docSnap of listSnap.docs) {
    const data = docSnap.data() as ForecastDoc
    if (data.settled === true) {
      if (data.outcome) {
        settledEntries.push({
          forecast: JSON.parse(data.payload) as BingoForecast,
          outcome: JSON.parse(data.outcome) as BingoForecastOutcome
        })
      }
      continue
    }
    if (data.settled === 'stale') continue

    const baseIdx = rowIndexByIssue.get(data.baseIssue)
    const storedForecast = JSON.parse(data.payload) as BingoForecast
    if (baseIdx == null) {
      await docSnap.ref.update({ settled: 'stale' })
      continue
    }
    const basisRow = rows[baseIdx]
    const actualRow = rows[baseIdx + 1]
    if (!basisRow || !actualRow) {
      if (storedForecast.baseIssue !== todayForecast?.baseIssue) pendingCount++
      continue
    }
    const outcome = settleBingoForecast(storedForecast, basisRow, actualRow, now)
    await docSnap.ref.update({
      settled: true,
      outcome: JSON.stringify(outcome),
      settledAt: outcome.settledAt
    })
    settledEntries.push({ forecast: storedForecast, outcome })
  }

  settledEntries.sort((a, b) => b.forecast.baseIssue.localeCompare(a.forecast.baseIssue))

  const dir = { prize: { hit: 0, n: 0 }, gap: { hit: 0, n: 0 }, val: { hit: 0, n: 0 } }
  let dGapSum = 0
  let dValSum = 0
  let gapCompDiffSum = 0
  let valCompDiffSum = 0
  let yCompDiffSum = 0
  let pickHitSum = 0
  const pickHitDist = new Array<number>(11).fill(0)
  for (const { outcome } of settledEntries) {
    for (const line of ['prize', 'gap', 'val'] as const) {
      const h = outcome.dirHit[line]
      if (h != null) {
        dir[line].n++
        if (h) dir[line].hit++
      }
    }
    dGapSum += outcome.dGap
    dValSum += outcome.dVal
    gapCompDiffSum += outcome.gapCompDiff
    valCompDiffSum += outcome.valCompDiff
    yCompDiffSum += outcome.yCompDiff
    pickHitSum += outcome.pickHits
    pickHitDist[Math.min(10, Math.max(0, outcome.pickHits))]!++
  }
  const n = settledEntries.length
  const stats = n === 0
    ? null
    : {
        n,
        dirRate: {
          prize: rate(dir.prize.hit, dir.prize.n),
          gap: rate(dir.gap.hit, dir.gap.n),
          val: rate(dir.val.hit, dir.val.n)
        },
        dirDecided: { prize: dir.prize.n, gap: dir.gap.n, val: dir.val.n },
        avgDGap: dGapSum / n,
        avgDVal: dValSum / n,
        avgGapCompDiff: gapCompDiffSum / n,
        avgValCompDiff: valCompDiffSum / n,
        avgYCompDiff: yCompDiffSum / n,
        avgPickHits: pickHitSum / n,
        pickHitDist,
        pickBaseline: 2.5
      }

  return {
    storage: 'firestore' as const,
    today: todayForecast ? { forecast: todayForecast, isNew } : null,
    pending: pendingCount,
    history: settledEntries.slice(0, HISTORY_LIMIT),
    stats
  }
})
