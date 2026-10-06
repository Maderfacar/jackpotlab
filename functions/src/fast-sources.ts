/**
 * 慢彩種（539/大樂透/威力彩）的「快速來源」— 比 LatestResult 早拿到獎號。
 *
 * 實測 2026-10-06（20:30 開獎）：
 *   - 第三方 i539.tw / pilio.idv.tw（看直播輸入）：20:35–20:41 就有
 *   - 官方 /Lottery/LastNumber、TodayLastNumber（官網首頁用）：約 21:28
 *   - 官方 LatestResult / byPeriod（含獎金分配）：21:42 之後仍未更新
 *
 * 分級（DrawResult.provisional）：
 *   'thirdparty' — 兩個第三方網站號碼一致才採用，期號用「上一期 + 1」推算
 *   'numbers'    — 官方 LastNumber，號碼/期號/開出順序皆官方，缺獎金分配
 *   undefined    — 官方完整紀錄（LatestResult / byPeriod），會覆蓋前兩者
 *
 * 複本：與 jackpotlab/shared/lotto/fast-sources.ts 同義（functions 必須自包），改動要同步。
 */
import { GAMES, type GameId } from './games.js'

export type SlowGameId = Exclude<GameId, 'bingo_bingo'>
export type Provisional = 'thirdparty' | 'numbers'

export interface FastDraw {
  gameId: SlowGameId
  drawTerm: number
  drawDate: string
  numbers: number[]
  drawOrder: number[]
  special: number | null
  provisional: Provisional
  source: string
}

/** 開獎日（JS getDay：0=週日）；三彩種都是台北時間 20:30 開獎。 */
const SLOW_DRAW_DAYS: Record<SlowGameId, number[]> = {
  lotto539: [1, 2, 3, 4, 5, 6],
  lotto649: [2, 5],
  super_lotto638: [1, 4]
}
const SLOW_DRAW_MINUTE_OF_DAY = 20 * 60 + 30
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000

/** 最近一個「應該已經開獎」的日期 YYYY-MM-DD（台北時間）。 */
export function expectedLatestDrawDate(gameId: SlowGameId, now = new Date()): string {
  // 把「台北現在」當成 UTC 欄位來算，避開主機時區
  const taipei = new Date(now.getTime() + TAIPEI_OFFSET_MS)
  const minuteOfDay = taipei.getUTCHours() * 60 + taipei.getUTCMinutes()
  if (minuteOfDay < SLOW_DRAW_MINUTE_OF_DAY) taipei.setUTCDate(taipei.getUTCDate() - 1)
  return rollBackToDrawDay(gameId, taipei)
}

/** date（YYYY-MM-DD）之前的上一個開獎日。 */
export function previousDrawDate(gameId: SlowGameId, date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return rollBackToDrawDay(gameId, d)
}

