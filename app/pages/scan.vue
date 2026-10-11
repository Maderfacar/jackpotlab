<script setup lang="ts">
/**
 * 我的查找 · 今彩 539 —— 八點（2026-10-11 使用者拍板，整頁重做）。
 *
 * 資料：public/data/lotto539-history.json（2007-01-01 起全部歷史，不吃資料庫讀取）
 *      + /api/draws/lotto539/since（只讀存檔之後的新期數）。
 * 每期八點亮燈／成真在 shared/lotto/scan/points；可切到任何一期，只用那期以前的資料。
 * 判斷勾選存這台裝置的瀏覽器（useScanPicks）。
 */
import { HISTORY_FILE_PATH, mergeDraws, parseHistoryFile, type PlainDraw } from '~~/shared/lotto/history-file'
import type { DrawQueryResponse } from '~~/shared/lotto/types'
import { WARMUP } from '~~/shared/lotto/scan/scan'
import { evaluatePoints, POINT_KEYS, type PointKey } from '~~/shared/lotto/scan/points/evaluate'
import { POINT_META } from '~~/shared/lotto/scan/points/meta'
import { buildRows } from '~~/shared/lotto/scan/points/rows'
import { allTrueTable, pairMatrix, strip, summarize } from '~~/shared/lotto/scan/points/stats'

useSeoMeta({ title: '我的查找 — 今彩 539' })

const STRIP_SIZE = 40

const { data, status, error } = useAsyncData('scan-draws', async () => {
  const history = parseHistoryFile(await $fetch(HISTORY_FILE_PATH))
  const fileLast = history.at(-1)?.issue ?? '0'
  let newer: PlainDraw[] = []
  let newerError = ''
  try {
    const res = await $fetch<DrawQueryResponse>('/api/draws/lotto539/since', { query: { after: fileLast } })
    newer = res.results.map(r => ({ issue: String(r.drawTerm), date: r.drawDate, nums: [...r.numbers].sort((a, b) => a - b) }))
  } catch (e: unknown) {
    newerError = e instanceof Error ? e.message : '讀取失敗'
  }
  return { draws: mergeDraws(history, newer), fileLast, newerError }
}, { server: false })

const rows = computed(() => buildRows(data.value?.draws ?? []))
const evals = computed(() => evaluatePoints(rows.value))
const lastT = computed(() => rows.value.length - 1)

/** null = 一直跟著最新一期 */
const picked = ref<number | null>(null)
const t = computed(() => Math.max(WARMUP + 1, Math.min(picked.value ?? lastT.value, lastT.value)))
const isLatest = computed(() => t.value === lastT.value)
function step(delta: number) {
  const next = Math.max(WARMUP + 1, Math.min(lastT.value, t.value + delta))
  picked.value = next === lastT.value ? null : next
}

const ready = computed(() => rows.value.length > WARMUP + 2)
const draw = computed(() => rows.value[t.value]!)
const nextDraw = computed(() => rows.value[t.value + 1] ?? null)
const summary = computed(() => summarize(evals.value, t.value))
const nowEvals = computed(() => Object.fromEntries(POINT_KEYS.map(k => [k, evals.value[k][t.value]!])) as Record<PointKey, typeof evals.value.low[number]>)

// ---- 判斷勾選 ----
const picks = useScanPicks()
const canPick = computed(() => isLatest.value && !nextDraw.value)
const indexOf = computed(() => new Map(rows.value.map((r, i) => [r.issue, i])))

const tiles = computed(() => POINT_META.map(m => ({
  meta: m,
  now: nowEvals.value[m.key],
  summary: summary.value[m.key],
  picked: picks.isPicked(draw.value.issue, m.key)
})))

// ---- 相吸相斥 ----
const stripData = computed(() => strip(evals.value, rows.value, t.value, STRIP_SIZE))
const matrix = computed(() => pairMatrix(evals.value, t.value))
const allTrue = computed(() => allTrueTable(evals.value, t.value))

const rangeText = computed(() => {
  if (!ready.value) return ''
  const first = rows.value[WARMUP]!
  return `用了 ${(t.value - WARMUP + 1).toLocaleString()} 期（${first.date}～${draw.value.date}）；最前面 ${WARMUP} 期表格還沒填滿，不算`
})

