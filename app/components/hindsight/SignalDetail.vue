<script setup lang="ts">
/**
 * 單支訊號的詳細頁。
 *
 * 釘頂：條件 + 推薦策略 + 累積命中率
 * 主體：歷史證據鏈 4 欄表（期數 / 推了哪幾個 / 實際開出 / 中了幾顆）
 * 底部：常一起亮燈的訊號（coFiringCounts 排序）
 */

import type { GameId } from '~~/shared/lotto/games'
import { bingoTimeFromMap, buildBingoMinTermByDate } from '~/utils/bingo-time'
import { N0, baselineHitRate } from '~/hindsight/config'
import { recentHitRate, smoothedHitRate } from '~/hindsight/scorecard'
import { getSignalsForGame } from '~/hindsight/registry'
import { slotCountForOriginDistribution } from '~/hindsight/signals/bingo-origin-distribution'
import type { AnalysisState } from '~/utils/analysis'
import type {
  BrainDraw,
  BrainState,
  OriginDistributionData,
  OriginIntervalEntry,
  SignalDef,
  SignalScorecard
} from '~/hindsight/types'

interface Props {
  gameId: GameId
  signalId: string
  brainState: BrainState | null
  drawsAsc: BrainDraw[]
  /**
   * 即時分析狀態（已含最新一期 T 的處理結果）。
   * 訊號 10 的「隔期剩餘號碼」一卡需要用這份即時狀態，
   * 才能完全對齊 draws 頁「原始分析 → 隔期狀態」看到的數字。
   */
  analysisState: AnalysisState | null
  /**
   * 隱藏「回訊號牆」按鈕。賓果海尼根頁設 true（本頁無上層列表可回）。
   */
  hideBackButton?: boolean
  /**
   * 是否讓條件區（獎號隔期來源標題卡）sticky 釘頂。
   * /hindsight 訊號牆內預設 true、賓果海尼根頁傳 false（讓條件區跟著滾走、不擋住下方）。
   */
  stickyConditionCard?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  hideBackButton: false,
  stickyConditionCard: true
})

// 條件區實際高度 — 用 ResizeObserver 動態量、暴露給 #before-origin slot
// 讓賓果海尼根頁的全壘打 sticky 能精準堆疊在條件區下方。
const condCard = useTemplateRef<HTMLElement>('condCard')
const condCardHeight = ref(0)
let condResizeObserver: ResizeObserver | null = null
onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return
  const el = condCard.value
  if (!el) return
  condCardHeight.value = el.offsetHeight
  condResizeObserver = new ResizeObserver(() => {
    if (condCard.value) condCardHeight.value = condCard.value.offsetHeight
  })
  condResizeObserver.observe(el)
})
onBeforeUnmount(() => {
  condResizeObserver?.disconnect()
  condResizeObserver = null
})

// slot 暴露的 sticky 偏移：條件區若不 sticky，全壘打就直接黏 top:0；
// 條件區 sticky 時用條件區動態高度。
const stickyTopOffsetForSlot = computed(() => {
  return props.stickyConditionCard ? condCardHeight.value : 0
})

// 隔期剩餘號碼 / 觀察紀錄 兩 section 可收合（兩處共用）。
const originLatestOpen = ref(true)
const evidenceOpen = ref(true)
const emit = defineEmits<{
  close: []
}>()

const baseline = computed(() => baselineHitRate(props.gameId))
const SAMPLE_FLOOR = 30

const signal = computed<SignalDef | null>(() => {
  const all = getSignalsForGame(props.gameId)
  return all.find(s => s.id === props.signalId) ?? null
})

const scorecard = computed<SignalScorecard | null>(() => {
  return props.brainState?.scorecards[props.signalId] ?? null
})

const cumulativeRate = computed<number>(() => {
  if (!scorecard.value) return baseline.value
  return smoothedHitRate(scorecard.value, baseline.value, N0)
})

const recentRate = computed<number | null>(() => {
  if (!scorecard.value) return null
  return recentHitRate(scorecard.value, 20)
})

