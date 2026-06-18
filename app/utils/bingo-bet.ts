/**
 * 賓果賓果（BINGO BINGO）下注單資料模型與 QR Code 字串編碼。
 *
 * 一張選號單上可以同時下多注：
 *   - 星等注 StarBet：選 1-10 顆號碼
 *   - 大小注 BigSmallBet：純猜總和大 (>40) 或小 (≤40)，不選號碼
 *   - 單雙注 OddEvenBet：純猜總和單或雙，不選號碼
 *
 * 每注獨立計費，獨立倍數（1/2/3/4/5/10x）。
 *
 * 真正的「Data String」格式由台彩決定、未公開規格；目前
 * `buildBetslipDataString()` 是單一進入點，等樣本收齊敲定編碼後在這裡換掉，
 * UI 與 QR 渲染不需要動。
 */

export type Multiplier = 1 | 2 | 3 | 4 | 5 | 10

export interface StarBet {
  kind: 'star'
  stars: number // 1..10
  numbers: number[] // 長度需等於 stars，值 1..80
  multiplier: Multiplier
}

export interface BigSmallBet {
  kind: 'bigsmall'
  value: 'big' | 'small'
  multiplier: Multiplier
}

export interface OddEvenBet {
  kind: 'oddeven'
  value: 'odd' | 'even'
  multiplier: Multiplier
}

export type Bet = StarBet | BigSmallBet | OddEvenBet
export type BetKind = Bet['kind']

export interface Betslip {
  bets: Bet[]
}

export interface BetValidation {
  valid: boolean
  reasons: string[]
}

export const STAR_OPTIONS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
export const MULTIPLIER_OPTIONS: Multiplier[] = [1, 2, 3, 4, 5, 10]
export const TOTAL_NUMBERS = 80

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

export function validateBet(bet: Bet): BetValidation {
  const reasons: string[] = []
  if (!MULTIPLIER_OPTIONS.includes(bet.multiplier)) reasons.push('倍數錯誤')
  if (bet.kind === 'star') {
    if (bet.stars < 1 || bet.stars > 10) reasons.push('星等需在 1-10')
    if (bet.numbers.length !== bet.stars) {
      reasons.push(`已選 ${bet.numbers.length} 個號碼，需為 ${bet.stars} 個`)
    }
    if (bet.numbers.some(n => n < 1 || n > TOTAL_NUMBERS)) {
      reasons.push('號碼需在 1-80')
    }
    if (new Set(bet.numbers).size !== bet.numbers.length) {
      reasons.push('號碼不可重複')
    }
  }
  return { valid: reasons.length === 0, reasons }
}

export function validateBetslip(slip: Betslip): BetValidation {
  if (slip.bets.length === 0) {
    return { valid: false, reasons: ['尚未加入任何注'] }
  }
  const reasons: string[] = []
  slip.bets.forEach((bet, i) => {
    const v = validateBet(bet)
    if (!v.valid) reasons.push(`第 ${i + 1} 注：${v.reasons.join('、')}`)
  })
  return { valid: reasons.length === 0, reasons }
}

function describeBet(bet: Bet): string {
  if (bet.kind === 'star') {
    const nums = [...bet.numbers].sort((a, b) => a - b).map(pad2).join('-')
    return `★${bet.stars}星[${nums}]×${bet.multiplier}`
  }
  if (bet.kind === 'bigsmall') {
    return `大小[${bet.value === 'big' ? '大' : '小'}]×${bet.multiplier}`
  }
  return `單雙[${bet.value === 'odd' ? '單' : '雙'}]×${bet.multiplier}`
}

/**
 * 產生 QR Code 內含的字串。
 *
 * ⚠️ 目前是「暫時格式」，給使用者肉眼比對用，掃出來不是真實購買用的字串。
 *   - 等使用者提供台彩 App 分享出來的範例字串
 *   - 再把這個函式換成正確編碼即可，UI 不需要動
 */
export function buildBetslipDataString(slip: Betslip): string {
  const items = slip.bets.map(describeBet).join('|')
  return `BINGO|${items}`
}

export function makeEmptyBetslip(): Betslip {
  return { bets: [] }
}

export function newStarBet(): StarBet {
  return { kind: 'star', stars: 5, numbers: [], multiplier: 1 }
}

export function newBigSmallBet(value: 'big' | 'small' = 'big'): BigSmallBet {
  return { kind: 'bigsmall', value, multiplier: 1 }
}

export function newOddEvenBet(value: 'odd' | 'even' = 'odd'): OddEvenBet {
  return { kind: 'oddeven', value, multiplier: 1 }
}

export function summarizeBet(bet: Bet): string {
  return describeBet(bet)
}
