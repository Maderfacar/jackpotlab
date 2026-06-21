<script setup lang="ts">
/**
 * /kobe Tab 3 「冷熱波段」（Phase 2）
 *
 * 三塊：
 *   1. 冷後反彈表 — 對每個隔期、給定「冷度標準」門檻，看後 1/2/3/5 期實際開出顆數
 *      vs 對照基準（該隔期整體平均），算「比基準少猜錯 ___ 顆」。
 *   2. 整盤冷度時段圖 — 每期所有隔期數值加總當整盤冷度、依小時 bucket 平均、
 *      旁邊小卡同時段平均開出顆數（從追蹤隔期內、不含新號）。
 *   3. 結論卡 — 三選一：反彈規律存在 / 時段規律存在 / 兩者皆無。
 *
 * 用語規則（柯比頁全頁守則）：
 *   - 不用英文代數變數（K/X/J/V 不出現在 UI）。
 *   - 不用統計術語（不出現 mean reversion / threshold / baseline 等英文）。
 *   - 改寫：threshold → 冷度標準；V → 數值/累計沒命中次數；baseline → 對照基準。
 */
import type {
  PerDrawSnapshot,
  ColdReboundCell,
  GlobalColdnessPoint
} from '~/utils/kobe-stats'
import { buildColdReboundTable, buildGlobalColdnessSeries } from '~/utils/kobe-stats'

interface Props { snapshots: PerDrawSnapshot[] }
const props = defineProps<Props>()

const THRESHOLD_MIN = 1
const THRESHOLD_MAX = 5
const SAMPLE_TRUST_THRESHOLD = 20
const MAX_SHOWN_INTERVAL = 19
const REBOUND_SIGNIFICANCE = 0.05
const TIME_SLOT_SIGNIFICANCE = 0.10

// 顯示哪些 look-ahead 步距（1, 2, 3, 5 期；跳過 4 期）
const LOOK_AHEAD_STEPS: Array<{ index: number, label: string }> = [
  { index: 0, label: '後 1 期' },
  { index: 1, label: '後 2 期' },
  { index: 2, label: '後 3 期' },
  { index: 4, label: '後 5 期' }
]

const threshold = ref<number>(2)

const allCells = computed<ColdReboundCell[]>(() =>
  buildColdReboundTable(props.snapshots, THRESHOLD_MIN, THRESHOLD_MAX)
)
const coldnessSeries = computed<GlobalColdnessPoint[]>(() =>
  buildGlobalColdnessSeries(props.snapshots)
)

const visibleCells = computed<ColdReboundCell[]>(() =>
  allCells.value
    .filter(c => c.threshold === threshold.value && c.interval <= MAX_SHOWN_INTERVAL)
    .sort((a, b) => a.interval - b.interval)
)

interface ReboundDisplayCell {
  interval: number
  baselineMean: number
  steps: Array<{
    label: string
    sampleCount: number
    actualMean: number
    diff: number
    improvementPct: number
    trustworthy: boolean
  }>
}

const reboundRows = computed<ReboundDisplayCell[]>(() => {
  return visibleCells.value.map((cell) => {
    const steps = LOOK_AHEAD_STEPS.map((step) => {
      const actualMean = cell.actualMeanAt[step.index] ?? 0
      const diff = actualMean - cell.baselineMean
      const improvementPct = cell.baselineMean > 0 ? Math.abs(diff) / cell.baselineMean : 0
      // 後 k 期樣本數會略少於後 1 期、但同數量級，用 sampleCount 當代理
      return {
        label: step.label,
        sampleCount: cell.sampleCount,
        actualMean,
        diff,
        improvementPct,
        trustworthy: cell.sampleCount >= SAMPLE_TRUST_THRESHOLD
      }
    })
    return {
      interval: cell.interval,
      baselineMean: cell.baselineMean,
      steps
    }
  })
})

// 反彈規律存在判定：任一可信 cell 的 |Δ/baseline| ≥ 5%
const reboundMaxImprovement = computed(() => {
  let max = 0
  for (const row of reboundRows.value) {
    for (const s of row.steps) {
      if (!s.trustworthy) continue
      if (s.improvementPct > max) max = s.improvementPct
    }
  }
  return max
})
const reboundRuleExists = computed(() => reboundMaxImprovement.value >= REBOUND_SIGNIFICANCE)

