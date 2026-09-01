/**
 * GET /api/signals/forecast — 「預期 vs 實際」帳本（539 專用，2026-09-02 拍板）。
 *
 * 每次請求（= 使用者開 /signals 頁）：
 *   1. 以最新 d=700 資料算出當下預期（buildForecast，固定 3 期窗口）
 *   2. 若該基準期尚無快照 → 寫入 Firestore（admin SDK；同一期只寫一次、不覆蓋 —
 *      開獎前已定，之後再開頁不會改寫）
 *   3. 對所有未結帳快照：實際下一期已開出 → 自動對帳寫回（一拍兩瞪眼）
 *   4. 回傳今日預期 + 歷史帳 + 累積打擊率
 *
 * Firestore 路徑：signals/lotto539/forecasts/{baseIssue}
 * 注意：Firestore 不接受巢狀陣列（逐位 y 票是 number[][]），
 * 所以 forecast / outcome 以 JSON 字串存於 payload / outcome 欄位。
 * client 對此 collection 無讀寫權（rules 預設拒絕）— 一律經此 route。
 */

import { FieldPath } from 'firebase-admin/firestore'
import { getLatestDraw, getRecentDraws } from '../../utils/draw-service'
import { tryGetAdminFirestore } from '../../utils/firebase-admin'
import { hydrateFromDraws, type AnalysisDrawInput } from '../../../app/utils/analysis'
import { toSignalRows } from '../../../app/signals/history'
import {
  buildForecast, settleForecast,
  type Forecast, type ForecastOutcome
} from '../../../app/signals/forecast'

const GAME_ID = 'lotto539'
const D = 700
const N = 60
/** 結帳/統計最多回看幾份快照（一天一份，約一年） */
const MAX_DOCS = 400
/** 回傳給頁面的歷史筆數 */
const HISTORY_LIMIT = 30

interface ForecastDoc {
  baseIssue: string
  baseDate: string
  createdAt: string
  /** false = 待開獎；true = 已對帳；'stale' = 基準期已掉出資料窗、無法對帳 */
  settled: boolean | 'stale'
  payload: string
  outcome?: string
  settledAt?: string
}

export interface SettledEntry {
  forecast: Forecast
  outcome: ForecastOutcome
}

function rate(hit: number, n: number): number | null {
  return n > 0 ? hit / n : null
}

export default defineEventHandler(async () => {
  try {
    await getLatestDraw(GAME_ID)
  } catch {
    // 上游掛掉 → 用 Firestore 既有資料照算
  }

  const draws = await getRecentDraws(GAME_ID, D)
  const drawsAsc = [...draws].sort((a, b) => a.drawTerm - b.drawTerm)
  const inputs: AnalysisDrawInput[] = drawsAsc.map(r => ({
    drawTerm: r.drawTerm,
    drawDate: r.drawDate,
    prizes: [...new Set(r.special != null ? [...r.numbers, r.special] : r.numbers)]
  }))
  if (inputs.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'No draw data available' })
  }

  const state = hydrateFromDraws(GAME_ID, N, inputs)
  const rows = toSignalRows(state)
  const rowIndexByIssue = new Map(rows.map((r, i) => [r.issue, i]))
  const now = new Date()

  const forecast = buildForecast(rows, state, now)

  const db = tryGetAdminFirestore()
  if (!db) {
    return {
      storage: 'disabled' as const,
      today: forecast ? { forecast, isNew: false } : null,
      pending: [],
      history: [],
      stats: null
    }
  }

  const coll = db.collection('signals').doc(GAME_ID).collection('forecasts')

  // ── 1. 今日快照（只寫一次） ──
  let isNew = false
  let todayForecast: Forecast | null = forecast
  if (forecast) {
    const docRef = coll.doc(forecast.baseIssue)
    const snap = await docRef.get()
    if (snap.exists) {
      const stored = snap.data() as ForecastDoc
      todayForecast = JSON.parse(stored.payload) as Forecast
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
        // 併發下已被別的請求寫入 — 沿用計算結果即可
      }
    }
  }

  // ── 2. 結帳 + 撈歷史 ──
  const listSnap = await coll
    .orderBy(FieldPath.documentId(), 'desc')
    .limit(MAX_DOCS)
    .get()

  const pending: Forecast[] = []
  const settledEntries: SettledEntry[] = []

  for (const docSnap of listSnap.docs) {
    const data = docSnap.data() as ForecastDoc
    if (data.settled === true) {
      if (data.outcome) {
        settledEntries.push({
          forecast: JSON.parse(data.payload) as Forecast,
          outcome: JSON.parse(data.outcome) as ForecastOutcome
        })
      }
      continue
    }
    if (data.settled === 'stale') continue

    const baseIdx = rowIndexByIssue.get(data.baseIssue)
    const storedForecast = JSON.parse(data.payload) as Forecast
    if (baseIdx == null) {
      // 基準期已掉出 700 期資料窗（久未開頁）— 標記後不再重掃
      await docSnap.ref.update({ settled: 'stale' })
      continue
    }
    const basisRow = rows[baseIdx]
    const actualRow = rows[baseIdx + 1]
    if (!basisRow || !actualRow) {
      pending.push(storedForecast)
      continue
    }
    const outcome = settleForecast(storedForecast, basisRow, actualRow, now)
    await docSnap.ref.update({
      settled: true,
      outcome: JSON.stringify(outcome),
      settledAt: outcome.settledAt
    })
    settledEntries.push({ forecast: storedForecast, outcome })
  }

  settledEntries.sort((a, b) => b.forecast.baseIssue.localeCompare(a.forecast.baseIssue))

  // ── 3. 累積打擊率（全部已結帳快照） ──
  const dir = { prize: { hit: 0, n: 0 }, gap: { hit: 0, n: 0 }, val: { hit: 0, n: 0 } }
  let dGapSum = 0
  let dValSum = 0
  let y1Hit = 0
  const yPos = Array.from({ length: 5 }, () => ({ hit: 0, n: 0 }))
  let comboBestSum = 0
  let comboDays = 0
  const comboBestDist = [0, 0, 0, 0, 0, 0]
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
    if (outcome.y1Hit) y1Hit++
    outcome.yPosHit.forEach((h, p) => {
      if (h != null) {
        yPos[p]!.n++
        if (h) yPos[p]!.hit++
      }
    })
    if (outcome.comboHits.length > 0) {
      const best = Math.max(...outcome.comboHits)
      comboBestSum += best
      comboBestDist[best]!++
      comboDays++
    }
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
        y1Rate: rate(y1Hit, n),
        yPosRate: yPos.map(p => rate(p.hit, p.n)),
        comboBestAvg: comboDays > 0 ? comboBestSum / comboDays : null,
        comboBestDist,
        comboDays
      }

  return {
    storage: 'firestore' as const,
    today: todayForecast ? { forecast: todayForecast, isNew } : null,
    // 今日那份已在 today 呈現，pending 只留更早的未結帳快照
    pending: pending.filter(p => p.baseIssue !== todayForecast?.baseIssue),
    history: settledEntries.slice(0, HISTORY_LIMIT),
    stats
  }
})
