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
 * 目標顆數 mapping（j=4-9 暫用保守值 1、待使用者拍板）：
 *   j=0：5 / j=1：raw≤12→2、13-15→3、≥16→4、<11→1
 *   j=2：raw≤11→2、12-15→3、≥16→4、<9→1
 *   j=3：raw≤11→2、12-13→3、≥14→4、<8→1
 */
import type { PerDrawSnapshot, KobeDraw, NumberHistoryRow } from '~/utils/kobe-stats'
import type { AnalysisState } from '~/utils/analysis'
import { buildNumberHistory } from '~/utils/kobe-stats'
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
const rules = reactive<RuleSwitches>({
  position: true,
  carryover: true,
  deviation: true,
  target: true,
  recordLatest: false,
  posQuota: false,
  globalCap: false
})

// 規則參數
interface RuleParams {
  /** 選偏離上限（%）— deviation ≤ upper 才保留 */
  deviationUpperPct: number
  /** 選偏離下限（%）— deviation ≥ lower 才保留 */
  deviationLowerPct: number
  /** 記錄最新數據首碼上限（0-9）— recordValueBefore ≤ n 才入池 */
  recordLatestMax: number
  /** 位 1、2 各 ≤ */
  pos12Cap: number
  /** 位 3-9 各 ≤ */
  pos39Cap: number
  /** 位 10+ 各 ≤ */
  pos10PlusCap: number
  /** 任一尾數 ≤ */
  tailCap: number
  /** 連跑 ≤ */
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
const params = reactive<RuleParams>({
  deviationUpperPct: 5,
  deviationLowerPct: -5,
  recordLatestMax: 1,
  pos12Cap: 2,
  pos39Cap: 1,
  pos10PlusCap: 4,
  tailCap: 5,
  consecutiveCap: 4,
  oddCap: 12,
  evenCap: 12,
  le40Cap: 12,
  gt40Cap: 12
})

// 隔期 0-9 各自開關（預設全開）
const intervalEnabled = reactive<Record<number, boolean>>(
  Object.fromEntries(TARGET_INTERVALS.map(j => [j, true]))
)
const activeIntervals = computed(() => TARGET_INTERVALS.filter(j => intervalEnabled[j]))

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

function targetK(j: number, rawLen: number): number {
  if (j === 0) return 5
  if (j === 1) {
    if (rawLen < 11) return 1
    if (rawLen <= 12) return 2
    if (rawLen <= 15) return 3
    return 4
  }
  if (j === 2) {
    if (rawLen < 9) return 1
    if (rawLen <= 11) return 2
    if (rawLen <= 15) return 3
    return 4
  }
  if (j === 3) {
    if (rawLen < 8) return 1
    if (rawLen <= 11) return 2
    if (rawLen <= 13) return 3
    return 4
  }
  if (j >= 4 && j <= 9) return 1
  return 0
}

type CandidateStatus = 'hit' | 'candidateMiss' | 'miss' | 'excludedCorrect'
type ExcludedReason = 'position' | 'carryover' | 'deviation' | 'recordLatest' | 'truncated' | 'capPos' | 'capGlobal'

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
  /** 目標主推顆數 T（依 mapping 算出、無論 rules.target 是否開） */
  targetK: number
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
    const excludedByCarry = ruleSwitches.carryover && j === 0 && carryoverSet.has(n)
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
 *   - 全部通過 → 加入 picks；任一不通過 → 標 truncated/capPos/capGlobal
 */
interface SelectionResult {
  pickedNumbers: Set<number>
  rejectReason: Map<number, ExcludedReason>
}

function violatesPosCap(
  picks: PoolItem[],
  cand: PoolItem,
  ruleSwitches: RuleSwitches,
  ruleParams: RuleParams
): boolean {
  if (!ruleSwitches.posQuota) return false
  const p = cand.position
  let count = 0
  for (const x of picks) {
    if (x.position === p) count++
  }
  const next = count + 1
  if (p === 1 || p === 2) return next > ruleParams.pos12Cap
  if (p >= 3 && p <= 9) return next > ruleParams.pos39Cap
  if (p >= 10) return next > ruleParams.pos10PlusCap
  return false
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
  rawLengthByInterval: ReadonlyMap<number, number>,
  ruleSwitches: RuleSwitches,
  ruleParams: RuleParams
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
  // 排序：deviation ASC、interval ASC、position ASC
  candidates.sort((a, b) => {
    if (a.deviation !== b.deviation) return a.deviation - b.deviation
    if (a.interval !== b.interval) return a.interval - b.interval
    return a.position - b.position
  })

  const picks: PoolItem[] = []
  const pickedSet = new Set<number>()
  const intervalCount = new Map<number, number>()
  const reject = new Map<number, ExcludedReason>()

  for (const cand of candidates) {
    // 1. per-interval targetK cap
    if (ruleSwitches.target) {
      const rawLen = rawLengthByInterval.get(cand.interval) ?? 0
      const cap = targetK(cand.interval, rawLen)
      const cur = intervalCount.get(cand.interval) ?? 0
      if (cur + 1 > cap) {
        reject.set(cand.n, 'truncated')
        continue
      }
    }
    // 2. 位置數量 cap
    if (violatesPosCap(picks, cand, ruleSwitches, ruleParams)) {
      reject.set(cand.n, 'capPos')
      continue
    }
    // 3. 全域 cap
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
      if (item.excludedByRecord) {
        excludedBy = 'recordLatest'
        removedByRecord++
      } else if (item.excludedByPos) {
        excludedBy = 'position'
        removedByPosition++
      } else if (item.excludedByCarry) {
        excludedBy = 'carryover'
        removedByCarryover++
      } else if (item.excludedByDev) {
        excludedBy = 'deviation'
        removedByDeviation++
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
      targetK: targetK(j, rawLen),
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

  const selection = selectGlobally(perIntervalItems, rawLengthByInterval, rules, params)
  return buildRowsFromSelection(
    perIntervalItems,
    perIntervalRecordExcluded,
    perIntervalRecordValue,
    rawLengthByInterval,
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
  } else if (cell.excludedBy === 'capPos') {
    parts.push('被位置數量 cap 擋下')
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
        <div class="flex items-center gap-3 flex-wrap text-xs">
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
            僅截斷顯示、不影響 2000 期統計來源
          </span>
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
              <span class="text-[10px] text-muted">（隔期 0 連莊）</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <UCheckbox v-model="rules.deviation" />
              <span>選偏離</span>
              <span class="text-[10px] text-muted">（保留範圍內偏離）</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <UCheckbox v-model="rules.target" />
              <span>目標顆數截斷</span>
              <span class="text-[10px] text-muted">（每隔期主推取前 T 顆）</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <UCheckbox v-model="rules.recordLatest" />
              <span>記錄最新數據 ≤</span>
              <span class="text-[10px] text-muted">（在啟用隔期裡、首碼 ≤ n 才入池）</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <UCheckbox v-model="rules.posQuota" />
              <span>位置數量</span>
              <span class="text-[10px] text-muted">（位 1/2、3-9、10+ 各位置 cap）</span>
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
            <!-- 位置數量 -->
            <div class="flex items-baseline gap-2 flex-wrap">
              <span class="text-muted">位置數量</span>
              <label class="flex items-center gap-1">
                <span class="text-[10px] text-muted">位 1、2 各 ≤</span>
                <UInput
                  v-model.number="params.pos12Cap"
                  type="number"
                  :min="0"
                  :max="20"
                  step="1"
                  size="sm"
                  class="w-20"
                />
              </label>
              <label class="flex items-center gap-1">
                <span class="text-[10px] text-muted">位 3-9 各 ≤</span>
                <UInput
                  v-model.number="params.pos39Cap"
                  type="number"
                  :min="0"
                  :max="20"
                  step="1"
                  size="sm"
                  class="w-20"
                />
              </label>
              <label class="flex items-center gap-1">
                <span class="text-[10px] text-muted">位 10+ 各 ≤</span>
                <UInput
                  v-model.number="params.pos10PlusCap"
                  type="number"
                  :min="0"
                  :max="20"
                  step="1"
                  size="sm"
                  class="w-20"
                />
              </label>
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