const isObservation = computed<boolean>(() => signal.value?.kind === 'observation')
const sampleLow = computed<boolean>(() => !isObservation.value && (scorecard.value?.totalPicks ?? 0) < SAMPLE_FLOOR)

interface EvidenceRow {
  drawTerm: number
  drawDate: string
  picks: number[]
  actual: number[]
  hits: number
  hitNumbers: number[]
  observationLabels: string[]
  /** 訊號 7 結構化 y 值，UI 用染色 chip 顯示。其他訊號為空。 */
  latestYs: number[]
  /** 訊號 10 每隔期擷取資訊（hits/分母/位置 y）；用來渲染觀察表「位置」欄。其他訊號為 undefined。 */
  originPerInterval?: OriginIntervalEntry[]
}

// 2026-06-11 拍板：訊號 7 y 值染色 mapping（紅橙綠藍紫粉，Nuxt UI 4 text-{color}-500）
const Y_COLOR_CLASS: Record<number, string> = {
  1: 'text-red-500',
  2: 'text-orange-500',
  3: 'text-emerald-500',
  4: 'text-sky-500',
  5: 'text-violet-500',
  6: 'text-pink-500'
}
function yColorClass(y: number): string {
  return Y_COLOR_CLASS[y] ?? 'text-muted'
}

const drawByTerm = computed<Map<number, BrainDraw>>(() => {
  const m = new Map<number, BrainDraw>()
  for (const d of props.drawsAsc) m.set(d.drawTerm, d)
  return m
})

// 賓果：歷史每期都要顯示時間（[[reference-hindsight-must-read]] 之外的賓果顯示需求）
const isBingo = computed(() => props.gameId === 'bingo_bingo')
const bingoMinTermByDate = computed<Map<string, number>>(() => {
  if (!isBingo.value) return new Map()
  return buildBingoMinTermByDate(props.drawsAsc)
})
function bingoTime(drawDate: string, drawTerm: number): string {
  return bingoTimeFromMap(bingoMinTermByDate.value, drawDate, drawTerm)
}

// 訊號 10：用即時 analysisState 算「隔期剩餘號碼」一卡，post-T 視角。
//
// 上方卡顯示 post-T periods[0..(slotCount-1)]：
//   隔期 0 = periods[0] = T 本期主號（沒擷取過）
//   隔期 1..(slotCount-1) = periods[1..(slotCount-1)] = T-1 / T-2 / ... 期格被擷取後的剩餘
//
// SLOT_COUNT 依彩種：賓果 4 格、其他彩種 6 格（slotCountForOriginDistribution）
//
// 連莊（隔期 0 紅框）= T 期 csv 值 = 0 對應的 sorted-unique T 主號 = T ∩ T-1
//   （T 從 T-1 期格擷取的；顯示在 T 本期主號裡跟 T-1 重疊的那幾顆）
//
// hits/remaining 在這張卡上不顯示（卡只顯示 remainingNumbers）；
// 下方觀察紀錄表用的 hits/remaining 在訊號 evaluate 裡算、走 firing.observationLabels 路徑。
const signal10SlotCount = computed<number>(() => slotCountForOriginDistribution(props.gameId))
interface OriginLatestData {
  drawTerm: number
  drawDate: string
  data: OriginDistributionData
  carryoverSet: Set<number>
}
function parsePeriodsCsvLocal(csv: string | undefined): Array<number | null> {
  if (!csv) return []
  return csv.split(',').map((s) => {
    if (s === '') return null
    const v = Number.parseInt(s, 10)
    return Number.isFinite(v) ? v : null
  })
}
function parsePrizesCsvLocal(csv: string | undefined): number[] {
  if (!csv) return []
  const out: number[] = []
  for (const s of csv.split(',')) {
    const v = Number.parseInt(s, 10)
    if (Number.isFinite(v)) out.push(v)
  }
  return out
}
const originLatest = computed<OriginLatestData | null>(() => {
  if (props.signalId !== 'bingo_origin_distribution') return null
  const as = props.analysisState
  if (!as) return null
  if (as.history.length === 0) return null
  const slotCount = signal10SlotCount.value
  if (as.periods.length < slotCount) return null

  const tEntry = as.history[as.history.length - 1]!
  const drawTerm = Number.parseInt(tEntry.issue, 10)
  if (!Number.isFinite(drawTerm)) return null

  const tCsvIdxs = parsePeriodsCsvLocal(tEntry.periods)
  const tNumsSorted = parsePrizesCsvLocal(tEntry.prizes)

  const perInterval: OriginIntervalEntry[] = []
  for (let j = 0; j < slotCount; j++) {
    const slot = as.periods[j]!
    const remainingNumbers = [...slot.prizes].sort((a, b) => a - b)
    perInterval.push({
      // hits / remaining / positionYs 在卡上不顯示，這邊只是塞個值維持型別
      interval: j,
      hits: 0,
      remaining: remainingNumbers.length,
      remainingNumbers,
      positionYs: []
    })
  }

  // 連莊（隔期 0 紅框）= T 期 csv 值 = 0 對應的 sorted-unique T 號 = T ∩ T-1
  const period0Set = new Set(as.periods[0]!.prizes)
  const carryover: number[] = []
  for (let i = 0; i < tCsvIdxs.length; i++) {
    if (tCsvIdxs[i] === 0) {
      const n = tNumsSorted[i]
      if (typeof n === 'number' && period0Set.has(n)) carryover.push(n)
    }
  }
  carryover.sort((a, b) => a - b)

  return {
    drawTerm,
    drawDate: tEntry.date,
    data: {
      perInterval,
      totalHits: 0,
      totalRemaining: 0,
      carryoverInPeriod0: carryover
    },
    carryoverSet: new Set(carryover)
  }
})

