<script setup lang="ts">
/**
 * /kobe Tab 6 「訊號比拚」（Phase 5）
 *
 * 三塊：
 *   1. 三訊號比拚表 — 訊號名稱 / 整體平均誤差 / 改善幅度 / 樣本覆蓋率 / 結論
 *   2. 每隔期下哪個訊號最強 — 列 = 隔期 0..19、欄 = 三訊號改善幅度、最佳欄高亮
 *   3. 訊號組合測試 — 單訊號 + 兩兩組合 + 三合一、改善幅度排序
 *
 * 用語規則（柯比頁全頁守則）：
 *   - 不出現 logistic regression / feature importance / interaction effect。
 *   - 改寫：feature importance → 「哪個訊號比較有用」；
 *     interaction → 「兩個訊號組合是否互補」。
 */
import type {
  PerDrawSnapshot,
  HoldoutResult,
  HoldoutKeyFn
} from '~/utils/kobe-stats'
import {
  holdoutByCondition,
  holdoutByConditionPerInterval,
  combineKeyFns
} from '~/utils/kobe-stats'

interface Props { snapshots: PerDrawSnapshot[] }
const props = defineProps<Props>()

const TRAIN_RATIO = 0.8
const MAX_SHOWN_INTERVAL = 19
const STRONG_IMPROVEMENT = 0.05
const SAMPLE_TRUST_THRESHOLD = 50

// 三個訊號的 keyFn
const remainingKeyFn: HoldoutKeyFn = ({ slot }) => {
  if (slot.remainingBefore <= 0) return null
  return `${slot.interval}|R${slot.remainingBefore}`
}
const valueKeyFn: HoldoutKeyFn = ({ slot }) => {
  if (slot.remainingBefore <= 0) return null
  return `${slot.interval}|V${slot.recordValueBefore}`
}
const positionKeyFn: HoldoutKeyFn = ({ snapshots, snapshotIndex, slot }) => {
  if (slot.remainingBefore <= 0) return null
  if (snapshotIndex <= 1) return null
  const prev = snapshots[snapshotIndex - 1]
  if (!prev) return null
  const prevSlot = prev.slots[slot.interval]
  if (!prevSlot) return null
  if (prevSlot.hitsThisDraw === 0) return `${slot.interval}|Pnone`
  let maxPos = 0
  for (const y of prevSlot.hitPositions) {
    if (y > maxPos) maxPos = y
  }
  return `${slot.interval}|P${maxPos}`
}

type SignalKey = 'remaining' | 'value' | 'position'
interface SignalDef {
  key: SignalKey
  label: string
  hint: string
  keyFn: HoldoutKeyFn
}
const SIGNALS: SignalDef[] = [
  {
    key: 'remaining',
    label: '剩餘顆數',
    hint: '該隔期此期 pre-T 還剩多少顆未開出',
    keyFn: remainingKeyFn
  },
  {
    key: 'value',
    label: '數值',
    hint: '該隔期此期 pre-T 累計沒命中次數（record 首碼）',
    keyFn: valueKeyFn
  },
  {
    key: 'position',
    label: '位置',
    hint: '該隔期上一期被命中時的最大位置（上期沒命中 → 歸到「無」一組）',
    keyFn: positionKeyFn
  }
]

// 三個訊號 × per-interval 結果
const remainingPerInterval = computed(() => holdoutByConditionPerInterval(props.snapshots, remainingKeyFn, TRAIN_RATIO))
const valuePerInterval = computed(() => holdoutByConditionPerInterval(props.snapshots, valueKeyFn, TRAIN_RATIO))
const positionPerInterval = computed(() => holdoutByConditionPerInterval(props.snapshots, positionKeyFn, TRAIN_RATIO))

