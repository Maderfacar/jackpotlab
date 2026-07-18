import { initializeApp } from 'firebase-admin/app'
import { setGlobalOptions } from 'firebase-functions/v2'
import { logger } from 'firebase-functions/v2'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { scrapeAndStore } from './scraper.js'

initializeApp()

setGlobalOptions({
  region: 'asia-east1',
  maxInstances: 5,
  timeoutSeconds: 60,
  memory: '256MiB'
})

/**
 * 賓果賓果 — 已停用（2026-07-19），省 Firestore 用量。
 * 恢復方式：取消下面註解後 `firebase deploy --only functions:scrapeBingoBingo`。
 * 原規格：每 1 分鐘 poll；官方 5 分鐘一期，1 分鐘 poll 保證 lag < 90s。
 * 同期重複寫不會出問題（doc id 是 drawTerm，set 是 upsert）。
 */
// export const scrapeBingoBingo = onSchedule({
//   schedule: 'every 1 minutes',
//   timeZone: 'Asia/Taipei'
// }, async () => {
//   const outcome = await scrapeAndStore('bingo_bingo')
//   logger.info('scrapeBingoBingo done', outcome)
// })

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
