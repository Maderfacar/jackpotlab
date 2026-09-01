<script setup lang="ts">
/**
 * 賓果訊號 /bingo-signals — 歷史相似比對（賓果尺 + 窮舉計分）+ 預期vs實際帳本。
 * 2026-09-02 使用者拍板「第一版試水溫」。
 *
 * 與 /signals（539）平行、引擎獨立（app/bingosignals/*）；539 引擎不動。
 * 資料池預設 7 天（≈1,420 期，扣暖機 60 期）；頁面可調 3~16 天。
 *
 * ⚠️ 動本頁或比對邏輯前必看 docs/HINDSIGHT-PRINCIPLE.md。
 */

import type { DrawQueryResponse } from '~~/shared/lotto/types'
import { hydrateFromDraws, defaultN, type AnalysisDrawInput, type AnalysisState } from '~/utils/analysis'
import { toBingoSignalRows } from '~/bingosignals/history'
import type { SignalRow } from '~/signals/types'

definePageMeta({
  title: '賓果訊號'
})

const GAME_ID = 'bingo_bingo'
const ANALYSIS_N = defaultN()
const PER_DAY_MAX = 230
const DEFAULT_DAYS = 7
const MIN_DAYS = 3
const MAX_DAYS = 16
const DAYS_STORAGE_KEY = 'jackpotlab-bingo-signals-days'

const days = ref(DEFAULT_DAYS)
const loading = ref(false)
const error = ref<string | null>(null)
const rows = shallowRef<SignalRow[]>([])
const analysisState = shallowRef<AnalysisState | null>(null)

function clampDays(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_DAYS
  return Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.floor(v)))
}

function loadDaysPref() {
  if (typeof window === 'undefined') return
  const raw = window.localStorage.getItem(DAYS_STORAGE_KEY)
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  days.value = clampDays(parsed)
}

function taipeiDateNDaysAgo(n: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(Date.now() - n * 24 * 60 * 60 * 1000))
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<DrawQueryResponse>(`/api/draws/${GAME_ID}/recent`, {
      params: { limit: days.value * PER_DAY_MAX }
    })
    const cutoff = taipeiDateNDaysAgo(days.value - 1)
    const drawsAsc = [...res.results]
      .filter(r => r.drawDate >= cutoff)
      .sort((a, b) => a.drawTerm - b.drawTerm)
    const inputs: AnalysisDrawInput[] = drawsAsc.map(r => ({
      drawTerm: r.drawTerm,
      drawDate: r.drawDate,
      prizes: [...new Set(r.special != null ? [...r.numbers, r.special] : r.numbers)]
    }))
    const state = hydrateFromDraws(GAME_ID, ANALYSIS_N, inputs)
    analysisState.value = state
    rows.value = toBingoSignalRows(state)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'unknown error'
  } finally {
    loading.value = false
  }
}

function commitDays(rawVal: number | string) {
  const num = typeof rawVal === 'string' ? Number.parseInt(rawVal, 10) : rawVal
  const clamped = clampDays(num)
  days.value = clamped
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(DAYS_STORAGE_KEY, String(clamped))
  }
  load()
}

onMounted(() => {
  loadDaysPref()
  load()
})

const latestRow = computed(() => rows.value.at(-1) ?? null)

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
</script>

<template>
  <UContainer class="py-10 space-y-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="space-y-2">
        <h1 class="text-3xl font-semibold tracking-tight">
          賓果訊號 · 歷史相似比對
        </h1>
        <p class="text-sm text-muted">
          賓果賓果（80 選 20，每 5 分鐘一期）· 賓果專用尺 + 窮舉計分 · 第一版試水溫
        </p>
      </div>
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-refresh-cw"
        :loading="loading"
        @click="load"
      >
        重新整理
      </UButton>
    </header>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="`載入失敗：${error}`"
    />

    <UCard>
      <div class="space-y-3">
        <div
          v-if="latestRow"
          class="space-y-1"
        >
          <p class="text-sm font-medium">
            最新一期 {{ latestRow.issue }}（{{ latestRow.date }}）
          </p>
          <!-- 方格樣式沿用賓果海尼根（size md + min-w-8 + gap-1.5） -->
          <div class="flex flex-wrap items-center gap-1.5">
            <UBadge
              v-for="num in latestRow.prizes"
              :key="num"
              color="warning"
              variant="solid"
              size="md"
              class="min-w-8 justify-center font-mono"
            >
              {{ pad2(num) }}
            </UBadge>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-3 text-xs text-muted">
          <label class="flex items-center gap-2">
            <span>資料天數</span>
            <UInput
              :model-value="days"
              type="number"
              size="xs"
              :min="MIN_DAYS"
              :max="MAX_DAYS"
              class="w-20"
              @change="(e: Event) => commitDays((e.target as HTMLInputElement).value)"
            />
          </label>
          <span v-if="rows.length > 0">賓果一天 203 期 · 前 {{ ANALYSIS_N }} 期表格未填滿不入比對 · 可比對 {{ rows.length }} 期（{{ rows[0]?.date }} ～ {{ latestRow?.date }}）</span>
          <UBadge
            v-if="loading"
            color="info"
            variant="subtle"
            size="sm"
            class="animate-pulse"
          >
            載入中…
          </UBadge>
        </div>
      </div>
    </UCard>

    <BingosignalsBingoSimilaritySection
      v-if="rows.length > 0"
      :rows="rows"
    />

    <BingosignalsBingoForecastSection />

    <p class="text-xs text-muted">
      誠實註記：相似段的「下一期／下二期」是歷史事實紀錄，是參考不是預測。10 顆候選的隨機基準 = 中 2.5 顆，帳本累積成績自己會說話。本頁為統計驗證用途。
    </p>
  </UContainer>
</template>
