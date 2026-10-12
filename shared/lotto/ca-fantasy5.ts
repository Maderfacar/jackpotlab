/**
 * 美國加州天天樂（California Fantasy 5，39 選 5，每天開）— 2026-10-12 使用者要求接進資料庫。
 *
 * 來源（2026-10-12 實測）：
 *   - 加州官方 calottery.com：從台灣連線回 403、網頁空白 → 不能用。
 *   - lotterycorner.com /ca/fantasy-5/{年}：每年一頁，1992 起。
 *   - lottery.net /california/fantasy-5/numbers/{年}：每年一頁，2010 起；/numbers 是最近 30 天。
 *   - lotteryusa.com /california/fantasy-5/：最近 10 期。
 * 官方期號抓不到 → 期號用加州當地開獎日 YYYYMMDD（例 20261011），一天一期。
 * 寫入前要兩家一致；只有一家的（1992～2009）標「單一來源」。
 *
 * 注意：functions/src/ca-fantasy5.ts 是這支的複本（functions 必須自包），改動要同步。
 */

export const CA_FANTASY5_ID = 'ca_fantasy5'
export const CA_NUMBER_MAX = 39
export const CA_PICK = 5

export interface CaDraw {
  /** 加州當地開獎日 YYYY-MM-DD */
  date: string
  /** 五顆（升序） */
  nums: number[]
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** HTML → 純文字（去掉 script/style/標籤、合併空白） */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, '\'')
    .replace(/\s+/g, ' ')
}

/** 「October 11, 2026」「Oct 11, 2026」後面接 5 個號碼（中間可能夾 Draw Payouts） */
const DRAW_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.? (\d{1,2}),? (\d{4}) (?:Draw Payouts )?(\d{1,2}) (\d{1,2}) (\d{1,2}) (\d{1,2}) (\d{1,2})\b/g

/** 一頁文字裡所有「日期 + 5 顆」；同一天出現多次只留第一次 */
export function parseDraws(html: string): CaDraw[] {
  const text = htmlToText(html)
  const seen = new Set<string>()
  const out: CaDraw[] = []
  for (const m of text.matchAll(DRAW_RE)) {
    const month = MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase()) + 1
    const date = `${m[3]}-${String(month).padStart(2, '0')}-${m[2]!.padStart(2, '0')}`
    if (seen.has(date)) continue
    seen.add(date)
    out.push({ date, nums: m.slice(4, 9).map(Number).sort((a, b) => a - b) })
  }
  return out
}

/** 5 顆、1～39、不重複 */
export function isValidDraw(d: CaDraw): boolean {
  return d.nums.length === CA_PICK
    && new Set(d.nums).size === CA_PICK
    && d.nums.every(n => Number.isInteger(n) && n >= 1 && n <= CA_NUMBER_MAX)
    && /^\d{4}-\d{2}-\d{2}$/.test(d.date)
}

export const caDrawTerm = (date: string): number => Number(date.replaceAll('-', ''))

export interface MergedDraw extends CaDraw {
  /** 採用的來源（號碼一致的那幾家） */
  sources: string[]
  /** 被判定貼錯而剔掉的來源（號碼跟它自己前一天一模一樣） */
  dropped: string[]
}

export interface MergeReport {
  draws: MergedDraw[]
  /** 兩家號碼不一樣、又判斷不出誰錯 → 不收 */
  conflicts: { date: string, bySource: Record<string, number[]> }[]
  invalid: { source: string, draw: CaDraw }[]
}

const prevDate = (date: string): string => new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

/**
 * 合併多家來源：同一天號碼一致才收。
 * 不一致時，若某家「這天的號碼跟它自己前一天一模一樣」→ 判定那家把前一天貼錯（2026-10-12 實測
 * lottery.net 有 12 個月初這樣），剔掉它；剩下的一致就收，否則列進 conflicts。
 * 只有一家有的照收，sources 只有一個 = 單一來源。
 */
export function mergeSources(bySource: Record<string, CaDraw[]>): MergeReport {
  const byDate = new Map<string, Map<string, number[]>>()
  const own = new Map<string, Map<string, string>>()
  const invalid: MergeReport['invalid'] = []
  for (const [source, draws] of Object.entries(bySource)) {
    const mine = new Map<string, string>()
    for (const d of draws) {
      if (!isValidDraw(d)) {
        invalid.push({ source, draw: d })
        continue
      }
      mine.set(d.date, d.nums.join(','))
      const m = byDate.get(d.date) ?? new Map<string, number[]>()
      m.set(source, d.nums)
      byDate.set(d.date, m)
    }
    own.set(source, mine)
  }
  const draws: MergedDraw[] = []
  const conflicts: MergeReport['conflicts'] = []
  for (const [date, m] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    let entries = [...m.entries()]
    const dropped: string[] = []
    if (new Set(entries.map(([, n]) => n.join(','))).size > 1) {
      const repeats = (source: string, nums: number[]) => own.get(source)!.get(prevDate(date)) === nums.join(',')
      dropped.push(...entries.filter(([src, n]) => repeats(src, n)).map(([src]) => src))
      entries = entries.filter(([src]) => !dropped.includes(src))
    }
    if (entries.length === 0 || new Set(entries.map(([, n]) => n.join(','))).size > 1) {
      conflicts.push({ date, bySource: Object.fromEntries(m) })
      continue
    }
    draws.push({ date, nums: entries[0]![1], sources: entries.map(([src]) => src).sort(), dropped: dropped.sort() })
  }
  return { draws, conflicts, invalid }
}
