import type { GameId } from '~~/shared/lotto/games'
import type { DrawQueryResponse } from '~~/shared/lotto/types'

interface LatestOptions {
  /** 每 N 毫秒自動 refetch；0 或 undefined = 不輪詢 */
  pollMs?: Ref<number> | ComputedRef<number> | number
}

/**
 * 查詢「最新一期」。
 * 預設 lazy + watch(gameId) — 切彩種會自動 refetch。
 * 給 pollMs 就會在 client 端定時 refresh（賓果賓果即時用）。
 */
export function useLatestDraw(
  gameId: Ref<GameId> | ComputedRef<GameId>,
  options: LatestOptions = {}
) {
  const fetched = useFetch<DrawQueryResponse>(() => `/api/draws/${toValue(gameId)}/latest`, {
    key: () => `latest-${toValue(gameId)}`,
    watch: [gameId],
    server: false
  })

  if (options.pollMs !== undefined && import.meta.client) {
    let timer: ReturnType<typeof setInterval> | null = null

    const stop = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }

    const start = (intervalMs: number) => {
      stop()
      if (intervalMs <= 0) return
      timer = setInterval(() => fetched.refresh(), intervalMs)
    }

    watchEffect(() => {
      const ms = typeof options.pollMs === 'number' ? options.pollMs : toValue(options.pollMs)
      start(ms ?? 0)
    })

    onBeforeUnmount(stop)
  }

  return fetched
}

/**
 * 按日期查詢。
 */
export function useDrawsByDate(
  gameId: Ref<GameId> | ComputedRef<GameId>,
  date: Ref<string> | ComputedRef<string>
) {
  return useFetch<DrawQueryResponse>(() => `/api/draws/${toValue(gameId)}/by-date?date=${toValue(date)}`, {
    key: () => `by-date-${toValue(gameId)}-${toValue(date)}`,
    watch: [gameId, date],
    immediate: false,
    server: false
  })
}
