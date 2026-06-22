<script setup lang="ts">
/**
 * /kobe Tab 0 「候選」
 *
 * 結構：
 *   1. 控制台（最近 N 期截斷下方歷史回顧、不影響 2000 期統計）
 *   2. sticky 候選 section（避開頂部 UHeader）
 *      - 下一期候選（待開獎）：用 finalState、白底
 *      - 最新一期回顧：用 preLatestState、4 色標示
 *   3. 歷史候選回顧列表（不 sticky）：每期一張卡、4 色標示
 *
 * 候選邏輯（隔期 0..3）：
 *   raw = pre-T 該隔期 prizesBefore（sorted asc）
 *   positionYs = 從歷史往前掃、最近一個 slot[j].hits > 0 的 hitPositions
 *   扣位置：raw 中 1-indexed 位置 ∈ positionYs 的號碼移除
 *   扣紅框（僅 j=0）：上兩期共同號（連莊）移除
 *
 * 4 色狀態（歷史回顧 + 最新一期）：
 *   命中（候選且開出）→ 綠底 solid
 *   候選沒中（候選但沒開）→ 白底 outline
 *   漏（被扣但開出 = 過濾殺錯）→ 紅底 solid
 *   過濾正確（被扣且沒開）→ 灰底劃線 dimmed
 */
import type { PerDrawSnapshot, KobeDraw } from '~/utils/kobe-stats'
import type { AnalysisState } from '~/utils/analysis'
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

const recentN = ref<number>(DEFAULT_RECENT_N)

const bingoMinTermByDate = computed<Map<string, number>>(() => {
  return buildBingoMinTermByDate(props.drawsAsc)
})

type CandidateStatus = 'hit' | 'candidateMiss' | 'miss' | 'excludedCorrect'

interface NumberCell {
  n: number
  position: number
  /** 該號是被「扣位置」還是「扣紅框」過濾掉 */
  excludedBy?: 'position' | 'carryover'
  status: CandidateStatus
}