// ---- 小時切片 ----
interface HourBucket {
  hour: number
  sampleCount: number
  meanColdness: number
  meanHits: number
}

const hourBuckets = computed<HourBucket[]>(() => {
  const sumCold: number[] = new Array(24).fill(0)
  const sumHits: number[] = new Array(24).fill(0)
  const cnt: number[] = new Array(24).fill(0)
  for (const p of coldnessSeries.value) {
    if (p.hour < 0 || p.hour > 23) continue
    sumCold[p.hour]! += p.coldness
    sumHits[p.hour]! += p.hitsThisDraw
    cnt[p.hour]! += 1
  }
  const out: HourBucket[] = []
  for (let h = 0; h < 24; h++) {
    const n = cnt[h]!
    out.push({
      hour: h,
      sampleCount: n,
      meanColdness: n > 0 ? sumCold[h]! / n : 0,
      meanHits: n > 0 ? sumHits[h]! / n : 0
    })
  }
  return out
})

const activeHours = computed<HourBucket[]>(() =>
  hourBuckets.value.filter(b => b.sampleCount >= SAMPLE_TRUST_THRESHOLD)
)

const coldnessOverallMean = computed(() => {
  const series = coldnessSeries.value
  if (series.length === 0) return 0
  let sum = 0
  for (const p of series) sum += p.coldness
  return sum / series.length
})

const timeSlotSpread = computed(() => {
  const buckets = activeHours.value
  if (buckets.length < 2) return 0
  let max = -Infinity
  let min = Infinity
  for (const b of buckets) {
    if (b.meanColdness > max) max = b.meanColdness
    if (b.meanColdness < min) min = b.meanColdness
  }
  const overall = coldnessOverallMean.value
  if (overall <= 0) return 0
  return (max - min) / overall
})
const timeSlotRuleExists = computed(() => timeSlotSpread.value >= TIME_SLOT_SIGNIFICANCE)

// ---- SVG 圖表參數 ----
const CHART_W = 600
const CHART_H = 200
const CHART_PAD_L = 36
const CHART_PAD_R = 12
const CHART_PAD_T = 12
const CHART_PAD_B = 28

const chartScale = computed(() => {
  const buckets = activeHours.value
  if (buckets.length === 0) return { yMin: 0, yMax: 1 }
  let yMin = Infinity
  let yMax = -Infinity
  for (const b of buckets) {
    if (b.meanColdness < yMin) yMin = b.meanColdness
    if (b.meanColdness > yMax) yMax = b.meanColdness
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return { yMin: 0, yMax: 1 }
  if (yMax === yMin) {
    yMax = yMin + 1
  }
  // 留 5% 上下空間
  const span = yMax - yMin
  return { yMin: yMin - span * 0.05, yMax: yMax + span * 0.05 }
})

function xForHour(h: number): number {
  const innerW = CHART_W - CHART_PAD_L - CHART_PAD_R
  return CHART_PAD_L + (h / 23) * innerW
}
function yForVal(v: number): number {
  const { yMin, yMax } = chartScale.value
  const innerH = CHART_H - CHART_PAD_T - CHART_PAD_B
  const ratio = (v - yMin) / (yMax - yMin)
  return CHART_PAD_T + (1 - ratio) * innerH
}

const linePath = computed(() => {
  const buckets = activeHours.value
  if (buckets.length === 0) return ''
  let path = ''
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i]!
    const cmd = i === 0 ? 'M' : 'L'
    path += `${cmd}${xForHour(b.hour).toFixed(1)},${yForVal(b.meanColdness).toFixed(1)} `
  }
  return path.trim()
})

