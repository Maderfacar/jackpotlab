import { initializeApp } from 'firebase-admin/app'
import { setGlobalOptions } from 'firebase-functions/v2'
import { logger } from 'firebase-functions/v2'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { scrapeAndStore, scrapeBingoDay, yesterdayInTaipei } from './scraper.js'

initializeApp()

setGlobalOptions({
  region: 'asia-east1',
  maxInstances: 5,
  timeoutSeconds: 60,
  memory: '256MiB'
})

/**
 * 賓果賓果 — 盤中即時（2026-09-02 使用者拍板重啟）。
 * 開獎 07:05–23:55 每 5 分鐘一期；每 5 分鐘 poll、增量寫入
 * （scraper 只寫比現存最新期更新的 → 每輪 1 讀 + 1~2 寫，
 *   一天約 200 讀 + 230 寫。舊版每 1 分鐘整批重寫 ~220 筆
 *   → 一天十幾萬寫，是 2026-07-19 停用的主因，已修正）。
 */
export const scrapeBingoBingo = onSchedule({
  schedule: '*/5 7-23 * * *',
  timeZone: 'Asia/Taipei'
}, async () => {
  const outcome = await scrapeAndStore('bingo_bingo')
  logger.info('scrapeBingoBingo done', outcome)
})

/**
 * 賓果賓果 — 每日 00:15 自癒：補完「昨天」整天（整批 upsert）。
 * 盤中任何漏抓、以及 23:55 尾期（poll 範圍到 23:55 為止）都靠這條收乾淨。
 */
export const scrapeBingoNightly = onSchedule({
  schedule: '15 0 * * *',
  timeZone: 'Asia/Taipei'
}, async () => {
  const outcome = await scrapeBingoDay(yesterdayInTaipei())
  logger.info('scrapeBingoNightly done', outcome)
})

/**
 * 慢彩種排程（2026-10-01 使用者拍板）：
 *   三個彩種官方公告都是 20:30 開獎、週日不開。
 *   從 20:30 起每 2 分鐘抓、連續半小時（20:30 - 20:58，共 15 次），不再拖到 23:55。
 *   官方 LatestResult 常晚 1 小時以上，所以依序試：官方完整 → 官方 LastNumber → 第三方
 *   （pilio + i539 兩家一致），20:35 左右就能先有初步獎號（見 fast-sources.ts）。
 *   已存到當期官方完整版後，後續每輪只讀 1 次 Firestore、不打上游。
 *   官方完整版（含獎金分配）由使用者開站時的補抓、或下一個開獎日的 cron 補上。
 */

/**
 * 今彩 539 — 週一至六 20:30 開獎。
 */
export const scrape539 = onSchedule({
  schedule: '30-58/2 20 * * 1-6',
  timeZone: 'Asia/Taipei'
}, async () => {
  const outcome = await scrapeAndStore('lotto539')
  logger.info('scrape539 done', outcome)
})

/**
 * 大樂透 — 週二、五 20:30 開獎。
 */
export const scrapeLotto649 = onSchedule({
  schedule: '30-58/2 20 * * 2,5',
  timeZone: 'Asia/Taipei'
}, async () => {
  const outcome = await scrapeAndStore('lotto649')
  logger.info('scrapeLotto649 done', outcome)
})

/**
 * 威力彩 — 週一、四 20:30 開獎。
 */
export const scrapeSuperLotto = onSchedule({
  schedule: '30-58/2 20 * * 1,4',
  timeZone: 'Asia/Taipei'
}, async () => {
  const outcome = await scrapeAndStore('super_lotto638')
  logger.info('scrapeSuperLotto done', outcome)
})