function aggregate(perInterval: Map<number, HoldoutResult>): HoldoutResult {
  let totalCond = 0
  let totalBase = 0
  let totalObs = 0
  let totalCovered = 0
  let trainingCount = 0
  let testCount = 0
  for (const r of perInterval.values()) {
    totalCond += r.conditionalMeanError * r.testObservations
    totalBase += r.baselineMeanError * r.testObservations
    totalObs += r.testObservations
    totalCovered += r.coverageRatio * r.testObservations
    trainingCount = r.trainingCount
    testCount = r.testCount
  }
  const condMAE = totalObs > 0 ? totalCond / totalObs : 0
  const baseMAE = totalObs > 0 ? totalBase / totalObs : 0
  const improvement = baseMAE - condMAE
  const improvementRatio = baseMAE > 0 ? improvement / baseMAE : 0
  return {
    trainingCount,
    testCount,
    testObservations: totalObs,
    conditionalMeanError: condMAE,
    baselineMeanError: baseMAE,
    improvement,
    improvementRatio,
    coverageRatio: totalObs > 0 ? totalCovered / totalObs : 0
  }
}

const remainingOverall = computed(() => aggregate(remainingPerInterval.value))
const valueOverall = computed(() => aggregate(valuePerInterval.value))
const positionOverall = computed(() => aggregate(positionPerInterval.value))

// Section 1: 三訊號比拚表
interface OverallRow {
  key: SignalKey
  label: string
  hint: string
  result: HoldoutResult
}
const overallRows = computed<OverallRow[]>(() => [
  { key: 'remaining', label: SIGNALS[0]!.label, hint: SIGNALS[0]!.hint, result: remainingOverall.value },
  { key: 'value', label: SIGNALS[1]!.label, hint: SIGNALS[1]!.hint, result: valueOverall.value },
  { key: 'position', label: SIGNALS[2]!.label, hint: SIGNALS[2]!.hint, result: positionOverall.value }
])

// Section 2: 每隔期 × 三訊號
interface PerIntervalRow {
  interval: number
  remaining: HoldoutResult
  value: HoldoutResult
  position: HoldoutResult
  best: SignalKey | null
}
const perIntervalRows = computed<PerIntervalRow[]>(() => {
  const rows: PerIntervalRow[] = []
  for (let j = 0; j <= MAX_SHOWN_INTERVAL; j++) {
    const r = remainingPerInterval.value.get(j)
    const v = valuePerInterval.value.get(j)
    const p = positionPerInterval.value.get(j)
    if (!r || !v || !p) continue
    const ratios: Array<{ key: SignalKey, ratio: number, obs: number }> = [
      { key: 'remaining', ratio: r.improvementRatio, obs: r.testObservations },
      { key: 'value', ratio: v.improvementRatio, obs: v.testObservations },
      { key: 'position', ratio: p.improvementRatio, obs: p.testObservations }
    ]
    ratios.sort((a, b) => b.ratio - a.ratio)
    const top = ratios[0]!
    const best = top.ratio > 0 && top.obs >= SAMPLE_TRUST_THRESHOLD ? top.key : null
    rows.push({ interval: j, remaining: r, value: v, position: p, best })
  }
  return rows
})

// Section 3: 組合測試（含三個單訊號當對照）
const comboRV = computed(() => holdoutByCondition(props.snapshots, combineKeyFns(remainingKeyFn, valueKeyFn), TRAIN_RATIO))
const comboRP = computed(() => holdoutByCondition(props.snapshots, combineKeyFns(remainingKeyFn, positionKeyFn), TRAIN_RATIO))
const comboVP = computed(() => holdoutByCondition(props.snapshots, combineKeyFns(valueKeyFn, positionKeyFn), TRAIN_RATIO))
const comboAll = computed(() => holdoutByCondition(props.snapshots, combineKeyFns(remainingKeyFn, valueKeyFn, positionKeyFn), TRAIN_RATIO))

