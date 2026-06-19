<script setup lang="ts">
/**
 * 艾佛森 /iverson
 *
 * 賓果賓果的「隔期狀態」即時頁。
 *   - 邏輯承襲自 utils/analysis.ts 的 PeriodTable（與 /draws 同一份算法）
 *   - UI 承襲自 /bingo-heineken：UBadge size=md、warning solid、min-w-8、
 *     右下角小黑字標 1-indexed 位置
 *
 * 規格：
 *   - Tab 1「隔期剩餘號碼」：N=50、深度=過去 1 小時（最新 12 期）
 *   - Tab 2「獎號關聯位置」：N=60、D=500（對齊 /draws bingo 預設）
 *   - Tab 3「下一期 20 顆預測」：用 N=60 / D=500 的每期 snapshot 套規則選 20 號、與下一期 actual 比對
 *   - 日期格式：MM/DD HH:MM
 *
 * 三 tab 共用同一份 `allDraws` fetch（limit=500）。Tab1 / Tab2 各自 hydrate analysisState；
 * Tab3 用自家漸進式 hydration 在每步保留 slot[0..5] 快照。
 *
 * ⚠️ 動本頁前必看 docs/IVERSON-PRINCIPLES.md。
 */

import type { DrawQueryResponse } from '~~/shared/lotto/types'
import {
  createInitialState,
  defaultN,
  defaultD,
  hydrateFromDraws,
  processDraw,
  type AnalysisDrawInput
} from '~/utils/analysis'
import { bingoTimeFromMap, buildBingoMinTermByDate } from '~/utils/bingo-time'

definePageMeta({
  title: '艾佛森'
})

const INTERVAL_ANALYSIS_N = 50
const INTERVAL_PAST_HOUR_DRAWS = 12
// 獎號關聯位置 tab 對齊 /draws bingo 預設（defaultN() / defaultD('bingo_bingo')）
const POSITIONS_ANALYSIS_N = defaultN()
// 預設 fetch 期數（= defaultD('bingo_bingo') = 500）寫進 DEFAULT_CONFIG.fetchLimit，
// 實際抓取改讀 config.fetchLimit、可在 UI 上即時調整（debounce 後重抓）。
const POSITIONS_DEFAULT_LIMIT = defaultD('bingo_bingo')

interface NormalizedDraw {
  drawTerm: number
  drawDate: string
  numbers: number[]
}

const loading = ref(false)
const error = ref<string | null>(null)
const allDraws = ref<NormalizedDraw[]>([])

async function load() {
  loading.value = true
  error.value = null
  try {
    // limit=500：同時供「隔期剩餘號碼」（取最新 12）與「獎號關聯位置」（用全部）使用
    const res = await $fetch<DrawQueryResponse>('/api/draws/bingo_bingo/recent', {
      params: { limit: config.fetchLimit }
    })
    allDraws.value = [...res.results]
      .sort((a, b) => a.drawTerm - b.drawTerm)
      .map((r) => {
        const merged = r.special != null ? [...r.numbers, r.special] : r.numbers
        return {
          drawTerm: r.drawTerm,
          drawDate: r.drawDate,
          numbers: [...new Set(merged)].sort((a, b) => a - b)
        }
      })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'unknown error'
  } finally {
    loading.value = false
  }
}

const BINGO_POLL_MS = 30_000
let pollTimer: ReturnType<typeof setInterval> | null = null

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// Tab3 待開獎期 sticky 需要避開頂部 UHeader、不被蓋住。
// onMounted 量 UHeader 高度、ResizeObserver 跟進視窗大小變化（手機橫直、字體放大）。
const headerHeight = ref(0)
let headerResizeObserver: ResizeObserver | null = null

onMounted(() => {
  loadConfigFromStorage()
  load()
  if (typeof window === 'undefined') return

  // 量 header 高度（UHeader 渲染為 <header> 元素、sticky top:0）
  const headerEl = document.querySelector('header')
  if (headerEl instanceof HTMLElement) {
    headerHeight.value = headerEl.offsetHeight
    if (typeof ResizeObserver !== 'undefined') {
      headerResizeObserver = new ResizeObserver(() => {
        headerHeight.value = headerEl.offsetHeight
      })
      headerResizeObserver.observe(headerEl)
    }
  }

  pollTimer = setInterval(async () => {
    if (loading.value) return
    try {
      const res = await $fetch<DrawQueryResponse>('/api/draws/bingo_bingo/latest')
      const latestServer = res.results[0]?.drawTerm
      if (latestServer == null) return
      const localArr = allDraws.value
      const localLatest = localArr.length > 0 ? localArr[localArr.length - 1]!.drawTerm : null
      if (localLatest == null || latestServer > localLatest) {
        await load()
      }
    } catch {
      // 單次 poll 失敗忽略；下個 tick 再試
    }
  }, BINGO_POLL_MS)
})

onBeforeUnmount(() => {
  stopPolling()
  headerResizeObserver?.disconnect()
  headerResizeObserver = null
})

const pendingStickyStyle = computed(() => ({
  top: `${headerHeight.value}px`
}))

// ---- 共用工具 -----------------------------------------------------------

const bingoMinTermByDate = computed<Map<string, number>>(() => {
  return buildBingoMinTermByDate(allDraws.value)
})

function timeOf(date: string, term: number): string {
  return bingoTimeFromMap(bingoMinTermByDate.value, date, term)
}

function dateLabel(date: string, term: number): string {
  if (!date || date.length < 10) return ''
  const md = `${date.slice(5, 7)}/${date.slice(8, 10)}`
  const time = timeOf(date, term)
  return time ? `${md} ${time}` : md
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

// ---- Tab 1：隔期剩餘號碼（N=50、過去 1 小時） --------------------------

const intervalInputs = computed<AnalysisDrawInput[]>(() => {
  if (allDraws.value.length === 0) return []
  const latest = allDraws.value[allDraws.value.length - 1]!
  const cutoff = latest.drawTerm - (INTERVAL_PAST_HOUR_DRAWS - 1)
  return allDraws.value
    .filter(d => d.drawTerm >= cutoff)
    .map(d => ({
      drawTerm: d.drawTerm,
      drawDate: d.drawDate,
      prizes: d.numbers
    }))
})

const intervalState = computed(() => {
  if (intervalInputs.value.length === 0) return null
  return hydrateFromDraws('bingo_bingo', INTERVAL_ANALYSIS_N, intervalInputs.value)
})

interface IntervalEntry {
  n: number
  originPos: number
}

interface IntervalRow {
  interval: number
  issue: string
  dateLabel: string
  entries: IntervalEntry[]
}

const intervalRows = computed<IntervalRow[]>(() => {
  const s = intervalState.value
  if (!s) return []
  return s.periods.map((p) => {
    const sorted = [...p.prizes].sort((a, b) => a - b)
    const issueNum = p.issue ? Number.parseInt(p.issue, 10) : Number.NaN
    return {
      interval: p.period,
      issue: p.issue,
      dateLabel: Number.isFinite(issueNum) ? dateLabel(p.date, issueNum) : '',
      entries: sorted.map((n, idx) => ({ n, originPos: idx + 1 }))
    }
  })
})

const latestDrawInfo = computed<{ term: number, label: string } | null>(() => {
  const arr = allDraws.value
  if (arr.length === 0) return null
  const latest = arr[arr.length - 1]!
  return {
    term: latest.drawTerm,
    label: dateLabel(latest.drawDate, latest.drawTerm)
  }
})

// ---- Tab 2：獎號關聯位置（N=60、D=500） --------------------------------

const positionsState = computed(() => {
  if (allDraws.value.length === 0) return null
  const inputs: AnalysisDrawInput[] = allDraws.value.map(d => ({
    drawTerm: d.drawTerm,
    drawDate: d.drawDate,
    prizes: d.numbers
  }))
  return hydrateFromDraws('bingo_bingo', POSITIONS_ANALYSIS_N, inputs)
})

interface ParsedPosition {
  x: number
  y: number
}

function parsePositions(csv: string): Array<ParsedPosition | null> {
  if (!csv) return []
  return csv.split(',').map((s) => {
    if (!s) return null
    const dash = s.indexOf('-')
    if (dash < 0) return null
    const x = Number.parseInt(s.slice(0, dash), 10)
    const y = Number.parseInt(s.slice(dash + 1), 10)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x, y }
  })
}

