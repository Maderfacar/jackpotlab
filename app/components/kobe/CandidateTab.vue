<script setup lang="ts">
/**
 * /kobe Tab 0 「候選」
 *
 * 結構：
 *   1. 控制台
 *      - 第 1 行：規則開關（扣位置 / 扣紅框 / 選偏離 / 目標顆數截斷 / 記錄最新數據 / 位置數量 / 全域上限）
 *      - 第 2 行：隔期顯示 0-9 各自開關
 *      - 第 3 行：規則參數（選偏離上下限、記錄最新首碼上限、位置 cap、全域 cap）
 *      - 第 4 行：圖例
 *   2. sticky 候選 section（避開頂部 UHeader）
 *      - 下一期候選（待開獎）：用 finalState、白底
 *   3. 歷史候選回顧列表（不 sticky）：每期一張卡、4 色標示
 *
 * 候選邏輯（隔期 0..9）：
 *   raw = pre-T 該隔期 prizesBefore（sorted asc）
 *   positionYs = 從歷史往前掃、最近一個 slot[j].hits > 0 的 hitPositions
 *   每隔期內過濾：
 *     1) 記錄最新數據 ≤ n（toggle）：slot.recordValueBefore > n → 整支隔期排除
 *     2) 扣位置：raw 中 1-indexed 位置 ∈ positionYs 的號碼移除
 *     3) 扣紅框（僅 j=0）：上兩期共同號（連莊）移除
 *     4) 選偏離（範圍）：保留 deviation ∈ [lower%, upper%]，超出範圍移除
 *   全域選號（greedy）：
 *     - 各隔期過濾後 pool，按 deviation ASC 全域排序
 *     - 逐顆嘗試加入：必須通過「目標顆數截斷」(per-J targetK) 與「位置數量」「全域上限」三類 cap
 *     - 通過 → 加入主推；不通過 → 標 truncated（仍顯示）
 *
 * 4 色狀態：
 *   命中（主推 + 開出）→ 綠底 solid
 *   候選沒中（主推 + 沒開）→ 白底 outline
 *   漏（非主推 + 開出 = 規則殺錯）→ 紅底 solid
 *   過濾正確（非主推 + 沒開）→ 灰底劃線 dimmed
 *
 * 目標顆數截斷（C 方案、使用者拍板）：
 *   T(j, raw) 直接讀 buildIntervalRemainingTable 的 mean、按 bias 取整：
 *     - ceil   = 重涵蓋率（預設、減少漏紅、推薦給多抓 hit 的場景）
 *     - round  = 標準
 *     - floor  = 重精準率
 *   樣本 < SAMPLE_TRUST_THRESHOLD 的 cell → 退回該隔期整體均值
 *   兩者皆無 → T = 0（不推）
 */
import type {
  PerDrawSnapshot,
  KobeDraw,
  NumberHistoryRow,
  IntervalRemainingCell
} from '~/utils/kobe-stats'
import type { AnalysisState } from '~/utils/analysis'
import { buildNumberHistory, buildIntervalRemainingTable } from '~/utils/kobe-stats'
import { bingoTimeFromMap, buildBingoMinTermByDate } from '~/utils/bingo-time'

interface Props {
  snapshots: PerDrawSnapshot[]
  finalState: AnalysisState | null
  preLatestState: AnalysisState | null
  drawsAsc: KobeDraw[]
  intervalCount: number
  /** sticky 卡片 top offset = UHeader 高度（避免被蓋住） */
  headerHeight: number
}
const props = defineProps<Props>()

const TARGET_INTERVALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const
const DEFAULT_RECENT_N = 50
const STORAGE_KEY = 'kobe-candidate-config-v1'

const recentN = ref<number>(DEFAULT_RECENT_N)

// sticky「候選 · 待開獎」卡的收合狀態
const stickyCollapsed = ref<boolean>(false)

// 規則開關
interface RuleSwitches {
  position: boolean
  carryover: boolean
  deviation: boolean
  target: boolean
  recordLatest: boolean
  posQuota: boolean
  globalCap: boolean
}
const DEFAULT_RULES: Readonly<RuleSwitches> = Object.freeze({
  position: true,
  carryover: true,
  deviation: true,
  target: true,
  recordLatest: false,
  posQuota: false,
  globalCap: false
})
const rules = reactive<RuleSwitches>({ ...DEFAULT_RULES })

// 規則參數
interface RuleParams {
  /** 選偏離上限（%）— deviation ≤ upper 才保留 */
  deviationUpperPct: number
  /** 選偏離下限（%）— deviation ≥ lower 才保留 */
  deviationLowerPct: number
  /** 記錄最新數據首碼上限（0-9）— recordValueBefore ≤ n 才入池 */
  recordLatestMax: number
  /** 目標顆數偏向 — 從 lookup table 算 T 後的取整方式 */
  targetBias: TargetBias
  /** 任一尾數 ≤（80 個號碼裡每尾數有 8 個、預設 6 = 留些餘地） */
  tailCap: number
  /** 連跑 ≤（排序後最長連號串、預設 4 = 允許至多 4 連、5 連即拒） */
  consecutiveCap: number
  /** 奇 ≤ */
  oddCap: number
  /** 偶 ≤ */
  evenCap: number
  /** ≤40 cap */
  le40Cap: number
  /** >40 cap */
  gt40Cap: number
}
type TargetBias = 'round' | 'ceil' | 'floor'

const DEFAULT_PARAMS: Readonly<RuleParams> = Object.freeze({
  deviationUpperPct: 5,
  deviationLowerPct: -5,
  recordLatestMax: 1,
  targetBias: 'ceil',
  tailCap: 6,
  consecutiveCap: 4,
  oddCap: 13,
  evenCap: 13,
  le40Cap: 13,
  gt40Cap: 13
})

// 樣本量低於此值的 lookup cell → 退回該隔期整體均值（避免雜訊放大）
const TARGET_SAMPLE_TRUST = 20

// 位置基準佔比（使用者拍板、來自位置規律分頁觀察）— 位置 1-20
// 過去 200 期實際開出佔比 < 基準 → 該位置候選號優先納入
const POSITION_BENCHMARK_PCT: ReadonlyArray<number> = [
  0, // index 0 不使用
  15.80, 12.10, 10.50, 8.02, 7.50,
  6.39, 5.32, 4.55, 4.65, 4.13,
  3.84, 2.90, 2.72, 2.15, 2.30,
  1.71, 1.46, 1.26, 1.11, 1.61
]
const POSITION_BENCHMARK_RECENT_N = 200
const params = reactive<RuleParams>({ ...DEFAULT_PARAMS })

// 隔期 0-9 各自開關（預設全開）
const intervalEnabled = reactive<Record<number, boolean>>(
  Object.fromEntries(TARGET_INTERVALS.map(j => [j, true]))
)
const activeIntervals = computed(() => TARGET_INTERVALS.filter(j => intervalEnabled[j]))

// ---------- 偏好設定持久化（localStorage） ----------
interface PersistedShape {
  recentN: number
  rules: RuleSwitches
  params: RuleParams
  intervalEnabled: Record<number, boolean>
}