interface ComboRow {
  label: string
  isCombo: boolean
  result: HoldoutResult
}
const comboRows = computed<ComboRow[]>(() => {
  const items: ComboRow[] = [
    { label: '剩餘顆數', isCombo: false, result: remainingOverall.value },
    { label: '數值', isCombo: false, result: valueOverall.value },
    { label: '位置', isCombo: false, result: positionOverall.value },
    { label: '剩餘顆數 + 數值', isCombo: true, result: comboRV.value },
    { label: '剩餘顆數 + 位置', isCombo: true, result: comboRP.value },
    { label: '數值 + 位置', isCombo: true, result: comboVP.value },
    { label: '三個合一（剩餘 + 數值 + 位置）', isCombo: true, result: comboAll.value }
  ]
  return items.sort((a, b) => b.result.improvementRatio - a.result.improvementRatio)
})

// 互補性判定：組合 vs 該組合的最佳單訊號
function bestComponent(label: string): number {
  if (label === '剩餘顆數 + 數值') return Math.max(remainingOverall.value.improvementRatio, valueOverall.value.improvementRatio)
  if (label === '剩餘顆數 + 位置') return Math.max(remainingOverall.value.improvementRatio, positionOverall.value.improvementRatio)
  if (label === '數值 + 位置') return Math.max(valueOverall.value.improvementRatio, positionOverall.value.improvementRatio)
  if (label === '三個合一（剩餘 + 數值 + 位置）') {
    return Math.max(
      remainingOverall.value.improvementRatio,
      valueOverall.value.improvementRatio,
      positionOverall.value.improvementRatio
    )
  }
  return 0
}

interface Verdict { label: string, color: 'success' | 'info' | 'warning' | 'neutral' }
function verdict(r: HoldoutResult): Verdict {
  if (r.testObservations < SAMPLE_TRUST_THRESHOLD) return { label: '樣本不足', color: 'neutral' }
  if (r.improvement <= 0) return { label: '無顯著預測力', color: 'warning' }
  if (r.improvementRatio < STRONG_IMPROVEMENT) return { label: '微弱預測力', color: 'info' }
  return { label: '有預測力', color: 'success' }
}

function comboVerdict(row: ComboRow): Verdict {
  const base = verdict(row.result)
  if (!row.isCombo) return base
  if (base.color === 'neutral' || base.color === 'warning') return base
  const bestSingle = bestComponent(row.label)
  // 改善 > 該組合的最佳單訊號 → 互補；否則 → 重疊
  if (row.result.improvementRatio > bestSingle + 0.005) {
    return { label: '互補（比單獨用更好）', color: 'success' }
  }
  return { label: '與單訊號相當（重疊）', color: 'info' }
}

function fmtMean(v: number): string {
  return v.toFixed(3)
}
function fmtPct(v: number): string {
  const pct = v * 100
  if (Math.abs(pct) >= 10) return `${pct.toFixed(1)}%`
  return `${pct.toFixed(2)}%`
}
function sign(v: number): string {
  return v > 0 ? '+' : ''
}

function getSignalResult(row: PerIntervalRow, sig: SignalKey): HoldoutResult {
  if (sig === 'remaining') return row.remaining
  if (sig === 'value') return row.value
  return row.position
}

function bestColClass(row: PerIntervalRow, sig: SignalKey): string {
  const r = getSignalResult(row, sig)
  if (r.testObservations < SAMPLE_TRUST_THRESHOLD) return 'opacity-50'
  if (row.best === sig) return 'bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-300'
  return ''
}

function ratioColorClass(r: HoldoutResult): string {
  if (r.testObservations < SAMPLE_TRUST_THRESHOLD) return 'text-muted'
  if (r.improvement <= 0) return 'text-sky-600 dark:text-sky-400'
  if (r.improvementRatio < STRONG_IMPROVEMENT) return ''
  return 'text-emerald-600 dark:text-emerald-400'
}

