/**
 * 一頁總覽（2026-10-27 使用者：把問過的、建議的、可探索的都放進一頁）的「盤面座標」。
 *
 * 每期開獎轉成一組座標狀態（單雙、格局、大小…），之後「連 N 期之後怎麼走」「等多久了」
 * 都只看這串狀態，不看號碼本身。隔期、值、y 用 patterns/features.ts 的 computeFeatures
 * （與 analysis.ts processDraw 逐步等價）；暖機期間有號碼找不到隔期的期，隔期類座標記 null。
 */
import { computeFeatures, type DrawFeatures } from '../patterns/features'

export interface OverviewDraw {
  issue: string
  date: string
  /** 五顆主號（升序） */
  nums: number[]
}

/** 狀態往哪一邊偏：偏單／大／升 = 1，偏雙／小／降 = -1，中性 = 0；強度 0～1 決定顏色深淺 */
export interface StateTone {
  side: -1 | 0 | 1
  strength: number
}

export interface CoordDef {
  id: string
  /** 座標名稱（畫面標題） */
  name: string
  /** 一句話說明怎麼數 */
  hint: string
  /** 所有可能的狀態（畫面排序用）；沒列到的照出現順序排在後面 */
  states: string[]
  tone: (state: string) => StateTone
}

export interface CoordSeries {
  def: CoordDef
  /** 每期的狀態（與 draws 同索引）；算不出來為 null */
  seq: (string | null)[]
  /** 每期附帶的數字（總和、隔期和…），沒有就空 */
  values?: (number | null)[]
}

const ODD_STATES = ['5雙', '4雙', '3雙', '3單', '4單', '5單']
const BIG_STATES = ['5小', '4小', '3小', '3大', '4大', '5大']
const DIR_STATES = ['降', '平', '升']

/** 5 顆裡有 k 顆是 A：k ≥ 3 → 「k A」，否則「(5-k) B」 */
function majority(k: number, a: string, b: string): string {
  return k >= 3 ? `${k}${a}` : `${5 - k}${b}`
}

function majorityTone(state: string, a: string): StateTone {
  const k = Number(state[0])
  return { side: state.endsWith(a) ? 1 : -1, strength: (k - 2) / 3 }
}

const dirTone = (s: string): StateTone => (s === '升' ? { side: 1, strength: 0.7 } : s === '降' ? { side: -1, strength: 0.7 } : { side: 0, strength: 0.2 })