function loadFromStorage(): void {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Partial<PersistedShape>
    if (typeof parsed.recentN === 'number' && Number.isFinite(parsed.recentN) && parsed.recentN > 0) {
      recentN.value = parsed.recentN
    }
    if (parsed.rules && typeof parsed.rules === 'object') {
      for (const k of Object.keys(DEFAULT_RULES) as Array<keyof RuleSwitches>) {
        const v = (parsed.rules as Record<string, unknown>)[k]
        if (typeof v === 'boolean') rules[k] = v
      }
    }
    if (parsed.params && typeof parsed.params === 'object') {
      const parsedParams = parsed.params as Record<string, unknown>
      const target = params as Record<string, unknown>
      for (const k of Object.keys(DEFAULT_PARAMS) as Array<keyof RuleParams>) {
        const v = parsedParams[k]
        const defaultV = DEFAULT_PARAMS[k]
        if (typeof defaultV === 'number') {
          if (typeof v === 'number' && Number.isFinite(v)) target[k] = v
        } else if (typeof defaultV === 'string') {
          // targetBias：只接受 'round' | 'ceil' | 'floor'
          if (v === 'round' || v === 'ceil' || v === 'floor') target[k] = v
        }
      }
    }
    if (parsed.intervalEnabled && typeof parsed.intervalEnabled === 'object') {
      for (const j of TARGET_INTERVALS) {
        const v = (parsed.intervalEnabled as Record<string, unknown>)[String(j)]
        if (typeof v === 'boolean') intervalEnabled[j] = v
      }
    }
  } catch {
    // 忽略 storage 故障、走預設
  }
}

