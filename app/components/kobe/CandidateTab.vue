<script setup lang="ts">
/**
 * /kobe Tab 0 「候選」
 *
 * 結構：
 *   1. 控制台（最近 N 期截斷下方歷史回顧、不影響 2000 期統計）
 *   2. sticky 候選 section（避開頂部 UHeader）
 *      - 下一期候選（待開獎）：用 finalState、白底
 *   3. 最新一期回顧（獨立卡、不 sticky）：用 preLatestState、4 色標示
 *   4. 歷史候選回顧列表（不 sticky）：每期一張卡、4 色標示
 *
 * 候選邏輯（隔期 0..3）：
 *   raw = pre-T 該隔期 prizesBefore（sorted asc）
 *   positionYs = 從歷史往前掃、最近一個 slot[j].hits > 0 的 hitPositions
 *   1) 扣位置：raw 中 1-indexed 位置 ∈ positionYs 的號碼移除
 *   2) 扣紅框（僅 j=0）：上兩期共同號（連莊）移除
 *   3) 扣偏離高：出現次數 > 理論平均 +5% 的號（過熱）移除
 *   4) 過濾後候選池按 deviation ASC 排序（偏離低的優先）
 *   5) 取前 T 顆 = 主推（T 來自目標顆數 mapping、依該隔期 raw.length 對照）
 *
 * 4 色狀態：
 *   命中（主推 + 開出）→ 綠底 solid
 *   候選沒中（主推 + 沒開）→ 白底 outline
 *   漏（非主推 + 開出 = 規則殺錯）→ 紅底 solid
 *   過濾正確（非主推 + 沒開）→ 灰底劃線 dimmed
 *
 * 目標顆數 mapping（使用者拍板、基於 phase 1 對照表觀察）：
 *   j=0：4-6 範圍取中位 5
 *   j=1：raw ≤12 → 2 / 13-15 → 3 / ≥16 → 4 / <11 → 1
 *   j=2：raw ≤11 → 2 / 12-15 → 3 / ≥16 → 4 / <9  → 1
 *   j=3：raw ≤11 → 2 / 12-13 → 3 / ≥14 → 4 / <8  → 1
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

const TARGET_INTERVALS = [0, 1, 2, 3] as const
const DEFAULT_RECENT_N = 50
const DEVIATION_HIGH_THRESHOLD = 0.05 // > +5% → 扣
const DEVIATION_LOW_THRESHOLD = -0.05 // < -5% → 「優先納入」(視覺標記)

const recentN = ref<number>(DEFAULT_RECENT_N)

const bingoMinTermByDate = computed<Map<string, number>>(() => {
  return buildBingoMinTermByDate(props.drawsAsc)
})

// 號碼軌跡：全期統計、給偏離過濾用
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
  if (j === 0) return 5 // 4-6 範圍取中位 5
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
  return 0
}

type CandidateStatus = 'hit' | 'candidateMiss' | 'miss' | 'excludedCorrect'

interface NumberCell {
  n: number
  position: number
  /** 該號被扣的原因（若有）；undefined = 在主推內 */
  excludedBy?: 'position' | 'carryover' | 'deviationHigh' | 'truncated'
  status: CandidateStatus
  /** 全期出現次數 */
  appearances: number
  /** 偏離理論平均的比率 */
  deviation: number
  /** 是否「優先納入」（偏離 < -5%、視覺加標） */
  isPriority: boolean
}

interface CandidateRow {
  interval: number
  rawCount: number
  cells: NumberCell[]
  /** 目標主推顆數 T */
  targetK: number
  /** 過濾後候選池大小（扣位置 + 紅框 + 偏離高之後） */
  poolSize: number
  /** 實際主推顆數 = min(targetK, poolSize) */
  recommendedCount: number
  /** 主推命中數（候選 + 開出） */
  hitCount: number
  /** 漏數 = 非主推但開出 */
  missCount: number
  removedByPosition: number
  removedByCarryover: number
  removedByDeviationHigh: number
  /** 候選池內、超過目標被截斷的顆數 */
  truncatedCount: number
}

