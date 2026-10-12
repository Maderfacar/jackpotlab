import { analysisCacheSeconds } from '../../../../shared/lotto/cache-window'
import { CA_FANTASY5, isStoredGameId } from '../../../../shared/lotto/games'
import type { DrawQueryResponse } from '../../../../shared/lotto/types'
import { getDrawsAfter, getLatestDraw } from '../../../utils/draw-service'
import { getAfter } from '../../../utils/draw-store'

/**
 * GET /api/draws/:gameId/since?after=<期號> — 期號 > after 的期數（由舊到新）。
 *
 * 給 /scan 用：過去的期數讀 public/data/lotto539-history.json，只有存檔之後的新期數才讀 Firestore，
 * 讀取次數 = 新期數（2026-10-11 使用者拍板，避免吃讀取額度）。
 * CDN 快取與 /api/analysis 相同：開獎時段 5 分鐘，其餘時間到當天 20:25。
 */
export default defineEventHandler(async (event): Promise<DrawQueryResponse> => {
  const gameId = getRouterParam(event, 'gameId')
  if (!isStoredGameId(gameId)) {
    throw createError({ statusCode: 400, statusMessage: `Unknown gameId: ${gameId}` })
  }
  const raw = getQuery(event).after
  const after = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN
  if (!Number.isInteger(after) || after < 0) {
    throw createError({ statusCode: 400, statusMessage: 'after 必須是期號（正整數）' })
  }

  // 加州天天樂只讀 Firestore（歷史檔之後的新期數）；台灣彩種與 /recent 相同，先觸發最新期補抓、上游失敗不擋
  if (gameId !== CA_FANTASY5) {
    try {
      await getLatestDraw(gameId)
    } catch {
      // 上游掛掉 → 回 Firestore 現有資料
    }
  }

  const draws = gameId === CA_FANTASY5 ? await getAfter(gameId, after, 1000) : await getDrawsAfter(gameId, after)
  // 加州新一期約台灣早上 9:30～10:30 寫入，開獎時段快取不適用 → 固定 10 分鐘
  const maxAge = gameId === 'bingo_bingo' ? 300 : gameId === CA_FANTASY5 ? 600 : analysisCacheSeconds(new Date())
  setResponseHeader(event, 'Cache-Control', `public, s-maxage=${maxAge}, stale-while-revalidate=60`)
  return { gameId, results: draws, fromCache: true }
})
