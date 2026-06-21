import { isGameId } from '../../../../shared/lotto/games'
import type { DrawQueryResponse } from '../../../../shared/lotto/types'
import { getLatestDraw, getRecentDraws } from '../../../utils/draw-service'

export default defineEventHandler(async (event): Promise<DrawQueryResponse> => {
  const gameId = getRouterParam(event, 'gameId')
  if (!isGameId(gameId)) {
    throw createError({ statusCode: 400, statusMessage: `Unknown gameId: ${gameId}` })
  }

  const query = getQuery(event)
  const rawLimit = typeof query.limit === 'string' ? Number.parseInt(query.limit, 10) : 50
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(5000, rawLimit)) : 50

  // 讀 Firestore 前先觸發 getLatestDraw —— 內建 5 分鐘 cache、過期會 fetch upstream + upsert 整批今日資料。
  // 這樣 /recent 回給前端的「最新 N 期」最多 lag 5 分鐘、不再依賴 cron 健康。
  // upstream 失敗時不擋整個 /recent，仍回 Firestore 既有資料。
  try {
    await getLatestDraw(gameId)
  } catch {
    // 上游掛掉 → 回 Firestore 現有資料，由前端 UI 提示 lag
  }

  const draws = await getRecentDraws(gameId, limit)
  return { gameId, results: draws, fromCache: true }
})