/** 跟上一期比：升／降／平 */
function directions(values: (number | null)[]): (string | null)[] {
  return values.map((v, i) => {
    const prev = i > 0 ? values[i - 1] : null
    if (v == null || prev == null) return null
    return v > prev ? '升' : v < prev ? '降' : '平'
  })
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** 隔期類：五顆都有數字才算 */
function allKnown(xs: (number | null)[]): xs is number[] {
  return xs.length === 5 && xs.every(x => x != null)
}

/** 隔期分三段：0~5、6~9、10 以上 */
export function gapShape(gaps: number[]): string {
  const a = gaps.filter(g => g <= 5).length
  const b = gaps.filter(g => g >= 6 && g <= 9).length
  return `${a}·${b}·${5 - a - b}`
}

/** 四個區段 01~09、10~19、20~29、30~39 各幾顆 */
export function zoneShape(nums: number[]): string {
  const c = [0, 0, 0, 0]
  for (const n of nums) c[Math.min(3, Math.floor(n / 10))]! += 1
  return c.join('·')
}

export function hasConsecutive(nums: number[]): boolean {
  const s = [...nums].sort((a, b) => a - b)
  return s.some((n, i) => i > 0 && n - s[i - 1]! === 1)
}

export function hasSameTail(nums: number[]): boolean {
  return new Set(nums.map(n => n % 10)).size < nums.length
}

const shapeTone = (s: string): StateTone => {
  // 0~5 開越多 → 偏「熱」（1），10 以上開越多 → 偏「冷」（-1）
  const [hot = 0, , cold = 0] = s.split('·').map(Number)
  const d = hot - 2.5 - cold
  return { side: d > 0.6 ? 1 : d < -0.6 ? -1 : 0, strength: Math.min(1, Math.abs(d) / 3) }
}

/** feats 可傳進來共用（畫面上方也要顯示最新一期每顆的隔期、值、y） */
export function buildCoords(draws: OverviewDraw[], feats: DrawFeatures[] = computeFeatures(draws.map(d => d.nums))): CoordSeries[] {
  const nums = draws.map(d => d.nums)
  const gaps = feats.map(f => (allKnown(f.gaps) ? f.gaps : null))
  const values = feats.map(f => (allKnown(f.values) ? f.values : null))
  const ys = feats.map(f => (allKnown(f.ys) ? f.ys : null))

  const totals = nums.map(sum)
  const gapSums = gaps.map(g => (g ? sum(g) : null))
  const valueSums = values.map(v => (v ? sum(v) : null))
  const spans = nums.map(n => Math.max(...n) - Math.min(...n))
  const repeats = nums.map((n, i) => (i > 0 ? n.filter(x => nums[i - 1]!.includes(x)).length : null))

  const series: CoordSeries[] = [
    {
      def: { id: 'oddEven', name: '單雙', hint: '五顆裡單數、雙數各幾顆', states: ODD_STATES, tone: s => majorityTone(s, '單') },
      seq: nums.map(n => majority(n.filter(x => x % 2 === 1).length, '單', '雙'))
    },
    {
      def: { id: 'bigSmall', name: '大小', hint: '小 = 01~19、大 = 20~39', states: BIG_STATES, tone: s => majorityTone(s, '大') },
      seq: nums.map(n => majority(n.filter(x => x >= 20).length, '大', '小'))
    },
    {
      def: { id: 'gapShape', name: '隔期格局', hint: '五顆來自隔期 0~5 · 6~9 · 10 以上 各幾顆', states: [], tone: shapeTone },
      seq: gaps.map(g => (g ? gapShape(g) : null))
    },
    {
      def: { id: 'gapSum', name: '隔期和', hint: '五顆隔期加總，跟上一期比', states: DIR_STATES, tone: dirTone },
      seq: directions(gapSums),
      values: gapSums
    },
    {
      def: { id: 'valueSum', name: '值和', hint: '五顆的值加總，跟上一期比', states: DIR_STATES, tone: dirTone },
      seq: directions(valueSums),
      values: valueSums
    },
    {
      def: { id: 'y1', name: 'y=1 幾顆', hint: '五顆裡位置 y=1 的有幾顆', states: ['0顆', '1顆', '2顆', '3顆', '4顆', '5顆'], tone: s => ({ side: Number(s[0]) >= 3 ? 1 : -1, strength: Math.abs(Number(s[0]) - 2.5) / 2.5 }) },
      seq: ys.map(y => (y ? `${y.filter(v => v === 1).length}顆` : null))
    },
    {
      def: { id: 'firstY', name: '第 1 顆的 y', hint: '號碼最小那顆的位置 y', states: ['y=1', 'y=2', 'y=3', 'y≥4'], tone: s => (s === 'y=1' ? { side: 1, strength: 0.5 } : { side: -1, strength: s === 'y=2' ? 0.4 : s === 'y=3' ? 0.7 : 1 }) },
      seq: ys.map(y => (y ? (y[0]! >= 4 ? 'y≥4' : `y=${y[0]}`) : null))
    },
    {
      def: { id: 'zones', name: '區段', hint: '01~09 · 10~19 · 20~29 · 30~39 各幾顆', states: [], tone: () => ({ side: 0, strength: 0.3 }) },
      seq: nums.map(zoneShape)
    },
    {
      def: { id: 'total', name: '五顆總和', hint: '五顆號碼加總，跟上一期比', states: DIR_STATES, tone: dirTone },
      seq: directions(totals),
      values: totals
    },
    {
      def: { id: 'span', name: '跨度', hint: '最大號減最小號，跟上一期比', states: DIR_STATES, tone: dirTone },
      seq: directions(spans),
      values: spans
    },
    {
      def: { id: 'repeat', name: '連莊', hint: '跟上一期開出同一個號碼幾顆', states: ['無連莊', '連莊1', '連莊2+'], tone: s => (s === '無連莊' ? { side: -1, strength: 0.4 } : { side: 1, strength: s === '連莊1' ? 0.5 : 1 }) },
      seq: repeats.map(r => (r == null ? null : r === 0 ? '無連莊' : r === 1 ? '連莊1' : '連莊2+'))
    },
    {
      def: { id: 'consec', name: '連號', hint: '五顆裡有沒有相鄰號碼（例 14、15）', states: ['無連號', '有連號'], tone: s => (s === '有連號' ? { side: 1, strength: 0.6 } : { side: -1, strength: 0.4 }) },
      seq: nums.map(n => (hasConsecutive(n) ? '有連號' : '無連號'))
    },
    {
      def: { id: 'sameTail', name: '同尾', hint: '五顆裡有沒有尾數相同的（例 05、25）', states: ['無同尾', '有同尾'], tone: s => (s === '有同尾' ? { side: 1, strength: 0.6 } : { side: -1, strength: 0.4 }) },
      seq: nums.map(n => (hasSameTail(n) ? '有同尾' : '無同尾'))
    }
  ]
  return series
}

/** 狀態排序：先照 def.states，沒列的照字串排 */
export function orderStates(def: CoordDef, states: Iterable<string>): string[] {
  const set = [...new Set(states)]
  const idx = (s: string) => {
    const i = def.states.indexOf(s)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  return set.sort((a, b) => idx(a) - idx(b) || a.localeCompare(b))
}
