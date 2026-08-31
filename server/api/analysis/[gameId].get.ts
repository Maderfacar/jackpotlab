/**
 * GET /api/analysis/:gameId — 隔期狀態 + 獎號關聯 JSON 匯出（給 LLM / 程式讀）。
 *
 * 與 /draws 頁完全同一支演算法（app/utils/analysis.ts 的 hydrateFromDraws），
 * 每次請求時以最新開獎資料即時計算 — 固定網址、滾動視窗。
 *
 * Query 參數：
 *   d      灌入深度（抓最近幾期），預設 700 ≒ 539 兩年，clamp 1-5000
 *   n      隔期表格範圍，預設 60，clamp 1-200
 *   limit  history 只回最近幾期（省 LLM token），預設全回
 *   until  只用 drawTerm ≤ until 的資料計算（凍結到某期的快照）
 */

import { isGameId } from '../../../shared/lotto/games'
import { getLatestDraw, getRecentDraws } from '../../utils/draw-service'
import {
  hydrateFromDraws, clampD, clampN, defaultD, defaultN,
  type AnalysisDrawInput
} from '../../../app/utils/analysis'

const FIELD_GUIDE = {
  periods: '隔期狀態表現況。slot 0 = 最新一期，slot 越大越舊。prizes = 該期還沒被之後任何一期開走的剩餘號碼。record = 這個 slot 位置的開出紀錄（逗號分隔、最左為現值）：最左值 = 此位置已連續幾期沒開出獎號，開出時會在最左補 0。',
  history: '獎號關聯表，每期一列（由舊到新）。prizes = 該期開出號碼（升序）。periods = 每顆號碼回溯到的 slot（隔幾期，逗號對應 prizes 順序）。sum = periods 加總。values = 每顆號碼來源 slot 當時的記錄現值。positions = 每顆號碼的 x-y：x = 來源 slot 當時剩餘號碼數、y = 該號在剩餘號碼（小到大）中的排位。tails = 尾數 0-9 各出現幾顆（index = 尾數）。',
  warmup: 'history 的前 n 期表格尚未填滿，隔期值系統性偏小，做統計時建議剔除。'
} as const

export default defineEventHandler(async (event) => {
  const gameId = getRouterParam(event, 'gameId')
  if (!isGameId(gameId)) {
    throw createError({ statusCode: 400, statusMessage: `Unknown gameId: ${gameId}` })
  }

  const query = getQuery(event)
  const rawD = typeof query.d === 'string' ? Number.parseInt(query.d, 10) : Number.NaN
  const rawN = typeof query.n === 'string' ? Number.parseInt(query.n, 10) : Number.NaN
  const rawLimit = typeof query.limit === 'string' ? Number.parseInt(query.limit, 10) : Number.NaN
  const rawUntil = typeof query.until === 'string' ? Number.parseInt(query.until, 10) : Number.NaN

  const d = Number.isFinite(rawD) ? clampD(rawD) : (gameId === 'lotto539' ? 700 : defaultD(gameId))
  const n = Number.isFinite(rawN) ? clampN(rawN) : defaultN()
  const until = Number.isFinite(rawUntil) ? rawUntil : null

  // 與 /api/draws/:gameId/recent 同一套：先觸發 5 分鐘 cache 的最新期補抓，失敗不擋。
  try {
    await getLatestDraw(gameId)
  } catch {
    // 上游掛掉 → 用 Firestore 既有資料照算
  }

  const draws = await getRecentDraws(gameId, d)
  const filtered = until != null ? draws.filter(r => r.drawTerm <= until) : draws
  const drawsAsc = [...filtered].sort((a, b) => a.drawTerm - b.drawTerm)
  const inputs: AnalysisDrawInput[] = drawsAsc.map((r) => {
    const merged = r.special != null ? [...r.numbers, r.special] : r.numbers
    return {
      drawTerm: r.drawTerm,
      drawDate: r.drawDate,
      prizes: [...new Set(merged)]
    }
  })

  if (inputs.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'No draw data available for the requested window' })
  }

  const state = hydrateFromDraws(gameId, n, inputs)
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(state.history.length, rawLimit))
    : state.history.length
  const history = state.history.slice(-limit)

  return {
    gameId,
    generatedAt: new Date().toISOString(),
    params: { d, n, limit, until },
    range: {
      firstTerm: inputs[0]!.drawTerm,
      firstDate: inputs[0]!.drawDate,
      lastTerm: inputs.at(-1)!.drawTerm,
      lastDate: inputs.at(-1)!.drawDate,
      drawCount: inputs.length,
      historyReturned: history.length
    },
    fieldGuide: FIELD_GUIDE,
    periods: state.periods,
    history
  }
})
