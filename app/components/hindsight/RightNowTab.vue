<script setup lang="ts">
/**
 * 當下：下一期建議排名（釘頂）、亮燈訊號清單、上一期表現。
 *
 * 誠信規則：
 *   - 樣本不足（< 30 picks）的訊號卡片半透明 + 標「⚠ 樣本不足」
 *   - 上一期表現永遠顯示，包括「中 0 顆」
 *   - conditionMetButEmpty 也要 show，但半透明 + 「條件成立、無號可推」
 *   - 沒算過顯示「—」
 */

import type { GameId } from '~~/shared/lotto/games'
import type { NumberRanking } from '~/hindsight/ensemble'
import { N0, baselineHitRate } from '~/hindsight/config'
import { recentHitRate, smoothedHitRate } from '~/hindsight/scorecard'
import type {
  BrainDraw,
  BrainState,
  PickGroup
} from '~/hindsight/types'
import type { CurrentSignalFiring } from '~/composables/useHindsight'

interface Props {
  gameId: GameId
  drawsAsc: BrainDraw[]
  brainState: BrainState | null
  currentFirings: CurrentSignalFiring[]
  ranking: NumberRanking[]
}

const props = defineProps<Props>()

const TOP_K = 10
const SAMPLE_FLOOR = 30

const baseline = computed(() => baselineHitRate(props.gameId))
const topRanking = computed<NumberRanking[]>(() => props.ranking.slice(0, TOP_K))
const expandedNumber = ref<number | null>(null)

function toggleNumber(n: number) {
  expandedNumber.value = expandedNumber.value === n ? null : n
}

function signalName(signalId: string): string {
  const found = props.currentFirings.find(c => c.signal.id === signalId)
  return found?.signal.nameZh ?? signalId
}

interface CardData {
  signalId: string
  nameZh: string
  pickGroups: PickGroup[] | null
  picks: number[]
  conditionMetButEmpty: boolean
  emptyGroupLabels: string[]
  totalPicks: number
  recentRate: number | null
  cumulativeRate: number
  sampleLow: boolean
  recentSeries: Array<number | null>
}

const litCards = computed<CardData[]>(() => {
  const out: CardData[] = []
  for (const cf of props.currentFirings) {
    // 不亮也不是 conditionMetButEmpty 的就跳過
    if (!cf.evaluation.fires && !cf.evaluation.conditionMetButEmpty) continue

    const sc = props.brainState?.scorecards[cf.signal.id]
    const totalPicks = sc?.totalPicks ?? 0
    const sampleLow = totalPicks < SAMPLE_FLOOR
    const cumulative = sc
      ? smoothedHitRate(sc, baseline.value, N0)
      : baseline.value
    const recent = sc ? recentHitRate(sc, 20) : null
    const recentSeries = sc
      ? sc.recentFirings.slice(-20).map((f) => {
          const picks = f.picks.length
          if (picks === 0) return null
          return (f.hits ?? 0) / picks
        })
      : []

    out.push({
      signalId: cf.signal.id,
      nameZh: cf.signal.nameZh,
      pickGroups: cf.evaluation.pickGroups ?? null,
      picks: cf.evaluation.picks,
      conditionMetButEmpty: !!cf.evaluation.conditionMetButEmpty,
      emptyGroupLabels: cf.evaluation.emptyGroupLabels ?? [],
      totalPicks,
      recentRate: recent,
      cumulativeRate: cumulative,
      sampleLow,
      recentSeries
    })
  }
  return out
})

// ---- 上一期表現 -----------------------------------------------------------

interface LastFiring {
  signalId: string
  nameZh: string
  picks: number[]
  hits: number
  hitNumbers: number[]
}

const lastDraw = computed<BrainDraw | null>(() => {
  if (props.drawsAsc.length === 0) return null
  return props.drawsAsc[props.drawsAsc.length - 1] ?? null
})

const lastFirings = computed<LastFiring[]>(() => {
  const out: LastFiring[] = []
  const last = lastDraw.value
  if (!last || !props.brainState) return out
  for (const sc of Object.values(props.brainState.scorecards)) {
    const rec = sc.recentFirings.find(r => r.drawTerm === last.drawTerm)
    if (!rec) continue
    out.push({
      signalId: sc.signalId,
      nameZh: signalName(sc.signalId),
      picks: rec.picks,
      hits: rec.hits ?? 0,
      hitNumbers: rec.hitNumbers ?? []
    })
  }
  return out
})