const evidence = computed<EvidenceRow[]>(() => {
  if (!scorecard.value) return []
  const out: EvidenceRow[] = []
  for (const f of [...scorecard.value.recentFirings].reverse()) {
    const actual = drawByTerm.value.get(f.drawTerm)?.numbers ?? []
    const latestYs = f.observationData?.latestYs ?? []
    // 訊號 7：有 latestYs 時，移除 observationLabels 中以「本期 y 組成」開頭那條
    // （已被結構化資料取代），避免重複顯示。
    const rawLabels = f.observationLabels ?? []
    const filteredLabels = latestYs.length > 0
      ? rawLabels.filter(l => !l.startsWith('本期 y 組成'))
      : rawLabels
    out.push({
      drawTerm: f.drawTerm,
      drawDate: f.drawDate,
      picks: f.picks,
      actual,
      hits: f.hits ?? 0,
      hitNumbers: f.hitNumbers ?? [],
      observationLabels: filteredLabels,
      latestYs,
      originPerInterval: f.observationData?.originDistribution?.perInterval
    })
  }
  return out
})

interface CoFiringRow {
  signalId: string
  nameZh: string
  count: number
}

const coFirings = computed<CoFiringRow[]>(() => {
  if (!scorecard.value) return []
  const all = getSignalsForGame(props.gameId)
  const nameMap = new Map(all.map(s => [s.id, s.nameZh]))
  return Object.entries(scorecard.value.coFiringCounts)
    .map(([id, count]) => ({
      signalId: id,
      nameZh: nameMap.get(id) ?? id,
      count
    }))
    .sort((a, b) => b.count - a.count)
})

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function rateText(v: number | null): string {
  if (v == null) return '—'
  return `${(v * 100).toFixed(1)}%`
}

function isHit(num: number, hits: number[]): boolean {
  return hits.includes(num)
}
</script>