interface YStat {
  y: number
  count: number
}

interface PositionRow {
  issue: string
  dateLabel: string
  positionsCsv: string
  yList: number[]
  yStats: YStat[]
}

const positionRows = computed<PositionRow[]>(() => {
  const s = positionsState.value
  if (!s) return []
  const rows: PositionRow[] = []
  for (const h of s.history) {
    // 第一期 isEmpty 路徑沒有寫 positions、直接略過
    if (!h.positions) continue
    const parsed = parsePositions(h.positions)
    // 使用者拍板：空位置（找不到的獎號）從 Y 清單與統計中排除
    const yList: number[] = []
    for (const p of parsed) {
      if (p) yList.push(p.y)
    }
    const countMap = new Map<number, number>()
    for (const y of yList) {
      countMap.set(y, (countMap.get(y) ?? 0) + 1)
    }
    const yStats: YStat[] = [...countMap.entries()]
      .map(([y, count]) => ({ y, count }))
      .sort((a, b) => a.y - b.y)
    const issueNum = Number.parseInt(h.issue, 10)
    rows.push({
      issue: h.issue,
      dateLabel: Number.isFinite(issueNum) ? dateLabel(h.date, issueNum) : '',
      positionsCsv: h.positions,
      yList,
      yStats
    })
  }
  // 使用者拍板：最新期在上
  rows.reverse()
  return rows
})

// ---- Tab 3：符合規則的 20 顆（N=60 / D=500，每期套規則篩選） ----------
//
// 使用者拍板（2026-06-19）：規則參數開放於 UI 即時調整、localStorage 持久化。
// 預設：
//   單一隔期規則：
//     - 只從隔期 0~3 取候選；只取 record CSV 首碼為 '0' 的隔期
//     - 排除位置：用 T 自己的 positions CSV、取所有 Y 值 >= 10 的 Y、做去重集合
//     - 5/6/7/8/9 五個位置在 20 顆裡每個位置最多 2 個
//   全域 cap：
//     - <=40 ≤ 12、>40 ≤ 12
//     - 奇數 ≤ 12、偶數 ≤ 12
//     - 任一相同尾數 ≤ 5
//     - 連續號碼最大連跑 ≤ 5
//   候選排序優先序：3 (避免 cap 抵達) > 1 (小隔期優先) > 2 (低位置優先)
//   候選不足 20 / cap 衝突湊不滿：顯示實際數、標「不足 20」（不填、不破 cap）

interface RuleConfig {
  /** 抓取期數（影響 fetch limit、所有歷史比對與聚合命中率） */
  fetchLimit: number
  predictTarget: number
  sourceMaxInterval: number
  /** 位置 ≥ posCapHigh 時走 per-interval Y 排除（與前一期 T 的 positions 比對去重） */
  posCapHigh: number
  /** 位置 1、2 各自的命中上限 */
  pos12Cap: number
  /** 位置 3-9 各自的命中上限 */
  pos39Cap: number
  le40Cap: number
  gt40Cap: number
  oddCap: number
  evenCap: number
  tailCap: number
  consecutiveCap: number
}

const FETCH_LIMIT_MIN = 50
const FETCH_LIMIT_MAX = 5000
const FETCH_DEBOUNCE_MS = 500

/** 候選池熱/冷比例（2026-06-19 拍板、暫不開放 UI 調整）。
 * 熱 = slot.record CSV 首碼 '0'（最新一期該 slot 有命中）
 * 冷 = slot.record CSV 首碼 '1'（差一期沒命中）
 * 其餘首碼（'2' 以上）的 slot 不進候選池。 */
const HOT_PICK_RATIO = 0.85

const DEFAULT_CONFIG: Readonly<RuleConfig> = Object.freeze({
  fetchLimit: 500,
  predictTarget: 20,
  sourceMaxInterval: 3,
  posCapHigh: 10,
  pos12Cap: 2,
  pos39Cap: 1,
  le40Cap: 12,
  gt40Cap: 12,
  oddCap: 12,
  evenCap: 12,
  tailCap: 5,
  consecutiveCap: 4
})

const RULE_STORAGE_KEY = 'iverson-prediction-rules-v1'
const config = reactive<RuleConfig>({ ...DEFAULT_CONFIG })
const settingsOpen = ref(false)

// snapshot 一律切 slot[0..SLOT_SNAPSHOT_DEPTH-1]，user 在此範圍內調整 sourceMaxInterval。
// snapshots 不依賴 config，只依賴 allDraws、重算成本低；config 改變只觸發 predictionRows 重算。
const SLOT_SNAPSHOT_DEPTH = 10

function resetConfig() {
  Object.assign(config, DEFAULT_CONFIG)
}

function loadConfigFromStorage() {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(RULE_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Partial<RuleConfig>
    for (const k of Object.keys(DEFAULT_CONFIG) as Array<keyof RuleConfig>) {
      const v = parsed[k]
      if (typeof v === 'number' && Number.isFinite(v)) {
        config[k] = v
      }
    }
  } catch {
    // 忽略 storage 故障、用預設
  }
}

function saveConfigToStorage() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(RULE_STORAGE_KEY, JSON.stringify(config))
  } catch {
    // 忽略 storage 故障
  }
}

// config 改變→存 localStorage（deep watch）。
// 注意：必須宣告在 const config 之後，否則 TDZ。
watch(config, saveConfigToStorage, { deep: true })

// fetchLimit 改變→ debounce 後重抓 allDraws。其他 config 欄位不需重抓，
// 只觸發 predictionRows 重算（讀 config.* 的 reactive tracking）。
let fetchLimitDebounce: ReturnType<typeof setTimeout> | null = null
watch(() => config.fetchLimit, (next, prev) => {
  if (next === prev) return
  if (!Number.isFinite(next) || next < FETCH_LIMIT_MIN || next > FETCH_LIMIT_MAX) return
  if (fetchLimitDebounce) clearTimeout(fetchLimitDebounce)
  fetchLimitDebounce = setTimeout(() => {
    load()
  }, FETCH_DEBOUNCE_MS)
})

interface SlotSnapshot {
  period: number
  record: string
  prizes: number[]
}

