import { z } from 'zod'

/**
 * 共用的台彩 API 信封。
 *   { rtCode: 0, rtMsg: null, content: { ... } }
 */
export const apiEnvelopeSchema = z.object({
  rtCode: z.number(),
  rtMsg: z.string().nullable(),
  content: z.record(z.string(), z.unknown()).nullable().optional()
})

/**
 * 539 / 大樂透 / 威力彩 共用的紀錄基底。
 * passthrough 讓我們把其他欄位（獎金分配等）保留下來放 extras。
 */
const dailyLottoRecord = z.object({
  period: z.number().int().positive(),
  lotteryDate: z.string(),
  drawNumberSize: z.array(z.number().int().nonnegative()),
  drawNumberAppear: z.array(z.number().int().nonnegative())
}).passthrough()

export const daily539RecordSchema = dailyLottoRecord
export const lotto649RecordSchema = dailyLottoRecord
export const superLotto638RecordSchema = dailyLottoRecord

/**
 * 賓果賓果有自己一套欄位名。
 * bigShowOrder / openShowOrder 都是 string array (台彩 API 原貌)，要轉 number。
 * dDate 經常是 "0001-01-01" 垃圾值，靠不住，drawDate 用查詢日期回填。
 */
export const bingoBingoRecordSchema = z.object({
  drawTerm: z.number().int().positive(),
  bigShowOrder: z.array(z.string()),
  openShowOrder: z.array(z.string()),
  bullEyeTop: z.string().optional().nullable()
}).passthrough()

/** LatestResult 端點 — 一次回所有彩種最新一期 */
export const latestResultSchema = z.object({
  rtCode: z.number(),
  rtMsg: z.string().nullable(),
  content: z.object({
    superLotto638Result: dailyLottoRecord.optional().nullable(),
    lotto649Result: dailyLottoRecord.optional().nullable(),
    daily539Result: dailyLottoRecord.optional().nullable()
  }).passthrough()
})

export type Daily539Record = z.infer<typeof daily539RecordSchema>
export type Lotto649Record = z.infer<typeof lotto649RecordSchema>
export type SuperLotto638Record = z.infer<typeof superLotto638RecordSchema>
export type BingoBingoRecord = z.infer<typeof bingoBingoRecordSchema>
