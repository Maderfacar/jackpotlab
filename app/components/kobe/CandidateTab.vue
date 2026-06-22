<script setup lang="ts">
/**
 * /kobe Tab 0 「候選」
 *
 * 結構：
 *   1. 控制台（最近 N 期截斷下方觀察紀錄、不影響 2000 期統計）
 *   2. sticky 候選 section（避開頂部 UHeader）
 *      - 下一期候選（待開獎）：用 finalState 算
 *      - 最新一期回顧：用 preLatestState 算、與實際開獎比對
 *   3. 觀察紀錄列表（複用 KobeObservationTab + visibleCount 截斷）
 *
 * 候選邏輯（隔期 0..3）：
 *   raw = state.periods[j].prizes（post-T sorted）
 *   positionYs = snapshots 從尾巴往前掃、最近一個 slot[j].hits > 0 的 hitPositions
 *   扣位置：raw 中 1-indexed 位置 ∈ positionYs 的號碼移除
 *   扣紅框（僅 j=0）：上兩期共同號（連莊）移除
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

interface CandidateEntry {
  n: number
  /** 在 raw post-T sorted 內的 1-indexed 位置 */
  position: number
}
interface CandidateRow {
  interval: number
  rawCount: number
  removedByPositions: number[]
  removedByCarryover: number[]
  /** 過濾後候選號（保留位置） */
  candidates: CandidateEntry[]
}

function findLatestPositionYsForInterval(j: number, upToIdx: number): number[] {
  for (let i = upToIdx; i >= 1; i--) {
    const slot = props.snapshots[i]?.slots[j]
    if (!slot) continue
    if (slot.hitsThisDraw > 0) return [...slot.hitPositions]
  }
  return []
}

function computeCandidateRow(
  state: AnalysisState | null,
  j: number,
  snapshotsUpTo: number,
  carryoverSet: ReadonlySet<number>
): CandidateRow | null {
  if (!state) return null
  const slot = state.periods[j]
  if (!slot) return null
  const raw = [...slot.prizes].sort((a, b) => a - b)
  const positionYs = findLatestPositionYsForInterval(j, snapshotsUpTo)
  const posSet = new Set<number>()
  for (const y of positionYs) {
    if (y >= 1 && y <= raw.length) posSet.add(y)
  }
  const removedByPositions: number[] = []
  const afterPos: CandidateEntry[] = []
  raw.forEach((n, idx) => {
    const pos = idx + 1
    if (posSet.has(pos)) removedByPositions.push(n)
    else afterPos.push({ n, position: pos })
  })
  const removedByCarryover: number[] = []
  let final: CandidateEntry[] = afterPos
  if (j === 0 && carryoverSet.size > 0) {
    final = []
    for (const e of afterPos) {
      if (carryoverSet.has(e.n)) removedByCarryover.push(e.n)
      else final.push(e)
    }
  }
  return { interval: j, rawCount: raw.length, removedByPositions, removedByCarryover, candidates: final }
}

// 連莊：下一期預測 → drawsAsc[-1] ∩ drawsAsc[-2]
const nextCarryoverSet = computed<Set<number>>(() => {
  const arr = props.drawsAsc
  if (arr.length < 2) return new Set()
  const last = arr.at(-1)!.numbers
  const sl = new Set(arr.at(-2)!.numbers)
  return new Set(last.filter(n => sl.has(n)))
})
// 最新一期回顧連莊 → drawsAsc[-2] ∩ drawsAsc[-3]
const reviewCarryoverSet = computed<Set<number>>(() => {
  const arr = props.drawsAsc
  if (arr.length < 3) return new Set()
  const last = arr.at(-2)!.numbers
  const sl = new Set(arr.at(-3)!.numbers)
  return new Set(last.filter(n => sl.has(n)))
})

