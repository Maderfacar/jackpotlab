<script setup lang="ts">
/**
 * 訊號 /signals — 歷史相似片段（形狀比對）單一功能頁。
 *
 * 2026-08-31 使用者拍板：頁面只留歷史相似比對，以最新一期為窗口結尾。
 * 原本的例行檢查／條件燈／觀察卡已從頁面移除；模組與元件保留在
 * app/signals/ 與 app/components/signals/，要掛回來再掛。
 *
 * 資料層與 /draws、/api/analysis 完全同一套 hydrateFromDraws。
 *
 * ⚠️ 動本頁或比對邏輯前必看 docs/HINDSIGHT-PRINCIPLE.md。
 */

import type { DrawQueryResponse } from '~~/shared/lotto/types'
import { hydrateFromDraws, defaultN, clampD, type AnalysisDrawInput } from '~/utils/analysis'
import { toSignalRows } from '~/signals/history'
import type { SignalRow } from '~/signals/types'

definePageMeta({
  title: '訊號'
})

const GAME_ID = 'lotto539'
const ANALYSIS_N = defaultN()
/** 預設兩年：539 一週 6 期，約 700 期 */
const DEFAULT_DEPTH = 700
const DEPTH_STORAGE_KEY = 'jackpotlab-signals-d'

const depthD = ref(DEFAULT_DEPTH)
const loading = ref(false)
const error = ref<string | null>(null)
const rows = shallowRef<SignalRow[]>([])

function loadDepthPref() {
  if (typeof window === 'undefined') return
  const raw = window.localStorage.getItem(DEPTH_STORAGE_KEY)
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  depthD.value = Number.isFinite(parsed) ? clampD(parsed) : DEFAULT_DEPTH
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<DrawQueryResponse>(`/api/draws/${GAME_ID}/recent`, {
      params: { limit: depthD.value }
    })
    const drawsAsc = [...res.results].sort((a, b) => a.drawTerm - b.drawTerm)
    const inputs: AnalysisDrawInput[] = drawsAsc.map(r => ({
      drawTerm: r.drawTerm,
      drawDate: r.drawDate,
      prizes: [...new Set(r.special != null ? [...r.numbers, r.special] : r.numbers)]
    }))
    const state = hydrateFromDraws(GAME_ID, ANALYSIS_N, inputs)
    rows.value = toSignalRows(state)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'unknown error'
  } finally {
    loading.value = false
  }
}

function commitDepth(rawVal: number | string) {
  const num = typeof rawVal === 'string' ? Number.parseInt(rawVal, 10) : rawVal
  const clamped = clampD(Number.isFinite(num) ? num : DEFAULT_DEPTH)
  depthD.value = clamped
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(DEPTH_STORAGE_KEY, String(clamped))
  }
  load()
}

onMounted(() => {
  loadDepthPref()
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
          訊號 · 歷史相似比對
        </h1>
        <p class="text-sm text-muted">
          今彩 539 · 以最新一期為結尾的 5 期形狀，在載入歷史裡找最像的段落
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
          class="flex flex-wrap items-center gap-2"
        >
          <span class="text-sm font-medium">起始期（最新）{{ latestRow.issue }}（{{ latestRow.date }}）</span>
          <UBadge
            v-for="num in latestRow.prizes"
            :key="num"
            color="warning"
            variant="solid"
            size="lg"
            class="min-w-9 justify-center font-mono"
          >
            {{ pad2(num) }}
          </UBadge>
        </div>
        <div class="flex flex-wrap items-center gap-3 text-xs text-muted">
          <label class="flex items-center gap-2">
            <span>載入期數</span>
            <UInput
              :model-value="depthD"
              type="number"
              size="xs"
              min="100"
              max="5000"
              class="w-24"
              @change="(e: Event) => commitDepth((e.target as HTMLInputElement).value)"
            />
          </label>
          <span v-if="rows.length > 0">預設 700 期 ≒ 兩年 · 前 {{ ANALYSIS_N }} 期表格未填滿不入比對 · 可比對 {{ rows.length }} 期（{{ rows[0]?.date }} ～ {{ latestRow?.date }}）</span>
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

    <SignalsSimilaritySection
      v-if="rows.length > 0"
      :rows="rows"
    />

    <p class="text-xs text-muted">
      誠實註記：相似段的「下一期／下二期」是歷史事實紀錄，樣本很少，是參考不是預測。每次開獎後本頁自動以最新一期重新比對。
    </p>
  </UContainer>
</template>
