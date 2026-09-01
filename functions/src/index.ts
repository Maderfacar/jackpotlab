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
 * 今彩 539 — 每日 20:30 開獎，20:00 - 23:55 每 5 分鐘 retry。
 * scrapeAndStore 內含「LatestResult + byPeriod」雙路徑，已存最新一期就 upsert 不會出錯。
 * 比原本「20:35 / 20:45 / 21:00 三次」靠譜：官方 API 慢一兩個小時還能自己補抓。
 */
export const scrape539 = onSchedule({
  schedule: '*/5 20-23 * * *',
  timeZone: 'Asia/Taipei'
}, async () => {
  const outcome = await scrapeAndStore('lotto539')
  logger.info('scrape539 done', outcome)
})

/**
 * 大樂透 — 週二、五 21:30 開獎，週二、五 21:00 - 23:55 每 5 分鐘 retry。
 */
export const scrapeLotto649 = onSchedule({
  schedule: '*/5 21-23 * * 2,5',
  timeZone: 'Asia/Taipei'
}, async () => {
  const outcome = await scrapeAndStore('lotto649')
  logger.info('scrapeLotto649 done', outcome)
})

/**
 * 威力彩 — 週一、四 22:00 開獎，週一、四 22:00 - 23:55 每 5 分鐘 retry。
 */
export const scrapeSuperLotto = onSchedule({
  schedule: '*/5 22-23 * * 1,4',
  timeZone: 'Asia/Taipei'
}, async () => {
  const outcome = await scrapeAndStore('super_lotto638')
  logger.info('scrapeSuperLotto done', outcome)
})