interface PredictionSnapshot {
  drawTerm: number
  drawDate: string
  positions: string
  /** T 的 periods CSV — 每顆 T 獎號被找到的 foundIdx（pre-shift slot 索引）。
   * 用來把 positions CSV 內的 Y 值按來源隔期分組、做 per-interval 排除。 */
  periods: string
  topSlots: SlotSnapshot[]
}

// 漸進式 hydration、每步快照 slot[0..SLOT_SNAPSHOT_DEPTH-1]。
const predictionSnapshots = computed<PredictionSnapshot[]>(() => {
  if (allDraws.value.length === 0) return []
  let s = createInitialState('bingo_bingo', POSITIONS_ANALYSIS_N)
  const snapshots: PredictionSnapshot[] = []
  for (const d of allDraws.value) {
    s = processDraw(s, {
      drawTerm: d.drawTerm,
      drawDate: d.drawDate,
      prizes: d.numbers
    })
    const hist = s.history[s.history.length - 1]!
    snapshots.push({
      drawTerm: d.drawTerm,
      drawDate: d.drawDate,
      positions: hist.positions ?? '',
      periods: hist.periods ?? '',
      topSlots: s.periods.slice(0, SLOT_SNAPSHOT_DEPTH).map(p => ({
        period: p.period,
        record: p.record,
        prizes: [...p.prizes]
      }))
    })
  }
  return snapshots
})

interface PredictionPick {
  n: number
  position: number
  intervalJ: number
  /** 候選來自熱池（record 首碼 '0'）= true、冷池（首碼 '1'）= false */
  hot: boolean
}

function wouldViolatePredictionCap(picks: PredictionPick[], cand: PredictionPick): boolean {
  const newNs = picks.map(p => p.n)
  newNs.push(cand.n)

  let le40 = 0
  let gt40 = 0
  let odd = 0
  let even = 0
  for (const x of newNs) {
    if (x <= 40) le40++
    else gt40++
    if (x % 2 === 1) odd++
    else even++
  }
  if (le40 > config.le40Cap) return true
  if (gt40 > config.gt40Cap) return true
  if (odd > config.oddCap) return true
  if (even > config.evenCap) return true

  const tailCount = new Map<number, number>()
  for (const x of newNs) {
    const t = x % 10
    const cur = (tailCount.get(t) ?? 0) + 1
    if (cur > config.tailCap) return true
    tailCount.set(t, cur)
  }

  const sorted = [...newNs].sort((a, b) => a - b)
  let cur = 1
  let max = 1
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === (sorted[i - 1] ?? 0) + 1) {
      cur++
      if (cur > max) max = cur
    } else if (sorted[i] !== sorted[i - 1]) {
      cur = 1
    }
  }
  if (max > config.consecutiveCap) return true

  // 新位置 cap 結構（2026-06-19 重做）：
  //   位置 1、2 各 ≤ pos12Cap
  //   位置 3-9 各 ≤ pos39Cap
  //   位置 ≥ 10 不在此檢查、走 per-interval Y 排除（在 predictFromSnapshot 預先過濾）
  let pos1 = 0
  let pos2 = 0
  const pos39Count = new Map<number, number>()
  for (const p of picks) {
    if (p.position === 1) pos1++
    else if (p.position === 2) pos2++
    else if (p.position >= 3 && p.position <= 9) {
      pos39Count.set(p.position, (pos39Count.get(p.position) ?? 0) + 1)
    }
  }
  if (cand.position === 1) {
    if (pos1 + 1 > config.pos12Cap) return true
  } else if (cand.position === 2) {
    if (pos2 + 1 > config.pos12Cap) return true
  } else if (cand.position >= 3 && cand.position <= 9) {
    const cur2 = (pos39Count.get(cand.position) ?? 0) + 1
    if (cur2 > config.pos39Cap) return true
  }
  return false
}

interface CapStats {
  le40: number
  gt40: number
  odd: number
  even: number
  tailMax: number
  tailMaxDigit: number
  maxRun: number
  pos1Count: number
  pos2Count: number
  /** 位置 3-9 之中、最大命中次數 */
  pos39Max: number
  /** 位置 3-9 之中、有最大命中次數的那一個位置值（3..9）；無 = -1 */
  pos39MaxValue: number
  hotCount: number
  coldCount: number
  /** 所有 cap 都沒超過 = true；應該永遠為 true（greedy 邏輯保證） */
  allWithinCap: boolean
}

function computeCapStats(picks: PredictionPick[]): CapStats {
  let le40 = 0
  let gt40 = 0
  let odd = 0
  let even = 0
  let pos1Count = 0
  let pos2Count = 0
  let hotCount = 0
  let coldCount = 0
  for (const p of picks) {
    if (p.n <= 40) le40++
    else gt40++
    if (p.n % 2 === 1) odd++
    else even++
    if (p.position === 1) pos1Count++
    else if (p.position === 2) pos2Count++
    if (p.hot) hotCount++
    else coldCount++
  }
  const tailCounts = new Map<number, number>()
  for (const p of picks) {
    const t = p.n % 10
    tailCounts.set(t, (tailCounts.get(t) ?? 0) + 1)
  }
  let tailMax = 0
  let tailMaxDigit = -1
  for (const [d, c] of tailCounts) {
    if (c > tailMax) {
      tailMax = c
      tailMaxDigit = d
    }
  }
  const sortedNs = picks.map(p => p.n).sort((a, b) => a - b)
  let cur = 1
  let maxRun = sortedNs.length > 0 ? 1 : 0
  for (let i = 1; i < sortedNs.length; i++) {
    if (sortedNs[i] === (sortedNs[i - 1] ?? 0) + 1) {
      cur++
      if (cur > maxRun) maxRun = cur
    } else if (sortedNs[i] !== sortedNs[i - 1]) {
      cur = 1
    }
  }
  // 位置 3-9 各自命中次數最大值
  const pos39Counts = new Map<number, number>()
  for (const p of picks) {
    if (p.position >= 3 && p.position <= 9) {
      pos39Counts.set(p.position, (pos39Counts.get(p.position) ?? 0) + 1)
    }
  }
  let pos39Max = 0
  let pos39MaxValue = -1
  for (const [v, c] of pos39Counts) {
    if (c > pos39Max) {
      pos39Max = c
      pos39MaxValue = v
    }
  }
  const allWithinCap = le40 <= config.le40Cap
    && gt40 <= config.gt40Cap
    && odd <= config.oddCap
    && even <= config.evenCap
    && tailMax <= config.tailCap
    && maxRun <= config.consecutiveCap
    && pos1Count <= config.pos12Cap
    && pos2Count <= config.pos12Cap
    && pos39Max <= config.pos39Cap
  return {
    le40,
    gt40,
    odd,
    even,
    tailMax,
    tailMaxDigit,
    maxRun,
    pos1Count,
    pos2Count,
    pos39Max,
    pos39MaxValue,
    hotCount,
    coldCount,
    allWithinCap
  }
}

interface ActualPositioned {
  n: number
  /** 1-indexed Y 來自下一期（T+1）positions CSV、表示該獎號在 pre-T+1 (= post-T) 隔期的位置；找不到則 null */
  y: number | null
}

interface ExcludedYPerInterval {
  interval: number
  ys: number[]
}

