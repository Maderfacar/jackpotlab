/**
 * 賓果賓果（BINGO BINGO）下注單資料模型與 QR Code 字串編碼。
 *
 * 真實的「Data String」格式由台彩決定，目前並未公開規格；本檔
 * `buildBetDataString()` 是一個單一進入點，等使用者提供官方 App
 * 分享出來的範例字串後，反推真正的編碼方式並補進來，UI 與 QR 渲染
 * 端不需要改動。
 *
 * 在正式格式確定前，會輸出一個人類可讀的暫時字串，方便手動比對與測試。
 */

export type BigSmall = 'big' | 'small' | null
export type OddEven = 'odd' | 'even' | null
export type Multiplier = 1 | 2 | 3 | 4 | 5 | 10

export interface BingoBet {
  stars: number // 1..10
  numbers: number[] // 由小到大、長度需等於 stars，值在 1..80
  bigSmall: BigSmall
  oddEven: OddEven
  multiplier: Multiplier
}

export interface BetValidation {
  valid: boolean
  reasons: string[]
}

export const STAR_OPTIONS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
export const MULTIPLIER_OPTIONS: Multiplier[] = [1, 2, 3, 4, 5, 10]
export const TOTAL_NUMBERS = 80

const PADDED = (n: number) => n.toString().padStart(2, '0')

export function validateBet(bet: BingoBet): BetValidation {
  const reasons: string[] = []
  if (bet.stars < 1 || bet.stars > 10) reasons.push('星等需在 1-10')
  if (bet.numbers.length !== bet.stars) {
    reasons.push(`已選 ${bet.numbers.length} 個號碼，需為 ${bet.stars} 個`)
  }
  if (bet.numbers.some(n => n < 1 || n > TOTAL_NUMBERS)) {
    reasons.push('號碼需在 1-80')
  }
  const dedup = new Set(bet.numbers)
  if (dedup.size !== bet.numbers.length) reasons.push('號碼不可重複')
  if (!MULTIPLIER_OPTIONS.includes(bet.multiplier)) reasons.push('倍數錯誤')
  return { valid: reasons.length === 0, reasons }
}

/**
 * 產生 QR Code 內含的字串。
 *
 * ⚠️ 目前是「暫時格式」，給使用者肉眼比對用，掃出來不是真實購買用的字串。
 *   - 等使用者提供台彩 App 分享出來的範例字串
 *   - 再把這個函式換成正確編碼即可，UI 不需要動
 */
export function buildBetDataString(bet: BingoBet): string {
  const sortedNumbers = [...bet.numbers].sort((a, b) => a - b).map(PADDED).join('-')
  const sides: string[] = []
  if (bet.bigSmall) sides.push(bet.bigSmall === 'big' ? '大' : '小')
  if (bet.oddEven) sides.push(bet.oddEven === 'odd' ? '單' : '雙')
  const sidesStr = sides.length ? `|加注:${sides.join('+')}` : ''
  return `BINGO|星:${bet.stars}|號:${sortedNumbers}${sidesStr}|倍:${bet.multiplier}x`
}

export function makeEmptyBet(): BingoBet {
  return {
    stars: 5,
    numbers: [],
    bigSmall: null,
    oddEven: null,
    multiplier: 1
  }
}