<template>
  <div class="space-y-4">
    <div
      v-if="!props.hideBackButton"
      class="flex items-center gap-2"
    >
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-arrow-left"
        @click="emit('close')"
      >
        回訊號牆
      </UButton>
    </div>

    <div
      v-if="!signal"
      class="rounded-md border border-dashed border-default p-6 text-center text-xs text-muted"
    >
      找不到訊號 {{ signalId }}
    </div>

    <template v-else>
      <!-- 條件區（預設釘頂；賓果海尼根頁傳 stickyConditionCard=false 取消 sticky） -->
      <div
        ref="condCard"
        :class="[
          props.stickyConditionCard ? 'sticky top-0 z-10' : '',
          '-mx-2 sm:-mx-4 px-2 sm:px-4 pt-2 pb-3 bg-default/95 backdrop-blur supports-[backdrop-filter]:bg-default/70'
        ]"
      >
        <UCard :ui="{ body: 'p-4' }">
          <div class="space-y-2">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h3 class="text-base font-semibold">
                {{ signal.nameZh }}
              </h3>
              <UBadge
                v-if="isObservation"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                觀察型
              </UBadge>
              <UBadge
                v-else-if="sampleLow"
                color="warning"
                variant="subtle"
                size="sm"
              >
                ⚠ 樣本不足
              </UBadge>
            </div>
            <p class="text-xs text-muted">
              {{ signal.description }}
            </p>
            <div
              v-if="!isObservation"
              class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums"
            >
              <span>
                <span class="text-muted">累積命中率</span>
                <span class="ml-1 font-mono">{{ rateText(cumulativeRate) }}</span>
              </span>
              <span>
                <span class="text-muted">最近 20 期</span>
                <span class="ml-1 font-mono">{{ rateText(recentRate) }}</span>
              </span>
              <span>
                <span class="text-muted">亮燈次數</span>
                <span class="ml-1 font-mono">{{ scorecard?.totalFires ?? 0 }}</span>
              </span>
              <span>
                <span class="text-muted">累積中/推</span>
                <span class="ml-1 font-mono">{{ scorecard?.totalHits ?? 0 }}/{{ scorecard?.totalPicks ?? 0 }}</span>
              </span>
            </div>
            <div
              v-else
              class="text-xs tabular-nums"
            >
              <span class="text-muted">已觀察</span>
              <span class="ml-1 font-mono">{{ scorecard?.totalFires ?? 0 }}</span>
              <span class="text-muted"> 次</span>
            </div>
          </div>
        </UCard>
      </div>

      <!-- 賓果海尼根頁專用：在「隔期剩餘號碼」之上插入「全壘打」 section
           - slot prop `sticky-top-offset` 提供 sticky 偏移；條件區 sticky 時 = 條件區高度，
             條件區不 sticky 時 = 0（slot 內 sticky 直接黏 top:0） -->
      <slot
        v-if="originLatest"
        name="before-origin"
        :origin-latest="originLatest"
        :sticky-top-offset="stickyTopOffsetForSlot"
      />

      <!-- 訊號 10 專屬：最新一期當下的隔期 0-3 剩餘號碼一覽（連莊號紅框） -->
      <section
        v-if="originLatest"
        class="space-y-2"
      >
        <div class="flex items-center justify-between gap-2">
          <h4 class="text-sm font-semibold">
            隔期剩餘號碼
          </h4>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :icon="originLatestOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            :aria-expanded="originLatestOpen"
            aria-controls="signal-detail-origin-latest"
            @click="originLatestOpen = !originLatestOpen"
          >
            {{ originLatestOpen ? '收合' : '展開' }}
          </UButton>
        </div>
        <UCard
          v-if="originLatestOpen"
          id="signal-detail-origin-latest"
          :ui="{ body: 'p-4' }"
        >
          <div class="space-y-3">
            <div class="text-xs text-muted">
              第 <span class="font-mono">{{ originLatest.drawTerm }}</span> 期 · {{ originLatest.drawDate }}<span
                v-if="isBingo && bingoTime(originLatest.drawDate, originLatest.drawTerm)"
                class="ml-1 font-mono"
              >{{ bingoTime(originLatest.drawDate, originLatest.drawTerm) }}</span>
            </div>
            <div
              v-for="p in originLatest.data.perInterval"
              :key="`origin-row-${p.interval}`"
              class="space-y-1"
            >
              <div class="text-[11px] text-muted">
                隔期 {{ p.interval }}（{{ p.remainingNumbers.length }} 顆）
              </div>
              <div class="flex flex-wrap items-center gap-1.5">
                <UBadge
                  v-for="n in p.remainingNumbers"
                  :key="`origin-${p.interval}-${n}`"
                  color="warning"
                  variant="solid"
                  size="md"
                  class="min-w-8 justify-center font-mono"
                  :class="p.interval === 0 && originLatest.carryoverSet.has(n) ? 'ring-2 ring-red-500' : ''"
                >
                  {{ n.toString().padStart(2, '0') }}
                </UBadge>
                <span
                  v-if="p.remainingNumbers.length === 0"
                  class="text-xs text-muted"
                >—</span>
              </div>
            </div>
          </div>
        </UCard>
      </section>

      <!-- 歷史證據鏈 / 觀察紀錄（依 isObservation 切換標題） -->
      <section class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <h4 class="text-sm font-semibold">
            {{ isObservation ? '觀察紀錄' : '歷史證據鏈' }}
          </h4>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :icon="evidenceOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            :aria-expanded="evidenceOpen"
            aria-controls="signal-detail-evidence"
            @click="evidenceOpen = !evidenceOpen"
          >
            {{ evidenceOpen ? '收合' : '展開' }}
          </UButton>
        </div>
        <div
          v-if="evidenceOpen && evidence.length === 0"
          id="signal-detail-evidence"
          class="rounded-md border border-dashed border-default p-4 text-center text-xs text-muted"
        >
          尚無亮燈紀錄
        </div>
        <UCard
          v-else-if="evidenceOpen"
          id="signal-detail-evidence"
          :ui="{ body: 'p-0 sm:p-0' }"
        >
          <div class="overflow-x-auto">
            <!-- 預測型：完整證據鏈 -->
            <table
              v-if="!isObservation"
              class="w-full text-xs"
            >
              <thead class="bg-elevated text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th class="px-3 py-2 text-left">
                    期數
                  </th>
                  <th class="px-3 py-2 text-left">
                    推了哪幾個
                  </th>
                  <th class="px-3 py-2 text-left">
                    實際開出
                  </th>
                  <th class="px-3 py-2 text-right">
                    中
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in evidence"
                  :key="`ev-${row.drawTerm}`"
                  class="border-t border-default align-top"
                >
                  <td class="px-3 py-2 font-mono whitespace-nowrap">
                    {{ row.drawTerm }}<br>
                    <span class="text-[10px] text-muted">{{ row.drawDate }}<span
                      v-if="isBingo && bingoTime(row.drawDate, row.drawTerm)"
                      class="ml-1"
                    >{{ bingoTime(row.drawDate, row.drawTerm) }}</span></span>
                  </td>
                  <td class="px-3 py-2">
                    <div class="flex flex-wrap items-center gap-1">
                      <UBadge
                        v-for="n in row.picks"
                        :key="`p-${row.drawTerm}-${n}`"
                        :color="isHit(n, row.hitNumbers) ? 'success' : 'neutral'"
                        :variant="isHit(n, row.hitNumbers) ? 'solid' : 'subtle'"
                        size="sm"
                        class="min-w-7 justify-center font-mono"
                      >
                        {{ pad(n) }}
                      </UBadge>
                    </div>
                  </td>
                  <td class="px-3 py-2">
                    <div
                      v-if="row.actual.length === 0"
                      class="text-muted"
                    >
                      —
                    </div>
                    <div
                      v-else
                      class="flex flex-wrap items-center gap-1"
                    >
                      <UBadge
                        v-for="n in row.actual"
                        :key="`a-${row.drawTerm}-${n}`"
                        color="warning"
                        variant="solid"
                        size="sm"
                        class="min-w-7 justify-center font-mono"
                      >
                        {{ pad(n) }}
                      </UBadge>
                    </div>
                  </td>
                  <td
                    class="px-3 py-2 text-right font-mono tabular-nums"
                    :class="row.hits > 0 ? 'text-emerald-500' : 'text-muted'"
                  >
                    {{ row.hits }}/{{ row.picks.length }}
                  </td>
                </tr>
              </tbody>
            </table>
            <!-- 觀察型：印出每期當時的觀察文字 -->
            <table
              v-else
              class="w-full text-xs"
            >
              <thead class="bg-elevated text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th class="px-3 py-2 text-left whitespace-nowrap">
                    期數
                  </th>
                  <th class="px-3 py-2 text-left">
                    當期觀察
                  </th>
                  <th
                    v-if="signalId === 'bingo_origin_distribution'"
                    class="px-3 py-2 text-left whitespace-nowrap"
                  >
                    位置
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in evidence"
                  :key="`ob-${row.drawTerm}`"
                  class="border-t border-default align-top"
                >
                  <td class="px-3 py-2 font-mono whitespace-nowrap">
                    {{ row.drawTerm }}
                    <br>
                    <span class="text-[10px] text-muted">{{ row.drawDate }}<span
                      v-if="isBingo && bingoTime(row.drawDate, row.drawTerm)"
                      class="ml-1"
                    >{{ bingoTime(row.drawDate, row.drawTerm) }}</span></span>
                  </td>
                  <td class="px-3 py-2">
                    <!-- 訊號 7：本期 y 組成染色 chip -->
                    <div
                      v-if="row.latestYs.length > 0"
                      class="mb-1 flex flex-wrap items-center gap-1"
                    >
                      <span class="text-muted leading-snug">本期 y 組成：</span>
                      <span
                        v-for="(y, i) in row.latestYs"
                        :key="`y-${row.drawTerm}-${i}`"
                        :class="['inline-flex min-w-5 justify-center rounded border border-default px-1.5 py-0.5 text-xs font-mono font-semibold', yColorClass(y)]"
                      >
                        {{ y }}
                      </span>
                    </div>
                    <div
                      v-if="row.observationLabels.length > 0"
                      class="flex flex-col gap-1"
                    >
                      <span
                        v-for="(lbl, i) in row.observationLabels"
                        :key="`${row.drawTerm}-${i}`"
                        class="text-muted leading-snug"
                      >
                        {{ lbl }}
                      </span>
                    </div>
                    <span
                      v-else-if="row.latestYs.length === 0"
                      class="text-muted"
                    >—（早期紀錄，請待下次 replay 補齊）</span>
                  </td>
                  <!-- 訊號 10：位置 y 值欄（與「當期觀察」前 4 行隔期對齊） -->
                  <td
                    v-if="signalId === 'bingo_origin_distribution'"
                    class="px-3 py-2 align-top"
                  >
                    <div
                      v-if="row.originPerInterval && row.originPerInterval.length > 0"
                      class="flex flex-col gap-1"
                    >
                      <span
                        v-for="p in row.originPerInterval"
                        :key="`pos-${row.drawTerm}-${p.interval}`"
                        class="font-mono text-muted leading-snug"
                      >
                        {{ p.positionYs && p.positionYs.length > 0 ? p.positionYs.join(', ') : '—' }}
                      </span>
                    </div>
                    <span
                      v-else
                      class="text-muted"
                    >—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
      </section>

      <!-- 常一起亮燈 -->
      <section class="space-y-2">
        <h4 class="text-sm font-semibold">
          常一起亮燈的訊號
        </h4>
        <div
          v-if="coFirings.length === 0"
          class="rounded-md border border-dashed border-default p-4 text-center text-xs text-muted"
        >
          —
        </div>
        <UCard
          v-else
          :ui="{ body: 'p-4' }"
        >
          <ul class="space-y-1.5 text-xs">
            <li
              v-for="co in coFirings"
              :key="`co-${co.signalId}`"
              class="flex items-center justify-between"
            >
              <span>{{ co.nameZh }}</span>
              <span class="font-mono tabular-nums text-muted">{{ co.count }} 次共燈</span>
            </li>
          </ul>
        </UCard>
      </section>
    </template>
  </div>
</template>