interface PredictionRow {
  predictForTerm: number
  predictForDateLabel: string
  sourceTerm: number
  sourceDateLabel: string
  picks: PredictionPick[]
  picksSorted: PredictionPick[]
  shortBy: number
  excludedByInterval: ExcludedYPerInterval[]
  capStats: CapStats
  /** 熱池目標顆數（= round(predictTarget * 0.85)） */
  hotTarget: number
  /** 冷池目標顆數（= predictTarget - hotTarget） */
  coldTarget: number
  actualNumbers: number[]
  actualPositions: ActualPositioned[]
  hitNumbers: number[]
  hitCount: number
  pending: boolean
}

function predictFromSnapshot(snap: PredictionSnapshot): {
  picks: PredictionPick[]
  shortBy: number
  excludedByInterval: ExcludedYPerInterval[]
  hotTarget: number
  coldTarget: number
} {
  // 1. 把 snapshot 切到 user 指定的 sourceMaxInterval 範圍；
  //    分熱（record 首碼 '0'）/ 冷（首碼 '1'）兩池；其餘首碼不入池。
  const inRange = snap.topSlots.slice(0, config.sourceMaxInterval + 1)
  const hotSlots: SlotSnapshot[] = []
  const coldSlots: SlotSnapshot[] = []
  for (const p of inRange) {
    const first = p.record.split(',')[0]
    if (first === '0') hotSlots.push(p)
    else if (first === '1') coldSlots.push(p)
  }

  // 2. 收集候選（hot flag 跟著 slot 走）
  function buildCands(slots: SlotSnapshot[], hot: boolean): PredictionPick[] {
    const out: PredictionPick[] = []
    for (const slot of slots) {
      const sorted = [...slot.prizes].sort((a, b) => a - b)
      sorted.forEach((n, idx) => {
        out.push({ n, position: idx + 1, intervalJ: slot.period, hot })
      })
    }
    return out
  }
  const hotCands = buildCands(hotSlots, true)
  const coldCands = buildCands(coldSlots, false)

  // 3. Per-interval 位置排除（與前一期 T 的 positions 比對、Y >= posCapHigh 去重）
  const excludedYByInterval = new Map<number, Set<number>>()
  const periodsParts = snap.periods.split(',')
  const positionsParts = snap.positions.split(',')
  for (let k = 0; k < periodsParts.length; k++) {
    const fStr = periodsParts[k]
    const pStr = positionsParts[k]
    if (!fStr || !pStr) continue
    const fIdx = Number.parseInt(fStr, 10)
    if (!Number.isFinite(fIdx)) continue
    const dash = pStr.indexOf('-')
    if (dash < 0) continue
    const y = Number.parseInt(pStr.slice(dash + 1), 10)
    if (!Number.isFinite(y) || y < config.posCapHigh) continue
    let set = excludedYByInterval.get(fIdx)
    if (!set) {
      set = new Set<number>()
      excludedYByInterval.set(fIdx, set)
    }
    set.add(y)
  }
  function applyExclusion(cands: PredictionPick[]): PredictionPick[] {
    return cands.filter((c) => {
      const set = excludedYByInterval.get(c.intervalJ)
      if (!set) return true
      return !set.has(c.position)
    })
  }
  let hotFiltered = applyExclusion(hotCands)
  let coldFiltered = applyExclusion(coldCands)

  // 4. 去重（n 全域、熱優先佔位、冷再補；不重複出現）
  const seenN = new Set<number>()
  hotFiltered = hotFiltered.filter((c) => {
    if (seenN.has(c.n)) return false
    seenN.add(c.n)
    return true
  })
  coldFiltered = coldFiltered.filter((c) => {
    if (seenN.has(c.n)) return false
    seenN.add(c.n)
    return true
  })

  // 5. 排序：小隔期優先 > 低位置優先（兩池各自）
  const sortFn = (a: PredictionPick, b: PredictionPick) => {
    if (a.intervalJ !== b.intervalJ) return a.intervalJ - b.intervalJ
    return a.position - b.position
  }
  hotFiltered.sort(sortFn)
  coldFiltered.sort(sortFn)

  // 6. 熱/冷配額：熱 85% / 冷 15%（嚴格、不互補）
  const hotTarget = Math.round(config.predictTarget * HOT_PICK_RATIO)
  const coldTarget = config.predictTarget - hotTarget

  const picks: PredictionPick[] = []

  function greedyPick(pool: PredictionPick[], target: number): number {
    let picked = 0
    const remaining = [...pool]
    while (picked < target) {
      let chosenIdx = -1
      for (let i = 0; i < remaining.length; i++) {
        if (!wouldViolatePredictionCap(picks, remaining[i]!)) {
          chosenIdx = i
          break
        }
      }
      if (chosenIdx === -1) break
      picks.push(remaining[chosenIdx]!)
      remaining.splice(chosenIdx, 1)
      picked++
    }
    return picked
  }

  greedyPick(hotFiltered, hotTarget)
  greedyPick(coldFiltered, coldTarget)

  // UI 軌跡輸出：只列 0..sourceMaxInterval 範圍內、有 Y >= 10 的 interval
  const excludedByInterval: ExcludedYPerInterval[] = []
  for (const [iv, set] of excludedYByInterval) {
    if (iv > config.sourceMaxInterval) continue
    excludedByInterval.push({ interval: iv, ys: [...set].sort((a, b) => a - b) })
  }
  excludedByInterval.sort((a, b) => a.interval - b.interval)

  return {
    picks,
    shortBy: config.predictTarget - picks.length,
    excludedByInterval,
    hotTarget,
    coldTarget
  }
}

const predictionRows = computed<PredictionRow[]>(() => {
  const snaps = predictionSnapshots.value
  if (snaps.length === 0) return []
  const rows: PredictionRow[] = []
  for (let i = 0; i < snaps.length; i++) {
    const snap = snaps[i]!
    const { picks, shortBy, excludedByInterval, hotTarget, coldTarget } = predictFromSnapshot(snap)
    // 比對目標 = 下一期 = drawsAsc[i+1]（若不存在則尚未開出）
    const next = i + 1 < allDraws.value.length ? allDraws.value[i + 1]! : null
    const nextSnap = i + 1 < snaps.length ? snaps[i + 1]! : null
    const actualNumbers = next?.numbers ?? []
    const hitSet = new Set(actualNumbers)
    const picksSorted = [...picks].sort((a, b) => a.n - b.n)
    const hitNumbers: number[] = picksSorted
      .map(p => p.n)
      .filter(n => hitSet.has(n))
    const capStats = computeCapStats(picks)

    // 實際開出（T+1）每顆獎號的位置 Y：來自 T+1 snapshot 的 positions CSV。
    // processDraw 內 positions CSV 第 k 個項目對應 T+1 sorted-unique prizes 的第 k 顆，
    // 跟 next.numbers（已 sorted-unique）一一對齊。找不到（''）則 Y = null。
    const actualPositions: ActualPositioned[] = []
    if (next && nextSnap) {
      const csvParts = nextSnap.positions.split(',')
      for (let k = 0; k < next.numbers.length; k++) {
        const n = next.numbers[k]!
        const s = csvParts[k]
        let y: number | null = null
        if (s) {
          const dash = s.indexOf('-')
          if (dash >= 0) {
            const parsed = Number.parseInt(s.slice(dash + 1), 10)
            if (Number.isFinite(parsed)) y = parsed
          }
        }
        actualPositions.push({ n, y })
      }
    } else {
      for (const n of actualNumbers) actualPositions.push({ n, y: null })
    }

    rows.push({
      predictForTerm: next?.drawTerm ?? snap.drawTerm + 1,
      predictForDateLabel: next ? dateLabel(next.drawDate, next.drawTerm) : '',
      sourceTerm: snap.drawTerm,
      sourceDateLabel: dateLabel(snap.drawDate, snap.drawTerm),
      picks,
      picksSorted,
      shortBy,
      excludedByInterval,
      capStats,
      hotTarget,
      coldTarget,
      actualNumbers,
      actualPositions,
      hitNumbers,
      hitCount: hitNumbers.length,
      pending: next === null
    })
  }
  rows.reverse() // 最新期在上
  return rows
})

