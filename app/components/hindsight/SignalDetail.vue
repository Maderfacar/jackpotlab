<script setup lang="ts">
/**
 * 單支訊號的詳細頁。
 *
 * 釘頂：條件 + 推薦策略 + 累積命中率
 * 主體：歷史證據鏈 4 欄表（期數 / 推了哪幾個 / 實際開出 / 中了幾顆）
 * 底部：常一起亮燈的訊號（coFiringCounts 排序）
 */

import type { GameId } from '~~/shared/lotto/games'
import { bingoTimeFromMap, buildBingoMinTermByDate } from '~/utils/bingo-time'
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

const isObservation = computed<boolean>(() => signal.value?.kind === 'observation')
const sampleLow = computed<boolean>(() => !isObservation.value && (scorecard.value?.totalPicks ?? 0) < SAMPLE_FLOOR)

interface EvidenceRow {
  drawTerm: number
  drawDate: string
  picks: number[]
  actual: number[]
  hits: number
  hitNumbers: number[]
  observationLabels: string[]
  /** 訊號 7 結構化 y 值，UI 用染色 chip 顯示。其他訊號為空。 */
  latestYs: number[]
}

// 2026-06-11 拍板：訊號 7 y 值染色 mapping（紅橙綠藍紫粉，Nuxt UI 4 text-{color}-500）
const Y_COLOR_CLASS: Record<number, string> = {
  1: 'text-red-500',
  2: 'text-orange-500',
  3: 'text-emerald-500',
  4: 'text-sky-500',
  5: 'text-violet-500',
  6: 'text-pink-500'
}
function yColorClass(y: number): string {
  return Y_COLOR_CLASS[y] ?? 'text-muted'
}

const drawByTerm = computed<Map<number, BrainDraw>>(() => {
  const m = new Map<number, BrainDraw>()
  for (const d of props.drawsAsc) m.set(d.drawTerm, d)
  return m
})

// 賓果：歷史每期都要顯示時間（[[reference-hindsight-must-read]] 之外的賓果顯示需求）
const isBingo = computed(() => props.gameId === 'bingo_bingo')
const bingoMinTermByDate = computed<Map<string, number>>(() => {
  if (!isBingo.value) return new Map()
  return buildBingoMinTermByDate(props.drawsAsc)
})
function bingoTime(drawDate: string, drawTerm: number): string {
  return bingoTimeFromMap(bingoMinTermByDate.value, drawDate, drawTerm)
}

const evidence = computed<EvidenceRow[]>(() => {
  if (!scorecard.value) return []
  const out: EvidenceRow[] = []
  for (const f of [...scorecard.value.recentFirings].reverse()) {
    const actual = drawByTerm.value.get(f.drawTerm)?.numbers ?? []
    const latestYs = f.observationData?.latestYs ?? []
    // 訊號 7：有 latestYs 時，移除 observationLabels 中以「本期 y 組成」開頭那條
    // （已被結構化資料取代），避免重複顯示。
    const rawLabels = f.observationLabels ?? []
    const filteredLabels = latestYs.length > 0
      ? rawLabels.filter(l => !l.startsWith('本期 y 組成'))
      : rawLabels
    out.push({
      drawTerm: f.drawTerm,
      drawDate: f.drawDate,
      picks: f.picks,
      actual,
      hits: f.hits ?? 0,
      hitNumbers: f.hitNumbers ?? [],
      observationLabels: filteredLabels,
      latestYs
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
                v-if="isObservation"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                觀察型
              </UBadge>
              <UBadge
                v-else-if="sampleLow"
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
            <div
              v-if="!isObservation"
              class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums"
            >
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
            <div
              v-else
              class="text-xs tabular-nums"
            >
              <span class="text-muted">已觀察</span>
              <span class="ml-1 font-mono">{{ scorecard?.totalFires ?? 0 }}</span>
              <span class="text-muted"> 次</span>
            </div>
          </div>
        </UCard>
      </div>

      <!-- 歷史證據鏈 -->
      <section class="space-y-2">
        <h4 class="text-sm font-semibold">
          {{ isObservation ? '觀察紀錄' : '歷史證據鏈' }}
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
            <!-- 預測型：完整證據鏈 -->
            <table
              v-if="!isObservation"
              class="w-full text-xs"
            >
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
                  <td class="px-3 py-2 font-mono whitespace-nowrap">
                    {{ row.drawTerm }}<br>
                    <span class="text-[10px] text-muted">{{ row.drawDate }}<span
                      v-if="isBingo && bingoTime(row.drawDate, row.drawTerm)"
                      class="ml-1"
                    >{{ bingoTime(row.drawDate, row.drawTerm) }}</span></span>
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
            <!-- 觀察型：印出每期當時的觀察文字 -->
            <table
              v-else
              class="w-full text-xs"
            >
              <thead class="bg-elevated text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th class="px-3 py-2 text-left whitespace-nowrap">
                    期數
                  </th>
                  <th class="px-3 py-2 text-left">
                    當期觀察
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in evidence"
                  :key="`ob-${row.drawTerm}`"
                  class="border-t border-default align-top"
                >
                  <td class="px-3 py-2 font-mono whitespace-nowrap">
                    {{ row.drawTerm }}
                    <br>
                    <span class="text-[10px] text-muted">{{ row.drawDate }}<span
                      v-if="isBingo && bingoTime(row.drawDate, row.drawTerm)"
                      class="ml-1"
                    >{{ bingoTime(row.drawDate, row.drawTerm) }}</span></span>
                  </td>
                  <td class="px-3 py-2">
                    <!-- 訊號 7：本期 y 組成染色 chip -->
                    <div
                      v-if="row.latestYs.length > 0"
                      class="mb-1 flex flex-wrap items-center gap-1"
                    >
                      <span class="text-muted leading-snug">本期 y 組成：</span>
                      <span
                        v-for="(y, i) in row.latestYs"
                        :key="`y-${row.drawTerm}-${i}`"
                        :class="['inline-flex min-w-5 justify-center rounded border border-default px-1.5 py-0.5 text-xs font-mono font-semibold', yColorClass(y)]"
                      >
                        {{ y }}
                      </span>
                    </div>
                    <div
                      v-if="row.observationLabels.length > 0"
                      class="flex flex-col gap-1"
                    >
                      <span
                        v-for="(lbl, i) in row.observationLabels"
                        :key="`${row.drawTerm}-${i}`"
                        class="text-muted leading-snug"
                      >
                        {{ lbl }}
                      </span>
                    </div>
                    <span
                      v-else-if="row.latestYs.length === 0"
                      class="text-muted"
                    >—（早期紀錄，請待下次 replay 補齊）</span>
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
