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
 * 賓果賓果 — 每 1 分鐘 poll。
 * 官方 5 分鐘一期，我們 1 分鐘 poll 保證 lag < 90s。
 * 同期重複寫不會出問題（doc id 是 drawTerm，set 是 upsert）。
 */
export const scrapeBingoBingo = onSchedule({
  schedule: 'every 1 minutes',
  timeZone: 'Asia/Taipei'
}, async () => {
  const outcome = await scrapeAndStore('bingo_bingo')
  logger.info('scrapeBingoBingo done', outcome)
})

/**
 * 今彩 539 — 每日 20:35 / 20:45 / 21:00 三次 retry。
 * 用三條 cron 排程 dispatch 同一支 function。
 */
export const scrape539 = onSchedule({
  schedule: '35,45 20 * * *',
  timeZone: 'Asia/Taipei'
}, async () => {
  const outcome = await scrapeAndStore('lotto539')
  logger.info('scrape539 done', outcome)
})

export const scrape539Late = onSchedule({
  schedule: '0 21 * * *',
  timeZone: 'Asia/Taipei'
}, async () => {
  const outcome = await scrapeAndStore('lotto539')
  logger.info('scrape539Late done', outcome)
})

/**
 * 大樂透 — 週二、五 21:35 / 21:45 / 22:00 三次。
 */
export const scrapeLotto649 = onSchedule({
  schedule: '35,45 21 * * 2,5',
  timeZone: 'Asia/Taipei'
}, async () => {
  const outcome = await scrapeAndStore('lotto649')
  logger.info('scrapeLotto649 done', outcome)
})

export const scrapeLotto649Late = onSchedule({
  schedule: '0 22 * * 2,5',
  timeZone: 'Asia/Taipei'
}, async () => {
  const outcome = await scrapeAndStore('lotto649')
  logger.info('scrapeLotto649Late done', outcome)
})

/**
 * 威力彩 — 週一、四 22:05 / 22:15 / 22:30 三次。
 */
export const scrapeSuperLotto = onSchedule({
  schedule: '5,15,30 22 * * 1,4',
  timeZone: 'Asia/Taipei'
}, async () => {
  const outcome = await scrapeAndStore('super_lotto638')
  logger.info('scrapeSuperLotto done', outcome)
})