const predictionPendingRow = computed<PredictionRow | null>(() => {
  return predictionRows.value.find(r => r.pending) ?? null
})

const predictionHistoricalRows = computed<PredictionRow[]>(() => {
  return predictionRows.value.filter(r => !r.pending)
})

interface AggregateStats {
  periods: number
  totalPicks: number
  totalHits: number
  /** 整體命中率 = totalHits / totalPicks（避免 picks=0 期影響、用加權平均） */
  integratedRatePct: number
  /** 每期平均命中數 = totalHits / periods（含 picks=0 的期） */
  avgHits: number
  /** 不足 N 顆的期數 */
  shortByCount: number
  /** picks=0（候選池為空）的期數 */
  zeroPickCount: number
}

const predictionAggregateStats = computed<AggregateStats>(() => {
  const rows = predictionHistoricalRows.value
  let totalPicks = 0
  let totalHits = 0
  let shortByCount = 0
  let zeroPickCount = 0
  for (const r of rows) {
    totalPicks += r.picks.length
    totalHits += r.hitCount
    if (r.shortBy > 0) shortByCount++
    if (r.picks.length === 0) zeroPickCount++
  }
  return {
    periods: rows.length,
    totalPicks,
    totalHits,
    integratedRatePct: totalPicks > 0 ? (totalHits / totalPicks) * 100 : 0,
    avgHits: rows.length > 0 ? totalHits / rows.length : 0,
    shortByCount,
    zeroPickCount
  }
})

function predictionRateText(row: PredictionRow): string {
  if (row.picks.length === 0) return '—'
  const pct = (row.hitCount / row.picks.length) * 100
  return `${pct.toFixed(1)}%`
}

function isPredictionHit(row: PredictionRow, n: number): boolean {
  return row.hitNumbers.includes(n)
}

function capColorClass(value: number, cap: number): string {
  if (value >= cap) return 'text-orange-500'
  return 'text-muted'
}

// ---- Tab state ----------------------------------------------------------

type TabValue = 'interval' | 'positions' | 'prediction'
const activeTab = ref<TabValue>('interval')
const tabItems = computed(() => [
  { label: '隔期剩餘號碼', value: 'interval' as const, icon: 'i-lucide-layers' },
  { label: '獎號關聯位置', value: 'positions' as const, icon: 'i-lucide-link' },
  { label: `符合規則的 ${config.predictTarget} 顆`, value: 'prediction' as const, icon: 'i-lucide-filter' }
])
</script>

