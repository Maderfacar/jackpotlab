/**
 * /api/analysis 的 CDN 快取秒數（2026-10-11 使用者拍板：開完獎之後到下次開獎前資料不會變，不必每 5 分鐘重算）。
 *
 * 新獎號由排程在每天 20:30～20:58（台北）寫入（functions/src/index.ts scrape539，週一至六；
 * 實際資料偶有週日開獎，所以每天都當成可能開獎）。
 *   - 20:25～23:59：維持 5 分鐘，新獎號與晚到的官方更正能很快出現
 *   - 其餘時間：快取到當天 20:25（最少 60 秒）
 */

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000
const WINDOW_START_MIN = 20 * 60 + 25
const WINDOW_SECONDS = 300
const MIN_SECONDS = 60

export function analysisCacheSeconds(now: Date): number {
  const t = new Date(now.getTime() + TAIPEI_OFFSET_MS)
  const secOfDay = t.getUTCHours() * 3600 + t.getUTCMinutes() * 60 + t.getUTCSeconds()
  const windowStart = WINDOW_START_MIN * 60
  if (secOfDay >= windowStart) return WINDOW_SECONDS
  return Math.max(MIN_SECONDS, windowStart - secOfDay)
}
