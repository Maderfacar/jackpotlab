import { isGameId } from '../../../../shared/lotto/games'
import type { DrawQueryResponse } from '../../../../shared/lotto/types'
import { getLatestDraw } from '../../../utils/draw-service'

export default defineEventHandler(async (event): Promise<DrawQueryResponse> => {
  const gameId = getRouterParam(event, 'gameId')
  if (!isGameId(gameId)) {
    throw createError({ statusCode: 400, statusMessage: `Unknown gameId: ${gameId}` })
  }

  const query = getQuery(event)
  const forceFresh = query.fresh === '1' || query.fresh === 'true'

  try {
    const { draw, fromCache } = await getLatestDraw(gameId, { forceFresh })
    return {
      gameId,
      results: draw ? [draw] : [],
      fromCache
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    throw createError({ statusCode: 502, statusMessage: `Upstream fetch failed: ${message}` })
  }
})