// 結論卡
type Verdict = {
  variant: 'success' | 'warning' | 'neutral'
  title: string
  description: string
}
const verdict = computed<Verdict>(() => {
  if (reboundRuleExists.value && timeSlotRuleExists.value) {
    return {
      variant: 'success',
      title: '反彈規律 + 時段規律皆存在',
      description: `冷度標準 ${threshold.value} 之下，至少有一個隔期在後續 1-5 期出現 ${(reboundMaxImprovement.value * 100).toFixed(1)}% 以上的偏移；且整盤冷度在小時之間的差距達 ${(timeSlotSpread.value * 100).toFixed(1)}%（≥ 10% 視為有時段差異）。兩個訊號都可用、可以考慮疊用。`
    }
  }
  if (reboundRuleExists.value) {
    return {
      variant: 'success',
      title: '反彈規律存在（單一訊號）',
      description: `冷度標準 ${threshold.value} 之下，最大「比基準少猜錯」幅度為 ${(reboundMaxImprovement.value * 100).toFixed(1)}%（≥ 5% 視為有規律）。但整盤冷度沒有顯著時段差異（${(timeSlotSpread.value * 100).toFixed(1)}% < 10%），時段資訊不需要納入。`
    }
  }
  if (timeSlotRuleExists.value) {
    return {
      variant: 'success',
      title: '時段規律存在（單一訊號）',
      description: `整盤冷度在小時之間的差距達 ${(timeSlotSpread.value * 100).toFixed(1)}%（≥ 10% 視為有時段差異）。但冷度標準 ${threshold.value} 之下沒看到顯著反彈規律（最大改善 ${(reboundMaxImprovement.value * 100).toFixed(1)}% < 5%）。`
    }
  }
  return {
    variant: 'neutral',
    title: '兩者皆無顯著規律',
    description: `冷度標準 ${threshold.value} 之下，反彈最大改善 ${(reboundMaxImprovement.value * 100).toFixed(1)}%（門檻 5%）、整盤冷度時段差距 ${(timeSlotSpread.value * 100).toFixed(1)}%（門檻 10%）皆未達標。可以調冷度標準試試、或這兩個訊號對下期開出沒實質幫助。`
  }
})

function fmtMean(v: number): string {
  return v.toFixed(2)
}
function fmtPct(v: number): string {
  const pct = v * 100
  if (Math.abs(pct) >= 10) return `${pct.toFixed(1)}%`
  return `${pct.toFixed(2)}%`
}

function stepBgClass(step: ReboundDisplayCell['steps'][number]): string {
  if (!step.trustworthy) return 'bg-default'
  if (step.improvementPct < REBOUND_SIGNIFICANCE) return 'bg-default'
  // 反彈（diff > 0）→ 綠；冷續（diff < 0）→ 藍
  if (step.diff > 0) {
    if (step.improvementPct < 0.10) return 'bg-emerald-500/15'
    if (step.improvementPct < 0.20) return 'bg-emerald-500/30'
    return 'bg-emerald-500/50'
  }
  if (step.improvementPct < 0.10) return 'bg-sky-500/15'
  if (step.improvementPct < 0.20) return 'bg-sky-500/30'
  return 'bg-sky-500/50'
}
function stepOpacityClass(step: ReboundDisplayCell['steps'][number]): string {
  if (!step.trustworthy) return 'opacity-50'
  return ''
}

const hoursWithData = computed(() => activeHours.value.length)
</script>

