<script setup lang="ts">
/**
 * /kobe Tab 5 「號碼軌跡」（Phase 4）
 *
 * 三塊：
 *   1. 號碼總覽表 — 80 個號的速覽，欄位可點擊排序。顯著偏離期望（±10%）的號用顏色標。
 *   2. 號碼明細 — 點某個號展開：時間序點圖（x = 期、y = 來源隔期）。
 *   3. 來源隔期分布 — 該號從各隔期被命中的次數分布（橫向 bar）。
 *
 * 用語規則（柯比頁全頁守則）：
 *   - 不出現 inter-arrival / fat tail 等英文。
 *   - 改寫：inter-arrival → 「間隔期數」；fat tail → 「最長乾期 ___ 期」。
 */
import type { PerDrawSnapshot, NumberHistoryRow } from '~/utils/kobe-stats'
import { buildNumberHistory } from '~/utils/kobe-stats'

interface Props { snapshots: PerDrawSnapshot[] }
const props = defineProps<Props>()

const DEVIATION_HIGHLIGHT = 0.10

type SortKey = 'number' | 'appearances' | 'deviation' | 'avgGap' | 'maxGap' | 'consecutiveCount'

const rows = computed<NumberHistoryRow[]>(() => buildNumberHistory(props.snapshots))
const effectiveDraws = computed(() => Math.max(0, props.snapshots.length - 1))
const expectedAppearances = computed(() => rows.value[0]?.expectedAppearances ?? 0)

const sortKey = ref<SortKey>('number')
const sortDir = ref<'asc' | 'desc'>('asc')

function deviationPct(row: NumberHistoryRow): number {
  if (row.expectedAppearances <= 0) return 0
  return (row.appearances - row.expectedAppearances) / row.expectedAppearances
}

const sortedRows = computed<NumberHistoryRow[]>(() => {
  const arr = [...rows.value]
  const dir = sortDir.value === 'asc' ? 1 : -1
  arr.sort((a, b) => {
    let av = 0
    let bv = 0
    switch (sortKey.value) {
      case 'number':
        av = a.number
        bv = b.number
        break
      case 'appearances':
        av = a.appearances
        bv = b.appearances
        break
      case 'deviation':
        av = deviationPct(a)
        bv = deviationPct(b)
        break
      case 'avgGap':
        av = a.avgGap
        bv = b.avgGap
        break
      case 'maxGap':
        av = a.maxGap
        bv = b.maxGap
        break
      case 'consecutiveCount':
        av = a.consecutiveCount
        bv = b.consecutiveCount
        break
    }
    if (av === bv) return a.number - b.number
    return (av - bv) * dir
  })
  return arr
})

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = key === 'number' ? 'asc' : 'desc'
  }
}

const selectedNumber = ref<number | null>(null)
const selectedRow = computed<NumberHistoryRow | null>(() => {
  if (selectedNumber.value == null) return null
  return rows.value.find(r => r.number === selectedNumber.value) ?? null
})

function selectNumber(n: number) {
  selectedNumber.value = selectedNumber.value === n ? null : n
}

function deviationClass(row: NumberHistoryRow): string {
  const d = deviationPct(row)
  if (d >= DEVIATION_HIGHLIGHT) return 'text-emerald-600 dark:text-emerald-400'
  if (d <= -DEVIATION_HIGHLIGHT) return 'text-sky-600 dark:text-sky-400'
  return ''
}
function rowBgClass(row: NumberHistoryRow): string {
  if (selectedRow.value?.number === row.number) return 'bg-emerald-500/10'
  return ''
}
function sortIcon(key: SortKey): string {
  if (sortKey.value !== key) return 'i-lucide-chevrons-up-down'
  return sortDir.value === 'asc' ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}
function fmtPct(v: number): string {
  const pct = v * 100
  if (Math.abs(pct) >= 10) return `${pct.toFixed(1)}%`
  return `${pct.toFixed(2)}%`
}
function fmtMean(v: number): string {
  return v.toFixed(2)
}

