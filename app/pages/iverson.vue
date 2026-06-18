<script setup lang="ts">
/**
 * 艾佛森 /iverson
 *
 * 賓果賓果的「隔期狀態」即時頁。
 *   - 邏輯承襲自 utils/analysis.ts 的 PeriodTable（與 /draws 同一份算法）
 *   - UI 承襲自 /bingo-heineken：UBadge size=md、warning solid、min-w-8、
 *     右下角小黑字標 1-indexed 位置
 *
 * 規格（2026-06-19 初稿）：
 *   - 隔期量 N = 50（analysisState.periods 50 格）
 *   - 深度 = 過去 1 小時（賓果 5 分鐘 1 期 → 餵入最新 12 期）
 *   - 日期格式：MM/DD HH:MM
 *
 * 每 30 秒輪詢 /api/draws/bingo_bingo/latest 比對最新一期；若 server 端已超過本地即重抓。
 */

import type { DrawQueryResponse } from '~~/shared/lotto/types'
import { hydrateFromDraws, type AnalysisDrawInput } from '~/utils/analysis'
import { bingoTimeFromMap, buildBingoMinTermByDate } from '~/utils/bingo-time'

definePageMeta({
  title: '艾佛森'
})

const ANALYSIS_N = 50
const PAST_HOUR_DRAWS = 12

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
    // 抓 limit=300 是為了讓 buildBingoMinTermByDate 拿到當天最小 drawTerm
    // 才能正確算 HH:MM；只把最近 12 期餵進 analysisState。
    const res = await $fetch<DrawQueryResponse>('/api/draws/bingo_bingo/recent', {
      params: { limit: 300 }
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

const pastHourInputs = computed<AnalysisDrawInput[]>(() => {
  if (allDraws.value.length === 0) return []
  const latest = allDraws.value[allDraws.value.length - 1]!
  const cutoff = latest.drawTerm - (PAST_HOUR_DRAWS - 1)
  return allDraws.value
    .filter(d => d.drawTerm >= cutoff)
    .map(d => ({
      drawTerm: d.drawTerm,
      drawDate: d.drawDate,
      prizes: d.numbers
    }))
})

const analysisState = computed(() => {
  if (pastHourInputs.value.length === 0) return null
  return hydrateFromDraws('bingo_bingo', ANALYSIS_N, pastHourInputs.value)
})

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
  const s = analysisState.value
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

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}
</script>

<template>
  <UContainer class="py-10 space-y-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="space-y-2">
        <h1 class="text-3xl font-semibold tracking-tight">
          艾佛森
        </h1>
        <p class="text-sm text-muted">
          賓果賓果隔期狀態（隔期量 {{ ANALYSIS_N }} 期、深度過去 1 小時）。每顆號碼右下角小黑字＝該號於該隔期中的位置。
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

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="`載入失敗：${error}`"
    />

    <div
      v-if="loading && intervalRows.length === 0"
      class="space-y-3"
    >
      <USkeleton
        v-for="i in 5"
        :key="i"
        class="h-12 w-full rounded-lg"
      />
    </div>

    <template v-else-if="intervalRows.length > 0">
      <UCard :ui="{ body: 'p-4' }">
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
    </template>

    <div
      v-else
      class="rounded-md border border-dashed border-default p-6 text-center text-xs text-muted"
    >
      尚無資料
    </div>
  </UContainer>
</template>