function saveToStorage(): void {
  if (typeof window === 'undefined') return
  try {
    const payload: PersistedShape = {
      recentN: recentN.value,
      rules: { ...rules },
      params: { ...params },
      intervalEnabled: { ...intervalEnabled }
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // 忽略 storage 故障
  }
}

function resetToDefaults(): void {
  recentN.value = DEFAULT_RECENT_N
  Object.assign(rules, DEFAULT_RULES)
  Object.assign(params, DEFAULT_PARAMS)
  for (const j of TARGET_INTERVALS) intervalEnabled[j] = true
}

onMounted(() => {
  loadFromStorage()
})

watch([recentN, rules, params, intervalEnabled], saveToStorage, { deep: true })

const bingoMinTermByDate = computed<Map<string, number>>(() => {
  return buildBingoMinTermByDate(props.drawsAsc)
})

const numberHistory = computed<NumberHistoryRow[]>(() => buildNumberHistory(props.snapshots))

interface NumberStat {
  appearances: number
  expected: number
  deviation: number
}

const numberStatsMap = computed<Map<number, NumberStat>>(() => {
  const m = new Map<number, NumberStat>()
  for (const row of numberHistory.value) {
    const deviation = row.expectedAppearances > 0
      ? (row.appearances - row.expectedAppearances) / row.expectedAppearances
      : 0
    m.set(row.number, {
      appearances: row.appearances,
      expected: row.expectedAppearances,
      deviation
    })
  }
  return m
})

// C 方案：lookup table 驅動的 targetK
//   - lookup cell 樣本 ≥ TARGET_SAMPLE_TRUST → 用該 cell 的 meanHits
//   - 樣本不足 → 退回該隔期整體均值（所有 X 的 sample-weighted mean）
//   - 兩者皆無 → mean = 0、T = 0
const intervalRemainingTable = computed<IntervalRemainingCell[]>(() =>
  buildIntervalRemainingTable(props.snapshots)
)

const intervalLookupMap = computed<Map<string, IntervalRemainingCell>>(() => {
  const m = new Map<string, IntervalRemainingCell>()
  for (const cell of intervalRemainingTable.value) {
    m.set(`${cell.interval}|${cell.remaining}`, cell)
  }
  return m
})

const intervalFallbackMean = computed<Map<number, number>>(() => {
  const sums = new Map<number, { sum: number, n: number }>()
  for (const cell of intervalRemainingTable.value) {
    const cur = sums.get(cell.interval) ?? { sum: 0, n: 0 }
    cur.sum += cell.meanHits * cell.sampleCount
    cur.n += cell.sampleCount
    sums.set(cell.interval, cur)
  }
  const m = new Map<number, number>()
  for (const [j, agg] of sums) {
    m.set(j, agg.n > 0 ? agg.sum / agg.n : 0)
  }
  return m
})

interface TargetInfo {
  target: number
  sourceMean: number
  source: 'cell' | 'fallback' | 'none'
}

function applyBias(mean: number, bias: TargetBias): number {
  let t: number
  if (bias === 'round') t = Math.round(mean)
  else if (bias === 'ceil') t = Math.ceil(mean)
  else t = Math.floor(mean)
  return Math.max(0, t)
}

function computeTargetInfo(
  j: number,
  rawLen: number,
  bias: TargetBias,
  lookup: ReadonlyMap<string, IntervalRemainingCell>,
  fallback: ReadonlyMap<number, number>
): TargetInfo {
  if (rawLen <= 0) return { target: 0, sourceMean: 0, source: 'none' }
  const cell = lookup.get(`${j}|${rawLen}`)
  if (cell && cell.sampleCount >= TARGET_SAMPLE_TRUST) {
    return { target: applyBias(cell.meanHits, bias), sourceMean: cell.meanHits, source: 'cell' }
  }
  const fb = fallback.get(j)
  if (fb !== undefined) {
    return { target: applyBias(fb, bias), sourceMean: fb, source: 'fallback' }
  }
  return { target: 0, sourceMean: 0, source: 'none' }
}

// 過去 N 期實際各位置開出佔比（%）
function computePositionActualPct(
  snapshots: ReadonlyArray<PerDrawSnapshot>,
  recentN: number
): number[] {
  const counts = new Array<number>(21).fill(0)
  let total = 0
  const start = Math.max(1, snapshots.length - recentN)
  for (let i = start; i < snapshots.length; i++) {
    const snap = snapshots[i]!
    for (const slot of snap.slots) {
      for (const y of slot.hitPositions) {
        if (y >= 1 && y <= 20) {
          counts[y]! += 1
          total += 1
        }
      }
    }
  }
  const out = new Array<number>(21).fill(0)
  if (total > 0) {
    for (let p = 1; p <= 20; p++) out[p] = (counts[p]! / total) * 100
  }
  return out
}

// 位置優先權：實際佔比 < 基準佔比 → 權重為正（缺額比例）；否則 0
function positionPriorityWeight(position: number, actualPct: ReadonlyArray<number>): number {
  if (position < 1 || position > 20) return 0
  const bench = POSITION_BENCHMARK_PCT[position]!
  if (bench <= 0) return 0
  const act = actualPct[position] ?? 0
  const diff = (bench - act) / bench
  return diff > 0 ? diff : 0
}

const positionActualPct = computed<number[]>(() =>
  computePositionActualPct(props.snapshots, POSITION_BENCHMARK_RECENT_N)
)

type CandidateStatus = 'hit' | 'candidateMiss' | 'miss' | 'excludedCorrect'
type ExcludedReason = 'position' | 'carryover' | 'deviation' | 'recordLatest' | 'truncated' | 'capGlobal'

interface NumberCell {
  n: number
  position: number
  excludedBy?: ExcludedReason
  status: CandidateStatus
  appearances: number
  deviation: number
  /** 是否「優先納入」（偏離 < -5%、視覺加標） */
  isPriority: boolean
}

interface CandidateRow {
  interval: number
  rawCount: number
  cells: NumberCell[]
  /** 目標主推顆數 T（從 lookup table 算、無論 rules.target 是否開） */
  targetK: number
  /** T 來源 mean（lookup cell 或退回該隔期均值） */
  targetMean: number
  /** T 來源：'cell' = 該 (J,X) cell；'fallback' = 該隔期均值；'none' = 無資料 */
  targetSource: 'cell' | 'fallback' | 'none'
  /** 過濾後候選池大小（per-interval filter 後） */
  poolSize: number
  /** 實際主推顆數 = 通過 greedy 選號的數量 */
  recommendedCount: number
  hitCount: number
  missCount: number
  removedByPosition: number
  removedByCarryover: number
  removedByDeviation: number
  removedByRecord: number
  /** 候選池內、未被主推（被 targetK / 位置 cap / 全域 cap 擋下）的顆數 */
  truncatedCount: number
  /** 該隔期是否被「記錄最新數據」整支排除 */
  recordExcluded: boolean
  /** 該隔期 pre-T recordValueBefore（顯示給使用者看是哪個首碼） */
  recordValue: number
}

function findLatestPositionYsForInterval(j: number, upToIdx: number): number[] {
  for (let i = upToIdx; i >= 1; i--) {
    const slot = props.snapshots[i]?.slots[j]
    if (!slot) continue
    if (slot.hitsThisDraw > 0) return [...slot.hitPositions]
  }
  return []
}

interface PoolItem {
  interval: number
  n: number
  position: number
  deviation: number
  appearances: number
}

interface ItemAnnotated extends PoolItem {
  excludedByPos: boolean
  excludedByCarry: boolean
  excludedByDev: boolean
  excludedByRecord: boolean
}

/**
 * Phase A：對單一隔期、計算 per-interval 過濾後的標註結果。
 * 各規則開關控制是否套用該過濾；關閉 → 該扣分一律 false。
 */
function annotateInterval(
  j: number,
  raw: number[],
  positionYs: number[],
  carryoverSet: ReadonlySet<number>,
  recordValueBefore: number,
  stats: ReadonlyMap<number, NumberStat>,
  ruleSwitches: RuleSwitches,
  ruleParams: RuleParams
): { items: ItemAnnotated[], recordExcluded: boolean } {
  const recordExcluded = ruleSwitches.recordLatest
    && recordValueBefore > ruleParams.recordLatestMax
  const posSet = new Set<number>()
  for (const y of positionYs) {
    if (y >= 1 && y <= raw.length) posSet.add(y)
  }
  // 防呆：v-model.number 在編輯中間狀態 (例如剛輸入 '-') 可能傳入非 number；
  // 任一邊變 NaN → 退化成不過濾 (Infinity / -Infinity)、避免外部 computed/template crash。
  const upperRaw = Number(ruleParams.deviationUpperPct)
  const lowerRaw = Number(ruleParams.deviationLowerPct)
  const upper = Number.isFinite(upperRaw) ? upperRaw / 100 : Number.POSITIVE_INFINITY
  const lower = Number.isFinite(lowerRaw) ? lowerRaw / 100 : Number.NEGATIVE_INFINITY
  const items: ItemAnnotated[] = raw.map((n, idx) => {
    const stat = stats.get(n)
    const deviation = stat?.deviation ?? 0
    const appearances = stat?.appearances ?? 0
    const position = idx + 1
    const excludedByPos = ruleSwitches.position && posSet.has(position)
    // 紅框 = 上期 ∩ 上上期（連莊號）；對齊 draws.vue 的紅框邏輯、套用到所有隔期、不再只限隔期 0
    const excludedByCarry = ruleSwitches.carryover && carryoverSet.has(n)
    const excludedByDev = ruleSwitches.deviation
      && (deviation > upper || deviation < lower)
    return {
      interval: j,
      n,
      position,
      deviation,
      appearances,
      excludedByPos,
      excludedByCarry,
      excludedByDev,
      excludedByRecord: recordExcluded
    }
  })
  return { items, recordExcluded }
}

/**
 * Phase B：全域 greedy 選號。
 *   - 輸入：全部隔期的 ItemAnnotated（已含通過/未通過 per-interval 過濾的標註）
 *   - 通過 per-interval 過濾的 = pool；按 deviation ASC + interval ASC + position ASC 排序
 *   - 逐顆嘗試：先 per-interval targetK cap、再位置 cap、再全域 cap
 *   - 全部通過 → 加入 picks；任一不通過 → 標 truncated/capGlobal
 */
interface SelectionResult {
  pickedNumbers: Set<number>
  rejectReason: Map<number, ExcludedReason>
}

function violatesGlobalCap(
  picks: PoolItem[],
  cand: PoolItem,
  ruleParams: RuleParams
): boolean {
  const ns: number[] = picks.map(p => p.n)
  ns.push(cand.n)
  let le40 = 0
  let gt40 = 0
  let odd = 0
  let even = 0
  for (const x of ns) {
    if (x <= 40) le40++
    else gt40++
    if (x % 2 === 1) odd++
    else even++
  }
  if (le40 > ruleParams.le40Cap) return true
  if (gt40 > ruleParams.gt40Cap) return true
  if (odd > ruleParams.oddCap) return true
  if (even > ruleParams.evenCap) return true
  const tailCount = new Map<number, number>()
  for (const x of ns) {
    const t = x % 10
    const cur = (tailCount.get(t) ?? 0) + 1
    if (cur > ruleParams.tailCap) return true
    tailCount.set(t, cur)
  }
  const sorted = [...ns].sort((a, b) => a - b)
  let cur = 1
  let max = sorted.length > 0 ? 1 : 0
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const now = sorted[i]!
    if (now === prev + 1) {
      cur++
      if (cur > max) max = cur
    } else if (now !== prev) {
      cur = 1
    }
  }
  if (max > ruleParams.consecutiveCap) return true
  return false
}