// ---- 時間序圖 ----
const TS_W = 800
const TS_H = 220
const TS_PAD_L = 38
const TS_PAD_R = 8
const TS_PAD_T = 18
const TS_PAD_B = 22
const TS_NEW_BAND_H = 12

const intervalCount = computed(() => {
  const r = rows.value[0]
  return r ? r.sourceIntervalCounts.length : 60
})
const maxIndex = computed(() => Math.max(1, props.snapshots.length - 1))

function tsX(snapshotIndex: number): number {
  const innerW = TS_W - TS_PAD_L - TS_PAD_R
  return TS_PAD_L + (snapshotIndex / maxIndex.value) * innerW
}
function tsY(sourceInterval: number): number {
  // sourceInterval = -1 → 上方新號專屬 band 中央
  const newBandY = TS_PAD_T - TS_NEW_BAND_H / 2
  if (sourceInterval < 0) return newBandY + TS_NEW_BAND_H / 2
  const innerH = TS_H - TS_PAD_T - TS_PAD_B
  const N = intervalCount.value
  if (N <= 1) return TS_PAD_T + innerH / 2
  return TS_PAD_T + (sourceInterval / (N - 1)) * innerH
}

// ---- 來源隔期分布 ----
const sourceDistMax = computed(() => {
  if (!selectedRow.value) return 0
  let m = 0
  for (const c of selectedRow.value.sourceIntervalCounts) {
    if (c > m) m = c
  }
  return m
})

interface SourceBar {
  interval: number
  count: number
  ratio: number
}
const sourceBars = computed<SourceBar[]>(() => {
  const row = selectedRow.value
  if (!row) return []
  const max = sourceDistMax.value
  return row.sourceIntervalCounts.map((c, i) => ({
    interval: i,
    count: c,
    ratio: max > 0 ? c / max : 0
  }))
})

// 概要卡資料
const topHot = computed<NumberHistoryRow | null>(() => {
  if (rows.value.length === 0) return null
  let best = rows.value[0]!
  for (const r of rows.value) {
    if (r.appearances > best.appearances) best = r
  }
  return best
})
const topCold = computed<NumberHistoryRow | null>(() => {
  if (rows.value.length === 0) return null
  let best = rows.value[0]!
  for (const r of rows.value) {
    if (r.appearances < best.appearances) best = r
  }
  return best
})
const topMaxGap = computed<NumberHistoryRow | null>(() => {
  if (rows.value.length === 0) return null
  let best = rows.value[0]!
  for (const r of rows.value) {
    if (r.maxGap > best.maxGap) best = r
  }
  return best
})
</script>

