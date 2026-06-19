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
const FETCH_LIMIT = defaultD('bingo_bingo')

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
      params: { limit: FETCH_LIMIT }
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

onMounted(() => {
  load()
  if (typeof window === 'undefined') return
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

onBeforeUnmount(stopPolling)

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

// ---- Tab 3：下一期 20 顆預測（N=60 / D=500，每期套規則選 20 號） ------
//
// 規則（2026-06-19 使用者拍板）：
//
// 單一隔期規則：
//   - 只從隔期 0~5 選；只取 record CSV 首碼為 '0' 的隔期（最新一期此 slot 有命中）
//   - 排除位置：用 T 自己的 positions CSV、取所有 Y 值 >= 10 的 Y、做去重集合
//   - 5/6/7/8/9 五個位置在 20 顆裡每個位置最多 2 個
//
// 全域規則（cap）：
//   - 候選排序優先序：3 (避免 cap 抵達) > 1 (小隔期優先) > 2 (低位置優先)
//   - <=40 ≤ 12、>40 ≤ 12
//   - 奇數 ≤ 12、偶數 ≤ 12
//   - 任一相同尾數 ≤ 5
//   - 連續號碼最大連跑 ≤ 5
//
// 候選不足 20 / cap 衝突湊不滿：顯示實際數、標「不足 20」（不填、不破 cap）

const PREDICT_TARGET = 20
const SOURCE_MAX_INTERVAL = 5 // 隔期 0~5
const POS_CAP_HIGH = 10 // Y >= 10 排除
const POS_5TO9_CAP = 2 // 位置 5/6/7/8/9 各自 ≤ 2
const LE40_CAP = 12
const GT40_CAP = 12
const ODD_CAP = 12
const EVEN_CAP = 12
const TAIL_CAP = 5
const CONSECUTIVE_CAP = 5

interface SlotSnapshot {
  period: number
  record: string
  prizes: number[]
}

interface PredictionSnapshot {
  drawTerm: number
  drawDate: string
  positions: string
  slot06: SlotSnapshot[]
}

// 漸進式 hydration、每步快照 slot[0..5]。Tab 3 專用。
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
      slot06: s.periods.slice(0, SOURCE_MAX_INTERVAL + 1).map(p => ({
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
}

function wouldViolatePredictionCap(picks: PredictionPick[], cand: PredictionPick): boolean {
  const newNs = picks.map(p => p.n)
  newNs.push(cand.n)

  // <=40 / >40
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
  if (le40 > LE40_CAP) return true
  if (gt40 > GT40_CAP) return true
  if (odd > ODD_CAP) return true
  if (even > EVEN_CAP) return true

  // 尾數
  const tailCount = new Map<number, number>()
  for (const x of newNs) {
    const t = x % 10
    const cur = (tailCount.get(t) ?? 0) + 1
    if (cur > TAIL_CAP) return true
    tailCount.set(t, cur)
  }

  // 連跑
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
  if (max > CONSECUTIVE_CAP) return true

  // 位置 5/6/7/8/9 各 ≤ 2
  const posCount = new Map<number, number>()
  for (const p of picks) {
    if (p.position >= 5 && p.position <= 9) {
      posCount.set(p.position, (posCount.get(p.position) ?? 0) + 1)
    }
  }
  if (cand.position >= 5 && cand.position <= 9) {
    const cur2 = (posCount.get(cand.position) ?? 0) + 1
    if (cur2 > POS_5TO9_CAP) return true
  }
  return false
}

interface PredictionRow {
  predictForTerm: number
  predictForDateLabel: string
  sourceTerm: number
  sourceDateLabel: string
  picks: PredictionPick[]
  picksSorted: PredictionPick[]
  shortBy: number
  actualNumbers: number[]
  hitNumbers: number[]
  hitCount: number
  pending: boolean
}

function predictFromSnapshot(snap: PredictionSnapshot): { picks: PredictionPick[], shortBy: number } {
  // 1. 過濾 slot[0..5]：record CSV 首碼為 '0'
  const eligibleSlots = snap.slot06.filter((p) => {
    const first = p.record.split(',')[0]
    return first === '0'
  })

  // 2. 收集候選（每顆獎號帶 1-indexed 位置 + 隔期 j）
  const allCands: PredictionPick[] = []
  for (const slot of eligibleSlots) {
    const sorted = [...slot.prizes].sort((a, b) => a - b)
    sorted.forEach((n, idx) => {
      allCands.push({ n, position: idx + 1, intervalJ: slot.period })
    })
  }

  // 3. 排除位置：T positions CSV 內所有 Y >= 10 的 Y 集合
  const excludedY = new Set<number>()
  for (const s of snap.positions.split(',')) {
    if (!s) continue
    const dash = s.indexOf('-')
    if (dash < 0) continue
    const y = Number.parseInt(s.slice(dash + 1), 10)
    if (Number.isFinite(y) && y >= POS_CAP_HIGH) excludedY.add(y)
  }
  let filtered = allCands.filter(c => !excludedY.has(c.position))

  // 4. 去重（同號可能跨多個 slot —— step b 已移除、理論上不會、但保險起見）
  const seenN = new Set<number>()
  filtered = filtered.filter((c) => {
    if (seenN.has(c.n)) return false
    seenN.add(c.n)
    return true
  })

  // 5. 排序：小隔期優先 > 低位置優先
  filtered.sort((a, b) => {
    if (a.intervalJ !== b.intervalJ) return a.intervalJ - b.intervalJ
    return a.position - b.position
  })

  // 6. Greedy 選 20：cap 抵達者跳過（cap 避免 = primary）
  const picks: PredictionPick[] = []
  const remaining = [...filtered]
  while (picks.length < PREDICT_TARGET) {
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
  }
  return { picks, shortBy: PREDICT_TARGET - picks.length }
}

const predictionRows = computed<PredictionRow[]>(() => {
  const snaps = predictionSnapshots.value
  if (snaps.length === 0) return []
  const rows: PredictionRow[] = []
  for (let i = 0; i < snaps.length; i++) {
    const snap = snaps[i]!
    const { picks, shortBy } = predictFromSnapshot(snap)
    // 預測目標 = 下一期 = drawsAsc[i+1]（若不存在則尚未開出）
    const next = i + 1 < allDraws.value.length ? allDraws.value[i + 1]! : null
    const actualNumbers = next?.numbers ?? []
    const hitSet = new Set(actualNumbers)
    const picksSorted = [...picks].sort((a, b) => a.n - b.n)
    const hitNumbers: number[] = picksSorted
      .map(p => p.n)
      .filter(n => hitSet.has(n))
    rows.push({
      predictForTerm: next?.drawTerm ?? snap.drawTerm + 1,
      predictForDateLabel: next ? dateLabel(next.drawDate, next.drawTerm) : '',
      sourceTerm: snap.drawTerm,
      sourceDateLabel: dateLabel(snap.drawDate, snap.drawTerm),
      picks,
      picksSorted,
      shortBy,
      actualNumbers,
      hitNumbers,
      hitCount: hitNumbers.length,
      pending: next === null
    })
  }
  rows.reverse() // 最新期在上
  return rows
})

function predictionRateText(row: PredictionRow): string {
  if (row.picks.length === 0) return '—'
  const pct = (row.hitCount / row.picks.length) * 100
  return `${pct.toFixed(1)}%`
}

function isPredictionHit(row: PredictionRow, n: number): boolean {
  return row.hitNumbers.includes(n)
}

// ---- Tab state ----------------------------------------------------------

type TabValue = 'interval' | 'positions' | 'prediction'
const activeTab = ref<TabValue>('interval')
const tabItems = [
  { label: '隔期剩餘號碼', value: 'interval' as const, icon: 'i-lucide-layers' },
  { label: '獎號關聯位置', value: 'positions' as const, icon: 'i-lucide-link' },
  { label: '下一期 20 顆預測', value: 'prediction' as const, icon: 'i-lucide-target' }
]
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
          分析參數：N={{ POSITIONS_ANALYSIS_N }}、深度 {{ FETCH_LIMIT }} 期（對齊 /draws 賓果預設）。共 {{ positionRows.length }} 期，最新期在上。
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

    <!-- Tab 3：下一期 20 顆預測 -->
    <template v-else-if="activeTab === 'prediction'">
      <div
        v-if="predictionRows.length === 0"
        class="rounded-md border border-dashed border-default p-6 text-center text-xs text-muted"
      >
        尚無資料
      </div>
      <template v-else>
        <p class="text-xs text-muted">
          每期套規則從當下「隔期 0~5」（最新記錄為 0、且位置不在 T 排除集合內）挑 20 顆、與下一期 actual 比對。共 {{ predictionRows.length }} 期，最新期在上。
        </p>
        <UCard
          v-for="row in predictionRows"
          :key="`pred-${row.sourceTerm}`"
          :ui="{ body: 'p-3 sm:p-4' }"
        >
          <div class="space-y-3 text-xs">
            <!-- 預測目標期 + 命中機率 -->
            <div class="space-y-1">
              <div class="flex items-baseline gap-2 flex-wrap">
                <span class="font-mono text-sm font-semibold">第 {{ row.predictForTerm }} 期</span>
                <span
                  v-if="row.predictForDateLabel"
                  class="text-[10px] text-muted font-mono"
                >{{ row.predictForDateLabel }}</span>
                <span
                  v-else
                  class="text-[10px] text-muted"
                >尚未開出</span>
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
                >不足 20（差 {{ row.shortBy }} 顆）</span>
                <span
                  v-if="row.pending"
                  class="ml-2 text-muted"
                >待開獎</span>
              </div>
              <div class="text-[10px] text-muted">
                來源期 第 {{ row.sourceTerm }} 期
                <span
                  v-if="row.sourceDateLabel"
                  class="ml-1 font-mono"
                >{{ row.sourceDateLabel }}</span>
              </div>
            </div>

            <!-- 實際開出 -->
            <div class="space-y-1">
              <div class="text-[10px] text-muted">
                實際開出（{{ row.actualNumbers.length }} 顆）
              </div>
              <div
                v-if="row.actualNumbers.length === 0"
                class="text-[10px] text-muted"
              >
                —
              </div>
              <div
                v-else
                class="flex flex-wrap items-center gap-1"
              >
                <UBadge
                  v-for="n in row.actualNumbers"
                  :key="`pred-a-${row.sourceTerm}-${n}`"
                  color="warning"
                  variant="solid"
                  size="sm"
                  class="min-w-7 justify-center font-mono"
                >
                  {{ pad(n) }}
                </UBadge>
              </div>
            </div>

            <!-- 推了哪幾個（升冪、命中染綠） -->
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