function selectGlobally(
  pools: ReadonlyMap<number, ItemAnnotated[]>,
  targetInfoByInterval: ReadonlyMap<number, TargetInfo>,
  ruleSwitches: RuleSwitches,
  ruleParams: RuleParams,
  positionActual: ReadonlyArray<number>
): SelectionResult {
  // 收集所有「通過 per-interval 過濾」的候選
  const candidates: PoolItem[] = []
  for (const [, items] of pools) {
    for (const it of items) {
      if (it.excludedByPos || it.excludedByCarry || it.excludedByDev || it.excludedByRecord) continue
      candidates.push({
        interval: it.interval,
        n: it.n,
        position: it.position,
        deviation: it.deviation,
        appearances: it.appearances
      })
    }
  }
  // 排序順位（對齊使用者 8 步流程之 step 6 = 位置數量 sort）：
  //   1. 位置優先權（過去 200 期實際佔比 < 基準 → 權重高）— 僅在 posQuota toggle 開啟時生效
  //   2. deviation ASC（最冷的優先）
  //   3. interval ASC、position ASC（穩定排序、避免抖動）
  candidates.sort((a, b) => {
    if (ruleSwitches.posQuota) {
      const wa = positionPriorityWeight(a.position, positionActual)
      const wb = positionPriorityWeight(b.position, positionActual)
      if (wa !== wb) return wb - wa
    }
    if (a.deviation !== b.deviation) return a.deviation - b.deviation
    if (a.interval !== b.interval) return a.interval - b.interval
    return a.position - b.position
  })

  const picks: PoolItem[] = []
  const pickedSet = new Set<number>()
  const intervalCount = new Map<number, number>()
  const reject = new Map<number, ExcludedReason>()

  for (const cand of candidates) {
    // step 5: per-interval 目標顆數截斷（T 來自 lookup table、由 bias 取整）
    if (ruleSwitches.target) {
      const info = targetInfoByInterval.get(cand.interval)
      const cap = info?.target ?? 0
      const cur = intervalCount.get(cand.interval) ?? 0
      if (cur + 1 > cap) {
        reject.set(cand.n, 'truncated')
        continue
      }
    }
    // step 8: 全域上限
    if (ruleSwitches.globalCap && violatesGlobalCap(picks, cand, ruleParams)) {
      reject.set(cand.n, 'capGlobal')
      continue
    }
    picks.push(cand)
    pickedSet.add(cand.n)
    intervalCount.set(cand.interval, (intervalCount.get(cand.interval) ?? 0) + 1)
  }

  return { pickedNumbers: pickedSet, rejectReason: reject }
}

const DEVIATION_LOW_THRESHOLD = -0.05

/**
 * Phase C：把 annotated items + 選號結果包成 CandidateRow（給 UI 顯示）。
 */
function buildRowsFromSelection(
  perIntervalItems: ReadonlyMap<number, ItemAnnotated[]>,
  perIntervalRecordExcluded: ReadonlyMap<number, boolean>,
  perIntervalRecordValue: ReadonlyMap<number, number>,
  rawLengthByInterval: ReadonlyMap<number, number>,
  targetInfoByInterval: ReadonlyMap<number, TargetInfo>,
  selection: SelectionResult,
  actualSet: ReadonlySet<number>,
  isPending: boolean
): CandidateRow[] {
  const rows: CandidateRow[] = []
  for (const [j, items] of perIntervalItems) {
    const rawLen = rawLengthByInterval.get(j) ?? 0
    const recordExcluded = perIntervalRecordExcluded.get(j) ?? false
    const recordValue = perIntervalRecordValue.get(j) ?? 0
    let poolSize = 0
    let removedByPosition = 0
    let removedByCarryover = 0
    let removedByDeviation = 0
    let removedByRecord = 0
    let truncatedCount = 0
    let hitCount = 0
    let missCount = 0
    let recommendedCount = 0
    const cells: NumberCell[] = []
    for (const item of items) {
      let excludedBy: ExcludedReason | undefined
      // 使用者拍板過濾順位（步驟 2 → 3 → 4 → 7）：
      //   2 recordLatest → 3 紅框 (carryover) → 4 deviation → 7 position
      // 同一個號被多條規則同時排除時、只算第一條 = 不會重覆扣
      if (item.excludedByRecord) {
        excludedBy = 'recordLatest'
        removedByRecord++
      } else if (item.excludedByCarry) {
        excludedBy = 'carryover'
        removedByCarryover++
      } else if (item.excludedByDev) {
        excludedBy = 'deviation'
        removedByDeviation++
      } else if (item.excludedByPos) {
        excludedBy = 'position'
        removedByPosition++
      } else {
        poolSize++
        const rej = selection.rejectReason.get(item.n)
        if (rej) {
          excludedBy = rej
          if (rej === 'truncated') truncatedCount++
        }
      }
      const isRecommended = !excludedBy && selection.pickedNumbers.has(item.n)
      if (isRecommended) recommendedCount++
      const isHit = actualSet.has(item.n)
      let status: CandidateStatus
      if (isPending) {
        status = isRecommended ? 'candidateMiss' : 'excludedCorrect'
      } else if (isRecommended && isHit) {
        status = 'hit'
        hitCount++
      } else if (isRecommended) {
        status = 'candidateMiss'
      } else if (isHit) {
        status = 'miss'
        missCount++
      } else {
        status = 'excludedCorrect'
      }
      cells.push({
        n: item.n,
        position: item.position,
        excludedBy,
        status,
        appearances: item.appearances,
        deviation: item.deviation,
        isPriority: item.deviation < DEVIATION_LOW_THRESHOLD
      })
    }
    rows.push({
      interval: j,
      rawCount: rawLen,
      cells,
      targetK: targetInfoByInterval.get(j)?.target ?? 0,
      targetMean: targetInfoByInterval.get(j)?.sourceMean ?? 0,
      targetSource: targetInfoByInterval.get(j)?.source ?? 'none',
      poolSize,
      recommendedCount,
      hitCount,
      missCount,
      removedByPosition,
      removedByCarryover,
      removedByDeviation,
      removedByRecord,
      truncatedCount,
      recordExcluded,
      recordValue
    })
  }
  return rows
}

/**
 * 對某個 snapshotIndex 計算所有啟用隔期的候選；
 * isPending=true → 用 finalState（下一期）、actualSet 空、不算 hit/miss
 * isPending=false → 用 snapshot.slots、actualSet = snap.actualNumbers
 */