function findLatestPositionYsForInterval(j: number, upToIdx: number): number[] {
  for (let i = upToIdx; i >= 1; i--) {
    const slot = props.snapshots[i]?.slots[j]
    if (!slot) continue
    if (slot.hitsThisDraw > 0) return [...slot.hitPositions]
  }
  return []
}

/**
 * 共用候選計算：套用全部三層過濾 + 目標顆數截斷。
 */
function buildCandidateRow(
  j: number,
  raw: number[],
  positionYs: number[],
  carryoverSet: ReadonlySet<number>,
  actualSet: ReadonlySet<number>,
  stats: ReadonlyMap<number, NumberStat>,
  isPending: boolean
): CandidateRow {
  const posSet = new Set<number>()
  for (const y of positionYs) {
    if (y >= 1 && y <= raw.length) posSet.add(y)
  }

  // Pass 1: 對每個號分類
  interface Item {
    n: number
    position: number
    excludedByPos: boolean
    excludedByCarry: boolean
    excludedByDev: boolean
    deviation: number
    appearances: number
  }
  const items: Item[] = raw.map((n, idx) => {
    const stat = stats.get(n)
    return {
      n,
      position: idx + 1,
      excludedByPos: posSet.has(idx + 1),
      excludedByCarry: j === 0 && carryoverSet.has(n),
      excludedByDev: (stat?.deviation ?? 0) > DEVIATION_HIGH_THRESHOLD,
      deviation: stat?.deviation ?? 0,
      appearances: stat?.appearances ?? 0
    }
  })

  // Pass 2: 過濾後候選池
  const pool = items.filter(x => !x.excludedByPos && !x.excludedByCarry && !x.excludedByDev)

  // Pass 3: 按 deviation ASC 排序、取前 T 顆 = 主推
  const target = targetK(j, raw.length)
  const sortedPool = [...pool].sort((a, b) => a.deviation - b.deviation)
  const recommendedCount = Math.min(target, sortedPool.length)
  const recommendedSet = new Set<number>(sortedPool.slice(0, recommendedCount).map(x => x.n))

  // Pass 4: 給每個 cell 標 status
  const cells: NumberCell[] = []
  let hitCount = 0
  let missCount = 0
  let removedByPosition = 0
  let removedByCarryover = 0
  let removedByDeviationHigh = 0
  let truncatedCount = 0

  for (const item of items) {
    const isRecommended = recommendedSet.has(item.n)
    const isHit = actualSet.has(item.n)
    let excludedBy: NumberCell['excludedBy']
    if (item.excludedByPos) {
      excludedBy = 'position'
      removedByPosition++
    } else if (item.excludedByCarry) {
      excludedBy = 'carryover'
      removedByCarryover++
    } else if (item.excludedByDev) {
      excludedBy = 'deviationHigh'
      removedByDeviationHigh++
    } else if (!isRecommended) {
      excludedBy = 'truncated'
      truncatedCount++
    }

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

  return {
    interval: j,
    rawCount: raw.length,
    cells,
    targetK: target,
    poolSize: pool.length,
    recommendedCount,
    hitCount,
    missCount,
    removedByPosition,
    removedByCarryover,
    removedByDeviationHigh,
    truncatedCount
  }
}

// ---------- 下一期候選 (待開獎) ----------
const nextCarryoverSet = computed<Set<number>>(() => {
  const arr = props.drawsAsc
  if (arr.length < 2) return new Set()
  const last = arr.at(-1)!.numbers
  const sl = new Set(arr.at(-2)!.numbers)
  return new Set(last.filter(n => sl.has(n)))
})

const nextRows = computed<CandidateRow[]>(() => {
  const state = props.finalState
  if (!state) return []
  const upToIdx = props.snapshots.length - 1
  const emptyActual = new Set<number>()
  return TARGET_INTERVALS.map((j) => {
    const slot = state.periods[j]
    const raw = slot ? [...slot.prizes].sort((a, b) => a - b) : []
    const positionYs = findLatestPositionYsForInterval(j, upToIdx)
    return buildCandidateRow(j, raw, positionYs, nextCarryoverSet.value, emptyActual, numberStatsMap.value, true)
  })
})

// ---------- 最新一期回顧 ----------
const reviewCarryoverSet = computed<Set<number>>(() => {
  const arr = props.drawsAsc
  if (arr.length < 3) return new Set()
  const last = arr.at(-2)!.numbers
  const sl = new Set(arr.at(-3)!.numbers)
  return new Set(last.filter(n => sl.has(n)))
})

const reviewRows = computed<CandidateRow[]>(() => {
  const state = props.preLatestState
  if (!state) return []
  const upToIdx = props.snapshots.length - 2
  const actualSet = new Set(props.drawsAsc.at(-1)?.numbers ?? [])
  return TARGET_INTERVALS.map((j) => {
    const slot = state.periods[j]
    const raw = slot ? [...slot.prizes].sort((a, b) => a - b) : []
    const positionYs = findLatestPositionYsForInterval(j, upToIdx)
    return buildCandidateRow(j, raw, positionYs, reviewCarryoverSet.value, actualSet, numberStatsMap.value, false)
  })
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
}

const historicalCards = computed<HistoricalCard[]>(() => {
  const out: HistoricalCard[] = []
  const snaps = props.snapshots
  const start = Math.max(2, snaps.length - recentN.value)
  for (let i = start; i < snaps.length; i++) {
    const snap = snaps[i]!
    const actualSet = new Set(snap.actualNumbers)
    const prev = props.drawsAsc[i - 1]
    const prev2 = props.drawsAsc[i - 2]
    let carryoverSet: ReadonlySet<number> = new Set()
    if (prev && prev2) {
      const sl = new Set(prev2.numbers)
      carryoverSet = new Set(prev.numbers.filter(n => sl.has(n)))
    }
    const rows = TARGET_INTERVALS.map((j) => {
      const slot = snap.slots[j]
      const raw = slot ? [...slot.prizesBefore].sort((a, b) => a - b) : []
      const positionYs = findLatestPositionYsForInterval(j, i - 1)
      return buildCandidateRow(j, raw, positionYs, carryoverSet, actualSet, numberStatsMap.value, false)
    })
    let totalHit = 0
    let totalMiss = 0
    let totalRecommended = 0
    for (const r of rows) {
      totalHit += r.hitCount
      totalMiss += r.missCount
      totalRecommended += r.recommendedCount
    }
    out.push({
      snapshotIndex: i,
      drawTerm: snap.drawTerm,
      drawDate: snap.drawDate,
      timeLabel: bingoTimeFromMap(bingoMinTermByDate.value, snap.drawDate, snap.drawTerm),
      rows,
      totalHit,
      totalMiss,
      totalRecommended
    })
  }
  out.reverse()
  return out
})

// 累計命中統計（橫跨歷史回顧的最近 N 期）
const aggregateStats = computed(() => {
  let hit = 0
  let miss = 0
  let rec = 0
  for (const c of historicalCards.value) {
    hit += c.totalHit
    miss += c.totalMiss
    rec += c.totalRecommended
  }
  return { hit, miss, rec, hitRate: rec > 0 ? hit / rec : 0 }
})

interface DrawInfo {
  drawTerm: number
  drawDate: string
  timeLabel: string
}
const latestDrawInfo = computed<DrawInfo | null>(() => {
  const last = props.drawsAsc.at(-1)
  if (!last) return null
  return {
    drawTerm: last.drawTerm,
    drawDate: last.drawDate,
    timeLabel: bingoTimeFromMap(bingoMinTermByDate.value, last.drawDate, last.drawTerm)
  }
})
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

function cellClass(cell: NumberCell): string {
  switch (cell.status) {
    case 'hit':
      // 「優先納入」中號 → 綠底 + 藍邊雙框（區別普通主推命中）
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
  } else if (cell.excludedBy === 'deviationHigh') {
    parts.push('扣偏離高（> +5%）')
  } else if (cell.excludedBy === 'truncated') {
    parts.push('候選池但超過目標被截斷')
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
        <span class="text-[10px] text-muted">
          · 規則：扣位置 + 扣紅框(j=0) + 扣偏離高(&gt;+5%) → 候選池按偏離 ASC 排 → 取前 T 顆主推
        </span>
      </div>
    </UCard>

    <!-- 候選 sticky section（只放下一期候選） -->
    <UCard
      class="sticky z-20 bg-default/95 backdrop-blur supports-[backdrop-filter]:bg-default/70 ring-1 ring-emerald-500/40"
      :style="stickyStyle"
      :ui="{ body: 'p-3 sm:p-4' }"
    >
      <div class="space-y-3 text-xs">
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
        <div
          v-for="row in nextRows"
          :key="`next-${row.interval}`"
          class="space-y-1"
        >
          <div class="flex items-baseline gap-2 flex-wrap text-[10px]">
            <span class="font-mono font-semibold">隔期 {{ row.interval }}</span>
            <span class="text-muted">
              原 {{ row.rawCount }} 顆 → 候選池 {{ row.poolSize }} · 主推 <span class="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{{ row.recommendedCount }}</span> / 目標 {{ row.targetK }}
            </span>
          </div>
          <div class="text-[9px] text-muted">
            扣位置 {{ row.removedByPosition }} · 紅框 {{ row.removedByCarryover }} · 偏離高 {{ row.removedByDeviationHigh }} · 截斷 {{ row.truncatedCount }}
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

    <!-- 最新一期回顧（獨立卡、不 sticky） -->
    <UCard :ui="{ body: 'p-3 sm:p-4' }">
      <div class="space-y-2 text-xs">
        <div class="flex items-baseline gap-2 flex-wrap">
          <UBadge
            color="success"
            variant="subtle"
            size="sm"
          >
            最新一期回顧
          </UBadge>
          <span
            v-if="latestDrawInfo"
            class="font-mono text-sm font-semibold"
          >
            第 {{ latestDrawInfo.drawTerm }} 期
          </span>
          <span
            v-if="latestDrawInfo"
            class="text-[10px] text-muted"
          >
            {{ latestDrawInfo.drawDate }} {{ latestDrawInfo.timeLabel || '' }}
          </span>
        </div>
        <!-- legend -->
        <div class="flex flex-wrap items-center gap-2 text-[10px] text-muted">
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
          <span class="inline-flex items-center gap-1">
            <span class="inline-block w-3 h-3 rounded bg-elevated/40 line-through" />
            扣對（非主推且沒開）
          </span>
        </div>
        <div
          v-for="row in reviewRows"
          :key="`review-${row.interval}`"
          class="space-y-1"
        >
          <div class="flex items-baseline gap-2 flex-wrap text-[10px]">
            <span class="font-mono font-semibold">隔期 {{ row.interval }}</span>
            <span class="text-muted">
              原 {{ row.rawCount }} 顆 → 候選池 {{ row.poolSize }} · 主推 <span class="font-mono font-semibold">{{ row.recommendedCount }}</span> / 目標 {{ row.targetK }}
            </span>
            <span class="text-emerald-600 dark:text-emerald-400">中 {{ row.hitCount }}</span>
            <span
              v-if="row.missCount > 0"
              class="text-red-600 dark:text-red-400 font-semibold"
            >漏 {{ row.missCount }}</span>
            <span
              v-else
              class="text-muted"
            >漏 0</span>
          </div>
          <div class="text-[9px] text-muted">
            扣位置 {{ row.removedByPosition }} · 紅框 {{ row.removedByCarryover }} · 偏離高 {{ row.removedByDeviationHigh }} · 截斷 {{ row.truncatedCount }}
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
              :key="`review-${row.interval}-${cell.n}`"
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
        <div class="flex items-baseline gap-3 text-xs text-muted">
          <span>最近 {{ historicalCards.length }} 期</span>
          <span>
            累計主推 {{ aggregateStats.rec }} 顆 ·
            <span class="text-emerald-600 dark:text-emerald-400">中 {{ aggregateStats.hit }}</span> ·
            <span :class="aggregateStats.miss > 0 ? 'text-red-600 dark:text-red-400' : ''">漏 {{ aggregateStats.miss }}</span> ·
            命中率 {{ fmtPct(aggregateStats.hitRate) }}
          </span>
        </div>
      </header>
      <div class="text-[10px] text-muted">
        ※ 偏離過濾用「全期 stats」、回看時有輕微 lookahead bias、但對相對排序影響很小。
      </div>

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
                原 {{ row.rawCount }} → 池 {{ row.poolSize }} · 主推 <span class="font-mono">{{ row.recommendedCount }}</span> / 目標 {{ row.targetK }}
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
