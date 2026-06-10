<script setup lang="ts">
/**
 * 單支訊號的詳細頁。
 *
 * 釘頂：條件 + 推薦策略 + 累積命中率
 * 主體：歷史證據鏈 4 欄表（期數 / 推了哪幾個 / 實際開出 / 中了幾顆）
 * 底部：常一起亮燈的訊號（coFiringCounts 排序）
 */

import type { GameId } from '~~/shared/lotto/games'
import { N0, baselineHitRate } from '~/hindsight/config'
import { recentHitRate, smoothedHitRate } from '~/hindsight/scorecard'
import { getSignalsForGame } from '~/hindsight/registry'
import type { BrainDraw, BrainState, SignalDef, SignalScorecard } from '~/hindsight/types'

interface Props {
  gameId: GameId
  signalId: string
  brainState: BrainState | null
  drawsAsc: BrainDraw[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()

const baseline = computed(() => baselineHitRate(props.gameId))
const SAMPLE_FLOOR = 30

const signal = computed<SignalDef | null>(() => {
  const all = getSignalsForGame(props.gameId)
  return all.find(s => s.id === props.signalId) ?? null
})

const scorecard = computed<SignalScorecard | null>(() => {
  return props.brainState?.scorecards[props.signalId] ?? null
})

const cumulativeRate = computed<number>(() => {
  if (!scorecard.value) return baseline.value
  return smoothedHitRate(scorecard.value, baseline.value, N0)
})

const recentRate = computed<number | null>(() => {
  if (!scorecard.value) return null
  return recentHitRate(scorecard.value, 20)
})

const sampleLow = computed<boolean>(() => (scorecard.value?.totalPicks ?? 0) < SAMPLE_FLOOR)

interface EvidenceRow {
  drawTerm: number
  drawDate: string
  picks: number[]
  actual: number[]
  hits: number
  hitNumbers: number[]
}

const drawByTerm = computed<Map<number, BrainDraw>>(() => {
  const m = new Map<number, BrainDraw>()
  for (const d of props.drawsAsc) m.set(d.drawTerm, d)
  return m
})

const evidence = computed<EvidenceRow[]>(() => {
  if (!scorecard.value) return []
  const out: EvidenceRow[] = []
  for (const f of [...scorecard.value.recentFirings].reverse()) {
    const actual = drawByTerm.value.get(f.drawTerm)?.numbers ?? []
    out.push({
      drawTerm: f.drawTerm,
      drawDate: f.drawDate,
      picks: f.picks,
      actual,
      hits: f.hits ?? 0,
      hitNumbers: f.hitNumbers ?? []
    })
  }
  return out
})

interface CoFiringRow {
  signalId: string
  nameZh: string
  count: number
}

const coFirings = computed<CoFiringRow[]>(() => {
  if (!scorecard.value) return []
  const all = getSignalsForGame(props.gameId)
  const nameMap = new Map(all.map(s => [s.id, s.nameZh]))
  return Object.entries(scorecard.value.coFiringCounts)
    .map(([id, count]) => ({
      signalId: id,
      nameZh: nameMap.get(id) ?? id,
      count
    }))
    .sort((a, b) => b.count - a.count)
})

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function rateText(v: number | null): string {
  if (v == null) return '—'
  return `${(v * 100).toFixed(1)}%`
}

function isHit(num: number, hits: number[]): boolean {
  return hits.includes(num)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-arrow-left"
        @click="emit('close')"
      >
        回訊號牆
      </UButton>
    </div>

    <div
      v-if="!signal"
      class="rounded-md border border-dashed border-default p-6 text-center text-xs text-muted"
    >
      找不到訊號 {{ signalId }}
    </div>

    <template v-else>
      <!-- 釘頂條件區 -->
      <div class="sticky top-0 z-10 -mx-2 sm:-mx-4 px-2 sm:px-4 pt-2 pb-3 bg-default/95 backdrop-blur supports-[backdrop-filter]:bg-default/70">
        <UCard :ui="{ body: 'p-4' }">
          <div class="space-y-2">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h3 class="text-base font-semibold">
                {{ signal.nameZh }}
              </h3>
              <UBadge
                v-if="sampleLow"
                color="warning"
                variant="subtle"
                size="sm"
              >
                ⚠ 樣本不足
              </UBadge>
            </div>
            <p class="text-xs text-muted">
              {{ signal.description }}
            </p>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
              <span>
                <span class="text-muted">累積命中率</span>
                <span class="ml-1 font-mono">{{ rateText(cumulativeRate) }}</span>
              </span>
              <span>
                <span class="text-muted">最近 20 期</span>
                <span class="ml-1 font-mono">{{ rateText(recentRate) }}</span>
              </span>
              <span>
                <span class="text-muted">亮燈次數</span>
                <span class="ml-1 font-mono">{{ scorecard?.totalFires ?? 0 }}</span>
              </span>
              <span>
                <span class="text-muted">累積中/推</span>
                <span class="ml-1 font-mono">{{ scorecard?.totalHits ?? 0 }}/{{ scorecard?.totalPicks ?? 0 }}</span>
              </span>
            </div>
          </div>
        </UCard>
      </div>

      <!-- 歷史證據鏈 -->
      <section class="space-y-2">
        <h4 class="text-sm font-semibold">
          歷史證據鏈
        </h4>
        <div
          v-if="evidence.length === 0"
          class="rounded-md border border-dashed border-default p-4 text-center text-xs text-muted"
        >
          尚無亮燈紀錄
        </div>
        <UCard
          v-else
          :ui="{ body: 'p-0 sm:p-0' }"
        >
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-elevated text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th class="px-3 py-2 text-left">
                    期數
                  </th>
                  <th class="px-3 py-2 text-left">
                    推了哪幾個
                  </th>
                  <th class="px-3 py-2 text-left">
                    實際開出
                  </th>
                  <th class="px-3 py-2 text-right">
                    中
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in evidence"
                  :key="`ev-${row.drawTerm}`"
                  class="border-t border-default align-top"
                >
                  <td class="px-3 py-2 font-mono">
                    {{ row.drawTerm }}<br>
                    <span class="text-[10px] text-muted">{{ row.drawDate }}</span>
                  </td>
                  <td class="px-3 py-2">
                    <div class="flex flex-wrap items-center gap-1">
                      <UBadge
                        v-for="n in row.picks"
                        :key="`p-${row.drawTerm}-${n}`"
                        :color="isHit(n, row.hitNumbers) ? 'success' : 'neutral'"
                        :variant="isHit(n, row.hitNumbers) ? 'solid' : 'subtle'"
                        size="sm"
                        class="min-w-7 justify-center font-mono"
                      >
                        {{ pad(n) }}
                      </UBadge>
                    </div>
                  </td>
                  <td class="px-3 py-2">
                    <div
                      v-if="row.actual.length === 0"
                      class="text-muted"
                    >
                      —
                    </div>
                    <div
                      v-else
                      class="flex flex-wrap items-center gap-1"
                    >
                      <UBadge
                        v-for="n in row.actual"
                        :key="`a-${row.drawTerm}-${n}`"
                        color="warning"
                        variant="solid"
                        size="sm"
                        class="min-w-7 justify-center font-mono"
                      >
                        {{ pad(n) }}
                      </UBadge>
                    </div>
                  </td>
                  <td
                    class="px-3 py-2 text-right font-mono tabular-nums"
                    :class="row.hits > 0 ? 'text-emerald-500' : 'text-muted'"
                  >
                    {{ row.hits }}/{{ row.picks.length }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
      </section>

      <!-- 常一起亮燈 -->
      <section class="space-y-2">
        <h4 class="text-sm font-semibold">
          常一起亮燈的訊號
        </h4>
        <div
          v-if="coFirings.length === 0"
          class="rounded-md border border-dashed border-default p-4 text-center text-xs text-muted"
        >
          —
        </div>
        <UCard
          v-else
          :ui="{ body: 'p-4' }"
        >
          <ul class="space-y-1.5 text-xs">
            <li
              v-for="co in coFirings"
              :key="`co-${co.signalId}`"
              class="flex items-center justify-between"
            >
              <span>{{ co.nameZh }}</span>
              <span class="font-mono tabular-nums text-muted">{{ co.count }} 次共燈</span>
            </li>
          </ul>
        </UCard>
      </section>
    </template>
  </div>
</template>