function buildDrawRows(
  snapshotIndex: number,
  isPending: boolean
): CandidateRow[] {
  const perIntervalItems = new Map<number, ItemAnnotated[]>()
  const perIntervalRecordExcluded = new Map<number, boolean>()
  const perIntervalRecordValue = new Map<number, number>()
  const rawLengthByInterval = new Map<number, number>()
  let carryoverSet: ReadonlySet<number> = new Set()
  let actualSet: ReadonlySet<number> = new Set()
  let upToIdxForPositions: number

  if (isPending) {
    const state = props.finalState
    if (!state) return []
    upToIdxForPositions = props.snapshots.length - 1
    const arr = props.drawsAsc
    if (arr.length >= 2) {
      const last = arr.at(-1)!.numbers
      const sl = new Set(arr.at(-2)!.numbers)
      carryoverSet = new Set(last.filter(n => sl.has(n)))
    }
    for (const j of activeIntervals.value) {
      const slot = state.periods[j]
      const raw = slot ? [...slot.prizes].sort((a, b) => a - b) : []
      const recVal = slot
        ? Number.parseInt(slot.record.split(',')[0] ?? '0', 10) || 0
        : 0
      const positionYs = findLatestPositionYsForInterval(j, upToIdxForPositions)
      const { items, recordExcluded } = annotateInterval(
        j, raw, positionYs, carryoverSet, recVal, numberStatsMap.value, rules, params
      )
      perIntervalItems.set(j, items)
      perIntervalRecordExcluded.set(j, recordExcluded)
      perIntervalRecordValue.set(j, recVal)
      rawLengthByInterval.set(j, raw.length)
    }
  } else {
    const snap = props.snapshots[snapshotIndex]
    if (!snap) return []
    upToIdxForPositions = snapshotIndex - 1
    actualSet = new Set(snap.actualNumbers)
    const prev = props.drawsAsc[snapshotIndex - 1]
    const prev2 = props.drawsAsc[snapshotIndex - 2]
    if (prev && prev2) {
      const sl = new Set(prev2.numbers)
      carryoverSet = new Set(prev.numbers.filter(n => sl.has(n)))
    }
    for (const j of activeIntervals.value) {
      const slot = snap.slots[j]
      const raw = slot ? [...slot.prizesBefore].sort((a, b) => a - b) : []
      const recVal = slot?.recordValueBefore ?? 0
      const positionYs = findLatestPositionYsForInterval(j, upToIdxForPositions)
      const { items, recordExcluded } = annotateInterval(
        j, raw, positionYs, carryoverSet, recVal, numberStatsMap.value, rules, params
      )
      perIntervalItems.set(j, items)
      perIntervalRecordExcluded.set(j, recordExcluded)
      perIntervalRecordValue.set(j, recVal)
      rawLengthByInterval.set(j, raw.length)
    }
  }

  // 算出每個啟用隔期當下的 targetInfo（T、來源 mean、來源類型）
  const targetInfoByInterval = new Map<number, TargetInfo>()
  const lookup = intervalLookupMap.value
  const fallback = intervalFallbackMean.value
  for (const j of activeIntervals.value) {
    const rawLen = rawLengthByInterval.get(j) ?? 0
    targetInfoByInterval.set(j, computeTargetInfo(j, rawLen, params.targetBias, lookup, fallback))
  }

  const selection = selectGlobally(perIntervalItems, targetInfoByInterval, rules, params, positionActualPct.value)
  return buildRowsFromSelection(
    perIntervalItems,
    perIntervalRecordExcluded,
    perIntervalRecordValue,
    rawLengthByInterval,
    targetInfoByInterval,
    selection,
    actualSet,
    isPending
  )
}

// ---------- 下一期候選 (待開獎) ----------
const nextRows = computed<CandidateRow[]>(() => {
  return buildDrawRows(props.snapshots.length, true)
})

// ---------- 歷史候選回顧 ----------
interface HistoricalCard {
  snapshotIndex: number
  drawTerm: number
  drawDate: string
  timeLabel: string
  rows: CandidateRow[]
  totalHit: number
  totalMiss: number
  totalRecommended: number
  totalActual: number
  totalActualFromEnabled: number
}

const historicalCards = computed<HistoricalCard[]>(() => {
  const out: HistoricalCard[] = []
  const snaps = props.snapshots
  const start = Math.max(2, snaps.length - recentN.value)
  for (let i = start; i < snaps.length; i++) {
    const snap = snaps[i]!
    const actualSet = new Set(snap.actualNumbers)
    const rows = buildDrawRows(i, false)
    let totalHit = 0
    let totalMiss = 0
    let totalRecommended = 0
    const enabledRawUnion = new Set<number>()
    for (const r of rows) {
      totalHit += r.hitCount
      totalMiss += r.missCount
      totalRecommended += r.recommendedCount
      for (const cell of r.cells) enabledRawUnion.add(cell.n)
    }
    let totalActualFromEnabled = 0
    for (const n of actualSet) {
      if (enabledRawUnion.has(n)) totalActualFromEnabled++
    }
    out.push({
      snapshotIndex: i,
      drawTerm: snap.drawTerm,
      drawDate: snap.drawDate,
      timeLabel: bingoTimeFromMap(bingoMinTermByDate.value, snap.drawDate, snap.drawTerm),
      rows,
      totalHit,
      totalMiss,
      totalRecommended,
      totalActual: actualSet.size,
      totalActualFromEnabled
    })
  }
  out.reverse()
  return out
})

// 累計命中統計
const aggregateStats = computed(() => {
  let hit = 0
  let miss = 0
  let rec = 0
  let totalActual = 0
  let totalActualFromEnabled = 0
  for (const c of historicalCards.value) {
    hit += c.totalHit
    miss += c.totalMiss
    rec += c.totalRecommended
    totalActual += c.totalActual
    totalActualFromEnabled += c.totalActualFromEnabled
  }
  return {
    hit,
    miss,
    rec,
    totalActual,
    totalActualFromEnabled,
    precision: rec > 0 ? hit / rec : 0,
    recallOverall: totalActual > 0 ? hit / totalActual : 0,
    recallFromEnabled: totalActualFromEnabled > 0 ? hit / totalActualFromEnabled : 0
  }
})