// 切片資訊
const splitInfo = computed(() => {
  const r = remainingOverall.value
  return {
    trainingCount: r.trainingCount,
    testCount: r.testCount,
    testObservations: r.testObservations
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- 切片資訊 -->
    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-split"
      :title="`用前 ${splitInfo.trainingCount} 期當訓練、後 ${splitInfo.testCount} 期當考試（${Math.round(TRAIN_RATIO * 100)}/${Math.round((1 - TRAIN_RATIO) * 100)} 切）`"
      :description="`三個訊號各自當條件、在同一份考試集上比平均誤差顆數與只用『該隔期整體均值』的對照基準。改善幅度 ≥ ${fmtPct(STRONG_IMPROVEMENT)} 視為有預測力、樣本 < ${SAMPLE_TRUST_THRESHOLD} 標「樣本不足」。`"
    />

    <!-- Section 1: 三訊號比拚表 -->
    <section class="space-y-2">
      <header class="space-y-1">
        <h3 class="text-base font-semibold">
          三訊號比拚
        </h3>
        <p class="text-xs text-muted">
          看「剩餘顆數 / 數值 / 位置」三個訊號各自對「下一期該隔期開出多少顆」的預測力。
          改善幅度越正、代表越有用。
        </p>
      </header>

      <div class="overflow-x-auto rounded-md border border-default">
        <table class="min-w-max w-full text-[11px]">
          <thead>
            <tr class="border-b border-default text-muted">
              <th class="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                訊號
              </th>
              <th class="px-2 py-1.5 text-left font-medium">
                說明
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                條件預測誤差
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                對照基準誤差
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                改善幅度
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                考試樣本
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                條件覆蓋率
              </th>
              <th class="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                結論
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in overallRows"
              :key="`overall-${row.key}`"
              class="border-b border-default/60"
            >
              <td class="px-2 py-1.5 font-mono whitespace-nowrap font-semibold">
                {{ row.label }}
              </td>
              <td class="px-2 py-1.5 text-muted">
                {{ row.hint }}
              </td>
              <td class="px-2 py-1.5 text-right font-mono tabular-nums">
                {{ fmtMean(row.result.conditionalMeanError) }}
              </td>
              <td class="px-2 py-1.5 text-right font-mono tabular-nums text-muted">
                {{ fmtMean(row.result.baselineMeanError) }}
              </td>
              <td
                class="px-2 py-1.5 text-right font-mono tabular-nums"
                :class="ratioColorClass(row.result)"
              >
                {{ sign(row.result.improvement) }}{{ fmtMean(Math.abs(row.result.improvement)) }}
                <span class="text-[10px]">（{{ sign(row.result.improvementRatio) }}{{ fmtPct(row.result.improvementRatio) }}）</span>
              </td>
              <td class="px-2 py-1.5 text-right font-mono tabular-nums text-muted">
                {{ row.result.testObservations }}
              </td>
              <td class="px-2 py-1.5 text-right font-mono tabular-nums text-muted">
                {{ fmtPct(row.result.coverageRatio) }}
              </td>
              <td class="px-2 py-1.5">
                <UBadge
                  :color="verdict(row.result).color"
                  variant="subtle"
                  size="sm"
                >
                  {{ verdict(row.result).label }}
                </UBadge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Section 2: 每隔期下哪個訊號最強 -->
    <section class="space-y-2">
      <header class="space-y-1">
        <h3 class="text-base font-semibold">
          每隔期下哪個訊號比較有用
        </h3>
        <p class="text-xs text-muted">
          把同一個隔期單獨拿出來、看三個訊號各自的改善幅度。
          最佳欄高亮（且該訊號考試樣本 ≥ {{ SAMPLE_TRUST_THRESHOLD }} 才算數）；
          三者皆無改善 / 樣本不足 → 不上色。
        </p>
      </header>

      <div class="overflow-x-auto rounded-md border border-default">
        <table class="min-w-max w-full text-[11px]">
          <thead>
            <tr class="border-b border-default text-muted">
              <th class="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                隔期
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                剩餘顆數
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                數值
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                位置
              </th>
              <th class="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                最佳訊號
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in perIntervalRows"
              :key="`per-${row.interval}`"
              class="border-b border-default/60"
            >
              <td class="px-2 py-1 font-mono whitespace-nowrap">
                隔期 {{ row.interval }}
              </td>
              <td
                class="px-2 py-1 text-right font-mono tabular-nums"
                :class="bestColClass(row, 'remaining')"
              >
                {{ sign(row.remaining.improvementRatio) }}{{ fmtPct(row.remaining.improvementRatio) }}
                <div class="text-[9px] text-muted leading-tight">
                  n={{ row.remaining.testObservations }}
                </div>
              </td>
              <td
                class="px-2 py-1 text-right font-mono tabular-nums"
                :class="bestColClass(row, 'value')"
              >
                {{ sign(row.value.improvementRatio) }}{{ fmtPct(row.value.improvementRatio) }}
                <div class="text-[9px] text-muted leading-tight">
                  n={{ row.value.testObservations }}
                </div>
              </td>
              <td
                class="px-2 py-1 text-right font-mono tabular-nums"
                :class="bestColClass(row, 'position')"
              >
                {{ sign(row.position.improvementRatio) }}{{ fmtPct(row.position.improvementRatio) }}
                <div class="text-[9px] text-muted leading-tight">
                  n={{ row.position.testObservations }}
                </div>
              </td>
              <td class="px-2 py-1 text-muted">
                <span v-if="row.best === 'remaining'">剩餘顆數</span>
                <span v-else-if="row.best === 'value'">數值</span>
                <span v-else-if="row.best === 'position'">位置</span>
                <span v-else>—</span>
              </td>
            </tr>
            <tr v-if="perIntervalRows.length === 0">
              <td
                colspan="5"
                class="px-3 py-3 text-center text-muted"
              >
                尚無樣本可顯示。
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Section 3: 訊號組合測試 -->
    <section class="space-y-2">
      <header class="space-y-1">
        <h3 class="text-base font-semibold">
          訊號組合測試
        </h3>
        <p class="text-xs text-muted">
          兩個訊號組合是否互補（比單獨用更好）、三個合一是否進一步提升。
          表中已含三個單訊號當對照、依改善幅度從高到低排序。
          組合 key 拼接 → 條件空間爆增、覆蓋率通常掉、預測力可能反而變差，這是正常的。
        </p>
      </header>

      <div class="overflow-x-auto rounded-md border border-default">
        <table class="min-w-max w-full text-[11px]">
          <thead>
            <tr class="border-b border-default text-muted">
              <th class="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                訊號
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                改善幅度
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                條件預測誤差
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                條件覆蓋率
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                考試樣本
              </th>
              <th class="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                結論
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in comboRows"
              :key="`combo-${row.label}`"
              class="border-b border-default/60"
            >
              <td class="px-2 py-1.5 font-mono whitespace-nowrap">
                {{ row.label }}
                <UBadge
                  v-if="row.isCombo"
                  color="info"
                  variant="subtle"
                  size="sm"
                  class="ml-1"
                >
                  組合
                </UBadge>
              </td>
              <td
                class="px-2 py-1.5 text-right font-mono tabular-nums"
                :class="ratioColorClass(row.result)"
              >
                {{ sign(row.result.improvement) }}{{ fmtMean(Math.abs(row.result.improvement)) }}
                <span class="text-[10px]">（{{ sign(row.result.improvementRatio) }}{{ fmtPct(row.result.improvementRatio) }}）</span>
              </td>
              <td class="px-2 py-1.5 text-right font-mono tabular-nums">
                {{ fmtMean(row.result.conditionalMeanError) }}
              </td>
              <td class="px-2 py-1.5 text-right font-mono tabular-nums text-muted">
                {{ fmtPct(row.result.coverageRatio) }}
              </td>
              <td class="px-2 py-1.5 text-right font-mono tabular-nums text-muted">
                {{ row.result.testObservations }}
              </td>
              <td class="px-2 py-1.5">
                <UBadge
                  :color="comboVerdict(row).color"
                  variant="subtle"
                  size="sm"
                >
                  {{ comboVerdict(row).label }}
                </UBadge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