<template>
  <UContainer class="py-10 space-y-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="space-y-2">
        <h1 class="text-3xl font-semibold tracking-tight">
          艾佛森
        </h1>
        <p class="text-sm text-muted">
          賓果賓果隔期狀態（隔期量 {{ INTERVAL_ANALYSIS_N }} 期、深度過去 1 小時）。每顆號碼右下角小黑字＝該號於該隔期中的位置。
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          :loading="loading"
          @click="load"
        >
          重新整理
        </UButton>
      </div>
    </header>

    <UTabs
      v-model="activeTab"
      :items="tabItems"
      :unmount-on-hide="false"
      variant="pill"
      color="neutral"
    />

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="`載入失敗：${error}`"
    />

    <div
      v-if="loading && allDraws.length === 0"
      class="space-y-3"
    >
      <USkeleton
        v-for="i in 5"
        :key="i"
        class="h-12 w-full rounded-lg"
      />
    </div>

    <!-- Tab 1：隔期剩餘號碼 -->
    <template v-else-if="activeTab === 'interval'">
      <UCard
        v-if="intervalRows.length > 0"
        :ui="{ body: 'p-4' }"
      >
        <div class="space-y-3">
          <div
            v-if="latestDrawInfo"
            class="text-xs text-muted"
          >
            最新一期 第 <span class="font-mono">{{ latestDrawInfo.term }}</span> 期
            <span
              v-if="latestDrawInfo.label"
              class="ml-1 font-mono"
            >{{ latestDrawInfo.label }}</span>
          </div>
          <div
            v-for="row in intervalRows"
            :key="`iv-row-${row.interval}`"
            class="space-y-1"
          >
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-muted">
              <span>隔期 {{ row.interval }}（{{ row.entries.length }} 顆）</span>
              <span
                v-if="row.issue"
                class="font-mono"
              >第 {{ row.issue }} 期</span>
              <span
                v-if="row.dateLabel"
                class="font-mono"
              >{{ row.dateLabel }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              <UBadge
                v-for="e in row.entries"
                :key="`iv-${row.interval}-${e.n}`"
                color="warning"
                variant="solid"
                size="md"
                class="relative min-w-8 justify-center font-mono"
              >
                {{ pad(e.n) }}
                <span class="absolute bottom-0 right-0.5 text-[9px] leading-none font-normal text-black">{{ e.originPos }}</span>
              </UBadge>
              <span
                v-if="row.entries.length === 0"
                class="text-xs text-muted"
              >—</span>
            </div>
          </div>
        </div>
      </UCard>
      <div
        v-else
        class="rounded-md border border-dashed border-default p-6 text-center text-xs text-muted"
      >
        尚無資料
      </div>
    </template>

    <!-- Tab 2：獎號關聯位置 -->
    <template v-else-if="activeTab === 'positions'">
      <div
        v-if="positionRows.length === 0"
        class="rounded-md border border-dashed border-default p-6 text-center text-xs text-muted"
      >
        尚無資料
      </div>
      <template v-else>
        <p class="text-xs text-muted">
          分析參數：N={{ POSITIONS_ANALYSIS_N }}、深度 {{ config.fetchLimit }} 期（可在 Tab3 規則參數調整）。共 {{ positionRows.length }} 期，最新期在上。
        </p>
        <UCard
          v-for="row in positionRows"
          :key="`pos-${row.issue}`"
          :ui="{ body: 'p-4' }"
        >
          <div class="space-y-2">
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span class="font-mono text-sm font-semibold">第 {{ row.issue }} 期</span>
              <span
                v-if="row.dateLabel"
                class="text-[11px] text-muted font-mono"
              >{{ row.dateLabel }}</span>
            </div>
            <div class="text-xs">
              <span class="text-muted">對應的位置（{{ row.positionsCsv.split(',').length }} 顆）：</span>
              <span class="font-mono break-all">{{ row.positionsCsv }}</span>
            </div>
            <div class="text-xs">
              <span class="text-muted">Y（{{ row.yList.length }} 顆）：</span>
              <span class="font-mono break-all">{{ row.yList.join(', ') }}</span>
            </div>
            <div class="text-xs">
              <span class="text-muted">統計：</span>
              <span
                v-for="(stat, i) in row.yStats"
                :key="`stat-${row.issue}-${stat.y}`"
                class="font-mono"
              >{{ i > 0 ? ' · ' : '' }}{{ stat.y }} 有 {{ stat.count }} 個</span>
              <span
                v-if="row.yStats.length === 0"
                class="text-muted font-mono"
              >—</span>
            </div>
          </div>
        </UCard>
      </template>
    </template>

    <!-- Tab 3：符合規則的 20 顆（依規則篩選、非預測） -->
    <template v-else-if="activeTab === 'prediction'">
      <div
        v-if="predictionRows.length === 0"
        class="rounded-md border border-dashed border-default p-6 text-center text-xs text-muted"
      >
        尚無資料
      </div>
      <template v-else>
        <div class="flex items-start flex-wrap gap-2 text-xs text-muted">
          <span>依規則從每期當下「隔期 0~{{ config.sourceMaxInterval }}」（熱/冷池、位置 cap、per-interval Y 排除）篩選 {{ config.predictTarget }} 顆、與下一期實際開出比對。共 {{ predictionRows.length }} 期，待開獎期釘頂、歷史最新在上。</span>
          <UPopover :content="{ side: 'bottom', align: 'start' }">
            <UButton
              color="neutral"
              variant="subtle"
              size="xs"
              icon="i-lucide-info"
              label="本頁規則"
            />
            <template #content>
              <div class="max-w-md p-4 space-y-3 text-xs">
                <div>
                  <div class="text-sm font-semibold mb-1">單一隔期規則（候選池）</div>
                  <ol class="list-decimal pl-5 space-y-1">
                    <li>只從隔期 <span class="font-mono">0~{{ config.sourceMaxInterval }}</span> 取候選</li>
                    <li>
                      <strong>熱/冷分池</strong>：<span class="font-mono">record</span> CSV 首碼 <span class="font-mono">'0'</span> = 熱、<span class="font-mono">'1'</span> = 冷；
                      熱佔 <strong>85%</strong>、冷佔 <strong>15%</strong>（嚴格、不互補；其餘首碼不入池）
                    </li>
                    <li>
                      位置排除（<strong>per-interval</strong>）：把該期 T 的 <span class="font-mono">periods</span> + <span class="font-mono">positions</span> CSV zip、按 foundIdx 分組；
                      隔期 J 的 Y 值集合僅取該組內 <span class="font-mono">Y ≥ {{ config.posCapHigh }}</span> 去重；
                      候選若來自隔期 J、其 1-indexed 位置 ∈ 隔期 J 的排除集則排除（其他隔期的 Y 不波及）
                    </li>
                  </ol>
                </div>
                <div>
                  <div class="text-sm font-semibold mb-1">全域 cap（一旦會超就跳過該候選）</div>
                  <ul class="list-disc pl-5 space-y-1 font-mono">
                    <li>位置 1 ≤ {{ config.pos12Cap }}、位置 2 ≤ {{ config.pos12Cap }}</li>
                    <li>位置 3~9 各 ≤ {{ config.pos39Cap }}（每個位置獨立 cap）</li>
                    <li>≤40 ≤ {{ config.le40Cap }}、&gt;40 ≤ {{ config.gt40Cap }}</li>
                    <li>奇 ≤ {{ config.oddCap }}、偶 ≤ {{ config.evenCap }}</li>
                    <li>任一相同尾數 ≤ {{ config.tailCap }}</li>
                    <li>連續號碼最大連跑 ≤ {{ config.consecutiveCap }}</li>
                  </ul>
                </div>
                <div>
                  <div class="text-sm font-semibold mb-1">候選排序優先序（暫未變更）</div>
                  <p>3 (避免 cap 抵達) &gt; 1 (小隔期優先) &gt; 2 (低位置優先)</p>
                  <p class="mt-1 text-muted">
                    實作：兩池各自 sort by (隔期 asc, 位置 asc)、先熱後冷 greedy、跳過會 violate cap 的候選。
                  </p>
                </div>
                <div>
                  <div class="text-sm font-semibold mb-1">不足 {{ config.predictTarget }}</div>
                  <p>顯示實際掛上的數、標「不足 {{ config.predictTarget }}」，<strong>不破 cap、不補位</strong>。</p>
                </div>
                <div class="border-t border-default pt-2 text-[11px] text-muted">
                  每張卡片底下的 caps 是該期 picks 的實際 cap 使用量；數值 = cap 上限會染橘提醒（greedy 已保證不超過）。
                </div>
              </div>
            </template>
          </UPopover>
        </div>

        <!-- 規則參數調整面板（即時影響、localStorage 持久化） -->
        <UCard :ui="{ body: 'p-3 sm:p-4' }">
          <div class="space-y-3">
            <div class="flex items-center justify-between gap-2">
              <button
                type="button"
                class="flex items-center gap-1 text-sm font-semibold"
                @click="settingsOpen = !settingsOpen"
              >
                <UIcon
                  :name="settingsOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                  class="size-4"
                />
                規則參數調整
              </button>
              <UButton
                v-if="settingsOpen"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-rotate-ccw"
                @click="resetConfig"
              >
                還原預設
              </UButton>
            </div>
            <div
              v-if="settingsOpen"
              class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3 gap-y-2 text-xs"
            >
              <label class="block space-y-1">
                <span class="text-muted block">比對期數（深度）</span>
                <UInput
                  v-model.number="config.fetchLimit"
                  type="number"
                  :min="FETCH_LIMIT_MIN"
                  :max="FETCH_LIMIT_MAX"
                  step="50"
                  size="sm"
                />
              </label>
              <label class="block space-y-1">
                <span class="text-muted block">目標顆數</span>
                <UInput
                  v-model.number="config.predictTarget"
                  type="number"
                  min="1"
                  max="80"
                  size="sm"
                />
              </label>
              <label class="block space-y-1">
                <span class="text-muted block">隔期上限（0~）</span>
                <UInput
                  v-model.number="config.sourceMaxInterval"
                  type="number"
                  min="0"
                  :max="SLOT_SNAPSHOT_DEPTH - 1"
                  size="sm"
                />
              </label>
              <label class="block space-y-1">
                <span class="text-muted block">排除位置門檻（Y ≥）</span>
                <UInput
                  v-model.number="config.posCapHigh"
                  type="number"
                  min="1"
                  max="80"
                  size="sm"
                />
              </label>
              <label class="block space-y-1">
                <span class="text-muted block">位 1、2 各 ≤</span>
                <UInput
                  v-model.number="config.pos12Cap"
                  type="number"
                  min="0"
                  max="20"
                  size="sm"
                />
              </label>
              <label class="block space-y-1">
                <span class="text-muted block">位 3~9 各 ≤</span>
                <UInput
                  v-model.number="config.pos39Cap"
                  type="number"
                  min="0"
                  max="20"
                  size="sm"
                />
              </label>
              <label class="block space-y-1">
                <span class="text-muted block">≤40 ≤</span>
                <UInput
                  v-model.number="config.le40Cap"
                  type="number"
                  min="0"
                  max="20"
                  size="sm"
                />
              </label>
              <label class="block space-y-1">
                <span class="text-muted block">&gt;40 ≤</span>
                <UInput
                  v-model.number="config.gt40Cap"
                  type="number"
                  min="0"
                  max="20"
                  size="sm"
                />
              </label>
              <label class="block space-y-1">
                <span class="text-muted block">奇 ≤</span>
                <UInput
                  v-model.number="config.oddCap"
                  type="number"
                  min="0"
                  max="20"
                  size="sm"
                />
              </label>
              <label class="block space-y-1">
                <span class="text-muted block">偶 ≤</span>
                <UInput
                  v-model.number="config.evenCap"
                  type="number"
                  min="0"
                  max="20"
                  size="sm"
                />
              </label>
              <label class="block space-y-1">
                <span class="text-muted block">任一尾數 ≤</span>
                <UInput
                  v-model.number="config.tailCap"
                  type="number"
                  min="0"
                  max="20"
                  size="sm"
                />
              </label>
              <label class="block space-y-1">
                <span class="text-muted block">連跑 ≤</span>
                <UInput
                  v-model.number="config.consecutiveCap"
                  type="number"
                  min="0"
                  max="20"
                  size="sm"
                />
              </label>
            </div>
          </div>
        </UCard>

        <!-- 過去 X 期聚合命中率（即時隨任何參數變化重算） -->
        <UCard
          v-if="predictionAggregateStats.periods > 0"
          :ui="{ body: 'p-3 sm:p-4' }"
        >
          <div class="space-y-2">
            <div class="text-sm font-semibold">
              過去 {{ predictionAggregateStats.periods }} 期整體命中
              <span
                v-if="loading"
                class="ml-2 text-[10px] text-muted font-normal"
              >（重新計算中…）</span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-xs font-mono tabular-nums">
              <div>
                <span class="text-muted">整體命中率：</span>
                <span
                  :class="predictionAggregateStats.integratedRatePct > 0 ? 'text-emerald-500 font-semibold' : 'text-muted'"
                >{{ predictionAggregateStats.integratedRatePct.toFixed(2) }}%</span>
              </div>
              <div>
                <span class="text-muted">命中 / 推：</span>
                <span>{{ predictionAggregateStats.totalHits }} / {{ predictionAggregateStats.totalPicks }}</span>
              </div>
              <div>
                <span class="text-muted">平均命中：</span>
                <span>{{ predictionAggregateStats.avgHits.toFixed(2) }}</span>
                <span class="text-muted"> / {{ config.predictTarget }}</span>
              </div>
              <div>
                <span class="text-muted">不足 {{ config.predictTarget }}：</span>
                <span
                  :class="predictionAggregateStats.shortByCount > 0 ? 'text-orange-500' : ''"
                >{{ predictionAggregateStats.shortByCount }}</span>
                <span class="text-muted"> 期</span>
                <span
                  v-if="predictionAggregateStats.zeroPickCount > 0"
                  class="text-muted"
                >（含 {{ predictionAggregateStats.zeroPickCount }} 期 0 推）</span>
              </div>
            </div>
          </div>
        </UCard>

        <!-- 待開獎期釘頂（sticky top 用 header 高度避開頂列 UHeader） -->
        <UCard
          v-if="predictionPendingRow"
          :ui="{ body: 'p-3 sm:p-4' }"
          class="sticky z-10 bg-default/95 backdrop-blur supports-[backdrop-filter]:bg-default/70 ring-1 ring-primary/50"
          :style="pendingStickyStyle"
        >
          <div class="space-y-3 text-xs">
            <div class="flex items-baseline gap-2 flex-wrap">
              <UBadge
                color="primary"
                variant="subtle"
                size="sm"
              >
                待開獎
              </UBadge>
              <span class="font-mono text-sm font-semibold">第 {{ predictionPendingRow.predictForTerm }} 期</span>
              <span class="text-[10px] text-muted">尚未開出</span>
            </div>
            <!-- 規則執行軌跡（debug 用，幫使用者驗證規則確實有跑） -->
            <div class="text-[10px] text-muted font-mono space-y-0.5">
              <div>
                排除位置（Y≥{{ config.posCapHigh }}）：
                <span v-if="predictionPendingRow.excludedByInterval.length === 0">無</span>
                <template v-else>
                  <span
                    v-for="(seg, i) in predictionPendingRow.excludedByInterval"
                    :key="`exclpend-${seg.interval}`"
                  >{{ i > 0 ? ' · ' : '' }}隔期 {{ seg.interval }}: {{ seg.ys.join(',') }}</span>
                </template>
              </div>
              <div class="flex flex-wrap gap-x-2 gap-y-0.5">
                <span :class="capColorClass(predictionPendingRow.capStats.le40, config.le40Cap)">≤40 {{ predictionPendingRow.capStats.le40 }}/{{ config.le40Cap }}</span>
                <span>·</span>
                <span :class="capColorClass(predictionPendingRow.capStats.gt40, config.gt40Cap)">&gt;40 {{ predictionPendingRow.capStats.gt40 }}/{{ config.gt40Cap }}</span>
                <span>·</span>
                <span :class="capColorClass(predictionPendingRow.capStats.odd, config.oddCap)">奇 {{ predictionPendingRow.capStats.odd }}/{{ config.oddCap }}</span>
                <span>·</span>
                <span :class="capColorClass(predictionPendingRow.capStats.even, config.evenCap)">偶 {{ predictionPendingRow.capStats.even }}/{{ config.evenCap }}</span>
                <span>·</span>
                <span :class="capColorClass(predictionPendingRow.capStats.tailMax, config.tailCap)">尾 max {{ predictionPendingRow.capStats.tailMax }}/{{ config.tailCap }}<span v-if="predictionPendingRow.capStats.tailMaxDigit >= 0"> (尾{{ predictionPendingRow.capStats.tailMaxDigit }})</span></span>
                <span>·</span>
                <span :class="capColorClass(predictionPendingRow.capStats.maxRun, config.consecutiveCap)">連跑 {{ predictionPendingRow.capStats.maxRun }}/{{ config.consecutiveCap }}</span>
                <span>·</span>
                <span :class="capColorClass(predictionPendingRow.capStats.pos1Count, config.pos12Cap)">位1 {{ predictionPendingRow.capStats.pos1Count }}/{{ config.pos12Cap }}</span>
                <span>·</span>
                <span :class="capColorClass(predictionPendingRow.capStats.pos2Count, config.pos12Cap)">位2 {{ predictionPendingRow.capStats.pos2Count }}/{{ config.pos12Cap }}</span>
                <span>·</span>
                <span :class="capColorClass(predictionPendingRow.capStats.pos39Max, config.pos39Cap)">位3-9 max {{ predictionPendingRow.capStats.pos39Max }}/{{ config.pos39Cap }}<span v-if="predictionPendingRow.capStats.pos39MaxValue >= 0"> (位{{ predictionPendingRow.capStats.pos39MaxValue }})</span></span>
                <span>·</span>
                <span>熱 {{ predictionPendingRow.capStats.hotCount }}/{{ predictionPendingRow.hotTarget }}</span>
                <span>·</span>
                <span>冷 {{ predictionPendingRow.capStats.coldCount }}/{{ predictionPendingRow.coldTarget }}</span>
                <span
                  v-if="predictionPendingRow.shortBy > 0"
                  class="text-orange-500"
                >· 不足 {{ config.predictTarget }}（差 {{ predictionPendingRow.shortBy }} 顆）</span>
              </div>
            </div>

            <!-- 推（升冪、命中染綠，待開獎期應全部 neutral） -->
            <div class="space-y-1">
              <div class="text-[10px] text-muted">
                推（{{ predictionPendingRow.picks.length }} 顆）
              </div>
              <div
                v-if="predictionPendingRow.picksSorted.length === 0"
                class="text-[10px] text-muted"
              >
                —
              </div>
              <div
                v-else
                class="flex flex-wrap items-center gap-1"
              >
                <UBadge
                  v-for="p in predictionPendingRow.picksSorted"
                  :key="`pred-pending-${p.n}`"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  class="relative min-w-7 justify-center font-mono"
                >
                  {{ pad(p.n) }}
                  <span class="absolute bottom-0 right-0.5 text-[8px] leading-none font-normal text-black">{{ p.position }}</span>
                </UBadge>
              </div>
            </div>
          </div>
        </UCard>

        <!-- 歷史期：最新在上、可驗證命中 -->
        <UCard
          v-for="row in predictionHistoricalRows"
          :key="`pred-${row.sourceTerm}`"
          :ui="{ body: 'p-3 sm:p-4' }"
        >
          <div class="space-y-3 text-xs">
            <!-- 目標期 + 命中機率 -->
            <div class="space-y-1">
              <div class="flex items-baseline gap-2 flex-wrap">
                <span class="font-mono text-sm font-semibold">第 {{ row.predictForTerm }} 期</span>
                <span
                  v-if="row.predictForDateLabel"
                  class="text-[10px] text-muted font-mono"
                >{{ row.predictForDateLabel }}</span>
              </div>
              <div
                class="font-mono tabular-nums text-[11px]"
                :class="row.hitCount > 0 ? 'text-emerald-500' : 'text-muted'"
              >
                命中機率 {{ row.hitCount }}/{{ row.picks.length }}
                <span class="ml-1">{{ predictionRateText(row) }}</span>
                <span
                  v-if="row.shortBy > 0"
                  class="ml-2 text-orange-500"
                >不足 {{ config.predictTarget }}（差 {{ row.shortBy }} 顆）</span>
              </div>
            </div>

            <!-- 規則執行軌跡 -->
            <div class="text-[10px] text-muted font-mono space-y-0.5">
              <div>
                排除位置（Y≥{{ config.posCapHigh }}）：
                <span v-if="row.excludedByInterval.length === 0">無</span>
                <template v-else>
                  <span
                    v-for="(seg, i) in row.excludedByInterval"
                    :key="`excl-${row.sourceTerm}-${seg.interval}`"
                  >{{ i > 0 ? ' · ' : '' }}隔期 {{ seg.interval }}: {{ seg.ys.join(',') }}</span>
                </template>
              </div>
              <div class="flex flex-wrap gap-x-2 gap-y-0.5">
                <span :class="capColorClass(row.capStats.le40, config.le40Cap)">≤40 {{ row.capStats.le40 }}/{{ config.le40Cap }}</span>
                <span>·</span>
                <span :class="capColorClass(row.capStats.gt40, config.gt40Cap)">&gt;40 {{ row.capStats.gt40 }}/{{ config.gt40Cap }}</span>
                <span>·</span>
                <span :class="capColorClass(row.capStats.odd, config.oddCap)">奇 {{ row.capStats.odd }}/{{ config.oddCap }}</span>
                <span>·</span>
                <span :class="capColorClass(row.capStats.even, config.evenCap)">偶 {{ row.capStats.even }}/{{ config.evenCap }}</span>
                <span>·</span>
                <span :class="capColorClass(row.capStats.tailMax, config.tailCap)">尾 max {{ row.capStats.tailMax }}/{{ config.tailCap }}</span>
                <span>·</span>
                <span :class="capColorClass(row.capStats.maxRun, config.consecutiveCap)">連跑 {{ row.capStats.maxRun }}/{{ config.consecutiveCap }}</span>
                <span>·</span>
                <span :class="capColorClass(row.capStats.pos1Count, config.pos12Cap)">位1 {{ row.capStats.pos1Count }}/{{ config.pos12Cap }}</span>
                <span>·</span>
                <span :class="capColorClass(row.capStats.pos2Count, config.pos12Cap)">位2 {{ row.capStats.pos2Count }}/{{ config.pos12Cap }}</span>
                <span>·</span>
                <span :class="capColorClass(row.capStats.pos39Max, config.pos39Cap)">位3-9 max {{ row.capStats.pos39Max }}/{{ config.pos39Cap }}<span v-if="row.capStats.pos39MaxValue >= 0"> (位{{ row.capStats.pos39MaxValue }})</span></span>
                <span>·</span>
                <span>熱 {{ row.capStats.hotCount }}/{{ row.hotTarget }}</span>
                <span>·</span>
                <span>冷 {{ row.capStats.coldCount }}/{{ row.coldTarget }}</span>
              </div>
            </div>

            <!-- 實際開出（右下小黑字 = 該獎號於 T+1 positions CSV 的 Y） -->
            <div class="space-y-1">
              <div class="text-[10px] text-muted">
                實際開出（{{ row.actualPositions.length }} 顆）
              </div>
              <div
                v-if="row.actualPositions.length === 0"
                class="text-[10px] text-muted"
              >
                —
              </div>
              <div
                v-else
                class="flex flex-wrap items-center gap-1"
              >
                <UBadge
                  v-for="ap in row.actualPositions"
                  :key="`pred-a-${row.sourceTerm}-${ap.n}`"
                  color="warning"
                  variant="solid"
                  size="sm"
                  class="relative min-w-7 justify-center font-mono"
                >
                  {{ pad(ap.n) }}
                  <span
                    v-if="ap.y != null"
                    class="absolute bottom-0 right-0.5 text-[8px] leading-none font-normal text-black"
                  >{{ ap.y }}</span>
                </UBadge>
              </div>
            </div>

            <!-- 推（升冪、命中染綠） -->
            <div class="space-y-1">
              <div class="text-[10px] text-muted">
                推（{{ row.picks.length }} 顆）
              </div>
              <div
                v-if="row.picksSorted.length === 0"
                class="text-[10px] text-muted"
              >
                —
              </div>
              <div
                v-else
                class="flex flex-wrap items-center gap-1"
              >
                <UBadge
                  v-for="p in row.picksSorted"
                  :key="`pred-p-${row.sourceTerm}-${p.n}`"
                  :color="isPredictionHit(row, p.n) ? 'success' : 'neutral'"
                  :variant="isPredictionHit(row, p.n) ? 'solid' : 'subtle'"
                  size="sm"
                  class="relative min-w-7 justify-center font-mono"
                >
                  {{ pad(p.n) }}
                  <span class="absolute bottom-0 right-0.5 text-[8px] leading-none font-normal text-black">{{ p.position }}</span>
                </UBadge>
              </div>
            </div>
          </div>
        </UCard>
      </template>
    </template>
  </UContainer>
</template>