const nextRows = computed<CandidateRow[]>(() => {
  const rows: CandidateRow[] = []
  const upToIdx = props.snapshots.length - 1
  for (const j of TARGET_INTERVALS) {
    const r = computeCandidateRow(props.finalState, j, upToIdx, nextCarryoverSet.value)
    if (r) rows.push(r)
  }
  return rows
})

const reviewRows = computed<CandidateRow[]>(() => {
  const rows: CandidateRow[] = []
  // snapshots.at(-1) 是「處理最新一期前」的 pre-T；找最近位置時上限是這之前
  const upToIdx = props.snapshots.length - 2
  for (const j of TARGET_INTERVALS) {
    const r = computeCandidateRow(props.preLatestState, j, upToIdx, reviewCarryoverSet.value)
    if (r) rows.push(r)
  }
  return rows
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

const latestActualSet = computed<Set<number>>(() => {
  return new Set(props.drawsAsc.at(-1)?.numbers ?? [])
})

function isHit(entry: CandidateEntry): boolean {
  return latestActualSet.value.has(entry.n)
}

function rowHits(row: CandidateRow): number {
  let h = 0
  for (const e of row.candidates) {
    if (latestActualSet.value.has(e.n)) h++
  }
  return h
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
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
          <span class="text-muted">下方觀察紀錄顯示最近</span>
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
        <!-- 下一期候選 header -->
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
            <span class="text-muted">目標 {{ row.candidates.length }} 顆</span>
            <span class="text-muted">
              （原 {{ row.rawCount }} 扣位置 {{ row.removedByPositions.length }}<span v-if="row.interval === 0">、紅框 {{ row.removedByCarryover.length }}</span>）
            </span>
          </div>
          <div
            v-if="row.candidates.length === 0"
            class="text-[10px] text-muted"
          >
            無候選號
          </div>
          <div
            v-else
            class="flex flex-wrap items-center gap-1"
          >
            <UBadge
              v-for="e in row.candidates"
              :key="`next-${row.interval}-${e.n}`"
              color="neutral"
              variant="outline"
              size="sm"
              class="relative min-w-7 justify-center font-mono"
            >
              {{ pad(e.n) }}
              <span class="absolute bottom-0 right-0.5 text-[8px] leading-none font-normal text-muted">
                {{ e.position }}
              </span>
            </UBadge>
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
            <span class="text-[10px] text-muted">已開出 · 候選號染綠者 = 命中</span>
          </div>
          <div
            v-for="row in reviewRows"
            :key="`review-${row.interval}`"
            class="space-y-1"
          >
            <div class="flex items-baseline gap-2 flex-wrap text-[10px]">
              <span class="font-mono">隔期 {{ row.interval }}</span>
              <span class="text-muted">
                中 {{ rowHits(row) }} / {{ row.candidates.length }} 顆
              </span>
              <span class="text-muted">
                （原 {{ row.rawCount }} 扣位置 {{ row.removedByPositions.length }}<span v-if="row.interval === 0">、紅框 {{ row.removedByCarryover.length }}</span>）
              </span>
            </div>
            <div
              v-if="row.candidates.length === 0"
              class="text-[10px] text-muted"
            >
              無候選號
            </div>
            <div
              v-else
              class="flex flex-wrap items-center gap-1"
            >
              <UBadge
                v-for="e in row.candidates"
                :key="`review-${row.interval}-${e.n}`"
                :color="isHit(e) ? 'success' : 'neutral'"
                :variant="isHit(e) ? 'solid' : 'outline'"
                size="sm"
                class="relative min-w-7 justify-center font-mono"
              >
                {{ pad(e.n) }}
                <span
                  class="absolute bottom-0 right-0.5 text-[8px] leading-none font-normal"
                  :class="isHit(e) ? 'text-black' : 'text-muted'"
                >
                  {{ e.position }}
                </span>
              </UBadge>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- 觀察紀錄列表（按 recentN 截斷） -->
    <KobeObservationTab
      :snapshots="snapshots"
      :interval-count="intervalCount"
      :visible-count="recentN"
    />
  </div>
</template>
