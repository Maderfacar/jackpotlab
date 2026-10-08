<script setup lang="ts">
/**
 * 我的查找（2026-10-08 使用者拍板）：照使用者每期開獎後的查找方向——隔期狀態四段＋獎號關聯七點——排成一頁。
 *
 * 資料：/api/analysis/lotto539?format=json（與 /board 同一支）。盤面由 shared/lotto/scan/board-states 從開獎號碼重建，
 * 已用真實資料核對與網站隔期狀態、獎號關聯逐顆一致。全部是已開出資料的查找次數，不做預測；
 * 可切到任何一期，只用那一期以前的資料，並對照下一期實際開出。
 */
import { computeBoardStates } from '~~/shared/lotto/scan/board-states'
import { WARMUP, type ScanDraw } from '~~/shared/lotto/scan/scan'
import { buildScanView } from '~~/shared/lotto/scan/view'

interface HistoryEntry {
  issue: string
  date: string
  prizes: string
  periods?: string
  values?: string
  positions?: string
}
interface AnalysisJson {
  history: HistoryEntry[]
}

useSeoMeta({ title: '我的查找 — 今彩 539' })

const { data, status, error } = useFetch<AnalysisJson>('/api/analysis/lotto539', {
  query: { format: 'json' },
  server: false
})

const toNum = (s: string | undefined) => (s == null || s === '' ? null : Number(s))
function parseDraw(h: HistoryEntry): ScanDraw {
  const nums = h.prizes.split(',').map(Number)
  const split = (x?: string) => (x ? x.split(',') : nums.map(() => ''))
  const pos = split(h.positions)
  return {
    issue: h.issue,
    date: h.date,
    nums,
    gaps: split(h.periods).map(toNum),
    values: split(h.values).map(toNum),
    xs: pos.map(p => (p ? Number(p.split('-')[0]) : null)),
    ys: pos.map(p => (p ? Number(p.split('-')[1]) : null))
  }
}

const draws = computed(() => (data.value?.history ?? []).map(parseDraw))
const states = computed(() => computeBoardStates(draws.value.map(d => d.nums), 60))
const lastT = computed(() => draws.value.length - 1)

/** null = 一直跟著最新一期 */
const picked = ref<number | null>(null)
const t = computed(() => Math.max(WARMUP, Math.min(picked.value ?? lastT.value, lastT.value)))
const isLatest = computed(() => t.value === lastT.value)
function step(delta: number) {
  const next = Math.max(WARMUP, Math.min(lastT.value, t.value + delta))
  picked.value = next === lastT.value ? null : next
}

const sizeOptions = [
  { label: '全部', value: 0 },
  { label: '近 300 期', value: 300 },
  { label: '近 100 期', value: 100 }
]
const size = ref(0)
const recentN = ref(20)

const view = computed(() => (draws.value.length > WARMUP + 1
  ? buildScanView(draws.value, states.value, t.value, size.value || null, recentN.value)
  : null))
const rangeText = computed(() => {
  const v = view.value
  if (!v || !v.idx.length) return ''
  const first = draws.value[v.idx[0]!]!
  return `統計：第 ${first.issue}～${v.draw.issue} 期，共 ${v.idx.length} 期（已剔除最前面 ${WARMUP} 期暖機）`
})
</script>

<template>
  <div class="scan-root mx-auto w-full max-w-6xl space-y-5 px-4 py-8 sm:px-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">
        我的查找 · 今彩 539
      </h1>
      <p class="text-sm text-muted">
        照你每期開獎後的查找方向排好：先看隔期狀態，再看獎號關聯七點。全部是已開出資料的次數統計，不是預測。
      </p>
    </div>

    <div
      v-if="status === 'pending'"
      class="py-16 text-center text-sm text-muted"
    >
      載入中…
    </div>
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="`載入失敗：${error.statusMessage ?? error.message}`"
    />

    <template v-else-if="view">
      <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div class="flex items-center gap-1">
          <UButton
            icon="i-lucide-chevrons-left"
            size="sm"
            color="neutral"
            variant="subtle"
            aria-label="往前 10 期"
            :disabled="t <= WARMUP"
            @click="step(-10)"
          />
          <UButton
            icon="i-lucide-chevron-left"
            size="sm"
            color="neutral"
            variant="subtle"
            aria-label="上一期"
            :disabled="t <= WARMUP"
            @click="step(-1)"
          />
          <span class="px-2 text-sm">第 <b class="font-mono">{{ view.draw.issue }}</b> 期開完</span>
          <UButton
            icon="i-lucide-chevron-right"
            size="sm"
            color="neutral"
            variant="subtle"
            aria-label="下一期"
            :disabled="isLatest"
            @click="step(1)"
          />
          <UButton
            icon="i-lucide-chevrons-right"
            size="sm"
            color="neutral"
            variant="subtle"
            aria-label="往後 10 期"
            :disabled="isLatest"
            @click="step(10)"
          />
          <UButton
            v-if="!isLatest"
            size="sm"
            color="primary"
            variant="soft"
            class="ml-1"
            @click="picked = null"
          >
            回到最新
          </UButton>
        </div>
        <label class="flex items-center gap-2 text-sm">
          統計範圍
          <USelect
            v-model="size"
            :items="sizeOptions"
            size="sm"
            class="w-32"
          />
        </label>
        <span class="text-xs text-muted">{{ rangeText }}</span>
      </div>

      <div class="grid gap-4">
        <ScanDrawCard
          :draw="view.draw"
          :label="isLatest ? '最新一期' : '回看的這一期'"
        />
        <ScanDrawCard
          v-if="view.next"
          :draw="view.next"
          label="下一期實際開出（對照用，統計不含這期以後）"
          highlight
        />
      </div>

      <ScanChecklist :view="view" />
      <ScanBoardState
        v-model:recent-n="recentN"
        :view="view"
      />
      <ScanGapSum :view="view" />
      <ScanValueSum :view="view" />
      <ScanPositionStreak :view="view" />
      <ScanYInterval :view="view" />
      <ScanTails :view="view" />
      <ScanExtras :view="view" />

      <p class="text-xs text-muted">
        「平常」= 不加條件時同一件事發生的比例；次數少於 30 標「樣本少」，參考就好。
        資料：<a
          href="/api/analysis/lotto539"
          target="_blank"
          class="underline"
        >/api/analysis/lotto539</a>（與號碼走勢同一份），開獎後自動更新。
      </p>
    </template>
  </div>
</template>

<style scoped>
.scan-root {
  --scan-blue: #2a78d6;
  --scan-orange: #eb6834;
  --scan-ball-ink: #0b0b0b;
}
:global(.dark) .scan-root {
  --scan-blue: #3987e5;
  --scan-orange: #d95926;
}
</style>

<style>
/* 「細節」連結跳過去時，避開上方固定的導覽列 */
.scan-root [id] {
  scroll-margin-top: 5rem;
}
</style>
