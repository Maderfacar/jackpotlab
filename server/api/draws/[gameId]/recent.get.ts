import { CA_FANTASY5, isGameId } from '../../../../shared/lotto/games'
import type { DrawQueryResponse } from '../../../../shared/lotto/types'
import { getLatestDraw, getRecentDraws } from '../../../utils/draw-service'
import { getRecent } from '../../../utils/draw-store'

function readLimit(raw: unknown): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : 50
  return Number.isFinite(n) ? Math.max(1, Math.min(5000, n)) : 50
}

export default defineEventHandler(async (event): Promise<DrawQueryResponse> => {
  const gameId = getRouterParam(event, 'gameId')
  // 加州天天樂：只讀 Firestore（每天排程寫入，沒有上游可補抓）
  if (gameId === CA_FANTASY5) {
    return { gameId, results: await getRecent(gameId, readLimit(getQuery(event).limit)), fromCache: true }
  }
  if (!isGameId(gameId)) {
    throw createError({ statusCode: 400, statusMessage: `Unknown gameId: ${gameId}` })
  }

  const limit = readLimit(getQuery(event).limit)

  // 讀 Firestore 前先觸發 getLatestDraw —— 慢彩種只在「該開的那期還沒存到」時才打上游，
  // 賓果則是 5 分鐘 cache。這樣官方 API 晚於 cron 時段才更新時，有人開網站就會補抓。
  // upstream 失敗時不擋整個 /recent，仍回 Firestore 既有資料。
  try {
    await getLatestDraw(gameId)
  } catch {
    // 上游掛掉 → 回 Firestore 現有資料，由前端 UI 提示 lag
  }

  const draws = await getRecentDraws(gameId, limit)
  return { gameId, results: draws, fromCache: true }
})
