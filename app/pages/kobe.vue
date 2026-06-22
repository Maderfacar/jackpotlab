<script setup lang="ts">
/**
 * 柯比 /kobe
 *
 * 賓果賓果的「獎號來源觀察 + 多面向分析」頁。
 * 7 個 tab，從觀察紀錄逐步深入到波段儀表板。
 *
 * 用語守則（柯比頁全頁）：
 *   - 不在 UI 用英文代數變數（K/X/J/V/Y）。
 *   - 不在 UI 用統計術語（MAE / holdout / chi-square / autocorrelation / regime…）。
 *   - 改用：「隔期」「剩餘顆數」「開出顆數」「樣本數」「平均誤差」「對照基準」「波段」「切換開關」。
 *
 * 詳細 phase 規格見 docs/KOBE-PHASES.md。
 */
import type { DrawQueryResponse } from '~~/shared/lotto/types'
import { defaultN, type AnalysisState } from '~/utils/analysis'
import { buildSnapshotsAndState, type KobeDraw, type PerDrawSnapshot } from '~/utils/kobe-stats'

definePageMeta({
  title: '柯比'
})

const KOBE_ANALYSIS_N = defaultN()
const KOBE_FETCH_LIMIT = 2000
const BINGO_POLL_MS = 30_000

const loading = ref(false)
const error = ref<string | null>(null)
const allDraws = ref<KobeDraw[]>([])

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<DrawQueryResponse>('/api/draws/bingo_bingo/recent', {
      params: { limit: KOBE_FETCH_LIMIT }
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

let pollTimer: ReturnType<typeof setInterval> | null = null

// 量 UHeader 高度給候選 sticky section 用（仿艾佛森 pendingStickyStyle）
const headerHeight = ref<number>(0)
let headerResizeObserver: ResizeObserver | null = null

onMounted(() => {
  load()
  if (typeof window === 'undefined') return
  const headerEl = document.querySelector('header')
  if (headerEl instanceof HTMLElement) {
    headerHeight.value = headerEl.offsetHeight
    if (typeof ResizeObserver !== 'undefined') {
      headerResizeObserver = new ResizeObserver(() => {
        headerHeight.value = headerEl.offsetHeight
      })
      headerResizeObserver.observe(headerEl)
    }
  }
  pollTimer = setInterval(async () => {
    if (loading.value) return
    try {
      const res = await $fetch<DrawQueryResponse>('/api/draws/bingo_bingo/latest')
      const latestServer = res.results[0]?.drawTerm
      if (latestServer == null) return
      const local = allDraws.value
      const localLatest = local.length > 0 ? local[local.length - 1]!.drawTerm : null
      if (localLatest == null || latestServer > localLatest) {
        await load()
      }
    } catch {
      // 單次 poll 失敗忽略
    }
  }, BINGO_POLL_MS)
})

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  headerResizeObserver?.disconnect()
  headerResizeObserver = null
})

// 集中算 snapshots + finalState + preLatestState — 所有 tab 共用、避免重複 hydrate。
// 2000 期 × 60 slot ≈ 120k slot snapshots，hydrate 約 1-2s（一次完成）。
const buildResult = computed(() => {
  if (allDraws.value.length === 0) {
    return { snapshots: [] as PerDrawSnapshot[], finalState: null as AnalysisState | null, preLatestState: null as AnalysisState | null }
  }
  return buildSnapshotsAndState(allDraws.value, KOBE_ANALYSIS_N)
})
const snapshots = computed<PerDrawSnapshot[]>(() => buildResult.value.snapshots)
const finalState = computed<AnalysisState | null>(() => buildResult.value.finalState)
const preLatestState = computed<AnalysisState | null>(() => buildResult.value.preLatestState)

const latestDrawInfo = computed(() => {
  const arr = allDraws.value
  if (arr.length === 0) return null
  const latest = arr[arr.length - 1]!
  const date = latest.drawDate
  return {
    term: latest.drawTerm,
    date
  }
})

interface TabDef {
  value: string
  label: string
  description?: string
}
const tabs: TabDef[] = [
  { value: 'candidate', label: '候選' },
  { value: 'observation', label: '觀察紀錄' },
  { value: 'remaining', label: '隔期剩餘 → 開出' },
  { value: 'cycle', label: '冷熱波段' },
  { value: 'position', label: '位置規律' },
  { value: 'journey', label: '號碼軌跡' },
  { value: 'compare', label: '訊號比拚' },
  { value: 'regime', label: '波段儀表板' }
]
const activeTab = ref<string>('candidate')
</script>

<template>
  <UContainer class="py-10 space-y-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="space-y-2">
        <h1 class="text-3xl font-semibold tracking-tight">
          柯比
        </h1>
        <p class="text-sm text-muted">
          每期獎號的「來源隔期」觀察紀錄 + 多面向分析（共 8 個分頁，候選分頁置頂）。資料源：隔期狀態（N={{ KOBE_ANALYSIS_N }}）+ 獎號關聯，hydrate 自過去 {{ KOBE_FETCH_LIMIT }} 期。
        </p>
        <p
          v-if="latestDrawInfo"
          class="text-xs text-muted"
        >
          最新期：<span class="font-mono">{{ latestDrawInfo.term }}</span>
          <span class="ml-1">{{ latestDrawInfo.date }}</span>
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

    <div
      v-if="loading && snapshots.length === 0"
      class="space-y-3"
    >
      <USkeleton
        v-for="i in 3"
        :key="i"
        class="h-32 w-full rounded-lg"
      />
    </div>

    <UTabs
      v-else
      v-model="activeTab"
      :items="tabs"
      :ui="{ list: 'overflow-x-auto' }"
    >
      <template #content="{ item }">
        <div class="pt-4">
          <KobeCandidateTab
            v-if="item.value === 'candidate'"
            :snapshots="snapshots"
            :final-state="finalState"
            :pre-latest-state="preLatestState"
            :draws-asc="allDraws"
            :interval-count="KOBE_ANALYSIS_N"
            :header-height="headerHeight"
          />
          <KobeObservationTab
            v-else-if="item.value === 'observation'"
            :snapshots="snapshots"
            :interval-count="KOBE_ANALYSIS_N"
          />
          <KobeIntervalRemainingTab
            v-else-if="item.value === 'remaining'"
            :snapshots="snapshots"
          />
          <KobeColdHotCycleTab
            v-else-if="item.value === 'cycle'"
            :snapshots="snapshots"
          />
          <KobePositionPatternTab
            v-else-if="item.value === 'position'"
            :snapshots="snapshots"
          />
          <KobeNumberJourneyTab
            v-else-if="item.value === 'journey'"
            :snapshots="snapshots"
          />
          <KobeSignalCompareTab
            v-else-if="item.value === 'compare'"
            :snapshots="snapshots"
          />
          <KobeRegimeDashboardTab
            v-else-if="item.value === 'regime'"
            :snapshots="snapshots"
          />
        </div>
      </template>
    </UTabs>
  </UContainer>
</template>
