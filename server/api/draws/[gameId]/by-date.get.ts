import { isGameId } from '../../../../shared/lotto/games'
import type { DrawQueryResponse } from '../../../../shared/lotto/types'
import { getDrawsByDate } from '../../../utils/draw-service'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export default defineEventHandler(async (event): Promise<DrawQueryResponse> => {
  const gameId = getRouterParam(event, 'gameId')
  if (!isGameId(gameId)) {
    throw createError({ statusCode: 400, statusMessage: `Unknown gameId: ${gameId}` })
  }

  const query = getQuery(event)
  const date = typeof query.date === 'string' ? query.date : ''
  if (!DATE_RE.test(date)) {
    throw createError({ statusCode: 400, statusMessage: 'date must be YYYY-MM-DD' })
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
