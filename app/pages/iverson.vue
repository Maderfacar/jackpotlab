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
 *   - 日期格式：MM/DD HH:MM
 *
 * 兩 tab 共用同一份 `allDraws` fetch（limit=500），分別 hydrate 兩個 analysisState。
 *
 * ⚠️ 動本頁前必看 docs/IVERSON-PRINCIPLES.md。
 */

import type { DrawQueryResponse } from '~~/shared/lotto/types'
import {
  defaultN,
  defaultD,
  hydrateFromDraws,
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

// ---- Tab state ----------------------------------------------------------

type TabValue = 'interval' | 'positions'
const activeTab = ref<TabValue>('interval')
const tabItems = [
  { label: '隔期剩餘號碼', value: 'interval' as const, icon: 'i-lucide-layers' },
  { label: '獎號關聯位置', value: 'positions' as const, icon: 'i-lucide-link' }
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
  </UContainer>
</template>
