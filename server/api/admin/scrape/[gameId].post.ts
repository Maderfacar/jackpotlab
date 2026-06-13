import { isGameId } from '../../../../shared/lotto/games'
import { getLatestDraw } from '../../../utils/draw-service'
import { tryGetAdminFirestore } from '../../../utils/firebase-admin'

interface ScrapeTriggerResponse {
  success: boolean
  gameId: string
  fromCache: boolean
  triggeredAt: string
  draw: {
    drawTerm: number
    drawDate: string
    fetchedAt: string
  } | null
  message: string
}

/**
 * 手動觸發單一彩種重抓 — 走 server admin SDK。
 *
 *   POST /api/admin/scrape/{gameId}
 *
 * 與 functions/scrapeAndStore 是平行路徑（functions 跑 cron、這條給使用者手動觸發補救）。
 * 兩者都共用 server/utils/draw-service.getLatestDraw + draw-store.upsertDraws、最後寫
 * Firestore latest mirror、效果一致。
 *
 * forceFresh: true 強制略過 cache、雙路徑（LatestResult + byPeriod）撈一次官方 API。
 */
export default defineEventHandler(async (event): Promise<ScrapeTriggerResponse> => {
  const gameId = getRouterParam(event, 'gameId')
  if (!isGameId(gameId)) {
    throw createError({
      statusCode: 400,
      statusMessage: `invalid gameId: ${String(gameId)}`
    })
  }

  if (!tryGetAdminFirestore()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Firebase Admin 未設定，無法觸發手動重抓'
    })
  }

  const triggeredAt = new Date().toISOString()
  try {
    const { draw, fromCache } = await getLatestDraw(gameId, { forceFresh: true })
    return {
      success: true,
      gameId,
      fromCache,
      triggeredAt,
      draw: draw
        ? {
            drawTerm: draw.drawTerm,
            drawDate: draw.drawDate,
            fetchedAt: draw.fetchedAt
          }
        : null,
      message: draw
        ? `已重抓最新一期：${draw.drawTerm}（${draw.drawDate}）`
        : '官方 API 暫時沒新資料、稍後再試'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    throw createError({
      statusCode: 502,
      statusMessage: `重抓失敗：${message}`
    })
  }
})
