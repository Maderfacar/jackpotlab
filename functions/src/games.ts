/**
 * 內嵌的彩種 registry — 與 jackpotlab/shared/lotto/games.ts 同義。
 * 為了讓 functions/ 完全自包（firebase deploy 不會帶 monorepo 外部檔案），刻意複製。
 * 兩邊 schema 改動時要同步。
 */

export const GAME_IDS = ['lotto539', 'lotto649', 'super_lotto638', 'bingo_bingo'] as const
export type GameId = typeof GAME_IDS[number]

export interface GameMeta {
  id: GameId
  name: string
  endpoint: string
  resultField: string
  numbersCount: number
  numberMin: number
  numberMax: number
  hasSpecial: boolean
  specialMin?: number
  specialMax?: number
  queryMode: 'period' | 'date'
}

export const GAMES: Record<GameId, GameMeta> = {
  lotto539: {
    id: 'lotto539', name: '今彩 539',
    endpoint: 'Daily539Result', resultField: 'daily539Res',
    numbersCount: 5, numberMin: 1, numberMax: 39,
    hasSpecial: false, queryMode: 'period'
  },
  lotto649: {
    id: 'lotto649', name: '大樂透',
    endpoint: 'Lotto649Result', resultField: 'lotto649Res',
    numbersCount: 6, numberMin: 1, numberMax: 49,
    hasSpecial: true, specialMin: 1, specialMax: 49,
    queryMode: 'period'
  },
  super_lotto638: {
    id: 'super_lotto638', name: '威力彩',
    endpoint: 'SuperLotto638Result', resultField: 'superLotto638Res',
    numbersCount: 6, numberMin: 1, numberMax: 38,
    hasSpecial: true, specialMin: 1, specialMax: 8,
    queryMode: 'period'
  },
  bingo_bingo: {
    id: 'bingo_bingo', name: '賓果賓果',
    endpoint: 'BingoResult', resultField: 'bingoQueryResult',
    numbersCount: 20, numberMin: 1, numberMax: 80,
    hasSpecial: true, queryMode: 'date'
  }
}
