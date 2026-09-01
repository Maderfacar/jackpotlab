import { isGameId } from '../../../../shared/lotto/games'
import { getDrawsByDate, getLatestDraw } from '../../../utils/draw-service'
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

  // ?date=YYYY-MM-DD → 補抓「指定日期整天」（賓果回填空缺用；慢彩種也通用）。
  // 預設走快取完整性檢查（賓果該日 ≥200 筆即略過）；?force=true 強制重抓。
  const query = getQuery(event)
  const dateParam = typeof query.date === 'string' ? query.date : null
  if (dateParam != null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      throw createError({ statusCode: 400, statusMessage: `invalid date: ${dateParam}` })
    }
    try {
      const { draws, fromCache } = await getDrawsByDate(gameId, dateParam, {
        forceFresh: query.force === 'true'
      })
      const top = draws.reduce<{ drawTerm: number, drawDate: string, fetchedAt: string } | null>(
        (acc, d) => (acc == null || d.drawTerm > acc.drawTerm
          ? { drawTerm: d.drawTerm, drawDate: d.drawDate, fetchedAt: d.fetchedAt }
          : acc),
        null
      )
      return {
        success: true,
        gameId,
        fromCache,
        triggeredAt,
        draw: top,
        message: `${dateParam} 共 ${draws.length} 期${fromCache ? '（快取已完整、未重抓）' : '（已向官方補抓）'}`
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown'
      throw createError({ statusCode: 502, statusMessage: `補抓 ${dateParam} 失敗：${message}` })
    }
  }

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