interface CandidateRow {
  interval: number
  rawCount: number
  cells: NumberCell[]
  candidateCount: number
  hitCount: number
  missCount: number // 漏（被扣但開出）
  excludedCorrectCount: number
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
 * 共用候選計算：
 *   - raw 來自任何 pre-T sorted 號碼陣列
 *   - actualSet 是該期實際開出的 20 顆（用於染色）；待開獎期 → 空 set
 */
function buildCandidateRow(
  j: number,
  raw: number[],
  positionYs: number[],
  carryoverSet: ReadonlySet<number>,
  actualSet: ReadonlySet<number>,
  isPending: boolean
): CandidateRow {
  const posSet = new Set<number>()
  for (const y of positionYs) {
    if (y >= 1 && y <= raw.length) posSet.add(y)
  }
  const cells: NumberCell[] = []
  let candidateCount = 0
  let hitCount = 0
  let missCount = 0
  let excludedCorrectCount = 0
  raw.forEach((n, idx) => {
    const pos = idx + 1
    const isExcludedByPos = posSet.has(pos)
    const isExcludedByCarry = j === 0 && carryoverSet.has(n)
    const isExcluded = isExcludedByPos || isExcludedByCarry
    const isHit = actualSet.has(n)
    let status: CandidateStatus
    if (isPending) {
      // 待開獎：開出資訊還沒有 → 候選 vs 已扣 兩種狀態
      status = isExcluded ? 'excludedCorrect' : 'candidateMiss'
    } else if (isExcluded && isHit) {
      status = 'miss' // 漏：被扣但開了
      missCount++
    } else if (isExcluded) {
      status = 'excludedCorrect' // 對：被扣且沒開
      excludedCorrectCount++
    } else if (isHit) {
      status = 'hit' // 中：候選且開了
      candidateCount++
      hitCount++
    } else {
      status = 'candidateMiss' // 候選但沒開
      candidateCount++
    }
    cells.push({
      n,
      position: pos,
      excludedBy: isExcluded ? (isExcludedByPos ? 'position' : 'carryover') : undefined,
      status
    })
  })
  if (isPending) {
    // 待開獎：候選數 = 沒被扣的、其他統計 0
    candidateCount = cells.filter(c => c.status === 'candidateMiss').length
  }
  return {
    interval: j,
    rawCount: raw.length,
    cells,
    candidateCount,
    hitCount,
    missCount,
    excludedCorrectCount
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
    return buildCandidateRow(j, raw, positionYs, nextCarryoverSet.value, emptyActual, true)
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
  // snapshots.at(-1) = 處理最新一期前的 pre-T；找最近位置時上限是這之前
  const upToIdx = props.snapshots.length - 2
  const actualSet = new Set(props.drawsAsc.at(-1)?.numbers ?? [])
  return TARGET_INTERVALS.map((j) => {
    const slot = state.periods[j]
    const raw = slot ? [...slot.prizes].sort((a, b) => a - b) : []
    const positionYs = findLatestPositionYsForInterval(j, upToIdx)
    return buildCandidateRow(j, raw, positionYs, reviewCarryoverSet.value, actualSet, false)
  })
})

// ---------- 歷史候選回顧（每期一張卡）----------
interface HistoricalCard {
  snapshotIndex: number
  drawTerm: number
  drawDate: string
  timeLabel: string
  rows: CandidateRow[]
}

const historicalCards = computed<HistoricalCard[]>(() => {
  const out: HistoricalCard[] = []
  const snaps = props.snapshots
  // i = 該期觀察、需要 i-1 (上期) 來算紅框、所以最少從 i=2 開始
  const start = Math.max(2, snaps.length - recentN.value)
  for (let i = start; i < snaps.length; i++) {
    const snap = snaps[i]!
    const actualSet = new Set(snap.actualNumbers)
    // 紅框 = 上期 ∩ 上上期
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
      return buildCandidateRow(j, raw, positionYs, carryoverSet, actualSet, false)
    })
    out.push({
      snapshotIndex: i,
      drawTerm: snap.drawTerm,
      drawDate: snap.drawDate,
      timeLabel: bingoTimeFromMap(bingoMinTermByDate.value, snap.drawDate, snap.drawTerm),
      rows
    })
  }
  out.reverse() // 最新在上
  return out
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

function cellClass(cell: NumberCell): string {
  // 四色 + 待開獎時 candidateMiss 顯示為「候選」白底
  switch (cell.status) {
    case 'hit':
      return 'bg-emerald-500 text-white border-emerald-600 font-semibold'
    case 'candidateMiss':
      return 'bg-default text-default border-default'
    case 'miss':
      return 'bg-red-500 text-white border-red-600 font-semibold'
    case 'excludedCorrect':
      return 'bg-elevated/40 text-muted border-default line-through opacity-55'
  }
}

function cellPositionClass(cell: NumberCell): string {
  if (cell.status === 'hit' || cell.status === 'miss') return 'text-white/80'
  if (cell.status === 'excludedCorrect') return 'text-muted'
  return 'text-muted'
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
      </div>
    </UCard>

    <!-- 候選 sticky section -->
    <UCard
      class="sticky z-20 bg-default/95 backdrop-blur supports-[backdrop-filter]:bg-default/70 ring-1 ring-emerald-500/40"
      :style="stickyStyle"
      :ui="{ body: 'p-3 sm:p-4' }"
    >
      <div class="space-y-3 text-xs">
        <!-- 下一期候選 -->
        <div class="space-y-2">
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
              <span class="font-mono">隔期 {{ row.interval }}</span>
              <span class="text-muted">
                候選 {{ row.candidateCount }} / 原 {{ row.rawCount }}
              </span>
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

        <!-- 最新一期回顧 -->
        <div class="mt-3 border-t border-default pt-2 space-y-2">
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
              <span class="inline-block w-3 h-3 rounded bg-emerald-500" />
              中（候選且開出）
            </span>
            <span class="inline-flex items-center gap-1">
              <span class="inline-block w-3 h-3 rounded border border-default bg-default" />
              候選沒開
            </span>
            <span class="inline-flex items-center gap-1">
              <span class="inline-block w-3 h-3 rounded bg-red-500" />
              漏（被扣但開了）
            </span>
            <span class="inline-flex items-center gap-1">
              <span class="inline-block w-3 h-3 rounded bg-elevated/40 line-through" />
              扣對（被扣且沒開）
            </span>
          </div>
          <div
            v-for="row in reviewRows"
            :key="`review-${row.interval}`"
            class="space-y-1"
          >
            <div class="flex items-baseline gap-2 flex-wrap text-[10px]">
              <span class="font-mono">隔期 {{ row.interval }}</span>
              <span class="text-muted">
                候選 {{ row.candidateCount }} / 原 {{ row.rawCount }}
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
      </div>
    </UCard>

    <!-- 歷史候選回顧 -->
    <section class="space-y-2">
      <header class="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 class="text-base font-semibold">
          歷史候選回顧
        </h3>
        <span class="text-xs text-muted">
          顯示最近 {{ historicalCards.length }} 期 · 最新在上
        </span>
      </header>

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
          </div>
          <div
            v-for="row in card.rows"
            :key="`hist-${card.drawTerm}-${row.interval}`"
            class="space-y-1"
          >
            <div class="flex items-baseline gap-2 flex-wrap text-[10px]">
              <span class="font-mono">隔期 {{ row.interval }}</span>
              <span class="text-muted">
                候選 {{ row.candidateCount }} / 原 {{ row.rawCount }}
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