<template>
  <div class="space-y-6">
    <!-- 概要卡 -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <UCard :ui="{ body: 'p-4' }">
        <div class="space-y-1">
          <div class="text-xs text-muted">
            出現最多的號
          </div>
          <div
            v-if="topHot"
            class="space-y-0.5"
          >
            <div class="font-mono text-base">
              {{ pad(topHot.number) }}
              <span class="text-xs text-emerald-600 dark:text-emerald-400">
                {{ topHot.appearances }} 次（{{ fmtPct(deviationPct(topHot)) }}）
              </span>
            </div>
            <div class="text-[11px] text-muted">
              理論平均 {{ expectedAppearances.toFixed(0) }} 次
            </div>
          </div>
        </div>
      </UCard>
      <UCard :ui="{ body: 'p-4' }">
        <div class="space-y-1">
          <div class="text-xs text-muted">
            出現最少的號
          </div>
          <div
            v-if="topCold"
            class="space-y-0.5"
          >
            <div class="font-mono text-base">
              {{ pad(topCold.number) }}
              <span class="text-xs text-sky-600 dark:text-sky-400">
                {{ topCold.appearances }} 次（{{ fmtPct(deviationPct(topCold)) }}）
              </span>
            </div>
            <div class="text-[11px] text-muted">
              理論平均 {{ expectedAppearances.toFixed(0) }} 次
            </div>
          </div>
        </div>
      </UCard>
      <UCard :ui="{ body: 'p-4' }">
        <div class="space-y-1">
          <div class="text-xs text-muted">
            最長乾期最久的號
          </div>
          <div
            v-if="topMaxGap"
            class="space-y-0.5"
          >
            <div class="font-mono text-base">
              {{ pad(topMaxGap.number) }}
              <span class="text-xs text-muted">
                最長乾期 {{ topMaxGap.maxGap }} 期
              </span>
            </div>
            <div class="text-[11px] text-muted">
              共出現 {{ topMaxGap.appearances }} 次
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Section 1: 號碼總覽表 -->
    <section class="space-y-2">
      <header class="space-y-1">
        <h3 class="text-base font-semibold">
          號碼總覽
        </h3>
        <p class="text-xs text-muted">
          80 個號過去 {{ effectiveDraws }} 期的總覽。每期開出 20 顆 ÷ 80 顆 ⇒ 每號理論平均 {{ expectedAppearances.toFixed(0) }} 次。
          總出現次數偏離期望 ±{{ fmtPct(DEVIATION_HIGHLIGHT) }} 的號上色（綠 = 偏熱、藍 = 偏冷）。
          點欄位標題切換排序、點橫列展開該號明細。
        </p>
      </header>

      <div class="overflow-x-auto rounded-md border border-default max-h-[600px]">
        <table class="min-w-max w-full text-[11px]">
          <thead class="sticky top-0 bg-default z-10">
            <tr class="border-b border-default text-muted">
              <th
                class="px-2 py-1.5 text-left font-medium whitespace-nowrap cursor-pointer hover:text-default"
                @click="toggleSort('number')"
              >
                號碼 <UIcon
                  :name="sortIcon('number')"
                  class="inline size-3"
                />
              </th>
              <th
                class="px-2 py-1.5 text-right font-medium whitespace-nowrap cursor-pointer hover:text-default"
                @click="toggleSort('appearances')"
              >
                總出現次數 <UIcon
                  :name="sortIcon('appearances')"
                  class="inline size-3"
                />
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                理論平均
              </th>
              <th
                class="px-2 py-1.5 text-right font-medium whitespace-nowrap cursor-pointer hover:text-default"
                @click="toggleSort('deviation')"
              >
                偏離 <UIcon
                  :name="sortIcon('deviation')"
                  class="inline size-3"
                />
              </th>
              <th
                class="px-2 py-1.5 text-right font-medium whitespace-nowrap cursor-pointer hover:text-default"
                @click="toggleSort('avgGap')"
              >
                平均間隔 <UIcon
                  :name="sortIcon('avgGap')"
                  class="inline size-3"
                />
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                中位間隔
              </th>
              <th
                class="px-2 py-1.5 text-right font-medium whitespace-nowrap cursor-pointer hover:text-default"
                @click="toggleSort('maxGap')"
              >
                最長乾期 <UIcon
                  :name="sortIcon('maxGap')"
                  class="inline size-3"
                />
              </th>
              <th
                class="px-2 py-1.5 text-right font-medium whitespace-nowrap cursor-pointer hover:text-default"
                @click="toggleSort('consecutiveCount')"
              >
                連兩期次數 <UIcon
                  :name="sortIcon('consecutiveCount')"
                  class="inline size-3"
                />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in sortedRows"
              :key="`num-${row.number}`"
              class="border-b border-default/60 cursor-pointer hover:bg-elevated"
              :class="rowBgClass(row)"
              @click="selectNumber(row.number)"
            >
              <td class="px-2 py-1 font-mono whitespace-nowrap">
                {{ pad(row.number) }}
              </td>
              <td
                class="px-2 py-1 text-right font-mono tabular-nums"
                :class="deviationClass(row)"
              >
                {{ row.appearances }}
              </td>
              <td class="px-2 py-1 text-right font-mono tabular-nums text-muted">
                {{ row.expectedAppearances.toFixed(0) }}
              </td>
              <td
                class="px-2 py-1 text-right font-mono tabular-nums"
                :class="deviationClass(row)"
              >
                {{ deviationPct(row) > 0 ? '+' : '' }}{{ fmtPct(deviationPct(row)) }}
              </td>
              <td class="px-2 py-1 text-right font-mono tabular-nums">
                {{ fmtMean(row.avgGap) }}
              </td>
              <td class="px-2 py-1 text-right font-mono tabular-nums text-muted">
                {{ fmtMean(row.medianGap) }}
              </td>
              <td class="px-2 py-1 text-right font-mono tabular-nums">
                {{ row.maxGap }}
              </td>
              <td class="px-2 py-1 text-right font-mono tabular-nums">
                {{ row.consecutiveCount }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Section 2 + 3: 號碼明細 -->
    <section
      v-if="selectedRow"
      class="space-y-2"
    >
      <header class="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 class="text-base font-semibold">
          號碼 {{ pad(selectedRow.number) }} 明細
        </h3>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-x"
          @click="selectedNumber = null"
        >
          收起
        </UButton>
      </header>

      <UCard :ui="{ body: 'p-4' }">
        <div class="space-y-4">
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div class="rounded border border-default p-2">
              <div class="text-muted">
                出現次數
              </div>
              <div
                class="font-mono text-base tabular-nums"
                :class="deviationClass(selectedRow)"
              >
                {{ selectedRow.appearances }}
              </div>
              <div class="text-[10px] text-muted">
                理論 {{ selectedRow.expectedAppearances.toFixed(0) }}（{{ deviationPct(selectedRow) > 0 ? '+' : '' }}{{ fmtPct(deviationPct(selectedRow)) }}）
              </div>
            </div>
            <div class="rounded border border-default p-2">
              <div class="text-muted">
                平均 / 中位間隔
              </div>
              <div class="font-mono text-base tabular-nums">
                {{ fmtMean(selectedRow.avgGap) }} / {{ fmtMean(selectedRow.medianGap) }}
              </div>
              <div class="text-[10px] text-muted">
                每幾期會回來一次
              </div>
            </div>
            <div class="rounded border border-default p-2">
              <div class="text-muted">
                最長乾期
              </div>
              <div class="font-mono text-base tabular-nums">
                {{ selectedRow.maxGap }} 期
              </div>
              <div class="text-[10px] text-muted">
                最久沒被開過
              </div>
            </div>
            <div class="rounded border border-default p-2">
              <div class="text-muted">
                連兩期出現
              </div>
              <div class="font-mono text-base tabular-nums">
                {{ selectedRow.consecutiveCount }} 次
              </div>
              <div class="text-[10px] text-muted">
                上一期剛開、下一期又開
              </div>
            </div>
          </div>

          <!-- 時間序點圖 -->
          <div class="space-y-1">
            <div class="text-xs text-muted">
              時間序：x 軸 = 期（越右越新）、y 軸 = 來源隔期（0 = 上一期才被開過、越下方代表越久之前被開過）。
              上方藍色 band = 新號（沒在追蹤的隔期內出現過）。
            </div>
            <div class="w-full overflow-x-auto">
              <svg
                :viewBox="`0 0 ${TS_W} ${TS_H}`"
                class="w-full max-w-full"
                preserveAspectRatio="xMidYMid meet"
              >
                <!-- 新號 band 背景 -->
                <rect
                  :x="TS_PAD_L"
                  :y="TS_PAD_T - TS_NEW_BAND_H"
                  :width="TS_W - TS_PAD_L - TS_PAD_R"
                  :height="TS_NEW_BAND_H"
                  fill="rgb(56 189 248)"
                  fill-opacity="0.08"
                />
                <!-- 主軸 -->
                <line
                  :x1="TS_PAD_L"
                  :y1="TS_H - TS_PAD_B"
                  :x2="TS_W - TS_PAD_R"
                  :y2="TS_H - TS_PAD_B"
                  stroke="currentColor"
                  stroke-opacity="0.2"
                />
                <line
                  :x1="TS_PAD_L"
                  :y1="TS_PAD_T - TS_NEW_BAND_H"
                  :x2="TS_PAD_L"
                  :y2="TS_H - TS_PAD_B"
                  stroke="currentColor"
                  stroke-opacity="0.2"
                />
                <!-- y 軸標示 -->
                <text
                  :x="TS_PAD_L - 4"
                  :y="TS_PAD_T - TS_NEW_BAND_H / 2 + 3"
                  text-anchor="end"
                  class="fill-current text-[9px] opacity-60"
                >
                  新號
                </text>
                <text
                  :x="TS_PAD_L - 4"
                  :y="TS_PAD_T + 3"
                  text-anchor="end"
                  class="fill-current text-[9px] opacity-60"
                >
                  0
                </text>
                <text
                  :x="TS_PAD_L - 4"
                  :y="TS_H - TS_PAD_B + 3"
                  text-anchor="end"
                  class="fill-current text-[9px] opacity-60"
                >
                  {{ intervalCount - 1 }}
                </text>
                <!-- x 軸標示 -->
                <text
                  :x="TS_PAD_L"
                  :y="TS_H - TS_PAD_B + 14"
                  text-anchor="start"
                  class="fill-current text-[9px] opacity-60"
                >
                  舊
                </text>
                <text
                  :x="TS_W - TS_PAD_R"
                  :y="TS_H - TS_PAD_B + 14"
                  text-anchor="end"
                  class="fill-current text-[9px] opacity-60"
                >
                  新
                </text>
                <!-- 點 -->
                <g>
                  <circle
                    v-for="(evt, idx) in selectedRow.timeline"
                    :key="`evt-${idx}`"
                    :cx="tsX(evt.snapshotIndex)"
                    :cy="tsY(evt.sourceInterval)"
                    r="1.6"
                    :fill="evt.sourceInterval < 0 ? 'rgb(56 189 248)' : 'rgb(16 185 129)'"
                    fill-opacity="0.85"
                  >
                    <title>期 {{ evt.drawTerm }}（{{ evt.drawDate }}）— {{ evt.sourceInterval < 0 ? '新號' : `來源隔期 ${evt.sourceInterval}` }}</title>
                  </circle>
                </g>
              </svg>
            </div>
          </div>

          <!-- 來源隔期分布 -->
          <div class="space-y-1">
            <div class="text-xs text-muted">
              來源隔期分布：該號各次命中時所屬的隔期次數（總計 {{ selectedRow.appearances - (selectedRow.timeline.filter(t => t.sourceInterval < 0).length) }} 次有紀錄隔期）。
              新號 {{ selectedRow.timeline.filter(t => t.sourceInterval < 0).length }} 次未列入。
            </div>
            <div class="rounded border border-default p-2 space-y-0.5">
              <div
                v-for="bar in sourceBars"
                :key="`src-${bar.interval}`"
                class="flex items-center gap-2 text-[10px]"
              >
                <span class="w-12 text-right font-mono text-muted whitespace-nowrap">
                  隔期 {{ bar.interval }}
                </span>
                <div class="relative flex-1 h-3 bg-elevated rounded overflow-hidden">
                  <div
                    class="absolute inset-y-0 left-0 bg-emerald-500/60"
                    :style="{ width: `${bar.ratio * 100}%` }"
                  />
                </div>
                <span class="w-10 text-right font-mono tabular-nums text-muted">
                  {{ bar.count }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </UCard>
    </section>

    <UAlert
      v-else
      color="neutral"
      variant="subtle"
      icon="i-lucide-mouse-pointer-click"
      title="點上方表格的任一橫列、展開該號的時間序與來源隔期分布"
      description="預設依號碼遞增排序、可改成依出現次數 / 平均間隔 / 最長乾期 / 連兩期次數排序。"
    />
  </div>
</template>