function rollBackToDrawDay(gameId: SlowGameId, d: Date): string {
  const days = SLOW_DRAW_DAYS[gameId]
  while (!days.includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

const HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (compatible; JackpotLab/1.0)'
}

async function fetchText(url: string, extraHeaders: Record<string, string> = {}): Promise<string> {
  const r = await fetch(url, {
    headers: { ...HEADERS, ...extraHeaders },
    signal: AbortSignal.timeout(10_000)
  })
  if (!r.ok) throw new Error(`HTTP ${r.status} - ${url}`)
  return r.text()
}

function isValid(gameId: SlowGameId, mains: number[], special: number | null): boolean {
  const g = GAMES[gameId]
  if (mains.length !== g.numbersCount) return false
  if (new Set(mains).size !== mains.length) return false
  if (mains.some(n => !Number.isInteger(n) || n < g.numberMin || n > g.numberMax)) return false
  if (g.hasSpecial) {
    if (special == null || g.specialMin == null || g.specialMax == null) return false
    if (special < g.specialMin || special > g.specialMax) return false
  }
  return true
}

const sortAsc = (a: number, b: number) => a - b

// ---------- 官方 LastNumber ----------

const LAST_NUMBER_GAME_CODE: Record<SlowGameId, number> = {
  lotto539: 1197,
  lotto649: 5118,
  super_lotto638: 5134
}

/** 官方 /Lottery/LastNumber：只在該期開獎日 = expectedDate 時回傳。 */
export async function fetchOfficialLastNumber(
  gameId: SlowGameId,
  expectedDate: string
): Promise<FastDraw | null> {
  const text = await fetchText('https://api.taiwanlottery.com/TLCAPIWeB/Lottery/LastNumber', {
    Accept: 'application/json',
    Referer: 'https://www.taiwanlottery.com/'
  })
  const json = JSON.parse(text) as {
    rtCode: number
    content?: { lastNumberList?: { gameCode: number, drawDate: string, period: string, lotNumber: number[] }[] }
  }
  if (json.rtCode !== 0) return null
  const row = json.content?.lastNumberList?.find(r => r.gameCode === LAST_NUMBER_GAME_CODE[gameId])
  if (!row || row.drawDate.slice(0, 10) !== expectedDate) return null

  const count = GAMES[gameId].numbersCount
  const order = row.lotNumber.slice(0, count)
  const special = GAMES[gameId].hasSpecial ? (row.lotNumber[count] ?? null) : null
  if (!isValid(gameId, order, special)) return null

  return {
    gameId,
    drawTerm: Number(row.period),
    drawDate: expectedDate,
    numbers: [...order].sort(sortAsc),
    drawOrder: order,
    special,
    provisional: 'numbers',
    source: 'taiwanlottery.com/LastNumber'
  }
}

// ---------- 第三方：pilio.idv.tw + i539.tw，兩家一致才採用 ----------

interface ScrapedNumbers {
  drawDate: string
  numbers: number[]
  special: number | null
}

const PILIO_URL: Record<SlowGameId, string> = {
  lotto539: 'https://www.pilio.idv.tw/lto539/list.asp',
  lotto649: 'https://www.pilio.idv.tw/ltobig/list.asp',
  super_lotto638: 'https://www.pilio.idv.tw/lto/list.asp'
}

const I539_URL: Record<SlowGameId, string> = {
  lotto539: 'https://i539.tw/',
  lotto649: 'https://i539.tw/lotto/',
  super_lotto638: 'https://i539.tw/super-lotto/'
}

/** pilio 列表第一列：<td class="date-cell">10/06<br>26(二)</td><td class="number-cell">14,&nbsp;25…</td>[<td class="bonus-cell">23</td>] */
export function parsePilio(html: string): ScrapedNumbers | null {
  const m = html.match(
    /class="date-cell">\s*(\d{2})\/(\d{2})<br>\s*(\d{2})\([^)]*\)\s*<\/td>\s*<td class="number-cell">([\d,\s&nbsp;]+)<\/td>(?:\s*<td class="bonus-cell">\s*(\d+)\s*<\/td>)?/
  )
  if (!m) return null
  const [, mm, dd, yy, nums, bonus] = m
  return {
    drawDate: `20${yy}-${mm}-${dd}`,
    numbers: nums!.replace(/&nbsp;/g, ' ').split(',').map(s => Number(s.trim())),
    special: bonus != null ? Number(bonus) : null
  }
}

/** i539 最新開獎區塊：lau-date + lau-ball-main ×N + lau-ball-extra（特別號 / 第二區）。 */
export function parseI539(html: string): ScrapedNumbers | null {
  const box = html.match(/class="lau-lottery-box[\s\S]*?class="lau-updated"/)
  if (!box) return null
  const date = box[0].match(/class="lau-date">\s*(\d{4})\/(\d{2})\/(\d{2})/)
  if (!date) return null
  const numbers = [...box[0].matchAll(/lau-ball-main">\s*(\d+)\s*</g)].map(x => Number(x[1]))
  const extra = box[0].match(/lau-ball-extra[^"]*">\s*(\d+)\s*</)
  return {
    drawDate: `${date[1]}-${date[2]}-${date[3]}`,
    numbers,
    special: extra ? Number(extra[1]) : null
  }
}

function sameNumbers(a: ScrapedNumbers, b: ScrapedNumbers): boolean {
  const x = [...a.numbers].sort(sortAsc)
  const y = [...b.numbers].sort(sortAsc)
  return a.drawDate === b.drawDate
    && a.special === b.special
    && x.length === y.length
    && x.every((n, i) => n === y[i])
}

/**
 * 第三方初步結果。
 * prevTerm/prevDate = 目前已存的最新一期；只有它正好是 expectedDate 的「上一個開獎日」
 * 才推算期號 = prevTerm + 1（中間漏期或跨民國年就不猜，等官方）。
 */
export async function fetchThirdParty(
  gameId: SlowGameId,
  expectedDate: string,
  prevTerm: number,
  prevDate: string
): Promise<FastDraw | null> {
  if (prevDate !== previousDrawDate(gameId, expectedDate)) return null
  const rocYear = Number(expectedDate.slice(0, 4)) - 1911
  if (Math.floor(prevTerm / 1_000_000) !== rocYear) return null

  const [pilio, i539] = await Promise.all([
    fetchText(PILIO_URL[gameId]).then(parsePilio).catch(() => null),
    fetchText(I539_URL[gameId]).then(parseI539).catch(() => null)
  ])
  if (!pilio || !i539) return null
  if (pilio.drawDate !== expectedDate || !sameNumbers(pilio, i539)) return null
  if (!isValid(gameId, pilio.numbers, pilio.special)) return null

  const numbers = [...pilio.numbers].sort(sortAsc)
  return {
    gameId,
    drawTerm: prevTerm + 1,
    drawDate: expectedDate,
    numbers,
    // 第三方沒有開出順序，先放升冪；官方資料到了會覆蓋
    drawOrder: numbers,
    special: pilio.special,
    provisional: 'thirdparty',
    source: 'pilio.idv.tw+i539.tw'
  }
}
