<script setup lang="ts">
/**
 * 訊號牆：列出當彩種所有訊號的成績單卡片。
 * 排序預設按「近 20 期命中率」由高到低（樣本不足／無資料的拉到尾端）；
 * 也可切換到累積命中率或觸發頻率。
 * 點卡片 → emit('open', signalId) 由父頁面展開 SignalDetail。
 */

import type { GameId } from '~~/shared/lotto/games'
import { N0, baselineHitRate } from '~/hindsight/config'
import { recentHitRate, smoothedHitRate } from '~/hindsight/scorecard'
import { getSignalsForGame } from '~/hindsight/registry'
import type { BrainState, SignalDef, SignalScorecard } from '~/hindsight/types'

interface Props {
  gameId: GameId
  brainState: BrainState | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  open: [signalId: string]
}>()

type SortKey = 'recent' | 'cumulative' | 'frequency'
const sortKey = ref<SortKey>('recent')
const SAMPLE_FLOOR = 30

const sortItems = [
  { label: '近 20 期', value: 'recent' as const },
  { label: '累積', value: 'cumulative' as const },
  { label: '觸發頻率', value: 'frequency' as const }
]

const baseline = computed(() => baselineHitRate(props.gameId))
const signals = computed<SignalDef[]>(() => getSignalsForGame(props.gameId))

interface SignalRow {
  signal: SignalDef
  isObservation: boolean
  scorecard: SignalScorecard | null
  totalFires: number
  totalPicks: number
  recentRate: number | null
  cumulativeRate: number
  sampleLow: boolean
}

const rows = computed<SignalRow[]>(() => {
  const out: SignalRow[] = []
  for (const sig of signals.value) {
    const sc = props.brainState?.scorecards[sig.id] ?? null
    const totalPicks = sc?.totalPicks ?? 0
    const totalFires = sc?.totalFires ?? 0
    const cumulative = sc ? smoothedHitRate(sc, baseline.value, N0) : baseline.value
    const recent = sc ? recentHitRate(sc, 20) : null
    const isObservation = sig.kind === 'observation'
    out.push({
      signal: sig,
      isObservation,
      scorecard: sc,
      totalFires,
      totalPicks,
      recentRate: recent,
      cumulativeRate: cumulative,
      // 觀察型不適用「樣本不足」概念——它沒有命中率，只算「已觀察 N 次」
      sampleLow: !isObservation && totalPicks < SAMPLE_FLOOR
    })
  }
  return out
})

const sortedRows = computed<SignalRow[]>(() => {
  const arr = [...rows.value]
  // 觀察型不算命中率，按 hit-rate 排序時固定排到尾端、組內按 totalFires
  if (sortKey.value === 'recent') {
    arr.sort((a, b) => {
      if (a.isObservation !== b.isObservation) return a.isObservation ? 1 : -1
      if (a.isObservation) return b.totalFires - a.totalFires
      const av = a.recentRate ?? -1
      const bv = b.recentRate ?? -1
      return bv - av
    })
  } else if (sortKey.value === 'cumulative') {
    arr.sort((a, b) => {
      if (a.isObservation !== b.isObservation) return a.isObservation ? 1 : -1
      if (a.isObservation) return b.totalFires - a.totalFires
      return b.cumulativeRate - a.cumulativeRate
    })
  } else {
    arr.sort((a, b) => b.totalFires - a.totalFires)
  }
  return arr
})

function rateText(v: number | null): string {
  if (v == null) return '—'
  return `${(v * 100).toFixed(1)}%`
}

function avgHits(sc: SignalScorecard | null): string {
  if (!sc || sc.totalFires === 0) return '—'
  return (sc.totalHits / sc.totalFires).toFixed(2)
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-muted">排序</span>
      <UTabs
        v-model="sortKey"
        :items="sortItems"
        :unmount-on-hide="false"
        variant="pill"
        color="neutral"
        size="sm"
        :content="false"
      />
    </div>

    <div
      v-if="sortedRows.length === 0"
      class="rounded-md border border-dashed border-default p-6 text-center text-xs text-muted"
    >
      此彩種尚未有訊號註冊
    </div>

    <UCard
      v-for="row in sortedRows"
      :key="row.signal.id"
      :ui="{ body: 'p-4' }"
      class="cursor-pointer transition hover:ring-1 hover:ring-primary"
      :class="row.sampleLow ? 'opacity-70' : ''"
      @click="emit('open', row.signal.id)"
    >
      <div class="space-y-2">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <div class="flex items-baseline gap-2">
            <span class="text-sm font-semibold">
              {{ row.signal.nameZh }}
            </span>
            <UBadge
              v-if="row.isObservation"
              color="neutral"
              variant="subtle"
              size="sm"
            >
              觀察型
            </UBadge>
            <UBadge
              v-else-if="row.sampleLow"
              color="warning"
              variant="subtle"
              size="sm"
            >
              ⚠ 樣本不足 {{ row.totalPicks }}/{{ SAMPLE_FLOOR }}
            </UBadge>
          </div>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-4 text-muted"
          />
        </div>
        <p class="text-xs text-muted">
          {{ row.signal.description }}
        </p>
        <!-- 預測型：4 欄命中率指標 -->
        <div
          v-if="!row.isObservation"
          class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs tabular-nums"
        >
          <div>
            <div class="text-muted">
              累積命中率
            </div>
            <div class="font-mono">
              {{ rateText(row.cumulativeRate) }}
            </div>
          </div>
          <div>
            <div class="text-muted">
              最近 20 期
            </div>
            <div class="font-mono">
              {{ rateText(row.recentRate) }}
            </div>
          </div>
          <div>
            <div class="text-muted">
              亮燈次數
            </div>
            <div class="font-mono">
              {{ row.totalFires }}
            </div>
          </div>
          <div>
            <div class="text-muted">
              平均每次中
            </div>
            <div class="font-mono">
              {{ avgHits(row.scorecard) }}
            </div>
          </div>
        </div>
        <!-- 觀察型：只顯示「已觀察次數」 -->
        <div
          v-else
          class="text-xs tabular-nums"
        >
          <span class="text-muted">已觀察</span>
          <span class="ml-1 font-mono">{{ row.totalFires }}</span>
          <span class="text-muted"> 次</span>
        </div>
      </div>
    </UCard>
  </div>
</template>