<template>
  <div class="space-y-6">
    <!-- Section 1: 冷後反彈表 -->
    <section class="space-y-2">
      <header class="space-y-1">
        <h3 class="text-base font-semibold">
          冷後反彈表
        </h3>
        <p class="text-xs text-muted">
          每個隔期都有一個「累計沒命中次數」（數值越大代表越冷）。設一個冷度標準、把所有「該隔期數值 ≥ 標準」的時點抓出來、
          看後 1/2/3/5 期該隔期實際平均開出多少顆，跟對照基準（該隔期整體平均）比較。
          樣本數低於 {{ SAMPLE_TRUST_THRESHOLD }} 的格子半透明、僅供參考。
        </p>
      </header>

      <UCard :ui="{ body: 'p-4' }">
        <div class="space-y-3">
          <div class="flex flex-wrap items-center gap-3">
            <label class="flex items-center gap-2 text-xs text-muted">
              <span>冷度標準（≥ 多少視為「夠冷」）</span>
              <input
                v-model.number="threshold"
                type="range"
                :min="THRESHOLD_MIN"
                :max="THRESHOLD_MAX"
                step="1"
                class="accent-emerald-500"
              >
              <span class="font-mono text-sm tabular-nums text-default">
                {{ threshold }}
              </span>
            </label>
          </div>

          <div class="overflow-x-auto rounded-md border border-default">
            <table class="min-w-max text-[11px]">
              <thead>
                <tr class="border-b border-default text-muted">
                  <th class="sticky left-0 z-10 bg-default px-2 py-1.5 text-left font-medium whitespace-nowrap">
                    隔期 ↓
                  </th>
                  <th class="px-2 py-1.5 text-center font-medium whitespace-nowrap">
                    對照基準<br>（該隔期平均）
                  </th>
                  <th
                    v-for="step in LOOK_AHEAD_STEPS"
                    :key="`hd-${step.index}`"
                    class="px-2 py-1.5 text-center font-medium whitespace-nowrap"
                  >
                    {{ step.label }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in reboundRows"
                  :key="`row-${row.interval}`"
                  class="border-b border-default/60"
                >
                  <td class="sticky left-0 z-10 bg-default px-2 py-1 font-mono text-muted whitespace-nowrap">
                    隔期 {{ row.interval }}
                  </td>
                  <td class="px-2 py-1 text-center align-middle font-mono tabular-nums text-muted">
                    {{ fmtMean(row.baselineMean) }} 顆
                  </td>
                  <td
                    v-for="(s, idx) in row.steps"
                    :key="`s-${row.interval}-${idx}`"
                    class="px-2 py-1 text-center align-middle font-mono tabular-nums"
                    :class="[stepBgClass(s), stepOpacityClass(s)]"
                  >
                    <div class="leading-tight">
                      {{ fmtMean(s.actualMean) }}
                    </div>
                    <div
                      v-if="s.trustworthy"
                      class="text-[9px] leading-tight"
                      :class="s.diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-sky-600 dark:text-sky-400'"
                    >
                      {{ s.diff > 0 ? '+' : '−' }}{{ fmtMean(Math.abs(s.diff)) }}（{{ fmtPct(s.improvementPct) }}）
                    </div>
                    <div class="text-[9px] leading-tight text-muted">
                      n={{ s.sampleCount }}
                    </div>
                  </td>
                </tr>
                <tr v-if="reboundRows.length === 0">
                  <td
                    colspan="6"
                    class="px-3 py-3 text-center text-muted"
                  >
                    尚無樣本可顯示。
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="text-[11px] text-muted leading-relaxed">
            欄位數字 = 觸發後該隔期實際平均開出顆數；下方 ± 數字 = 與對照基準的差異
            （正 = 反彈、平均開出比對照基準多；負 = 冷續、平均開出比基準少）。
            單一格子改善幅度未達 5% 視為無顯著差異、僅當噪音看待。
          </p>
        </div>
      </UCard>
    </section>

    <!-- Section 2: 整盤冷度時段圖 -->
    <section class="space-y-2">
      <header class="space-y-1">
        <h3 class="text-base font-semibold">
          整盤冷度時段圖
        </h3>
        <p class="text-xs text-muted">
          每期所有隔期的累計沒命中次數加總、視為「整盤冷度」。依 24 小時 bucket 平均，
          可看一天當中是否有時段性的高低起伏（賓果每 5 分鐘一期、每小時約 12 期、過去 {{ coldnessSeries.length }} 期共覆蓋 {{ hoursWithData }} 個有樣本的小時）。
        </p>
      </header>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <UCard
          class="lg:col-span-2"
          :ui="{ body: 'p-4' }"
        >
          <div class="space-y-2">
            <div class="text-xs text-muted">
              每小時平均整盤冷度
            </div>
            <div class="w-full overflow-x-auto">
              <svg
                :viewBox="`0 0 ${CHART_W} ${CHART_H}`"
                class="w-full max-w-full"
                preserveAspectRatio="xMidYMid meet"
              >
                <!-- 軸線 -->
                <line
                  :x1="CHART_PAD_L"
                  :y1="CHART_H - CHART_PAD_B"
                  :x2="CHART_W - CHART_PAD_R"
                  :y2="CHART_H - CHART_PAD_B"
                  stroke="currentColor"
                  stroke-opacity="0.2"
                />
                <line
                  :x1="CHART_PAD_L"
                  :y1="CHART_PAD_T"
                  :x2="CHART_PAD_L"
                  :y2="CHART_H - CHART_PAD_B"
                  stroke="currentColor"
                  stroke-opacity="0.2"
                />
                <!-- Y 軸刻度（min / max） -->
                <text
                  :x="CHART_PAD_L - 4"
                  :y="CHART_PAD_T + 6"
                  text-anchor="end"
                  class="fill-current text-[9px] opacity-60"
                >
                  {{ fmtMean(chartScale.yMax) }}
                </text>
                <text
                  :x="CHART_PAD_L - 4"
                  :y="CHART_H - CHART_PAD_B"
                  text-anchor="end"
                  class="fill-current text-[9px] opacity-60"
                >
                  {{ fmtMean(chartScale.yMin) }}
                </text>
                <!-- X 軸刻度（每 3 小時一個） -->
                <g class="fill-current text-[9px] opacity-60">
                  <text
                    v-for="h in [0, 3, 6, 9, 12, 15, 18, 21, 23]"
                    :key="`xt-${h}`"
                    :x="xForHour(h)"
                    :y="CHART_H - CHART_PAD_B + 14"
                    text-anchor="middle"
                  >
                    {{ h }}
                  </text>
                </g>
                <!-- 折線 -->
                <path
                  v-if="linePath"
                  :d="linePath"
                  fill="none"
                  stroke="rgb(16 185 129)"
                  stroke-width="1.5"
                />
                <!-- 資料點 -->
                <g>
                  <circle
                    v-for="b in activeHours"
                    :key="`pt-${b.hour}`"
                    :cx="xForHour(b.hour)"
                    :cy="yForVal(b.meanColdness)"
                    r="2.5"
                    fill="rgb(16 185 129)"
                  >
                    <title>{{ b.hour }} 時：平均冷度 {{ fmtMean(b.meanColdness) }}、平均開出 {{ fmtMean(b.meanHits) }} 顆（{{ b.sampleCount }} 期）</title>
                  </circle>
                </g>
              </svg>
            </div>
            <p class="text-[11px] text-muted">
              x 軸：0-23 時 / y 軸：該小時所有期的整盤冷度平均值。
            </p>
          </div>
        </UCard>

        <UCard :ui="{ body: 'p-4' }">
          <div class="space-y-2">
            <div class="text-xs text-muted">
              同時段平均開出顆數（從追蹤隔期內、不含新號）
            </div>
            <div class="max-h-72 overflow-y-auto rounded border border-default">
              <table class="w-full text-[11px]">
                <thead class="sticky top-0 bg-default">
                  <tr class="border-b border-default text-muted">
                    <th class="px-2 py-1 text-left font-medium">
                      時段
                    </th>
                    <th class="px-2 py-1 text-right font-medium">
                      平均冷度
                    </th>
                    <th class="px-2 py-1 text-right font-medium">
                      平均開出
                    </th>
                    <th class="px-2 py-1 text-right font-medium">
                      樣本
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="b in hourBuckets"
                    :key="`hr-${b.hour}`"
                    class="border-b border-default/60"
                    :class="b.sampleCount < SAMPLE_TRUST_THRESHOLD ? 'opacity-50' : ''"
                  >
                    <td class="px-2 py-1 font-mono">
                      {{ b.hour.toString().padStart(2, '0') }}:00
                    </td>
                    <td class="px-2 py-1 text-right font-mono tabular-nums">
                      {{ b.sampleCount > 0 ? fmtMean(b.meanColdness) : '—' }}
                    </td>
                    <td class="px-2 py-1 text-right font-mono tabular-nums">
                      {{ b.sampleCount > 0 ? fmtMean(b.meanHits) : '—' }}
                    </td>
                    <td class="px-2 py-1 text-right font-mono tabular-nums text-muted">
                      {{ b.sampleCount }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </UCard>
      </div>
    </section>

    <!-- Section 3: 結論卡 -->
    <section class="space-y-2">
      <header class="space-y-1">
        <h3 class="text-base font-semibold">
          冷熱波段結論
        </h3>
        <p class="text-xs text-muted">
          反彈規律門檻：任一可信格子「比基準少猜錯」≥ 5%。時段規律門檻：最大小時平均 − 最小小時平均 ≥ 整體平均的 10%。
        </p>
      </header>
      <UAlert
        :color="verdict.variant === 'success' ? 'success' : verdict.variant === 'warning' ? 'warning' : 'neutral'"
        variant="subtle"
        :icon="verdict.variant === 'success' ? 'i-lucide-check-circle' : verdict.variant === 'warning' ? 'i-lucide-info' : 'i-lucide-minus-circle'"
        :title="verdict.title"
        :description="verdict.description"
      />
    </section>
  </div>
</template>
