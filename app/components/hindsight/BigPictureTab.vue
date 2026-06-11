<script setup lang="ts">
/**
 * 大局：整體命中率趨勢 + 警示中心 + 鑑古健康狀態。
 *
 * 趨勢資料來自所有 scorecards 的 recentFirings，按 drawTerm 聚合「中/推」比值。
 * 期間切換 30/90/365 期；不足期數時顯示「樣本不足」。
 */

import type { GameId } from '~~/shared/lotto/games'
import { bingoTimeFromMap, buildBingoMinTermByDate } from '~/utils/bingo-time'
import type { BrainAlert, BrainDraw, BrainState, SignalScorecard } from '~/hindsight/types'

interface Props {
  gameId: GameId
  drawsAsc: BrainDraw[]
  brainState: BrainState | null
}

const props = defineProps<Props>()

type RangeKey = 30 | 90 | 365
const range = ref<RangeKey>(30)
const rangeItems = [
  { label: '30 期', value: 30 as const },
  { label: '90 期', value: 90 as const },
  { label: '365 期', value: 365 as const }
]

interface TermAgg {
  drawTerm: number
  hits: number
  picks: number
}

function aggregateByTerm(scorecards: Record<string, SignalScorecard>): TermAgg[] {
  const m = new Map<number, TermAgg>()
  for (const sc of Object.values(scorecards)) {
    for (const f of sc.recentFirings) {
      const entry = m.get(f.drawTerm) ?? { drawTerm: f.drawTerm, hits: 0, picks: 0 }
      entry.hits += f.hits ?? 0
      entry.picks += f.picks.length
      m.set(f.drawTerm, entry)
    }
  }
  return [...m.values()].sort((a, b) => a.drawTerm - b.drawTerm)
}

const aggregates = computed<TermAgg[]>(() => {
  if (!props.brainState) return []
  return aggregateByTerm(props.brainState.scorecards)
})

const windowed = computed<TermAgg[]>(() => {
  return aggregates.value.slice(-range.value)
})

const series = computed<Array<number | null>>(() => {
  return windowed.value.map(a => (a.picks === 0 ? null : a.hits / a.picks))
})

const overallRate = computed<number | null>(() => {
  let h = 0
  let p = 0
  for (const a of windowed.value) {
    h += a.hits
    p += a.picks
  }
  if (p === 0) return null
  return h / p
})

const overallSamples = computed<number>(() => windowed.value.reduce((s, a) => s + a.picks, 0))

const MIN_SAMPLES = 30

const alerts = computed<BrainAlert[]>(() => {
  if (!props.brainState) return []
  return [...props.brainState.alerts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
})

// 賓果：警示列表每筆顯示開獎時分
const isBingo = computed(() => props.gameId === 'bingo_bingo')
const bingoMinTermByDate = computed<Map<string, number>>(() => {
  if (!isBingo.value) return new Map()
  return buildBingoMinTermByDate(props.drawsAsc)
})
function bingoTime(drawDate: string, drawTerm: number): string {
  return bingoTimeFromMap(bingoMinTermByDate.value, drawDate, drawTerm)
}

const lastProcessedTerm = computed<number | null>(() => props.brainState?.lastProcessedTerm ?? null)
const updatedAt = computed<string | null>(() => props.brainState?.updatedAt ?? null)
const totalSignals = computed<number>(() => {
  if (!props.brainState) return 0
  return Object.keys(props.brainState.scorecards).length
})

function rateText(v: number | null): string {
  if (v == null) return '—'
  return `${(v * 100).toFixed(1)}%`
}

function typeLabel(t: BrainAlert['type']): string {
  switch (t) {
    case 'multi_signal': return '多訊號集中'
    case 'rare_combination': return '罕見組合'
    case 'signal_drift': return '訊號漂移'
    case 'overall_drift': return '整體漂移'
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      hour12: false
    }).formatToParts(d)
    const get = (type: string): string => parts.find(p => p.type === type)?.value ?? ''
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
  } catch {
    return iso
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- 整體命中率趨勢 -->
    <UCard :ui="{ body: 'p-4' }">
      <div class="space-y-3">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h3 class="text-sm font-semibold">
            整體命中率趨勢
          </h3>
          <UTabs
            v-model="range"
            :items="rangeItems"
            :unmount-on-hide="false"
            variant="pill"
            color="neutral"
            size="sm"
            :content="false"
          />
        </div>
        <div class="flex items-center gap-4">
          <HindsightSparkLine
            :data="series"
            :width="220"
            :height="36"
            color="rgb(217 119 6)"
          />
          <div class="text-xs tabular-nums space-y-1">
            <div>
              <span class="text-muted">區間平均</span>
              <span class="ml-1 font-mono">{{ rateText(overallRate) }}</span>
            </div>
            <div>
              <span class="text-muted">區間樣本</span>
              <span class="ml-1 font-mono">{{ overallSamples }} 推</span>
            </div>
            <div
              v-if="overallSamples < MIN_SAMPLES"
              class="text-warning text-[10px]"
            >
              ⚠ 樣本不足 {{ overallSamples }}/{{ MIN_SAMPLES }}
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- 警示中心 -->
    <section class="space-y-2">
      <h3 class="text-sm font-semibold">
        警示中心
      </h3>
      <div
        v-if="alerts.length === 0"
        class="rounded-md border border-dashed border-default p-4 text-center text-xs text-muted"
      >
        無警示
      </div>
      <UCard
        v-for="a in alerts"
        :key="a.id"
        :ui="{ body: 'p-3' }"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-2 text-xs">
          <div class="flex items-baseline gap-2">
            <UBadge
              color="error"
              variant="subtle"
              size="sm"
            >
              {{ typeLabel(a.type) }}
            </UBadge>
            <span class="font-mono">第 {{ a.drawTerm }} 期</span>
            <span class="text-muted">{{ a.drawDate }}<span
              v-if="isBingo && bingoTime(a.drawDate, a.drawTerm)"
              class="ml-1 font-mono"
            >{{ bingoTime(a.drawDate, a.drawTerm) }}</span></span>
          </div>
          <span class="text-muted text-[10px]">{{ formatTime(a.createdAt) }}</span>
        </div>
        <p class="mt-2 text-xs text-muted">
          {{ a.detail }}
        </p>
      </UCard>
    </section>

    <!-- 鑑古健康狀態 -->
    <UCard :ui="{ body: 'p-4' }">
      <div class="space-y-2">
        <h3 class="text-sm font-semibold">
          鑑古健康狀態
        </h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs tabular-nums">
          <div>
            <div class="text-muted">
              已分析到
            </div>
            <div class="font-mono">
              第 {{ lastProcessedTerm ?? '—' }} 期
            </div>
          </div>
          <div>
            <div class="text-muted">
              訊號數
            </div>
            <div class="font-mono">
              {{ totalSignals }}
            </div>
          </div>
          <div>
            <div class="text-muted">
              上次更新
            </div>
            <div class="font-mono text-[10px] sm:text-xs">
              {{ formatTime(updatedAt) }}
            </div>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