function jump(key: PointKey) {
  document.getElementById(`point-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="scan-root mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">
        我的查找 · 今彩 539
      </h1>
      <p class="text-sm text-muted">
        每期開完，看你的八個觀察點哪幾個「亮了」——亮了就是那個情況這期出現了，下一期開出來再對答案。
        所有數字都是 2007 年到現在實際開過的次數，不是預測。
      </p>
    </div>

    <div
      v-if="status === 'pending' || status === 'idle'"
      class="py-16 text-center text-sm text-muted"
    >
      載入中…
    </div>
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="`載入失敗：${error.message}`"
    />

    <template v-else-if="ready && data">
      <UAlert
        v-if="data.newerError"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="`最新期數讀不到（${data.newerError}），目前只顯示到存檔的第 ${data.fileLast} 期`"
      />

      <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div class="flex items-center gap-1">
          <UButton
            icon="i-lucide-chevrons-left"
            size="sm"
            color="neutral"
            variant="subtle"
            aria-label="往前 10 期"
            :disabled="t <= WARMUP + 1"
            @click="step(-10)"
          />
          <UButton
            icon="i-lucide-chevron-left"
            size="sm"
            color="neutral"
            variant="subtle"
            aria-label="上一期"
            :disabled="t <= WARMUP + 1"
            @click="step(-1)"
          />
          <span class="px-2 text-sm">第 <b class="font-mono">{{ draw.issue }}</b> 期開完</span>
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
        <span class="text-xs text-muted">{{ rangeText }}</span>
      </div>

      <div class="grid gap-3">
        <ScanDrawCard
          :draw="draw"
          :label="isLatest ? '最新一期' : '回看的這一期'"
        />
        <ScanDrawCard
          v-if="nextDraw"
          :draw="nextDraw"
          label="下一期實際開出（只拿來對答案，不算進統計）"
          highlight
        />
      </div>

      <ScanGuide
        :low="summary.low"
        :pair="summary.pair"
      />

      <ScanSignalBoard
        :tiles="tiles"
        :can-pick="canPick"
        :has-next="!!nextDraw"
        :pick-error="picks.errorText.value"
        @toggle="key => picks.toggle(draw.issue, key)"
        @jump="jump"
      />

      <ScanAffinity
        :strip="stripData"
        :matrix="matrix"
        :all-true="allTrue"
        @jump="jump"
      />

      <div class="space-y-4">
        <h2 class="text-lg font-semibold">
          八點細節
        </h2>
        <ScanPointLow
          :rows="rows"
          :t="t"
          :now="nowEvals.low"
          :summary="summary.low"
        />
        <ScanPointGapSum
          :rows="rows"
          :t="t"
          :now="nowEvals.gapsum"
          :summary="summary.gapsum"
        />
        <ScanPointValue
          :rows="rows"
          :t="t"
          :now="nowEvals.value"
          :summary="summary.value"
        />
        <ScanPointPair
          :rows="rows"
          :t="t"
          :now="nowEvals.pair"
          :summary="summary.pair"
        />
        <ScanPointY
          :rows="rows"
          :t="t"
          :now="nowEvals.y"
          :summary="summary.y"
        />
        <ScanPointPos
          :rows="rows"
          :t="t"
          :now="nowEvals.pos"
          :summary="summary.pos"
        />
        <ScanPointChain
          :rows="rows"
          :t="t"
          :now="nowEvals.chain"
          :summary="summary.chain"
        />
        <ScanPointTail
          :rows="rows"
          :t="t"
          :now="nowEvals.tail"
          :summary="summary.tail"
        />
      </div>

      <ScanPickScore
        :picks="picks.picks.value"
        :status="picks.status.value"
        :evals="evals"
        :index-of="indexOf"
        :rows="rows"
      />

      <p class="text-xs text-muted">
        「平常」＝不管有沒有亮燈，這件事本來就會發生的比例。次數不到 30 次的會標「次數少」，參考就好。
        過去的開獎存在網站裡（到第 {{ data.fileLast }} 期），之後的新期數才去資料庫讀。
      </p>
    </template>
  </div>
</template>

<style scoped>
.scan-root {
  --scan-blue: #2a78d6;
  --scan-orange: #eb6834;
  --scan-ball-ink: #0b0b0b;
  --viz-blue: #2a78d6;
  --viz-orange: #eb6834;
  --viz-red: #e34948;
  --viz-mid: #f0efec;
  --viz-gray: #a3a29c;
  --viz-good: #0ca30c;
  --viz-good-text: #006300;
  --viz-bad: #d03b3b;
  --viz-blue-text: #1c5cab;
  --viz-orange-text: #b8481c;
}
:global(.dark) .scan-root {
  --scan-blue: #3987e5;
  --scan-orange: #d95926;
  --viz-blue: #3987e5;
  --viz-orange: #d95926;
  --viz-red: #e66767;
  --viz-mid: #383835;
  --viz-gray: #6f6e69;
  --viz-good: #0ca30c;
  --viz-good-text: #4cc94c;
  --viz-bad: #e66767;
  --viz-blue-text: #86b6ef;
  --viz-orange-text: #f0905f;
}
</style>

<style>
.scan-root [id] {
  scroll-margin-top: 5rem;
}
</style>