function rateText(v: number | null): string {
  if (v == null) return '—'
  return `${(v * 100).toFixed(1)}%`
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function isHit(num: number, hits: number[]): boolean {
  return hits.includes(num)
}

function supportingFor(num: number): string[] {
  const found = props.ranking.find(r => r.number === num)
  return found?.supportingSignals ?? []
}
</script>

<template>
  <div class="space-y-4">
    <!-- 釘頂：下一期建議 -->
    <div class="sticky top-0 z-10 -mx-2 sm:-mx-4 px-2 sm:px-4 pt-2 pb-3 bg-default/95 backdrop-blur supports-[backdrop-filter]:bg-default/70">
      <UCard :ui="{ body: 'p-4 sm:p-5' }">
        <div class="space-y-3">
          <div class="flex items-baseline justify-between gap-2">
            <h3 class="text-sm font-semibold">
              下一期建議排名
            </h3>
            <span class="text-xs text-muted">
              {{ topRanking.length === 0 ? '尚無亮燈訊號' : `共 ${ranking.length} 個候選 · 顯示前 ${topRanking.length}` }}
            </span>
          </div>
          <div
            v-if="topRanking.length === 0"
            class="rounded-md border border-dashed border-default p-4 text-center text-xs text-muted"
          >
            目前沒有訊號亮燈、無號可推
          </div>
          <div
            v-else
            class="flex flex-wrap items-center gap-1.5"
          >
            <button
              v-for="(r, idx) in topRanking"
              :key="r.number"
              type="button"
              class="group inline-flex flex-col items-center gap-1 rounded-md p-1 transition hover:bg-elevated"
              :class="expandedNumber === r.number ? 'bg-elevated ring-1 ring-primary' : ''"
              @click="toggleNumber(r.number)"
            >
              <span class="text-[10px] text-muted tabular-nums">
                #{{ idx + 1 }}
              </span>
              <UBadge
                color="warning"
                variant="solid"
                size="lg"
                class="min-w-9 justify-center font-mono"
              >
                {{ pad(r.number) }}
              </UBadge>
              <span class="text-[10px] text-muted tabular-nums">
                {{ r.score.toFixed(2) }} 票
              </span>
            </button>
          </div>
          <!-- 為什麼是這個 -->
          <div
            v-if="expandedNumber !== null"
            class="rounded-md border border-default bg-elevated p-3 text-xs"
          >
            <div class="mb-1 font-medium">
              為什麼是 {{ pad(expandedNumber) }}？
            </div>
            <ul class="space-y-1">
              <li
                v-for="sigId in supportingFor(expandedNumber)"
                :key="sigId"
                class="text-muted"
              >
                · {{ signalName(sigId) }}
              </li>
              <li
                v-if="supportingFor(expandedNumber).length === 0"
                class="text-muted"
              >
                —
              </li>
            </ul>
          </div>
        </div>
      </UCard>
    </div>

    <!-- 正在亮燈的訊號 -->
    <section class="space-y-2">
      <h3 class="text-sm font-semibold">
        正在亮燈的訊號
      </h3>
      <div
        v-if="litCards.length === 0"
        class="rounded-md border border-dashed border-default p-4 text-center text-xs text-muted"
      >
        目前沒有訊號亮燈
      </div>
      <UCard
        v-for="card in litCards"
        :key="card.signalId"
        :ui="{ body: 'p-4' }"
        :class="card.conditionMetButEmpty && card.picks.length === 0 ? 'opacity-50' : (card.sampleLow ? 'opacity-70' : '')"
      >
        <div class="space-y-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <div class="flex items-baseline gap-2">
              <span class="text-sm font-semibold">
                {{ card.nameZh }}
              </span>
              <UBadge
                v-if="card.conditionMetButEmpty && card.picks.length === 0"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                條件成立、無號可推
              </UBadge>
              <UBadge
                v-if="card.sampleLow"
                color="warning"
                variant="subtle"
                size="sm"
                icon="i-lucide-triangle-alert"
              >
                ⚠ 樣本不足 {{ card.totalPicks }}/{{ SAMPLE_FLOOR }}
              </UBadge>
            </div>
            <div class="flex items-center gap-3 text-xs text-muted tabular-nums">
              <span>近期 {{ rateText(card.recentRate) }}</span>
              <span>累積 {{ rateText(card.cumulativeRate) }}</span>
              <SparkLine
                :data="card.recentSeries"
                :width="60"
                :height="18"
                color="rgb(217 119 6)"
              />
            </div>
          </div>

          <!-- pickGroups 分組顯示（不壓平） -->
          <div
            v-if="card.pickGroups && card.pickGroups.length > 0"
            class="space-y-2"
          >
            <div
              v-for="g in card.pickGroups"
              :key="g.label"
              class="flex flex-wrap items-center gap-1.5"
            >
              <span class="min-w-16 text-xs text-muted">{{ g.label }}</span>
              <UBadge
                v-for="n in g.numbers"
                :key="`${card.signalId}-${g.label}-${n}`"
                color="warning"
                variant="soft"
                size="md"
                class="min-w-8 justify-center font-mono"
              >
                {{ pad(n) }}
              </UBadge>
            </div>
          </div>
          <div
            v-else-if="card.picks.length > 0"
            class="flex flex-wrap items-center gap-1.5"
          >
            <UBadge
              v-for="n in card.picks"
              :key="`${card.signalId}-${n}`"
              color="warning"
              variant="soft"
              size="md"
              class="min-w-8 justify-center font-mono"
            >
              {{ pad(n) }}
            </UBadge>
          </div>

          <!-- 條件成立但無號可推時，列空 slot 標籤 -->
          <div
            v-if="card.emptyGroupLabels.length > 0"
            class="flex flex-wrap items-center gap-1.5 text-xs text-muted"
          >
            <span class="min-w-16">無號 slot</span>
            <span
              v-for="lbl in card.emptyGroupLabels"
              :key="lbl"
              class="rounded border border-default px-2 py-0.5"
            >
              {{ lbl }}
            </span>
          </div>
        </div>
      </UCard>
    </section>

    <!-- 上一期表現 -->
    <section class="space-y-2">
      <h3 class="text-sm font-semibold">
        上一期表現
      </h3>
      <UCard
        v-if="lastDraw"
        :ui="{ body: 'p-4' }"
      >
        <div class="space-y-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <div class="text-xs text-muted">
              第 <span class="font-mono">{{ lastDraw.drawTerm }}</span> 期 · {{ lastDraw.drawDate }}
            </div>
          </div>
          <div>
            <div class="text-xs text-muted mb-1">
              實際開出
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              <UBadge
                v-for="n in lastDraw.numbers"
                :key="`actual-${n}`"
                color="warning"
                variant="solid"
                size="md"
                class="min-w-8 justify-center font-mono"
              >
                {{ pad(n) }}
              </UBadge>
            </div>
          </div>
          <div
            v-if="lastFirings.length === 0"
            class="rounded-md border border-dashed border-default p-3 text-center text-xs text-muted"
          >
            上一期沒有訊號亮燈
          </div>
          <div
            v-else
            class="space-y-2"
          >
            <div
              v-for="f in lastFirings"
              :key="`last-${f.signalId}`"
              class="rounded border border-default p-2"
            >
              <div class="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <span class="font-medium">{{ f.nameZh }}</span>
                <span
                  class="tabular-nums"
                  :class="f.hits > 0 ? 'text-emerald-500' : 'text-muted'"
                >
                  中 {{ f.hits }} / 推 {{ f.picks.length }}
                </span>
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-1">
                <UBadge
                  v-for="n in f.picks"
                  :key="`last-${f.signalId}-${n}`"
                  :color="isHit(n, f.hitNumbers) ? 'success' : 'neutral'"
                  :variant="isHit(n, f.hitNumbers) ? 'solid' : 'subtle'"
                  size="sm"
                  class="min-w-7 justify-center font-mono"
                >
                  {{ pad(n) }}
                </UBadge>
              </div>
            </div>
          </div>
        </div>
      </UCard>
      <div
        v-else
        class="rounded-md border border-dashed border-default p-4 text-center text-xs text-muted"
      >
        —
      </div>
    </section>
  </div>
</template>