interface DrawInfo {
  drawTerm: number
  drawDate: string
  timeLabel: string
}
const nextDrawInfo = computed<DrawInfo | null>(() => {
  const last = props.drawsAsc.at(-1)
  if (!last) return null
  const nextTerm = last.drawTerm + 1
  return {
    drawTerm: nextTerm,
    drawDate: last.drawDate,
    timeLabel: bingoTimeFromMap(bingoMinTermByDate.value, last.drawDate, nextTerm)
  }
})

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}
function fmtPct(v: number): string {
  const pct = v * 100
  if (Math.abs(pct) >= 10) return `${pct.toFixed(1)}%`
  return `${pct.toFixed(2)}%`
}
function fmtDev(d: number): string {
  return `${d >= 0 ? '+' : ''}${fmtPct(d)}`
}
function fmtSignedPct(v: unknown): string {
  // 防呆：v-model.number 中間狀態 (空字串 / '-') 可能進來；非 finite → 顯示 '—' 而非 crash
  const num = typeof v === 'number' && Number.isFinite(v) ? v : Number(v)
  if (!Number.isFinite(num)) return '—'
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`
}

function cellClass(cell: NumberCell): string {
  switch (cell.status) {
    case 'hit':
      return cell.isPriority
        ? 'bg-emerald-500 text-white border-2 border-sky-500 font-semibold'
        : 'bg-emerald-500 text-white border border-emerald-600 font-semibold'
    case 'candidateMiss':
      return cell.isPriority
        ? 'bg-default text-default border-2 border-sky-500'
        : 'bg-default text-default border border-default'
    case 'miss':
      return 'bg-red-500 text-white border border-red-600 font-semibold'
    case 'excludedCorrect':
      return 'bg-elevated/40 text-muted border border-default line-through opacity-55'
  }
}

function cellPositionClass(cell: NumberCell): string {
  if (cell.status === 'hit' || cell.status === 'miss') return 'text-white/80'
  return 'text-muted'
}

function cellTitle(cell: NumberCell): string {
  const parts: string[] = [
    `號 ${pad(cell.n)}`,
    `位置 ${cell.position}`,
    `出現 ${cell.appearances} 次（${fmtDev(cell.deviation)}）`
  ]
  if (!cell.excludedBy) {
    parts.push(cell.isPriority ? '主推（優先納入：偏離低）' : '主推')
  } else if (cell.excludedBy === 'position') {
    parts.push('扣位置')
  } else if (cell.excludedBy === 'carryover') {
    parts.push('扣紅框（連莊）')
  } else if (cell.excludedBy === 'deviation') {
    parts.push('扣選偏離（超出範圍）')
  } else if (cell.excludedBy === 'recordLatest') {
    parts.push('扣記錄最新數據（首碼超過上限）')
  } else if (cell.excludedBy === 'truncated') {
    parts.push('候選池但超過目標被截斷')
  } else if (cell.excludedBy === 'capGlobal') {
    parts.push('被全域上限 cap 擋下')
  }
  if (cell.status === 'hit') parts.push('→ 命中')
  if (cell.status === 'miss') parts.push('→ 命中（漏！規則殺錯）')
  return parts.join(' · ')
}

const stickyStyle = computed(() => ({
  top: `${props.headerHeight}px`
}))
</script>

<template>
  <div class="space-y-4">
    <!-- 控制台 -->
    <UCard :ui="{ body: 'p-3' }">
      <div class="space-y-2">
        <!-- 顯示期數 -->
        <div class="flex items-center justify-between gap-3 flex-wrap text-xs">
          <div class="flex items-center gap-3 flex-wrap">
            <label class="flex items-center gap-2">
              <span class="text-muted">下方歷史回顧顯示最近</span>
              <UInput
                v-model.number="recentN"
                type="number"
                :min="1"
                :max="2000"
                step="1"
                size="sm"
                class="w-24"
              />
              <span class="text-muted">期</span>
            </label>
            <span class="text-[10px] text-muted">
              僅截斷顯示、不影響 2000 期統計來源 · 設定已自動記住
            </span>
          </div>
          <UButton
            color="neutral"
            variant="outline"
            size="xs"
            icon="i-lucide-rotate-ccw"
            @click="resetToDefaults"
          >
            重設為預設
          </UButton>
        </div>

        <!-- 第 1 行：規則開關 -->
        <div class="border-t border-default pt-2">
          <div class="flex items-baseline gap-2 flex-wrap text-xs">
            <span class="text-muted font-semibold">規則開關：</span>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <UCheckbox v-model="rules.position" />
              <span>扣位置</span>
              <span class="text-[10px] text-muted">（上次該隔期被中位置）</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <UCheckbox v-model="rules.carryover" />
              <span>扣紅框</span>
              <span class="text-[10px] text-muted">（連莊：上期 ∩ 上上期、套用全隔期）</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <UCheckbox v-model="rules.deviation" />
              <span>選偏離</span>
              <span class="text-[10px] text-muted">（保留範圍內偏離）</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <UCheckbox v-model="rules.target" />
              <span>目標顆數截斷</span>
              <span class="text-[10px] text-muted">（T 來自 lookup table、bias 控制取整）</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <UCheckbox v-model="rules.recordLatest" />
              <span>記錄最新數據 ≤</span>
              <span class="text-[10px] text-muted">（在啟用隔期裡、首碼 ≤ n 才入池）</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <UCheckbox v-model="rules.posQuota" />
              <span>位置數量</span>
              <span class="text-[10px] text-muted">（過去 {{ POSITION_BENCHMARK_RECENT_N }} 期實際 &lt; 基準 → 該位置候選優先納入）</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <UCheckbox v-model="rules.globalCap" />
              <span>全域上限</span>
              <span class="text-[10px] text-muted">（尾數/連跑/奇偶/40 分區 cap）</span>
            </label>
          </div>
        </div>

        <!-- 第 2 行：隔期顯示 -->
        <div class="border-t border-default pt-2">
          <div class="flex items-baseline gap-2 flex-wrap text-xs">
            <span class="text-muted font-semibold">隔期顯示：</span>
            <label
              v-for="j in TARGET_INTERVALS"
              :key="`int-toggle-${j}`"
              class="flex items-center gap-1.5 cursor-pointer"
            >
              <UCheckbox v-model="intervalEnabled[j]" />
              <span class="font-mono">隔期 {{ j }}</span>
            </label>
            <span class="text-[10px] text-muted">
              · 關閉 = 不顯示該隔期 row、亦不入候選與「記錄最新數據」範圍
            </span>
          </div>
        </div>

        <!-- 第 3 行：規則參數 -->
        <div class="border-t border-default pt-2">
          <div class="space-y-1.5 text-xs">
            <div class="text-muted font-semibold">
              規則參數：
            </div>
            <!-- 選偏離範圍 -->
            <div class="flex items-baseline gap-2 flex-wrap">
              <span class="text-muted">選偏離範圍</span>
              <label class="flex items-center gap-1">
                <span class="text-[10px] text-muted">下限</span>
                <UInput
                  v-model.number="params.deviationLowerPct"
                  type="number"
                  step="0.01"
                  size="sm"
                  class="w-24"
                />
                <span class="text-[10px] text-muted">%</span>
              </label>
              <span class="text-muted">~</span>
              <label class="flex items-center gap-1">
                <span class="text-[10px] text-muted">上限</span>
                <UInput
                  v-model.number="params.deviationUpperPct"
                  type="number"
                  step="0.01"
                  size="sm"
                  class="w-24"
                />
                <span class="text-[10px] text-muted">%</span>
              </label>
              <span class="text-[10px] text-muted">
                目前範圍 {{ fmtSignedPct(params.deviationLowerPct) }} ~ {{ fmtSignedPct(params.deviationUpperPct) }}（範圍內保留、外面扣除）
              </span>
            </div>
            <!-- 記錄最新數據上限 -->
            <div class="flex items-baseline gap-2 flex-wrap">
              <span class="text-muted">記錄最新數據</span>
              <label class="flex items-center gap-1">
                <span class="text-[10px] text-muted">首碼 ≤</span>
                <UInput
                  v-model.number="params.recordLatestMax"
                  type="number"
                  :min="0"
                  :max="9"
                  step="1"
                  size="sm"
                  class="w-20"
                />
              </label>
              <span class="text-[10px] text-muted">
                · 該隔期 pre-T 數值 ≤ 上限才入池、超過則整支隔期排除
              </span>
            </div>
            <!-- 目標顆數偏向（C 方案） -->
            <div class="flex items-baseline gap-2 flex-wrap">
              <span class="text-muted">目標顆數偏向</span>
              <div class="inline-flex rounded border border-default overflow-hidden text-[11px]">
                <button
                  v-for="bias in (['ceil', 'round', 'floor'] as const)"
                  :key="`bias-${bias}`"
                  type="button"
                  class="px-3 py-1 transition-colors"
                  :class="params.targetBias === bias
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold'
                    : 'bg-default text-muted hover:bg-elevated/50'"
                  @click="params.targetBias = bias"
                >
                  {{ bias === 'ceil' ? '重涵蓋率 (ceil)' : bias === 'round' ? '標準 (round)' : '重精準率 (floor)' }}
                </button>
              </div>
              <span class="text-[10px] text-muted">
                · T = bias(lookup mean) · 樣本 &lt; {{ TARGET_SAMPLE_TRUST }} 退回該隔期均值
              </span>
            </div>
            <!-- 位置數量基準對照（過去 N 期實際 vs 基準佔比） -->
            <div class="space-y-1">
              <div class="flex items-baseline gap-2 flex-wrap">
                <span class="text-muted">位置數量基準</span>
                <span class="text-[10px] text-muted">
                  · 過去 {{ POSITION_BENCHMARK_RECENT_N }} 期實際佔比 vs 基準（缺額越大、優先權越高）
                </span>
              </div>
              <div class="grid grid-cols-5 sm:grid-cols-10 gap-1 text-[10px]">
                <div
                  v-for="p in 20"
                  :key="`pos-bench-${p}`"
                  class="rounded border border-default px-1 py-1 flex flex-col items-center gap-0.5"
                  :class="(positionActualPct[p] ?? 0) < (POSITION_BENCHMARK_PCT[p] ?? 0) ? 'border-emerald-500/60 bg-emerald-500/5' : ''"
                >
                  <span class="font-mono text-muted">位 {{ p }}</span>
                  <span class="font-mono tabular-nums">
                    {{ (positionActualPct[p] ?? 0).toFixed(2) }}%
                  </span>
                  <span class="font-mono tabular-nums text-muted">
                    / {{ (POSITION_BENCHMARK_PCT[p] ?? 0).toFixed(2) }}%
                  </span>
                </div>
              </div>
            </div>
            <!-- 全域上限 -->
            <div class="flex items-baseline gap-2 flex-wrap">
              <span class="text-muted">全域上限</span>
              <label class="flex items-center gap-1">
                <span class="text-[10px] text-muted">任一尾數 ≤</span>
                <UInput
                  v-model.number="params.tailCap"
                  type="number"
                  :min="0"
                  :max="20"
                  step="1"
                  size="sm"
                  class="w-20"
                />
              </label>
              <label class="flex items-center gap-1">
                <span class="text-[10px] text-muted">連跑 ≤</span>
                <UInput
                  v-model.number="params.consecutiveCap"
                  type="number"
                  :min="0"
                  :max="20"
                  step="1"
                  size="sm"
                  class="w-20"
                />
              </label>
              <label class="flex items-center gap-1">
                <span class="text-[10px] text-muted">奇 ≤</span>
                <UInput
                  v-model.number="params.oddCap"
                  type="number"
                  :min="0"
                  :max="40"
                  step="1"
                  size="sm"
                  class="w-20"
                />
              </label>
              <label class="flex items-center gap-1">
                <span class="text-[10px] text-muted">偶 ≤</span>
                <UInput
                  v-model.number="params.evenCap"
                  type="number"
                  :min="0"
                  :max="40"
                  step="1"
                  size="sm"
                  class="w-20"
                />
              </label>
              <label class="flex items-center gap-1">
                <span class="text-[10px] text-muted">≤40 ≤</span>
                <UInput
                  v-model.number="params.le40Cap"
                  type="number"
                  :min="0"
                  :max="40"
                  step="1"
                  size="sm"
                  class="w-20"
                />
              </label>
              <label class="flex items-center gap-1">
                <span class="text-[10px] text-muted">&gt;40 ≤</span>
                <UInput
                  v-model.number="params.gt40Cap"
                  type="number"
                  :min="0"
                  :max="40"
                  step="1"
                  size="sm"
                  class="w-20"
                />
              </label>
            </div>
          </div>
        </div>

        <!-- 第 4 行：圖例 -->
        <div class="border-t border-default pt-2">
          <div class="flex flex-wrap items-center gap-2 text-[10px] text-muted">
            <span class="font-semibold">圖例：</span>
            <span class="inline-flex items-center gap-1">
              <span class="inline-block w-3 h-3 rounded bg-emerald-500 border border-emerald-600" />
              中（主推 + 開出）
            </span>
            <span class="inline-flex items-center gap-1">
              <span class="inline-block w-3 h-3 rounded bg-emerald-500 border-2 border-sky-500" />
              中 + 優先納入
            </span>
            <span class="inline-flex items-center gap-1">
              <span class="inline-block w-3 h-3 rounded border border-default bg-default" />
              主推沒開
            </span>
            <span class="inline-flex items-center gap-1">
              <span class="inline-block w-3 h-3 rounded border-2 border-sky-500 bg-default" />
              主推 + 優先納入（沒開）
            </span>
            <span class="inline-flex items-center gap-1">
              <span class="inline-block w-3 h-3 rounded bg-red-500" />
              漏（非主推但開了）
            </span>
          </div>
        </div>
      </div>
    </UCard>

    <!-- 候選 sticky section（只放下一期候選） -->
    <UCard
      class="sticky z-20 bg-default/95 backdrop-blur supports-[backdrop-filter]:bg-default/70 ring-1 ring-emerald-500/40"
      :style="stickyStyle"
      :ui="{ body: 'p-3 sm:p-4' }"
    >
      <div class="space-y-3 text-xs">
        <div class="flex items-baseline justify-between gap-2 flex-wrap">
          <div class="flex items-baseline gap-2 flex-wrap">
            <UBadge
              color="primary"
              variant="subtle"
              size="sm"
            >
              候選 · 待開獎
            </UBadge>
            <span
              v-if="nextDrawInfo"
              class="font-mono text-sm font-semibold"
            >
              第 {{ nextDrawInfo.drawTerm }} 期
            </span>
            <span
              v-if="nextDrawInfo"
              class="text-[10px] text-muted"
            >
              {{ nextDrawInfo.drawDate }} {{ nextDrawInfo.timeLabel || '時間待算' }}
            </span>
            <span class="text-[10px] text-muted">尚未開出</span>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :icon="stickyCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
            :aria-label="stickyCollapsed ? '展開' : '收合'"
            @click="stickyCollapsed = !stickyCollapsed"
          >
            {{ stickyCollapsed ? '展開' : '收合' }}
          </UButton>
        </div>
        <div
          v-for="row in nextRows"
          v-show="!stickyCollapsed"
          :key="`next-${row.interval}`"
          class="space-y-1"
        >
          <div class="flex items-baseline gap-2 flex-wrap text-[10px]">
            <span class="font-mono font-semibold">隔期 {{ row.interval }}</span>
            <span class="text-muted">
              原 {{ row.rawCount }} 顆 · 數值 {{ row.recordValue }} → 候選池 {{ row.poolSize }} · 主推 <span class="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{{ row.recommendedCount }}</span> / 目標 {{ row.targetK }}
              <span
                v-if="row.targetSource !== 'none'"
                class="text-[9px]"
              >
                ({{ row.targetSource === 'cell' ? 'lookup' : '退回均值' }} {{ row.targetMean.toFixed(2) }} · {{ params.targetBias }})
              </span>
            </span>
            <span
              v-if="row.recordExcluded"
              class="text-[10px] text-amber-600 dark:text-amber-400"
            >
              · 整支被記錄最新數據排除
            </span>
          </div>
          <div class="text-[9px] text-muted">
            扣位置 {{ row.removedByPosition }} · 紅框 {{ row.removedByCarryover }} · 選偏離 {{ row.removedByDeviation }} · 記錄 {{ row.removedByRecord }} · 截斷 {{ row.truncatedCount }}
          </div>
          <div
            v-if="row.cells.length === 0"
            class="text-[10px] text-muted"
          >
            無剩餘號
          </div>
          <div
            v-else
            class="flex flex-wrap items-center gap-1"
          >
            <span
              v-for="cell in row.cells"
              :key="`next-${row.interval}-${cell.n}`"
              class="relative inline-flex min-w-7 justify-center font-mono text-[11px] rounded border px-1.5 py-0.5"
              :class="cellClass(cell)"
              :title="cellTitle(cell)"
            >
              {{ pad(cell.n) }}
              <span
                class="absolute bottom-0 right-0.5 text-[8px] leading-none font-normal"
                :class="cellPositionClass(cell)"
              >{{ cell.position }}</span>
            </span>
          </div>
        </div>
      </div>
    </UCard>

    <!-- 歷史候選回顧 -->
    <section class="space-y-2">
      <header class="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 class="text-base font-semibold">
          歷史候選回顧
        </h3>
        <span class="text-xs text-muted">最近 {{ historicalCards.length }} 期</span>
      </header>
      <UCard :ui="{ body: 'p-3' }">
        <div class="space-y-2 text-xs">
          <div class="flex items-baseline gap-3 flex-wrap">
            <span class="text-muted">累計主推 <span class="font-mono font-semibold">{{ aggregateStats.rec }}</span> 顆</span>
            <span class="text-emerald-600 dark:text-emerald-400">中 {{ aggregateStats.hit }}</span>
            <span :class="aggregateStats.miss > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted'">漏 {{ aggregateStats.miss }}</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
            <div class="rounded border border-default p-2 space-y-0.5">
              <div class="text-muted">
                精準率 (precision)
              </div>
              <div class="font-mono text-sm tabular-nums">
                {{ fmtPct(aggregateStats.precision) }}
              </div>
              <div class="text-[10px] text-muted">
                = 中 / 主推 = {{ aggregateStats.hit }} / {{ aggregateStats.rec }}
              </div>
              <div class="text-[10px] text-muted">
                推的 N 顆裡有幾顆中（主推太多 → 低）
              </div>
            </div>
            <div class="rounded border border-emerald-500/40 p-2 space-y-0.5 bg-emerald-500/5">
              <div class="text-muted font-semibold">
                涵蓋率 (recall) — 整體
              </div>
              <div class="font-mono text-sm tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                {{ fmtPct(aggregateStats.recallOverall) }}
              </div>
              <div class="text-[10px] text-muted">
                = 中 / 實際開出 = {{ aggregateStats.hit }} / {{ aggregateStats.totalActual }}
              </div>
              <div class="text-[10px] text-muted">
                實際開的 20×{{ historicalCards.length }} 顆有幾顆被抓到
              </div>
            </div>
            <div class="rounded border border-default p-2 space-y-0.5">
              <div class="text-muted">
                涵蓋率 — 啟用隔期內
              </div>
              <div class="font-mono text-sm tabular-nums">
                {{ fmtPct(aggregateStats.recallFromEnabled) }}
              </div>
              <div class="text-[10px] text-muted">
                = 中 / 啟用隔期實際開 = {{ aggregateStats.hit }} / {{ aggregateStats.totalActualFromEnabled }}
              </div>
              <div class="text-[10px] text-muted">
                啟用隔期 raw 涵蓋的實際開出、被主推抓到的比例
              </div>
            </div>
          </div>
          <div class="text-[10px] text-muted">
            ※ 偏離過濾用「全期 stats」、回看時有輕微 lookahead bias、但對相對排序影響很小。
          </div>
        </div>
      </UCard>

      <div
        v-if="historicalCards.length === 0"
        class="rounded-md border border-dashed border-default p-6 text-center text-sm text-muted"
      >
        尚無資料
      </div>

      <UCard
        v-for="card in historicalCards"
        :key="`hist-${card.drawTerm}`"
        :ui="{ body: 'p-3 sm:p-4' }"
      >
        <div class="space-y-2 text-xs">
          <div class="flex items-baseline gap-2 flex-wrap">
            <span class="font-mono text-sm font-semibold">第 {{ card.drawTerm }} 期</span>
            <span class="text-[10px] text-muted">
              {{ card.drawDate }} {{ card.timeLabel }}
            </span>
            <span class="text-[10px] text-muted">
              · 主推 {{ card.totalRecommended }} ·
              <span class="text-emerald-600 dark:text-emerald-400">中 {{ card.totalHit }}</span> ·
              <span :class="card.totalMiss > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted'">漏 {{ card.totalMiss }}</span>
            </span>
          </div>
          <div
            v-for="row in card.rows"
            :key="`hist-${card.drawTerm}-${row.interval}`"
            class="space-y-1"
          >
            <div class="flex items-baseline gap-2 flex-wrap text-[10px]">
              <span class="font-mono">隔期 {{ row.interval }}</span>
              <span class="text-muted">
                原 {{ row.rawCount }} · 數值 {{ row.recordValue }} → 池 {{ row.poolSize }} · 主推 <span class="font-mono">{{ row.recommendedCount }}</span> / 目標 {{ row.targetK }}
                <span
                  v-if="row.targetSource !== 'none'"
                  class="text-[9px]"
                >
                  ({{ row.targetMean.toFixed(2) }})
                </span>
              </span>
              <span
                v-if="row.recordExcluded"
                class="text-[10px] text-amber-600 dark:text-amber-400"
              >
                · 整支被記錄最新數據排除
              </span>
              <span
                v-if="row.hitCount > 0"
                class="text-emerald-600 dark:text-emerald-400"
              >中 {{ row.hitCount }}</span>
              <span
                v-else
                class="text-muted"
              >中 0</span>
              <span
                v-if="row.missCount > 0"
                class="text-red-600 dark:text-red-400 font-semibold"
              >漏 {{ row.missCount }}</span>
            </div>
            <div
              v-if="row.cells.length === 0"
              class="text-[10px] text-muted"
            >
              無剩餘號
            </div>
            <div
              v-else
              class="flex flex-wrap items-center gap-1"
            >
              <span
                v-for="cell in row.cells"
                :key="`hist-${card.drawTerm}-${row.interval}-${cell.n}`"
                class="relative inline-flex min-w-7 justify-center font-mono text-[11px] rounded border px-1.5 py-0.5"
                :class="cellClass(cell)"
                :title="cellTitle(cell)"
              >
                {{ pad(cell.n) }}
                <span
                  class="absolute bottom-0 right-0.5 text-[8px] leading-none font-normal"
                  :class="cellPositionClass(cell)"
                >{{ cell.position }}</span>
              </span>
            </div>
          </div>
        </div>
      </UCard>
    </section>
  </div>
</template>
