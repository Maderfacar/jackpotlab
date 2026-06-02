import { isGameId } from '../../../../shared/lotto/games'
import type { DrawQueryResponse } from '../../../../shared/lotto/types'
import { getRecentDraws } from '../../../utils/draw-service'

export default defineEventHandler(async (event): Promise<DrawQueryResponse> => {
  const gameId = getRouterParam(event, 'gameId')
  if (!isGameId(gameId)) {
    throw createError({ statusCode: 400, statusMessage: `Unknown gameId: ${gameId}` })
  }

  const query = getQuery(event)
  const rawLimit = typeof query.limit === 'string' ? Number.parseInt(query.limit, 10) : 50
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(5000, rawLimit)) : 50

  const draws = await getRecentDraws(gameId, limit)
  return { gameId, results: draws, fromCache: true }
})
