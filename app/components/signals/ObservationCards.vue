<script setup lang="ts">
/**
 * 觀察卡區塊（六張走勢／頻率卡）。
 * 計算全部在 app/signals/observations.ts；本元件只負責渲染。
 */

import type { SignalRow } from '~/signals/types'
import {
  buildOddEven, buildPrizeSum, buildTails,
  buildGapBuckets, buildValueFreq, buildValueZero,
  type TailPairNext
} from '~/signals/observations'

const props = defineProps<{ rows: SignalRow[] }>()

const oddEven = computed(() => buildOddEven(props.rows))
const prizeSum = computed(() => buildPrizeSum(props.rows))
const tails = computed(() => buildTails(props.rows))
const gapBuckets = computed(() => buildGapBuckets(props.rows))
const valueFreq = computed(() => buildValueFreq(props.rows))
const valueZero = computed(() => buildValueZero(props.rows))

const recentPairEvents = computed(() => [...tails.value.pairEvents].slice(-8).reverse())

function pct(v: number | null | undefined): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`
}

function num1(v: number | null): string {
  return v == null ? '—' : v.toFixed(1)
}

function mmdd(date: string): string {
  return date.length >= 10 ? date.slice(5) : date
}

const PAIR_NEXT_LABEL: Record<TailPairNext, string> = {
  'pair-carry': '同尾成對・連莊',
  'pair-fresh': '同尾成對・全新兩顆',
  'single': '該尾只出 1 顆',
  'none': '該尾沒出',
  'pending': '下期未開'
}

const PAIR_NEXT_COLOR: Record<TailPairNext, 'success' | 'info' | 'neutral' | 'warning'> = {
  'pair-carry': 'success',
  'pair-fresh': 'info',
  'single': 'neutral',
  'none': 'neutral',
  'pending': 'warning'
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-xl font-semibold tracking-tight">
      觀察卡
    </h2>
    <p class="text-xs text-muted">
      走勢／頻率型：無亮燈與命中判定，把載入視窗內的分布、間隔與近期走勢如實攤開。走勢帶由左（舊）到右（新）。
    </p>

    <div class="grid gap-4 lg:grid-cols-2">
      <!-- 1. 單雙數 -->
      <UCard>
        <template #header>
          <p class="font-semibold">
            1 單雙數分布與走勢
          </p>
        </template>
        <div class="space-y-3 text-sm">
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="d in oddEven.dist"
              :key="d.label"
              color="neutral"
              variant="subtle"
            >
              {{ d.label }}：{{ d.count }} 期（{{ pct(d.pct) }}）
            </UBadge>
          </div>
          <p class="text-xs text-muted">
            單數顆數與前期比的反向率：{{ pct(oddEven.alternation.pairs > 0 ? oddEven.alternation.flips / oddEven.alternation.pairs : null) }}（{{ oddEven.alternation.flips }}/{{ oddEven.alternation.pairs }}）
          </p>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="p in oddEven.recent"
              :key="p.issue"
              class="rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px]"
              :title="`${p.issue} ${p.date}`"
            >
              {{ p.text }}
            </span>
          </div>
        </div>
      </UCard>

      <!-- 2. 獎號總和 -->
      <UCard>
        <template #header>
          <p class="font-semibold">
            2 獎號總和走勢（五顆號碼加總）
          </p>
        </template>
        <div class="space-y-3 text-sm">
          <div class="flex flex-wrap gap-2">
            <UBadge
              color="neutral"
              variant="subtle"
            >
              mean {{ prizeSum.mean.toFixed(1) }} · median {{ prizeSum.median }}
            </UBadge>
            <UBadge
              color="neutral"
              variant="subtle"
            >
              P10 {{ prizeSum.p10 }} · P90 {{ prizeSum.p90 }}
            </UBadge>
            <UBadge
              color="neutral"
              variant="subtle"
            >
              min {{ prizeSum.min }} · max {{ prizeSum.max }}
            </UBadge>
          </div>
          <p class="text-xs text-muted">
            與前期比的反向率：{{ pct(prizeSum.alternation.pairs > 0 ? prizeSum.alternation.flips / prizeSum.alternation.pairs : null) }}（{{ prizeSum.alternation.flips }}/{{ prizeSum.alternation.pairs }}）
          </p>
          <div class="flex flex-wrap gap-2 text-xs">
            <span
              v-for="r in prizeSum.runDist"
              :key="r.label"
              class="text-muted"
            >
              {{ r.label }}：{{ r.count }}（{{ pct(r.pct) }}）
            </span>
          </div>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="p in prizeSum.recent"
              :key="p.issue"
              class="rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px]"
              :title="`${p.issue} ${p.date}`"
            >
              {{ p.text }}
            </span>
          </div>
        </div>
      </UCard>

      <!-- 3. 尾數 -->
      <UCard class="lg:col-span-2">
        <template #header>
          <p class="font-semibold">
            3 尾數：無重覆尾間隔 + 恰兩顆同尾追蹤
          </p>
        </template>
        <div class="space-y-4 text-sm">
          <div class="space-y-2">
            <p class="text-xs font-medium text-muted">
              與上一期完全無重覆尾數
            </p>
            <div class="flex flex-wrap gap-2">
              <UBadge
                color="primary"
                variant="subtle"
              >
                發生 {{ tails.noRepeatCount }} 次（{{ pct(tails.noRepeatRate) }}）
              </UBadge>
              <UBadge
                color="neutral"
                variant="subtle"
              >
                平均間隔 {{ num1(tails.noRepeatIntervalMean) }} 期 · 最長 {{ tails.noRepeatIntervalMax ?? '—' }} 期
              </UBadge>
              <UBadge
                v-if="tails.lastNoRepeat"
                color="neutral"
                variant="subtle"
              >
                最近一次 {{ tails.lastNoRepeat.issue }}（{{ tails.lastNoRepeat.date }}）· 距今 {{ tails.sinceLastNoRepeat }} 期
              </UBadge>
            </div>
          </div>

          <USeparator />

          <div class="space-y-2">
            <p class="text-xs font-medium text-muted">
              恰兩顆同尾（≥3 顆同尾不計）後，下一期該尾的狀況（已判定 {{ tails.pairJudged }} 次）
            </p>
            <div class="flex flex-wrap gap-2">
              <UBadge
                color="success"
                variant="subtle"
              >
                同尾成對・連莊 {{ tails.pairNextPairCarry }}（{{ pct(tails.pairJudged > 0 ? tails.pairNextPairCarry / tails.pairJudged : null) }}）
              </UBadge>
              <UBadge
                color="info"
                variant="subtle"
              >
                同尾成對・全新兩顆 {{ tails.pairNextPairFresh }}（{{ pct(tails.pairJudged > 0 ? tails.pairNextPairFresh / tails.pairJudged : null) }}）
              </UBadge>
              <UBadge
                color="neutral"
                variant="subtle"
              >
                只出 1 顆 {{ tails.pairNextSingle }}（{{ pct(tails.pairJudged > 0 ? tails.pairNextSingle / tails.pairJudged : null) }}）
              </UBadge>
              <UBadge
                color="neutral"
                variant="subtle"
              >
                沒出 {{ tails.pairNextNone }}（{{ pct(tails.pairJudged > 0 ? tails.pairNextNone / tails.pairJudged : null) }}）
              </UBadge>
            </div>
            <ul class="space-y-1.5 text-xs">
              <li
                v-for="e in recentPairEvents"
                :key="`${e.issue}-${e.tail}`"
                class="flex flex-wrap items-center gap-2"
              >
                <span class="font-mono">{{ e.issue }}</span>
                <span class="text-muted">{{ mmdd(e.date) }}</span>
                <span>{{ e.tail }} 尾：</span>
                <UBadge
                  v-for="n in e.nums"
                  :key="n"
                  color="warning"
                  variant="solid"
                  size="sm"
                  class="min-w-7 justify-center font-mono"
                >
                  {{ pad2(n) }}
                </UBadge>
                <span class="text-muted">→ 下期</span>
                <UBadge
                  :color="PAIR_NEXT_COLOR[e.next]"
                  variant="subtle"
                  size="sm"
                >
                  {{ PAIR_NEXT_LABEL[e.next] }}
                </UBadge>
              </li>
            </ul>
          </div>
        </div>
      </UCard>

      <!-- 4. 隔期分桶 -->
      <UCard>
        <template #header>
          <p class="font-semibold">
            4 隔期分桶（0-5 / 6-10 / 11+）
          </p>
        </template>
        <div class="space-y-3 text-sm">
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="d in gapBuckets.totalDist"
              :key="d.label"
              color="primary"
              variant="subtle"
            >
              隔 {{ d.label }} 期：{{ d.count }} 顆（{{ pct(d.pct) }}）
            </UBadge>
          </div>
          <p class="text-xs text-muted">
            每期平均：0-5 佔 {{ gapBuckets.perPeriodAvg.low.toFixed(2) }} 顆 · 6-10 佔 {{ gapBuckets.perPeriodAvg.mid.toFixed(2) }} 顆 · 11+ 佔 {{ gapBuckets.perPeriodAvg.high.toFixed(2) }} 顆
          </p>
          <div class="space-y-1 text-xs">
            <p class="font-medium text-muted">
              常見組成（低-中-高 顆數）：
            </p>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="p in gapBuckets.topPatterns"
                :key="p.label"
                class="text-muted"
              >
                {{ p.label }}：{{ p.count }} 期（{{ pct(p.pct) }}）
              </span>
            </div>
          </div>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="p in gapBuckets.recent"
              :key="p.issue"
              class="rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px]"
              :title="`${p.issue} ${p.date}`"
            >
              {{ p.text }}
            </span>
          </div>
        </div>
      </UCard>

      <!-- 5. 數值 0-5 頻率 -->
      <UCard>
        <template #header>
          <p class="font-semibold">
            5 數值 0～5 出現頻率
          </p>
        </template>
        <div class="space-y-3 text-sm">
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="f in valueFreq.freqs"
              :key="f.label"
              :color="f.label === '>5' ? 'neutral' : 'primary'"
              variant="subtle"
            >
              數值 {{ f.label }}：{{ f.count }} 顆（{{ pct(f.pct) }}）
            </UBadge>
          </div>
          <p class="text-xs text-muted">
            分母 = 視窗內全部 {{ valueFreq.totalNums }} 顆獎號的數值。
          </p>
        </div>
      </UCard>

      <!-- 6. 數值0 規律 -->
      <UCard class="lg:col-span-2">
        <template #header>
          <p class="font-semibold">
            6 數值0 的出現規律
          </p>
        </template>
        <div class="space-y-3 text-sm">
          <p class="text-xs text-muted">
            數值0 = 該獎號的來源 slot 前一期才剛被撈中過（記錄首位為 0）。
          </p>
          <div class="flex flex-wrap gap-2">
            <UBadge
              color="primary"
              variant="subtle"
            >
              期含至少一顆數值0：{{ valueZero.periodsWithZero }}/{{ valueZero.totalPeriods }}（{{ pct(valueZero.periodsWithZeroRate) }}）
            </UBadge>
            <UBadge
              color="neutral"
              variant="subtle"
            >
              無數值0 的期：{{ valueZero.noZeroCount }} 次 · 平均間隔 {{ num1(valueZero.noZeroIntervalMean) }} 期 · 最長 {{ valueZero.noZeroIntervalMax ?? '—' }} 期
            </UBadge>
            <UBadge
              v-if="valueZero.lastNoZero"
              color="neutral"
              variant="subtle"
            >
              最近一次無0：{{ valueZero.lastNoZero.issue }}（{{ valueZero.lastNoZero.date }}）· 距今 {{ valueZero.sinceLastNoZero }} 期
            </UBadge>
            <UBadge
              color="neutral"
              variant="subtle"
            >
              連續有0最長 {{ valueZero.maxZeroStreak }} 期 · 目前連續 {{ valueZero.currentZeroStreak }} 期
            </UBadge>
          </div>
          <div class="flex flex-wrap gap-2 text-xs">
            <span
              v-for="d in valueZero.countDist"
              :key="d.label"
              class="text-muted"
            >
              {{ d.label }}數值0：{{ d.count }} 期（{{ pct(d.pct) }}）
            </span>
          </div>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="p in valueZero.recent"
              :key="p.issue"
              class="rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px]"
              :title="`${p.issue} ${p.date}`"
            >
              {{ p.text }}
            </span>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
