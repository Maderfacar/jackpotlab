import { CA_FANTASY5, isGameId } from '../../../../shared/lotto/games'
import type { DrawQueryResponse } from '../../../../shared/lotto/types'
import { getDrawsByDate } from '../../../utils/draw-service'
import { getByDate } from '../../../utils/draw-store'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export default defineEventHandler(async (event): Promise<DrawQueryResponse> => {
  const gameId = getRouterParam(event, 'gameId')
  const query = getQuery(event)
  const date = typeof query.date === 'string' ? query.date : ''
  if (!DATE_RE.test(date)) {
    throw createError({ statusCode: 400, statusMessage: 'date must be YYYY-MM-DD' })
  }
  // 加州天天樂：只讀 Firestore（日期 = 加州當地開獎日）
  if (gameId === CA_FANTASY5) {
    return { gameId, results: await getByDate(gameId, date), fromCache: true }
  }
  if (!isGameId(gameId)) {
    throw createError({ statusCode: 400, statusMessage: `Unknown gameId: ${gameId}` })
  }
  const forceFresh = query.fresh === '1' || query.fresh === 'true'

  try {
    const { draws, fromCache } = await getDrawsByDate(gameId, date, { forceFresh })
    return { gameId, results: draws, fromCache }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    throw createError({ statusCode: 502, statusMessage: `Upstream fetch failed: ${message}` })
  }
})
