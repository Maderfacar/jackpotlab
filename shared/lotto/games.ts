/**
 * 台灣 4 個彩種的中央註冊表。
 * 任何彩種相關的常數、metadata、合法性規則都來這找。
 */

export const GAME_IDS = ['lotto539', 'lotto649', 'super_lotto638', 'bingo_bingo'] as const
export type GameId = typeof GAME_IDS[number]

export interface GameMeta {
  id: GameId
  name: string                    // 完整中文名
  shortName: string               // tab 上顯示的短名
  /** taiwanlottery.com TLCAPIWeB endpoint segment */
  endpoint: string
  /** content.{resultField} 是 array of records */
  resultField: string
  drawSchedule: string            // 人類可讀的開獎時段
  cadenceLabel: string            // tab 上的節奏短籤
  numbersCount: number            // 主號碼數量
  numberMin: number
  numberMax: number
  hasSpecial: boolean             // 有沒有特別號 / 第二區 / 中央彩球
  specialLabel?: string
  specialMin?: number
  specialMax?: number
  /** 真實時段需要每分鐘 poll 的彩種（賓果賓果） */
  realtime: boolean
  /** 查詢時要用 period (民國年+000+期數) 或 openDate (YYYY-MM-DD) */
  queryMode: 'period' | 'date'
}

export const GAMES: Record<GameId, GameMeta> = {
  lotto539: {
    id: 'lotto539',
    name: '今彩 539',
    shortName: '539',
    endpoint: 'Daily539Result',
    resultField: 'daily539Res',
    drawSchedule: '每日 20:30',
    cadenceLabel: '每日',
    numbersCount: 5,
    numberMin: 1,
    numberMax: 39,
    hasSpecial: false,
    realtime: false,
    queryMode: 'period'
  },
  lotto649: {
    id: 'lotto649',
    name: '大樂透',
    shortName: '大樂',
    endpoint: 'Lotto649Result',
    resultField: 'lotto649Res',
    drawSchedule: '每週二、五 21:30',
    cadenceLabel: '週 2/5',
    numbersCount: 6,
    numberMin: 1,
    numberMax: 49,
    hasSpecial: true,
    specialLabel: '特別號',
    specialMin: 1,
    specialMax: 49,
    realtime: false,
    queryMode: 'period'
  },
  super_lotto638: {
    id: 'super_lotto638',
    name: '威力彩',
    shortName: '威力',
    endpoint: 'SuperLotto638Result',
    resultField: 'superLotto638Res',
    drawSchedule: '每週一、四 22:00',
    cadenceLabel: '週 1/4',
    numbersCount: 6,
    numberMin: 1,
    numberMax: 38,
    hasSpecial: true,
    specialLabel: '第二區',
    specialMin: 1,
    specialMax: 8,
    realtime: false,
    queryMode: 'period'
  },
  bingo_bingo: {
    id: 'bingo_bingo',
    name: '賓果賓果',
    shortName: '賓果',
    endpoint: 'BingoResult',
    resultField: 'bingoQueryResult',
    drawSchedule: '每日 05:05–24:00，每 5 分鐘一期',
    cadenceLabel: '5 分鐘',
    numbersCount: 20,
    numberMin: 1,
    numberMax: 80,
    hasSpecial: true,
    specialLabel: '中央彩球',
    realtime: true,
    queryMode: 'date'
  }
}

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && (GAME_IDS as readonly string[]).includes(value)
}

export function gameOrThrow(value: unknown): GameMeta {
  if (!isGameId(value)) {
    throw new Error(`Unknown gameId: ${String(value)}`)
  }
  return GAMES[value]
}
