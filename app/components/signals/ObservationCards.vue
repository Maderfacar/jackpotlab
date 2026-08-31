<script setup lang="ts">
/**
 * 觀察卡區塊（六張走勢／頻率卡）。
 * 計算全部在 app/signals/observations.ts；本元件只負責渲染。
 *
 * 2026-08-30 改版：預設收合 — 每張卡平時只露「白話標題 + 一行關鍵數字」，
 * 點開才看完整分布與走勢帶。文案白話化，術語不上頁面。
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

const expanded = ref<Set<string>>(new Set())

function toggle(id: string): void {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

function pct(v: number | null | undefined): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`
}

function ratio(part: number, total: number): string {
  return total > 0 ? pct(part / total) : '—'
}

function num1(v: number | null): string {
  return v == null ? '—' : v.toFixed(1)
}

function mmdd(date: string): string {
  return date.length >= 10 ? date.slice(5) : date
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

const PAIR_NEXT_LABEL: Record<TailPairNext, string> = {
  'pair-carry': '又成對・帶到原本的號',
  'pair-fresh': '又成對・換了兩顆新號',
  'single': '該尾只出 1 顆',
  'none': '該尾沒出',
  'pending': '下期還沒開'
}

const PAIR_NEXT_COLOR: Record<TailPairNext, 'success' | 'info' | 'neutral' | 'warning'> = {
  'pair-carry': 'success',
  'pair-fresh': 'info',
  'single': 'neutral',
  'none': 'neutral',
  'pending': 'warning'
}

/** 各卡標題 + 一行摘要（即時計算） */
const cardSummaries = computed(() => {
  const oe = [...oddEven.value.dist].sort((a, b) => b.count - a.count).slice(0, 2)
  const ps = prizeSum.value
  const t = tails.value
  const gb = gapBuckets.value.totalDist
  const vf = valueFreq.value.freqs
  const vz = valueZero.value
  const pairRate = t.pairJudged > 0
    ? (t.pairNextPairCarry + t.pairNextPairFresh) / t.pairJudged
    : null
  return {
    oddEven: `最常見：${oe.map(d => `${d.label} ${pct(d.pct)}`).join('、')}`,
    prizeSum: `平均 ${ps.mean.toFixed(0)} · 常見範圍 ${ps.p10}–${ps.p90} · 下期走反方向 ${ratio(ps.alternation.flips, ps.alternation.pairs)}`,
    tails: `跟上期完全不同尾只佔 ${pct(t.noRepeatRate)} · 兩顆同尾後下期又成對只有 ${pct(pairRate)}`,
    gapBuckets: gb.map(d => `${d.label} 期前 ${pct(d.pct)}`).join(' · '),
    valueFreq: `0 佔 ${pct(vf[0]?.pct)} · 1 佔 ${pct(vf[1]?.pct)} · 超過 5 佔 ${pct(vf.at(-1)?.pct)}`,
    valueZero: `${pct(vz.periodsWithZeroRate)} 的期至少有一顆數值 0`
  }
})

interface CardDef {
  id: string
  title: string
  summaryKey: 'oddEven' | 'prizeSum' | 'tails' | 'gapBuckets' | 'valueFreq' | 'valueZero'
}

const CARDS: CardDef[] = [
  { id: 'odd-even', title: '每期幾個單數、幾個雙數', summaryKey: 'oddEven' },
  { id: 'prize-sum', title: '五顆獎號加起來的總和', summaryKey: 'prizeSum' },
  { id: 'tails', title: '尾數：不同尾 & 兩顆同尾之後', summaryKey: 'tails' },
  { id: 'gap-buckets', title: '獎號從多久以前來（近／中／遠）', summaryKey: 'gapBuckets' },
  { id: 'value-freq', title: '數值 0～5 各出現多少', summaryKey: 'valueFreq' },
  { id: 'value-zero', title: '數值 0 多常出現', summaryKey: 'valueZero' }
]
</script>

<template>
  <UCard>
    <template #header>
      <div class="space-y-1">
        <p class="font-semibold">
          觀察卡
        </p>
        <p class="text-xs text-muted">
          沒有亮燈、單純把規律攤開看的統計。每張平時只露一行重點，點開看完整分布；走勢帶由左（舊）到右（新）。
        </p>
      </div>
    </template>

    <ul class="divide-y divide-default">
      <li
        v-for="card in CARDS"
        :key="card.id"
        class="py-3"
      >
        <!-- 收合列 -->
        <div
          class="flex cursor-pointer flex-wrap items-center gap-2"
          @click="toggle(card.id)"
        >
          <span class="text-sm font-medium">{{ card.title }}</span>
          <span class="text-xs text-muted">{{ cardSummaries[card.summaryKey] }}</span>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            class="ml-auto"
            :icon="expanded.has(card.id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            :aria-label="expanded.has(card.id) ? '收合' : '展開'"
          />
        </div>

        <!-- 1. 單雙數 -->
        <div
          v-if="card.id === 'odd-even' && expanded.has(card.id)"
          class="mt-3 space-y-3 rounded-lg bg-elevated/50 p-3 text-sm"
        >
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
            單數顆數跟前一期比、方向相反的比例：{{ ratio(oddEven.alternation.flips, oddEven.alternation.pairs) }}（{{ oddEven.alternation.flips }}/{{ oddEven.alternation.pairs }}）
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

        <!-- 2. 獎號總和 -->
        <div
          v-if="card.id === 'prize-sum' && expanded.has(card.id)"
          class="mt-3 space-y-3 rounded-lg bg-elevated/50 p-3 text-sm"
        >
          <div class="flex flex-wrap gap-2">
            <UBadge
              color="neutral"
              variant="subtle"
            >
              平均 {{ prizeSum.mean.toFixed(1) }} · 中位 {{ prizeSum.median }}
            </UBadge>
            <UBadge
              color="neutral"
              variant="subtle"
            >
              常見範圍（八成落在）{{ prizeSum.p10 }}–{{ prizeSum.p90 }}
            </UBadge>
            <UBadge
              color="neutral"
              variant="subtle"
            >
              最小 {{ prizeSum.min }} · 最大 {{ prizeSum.max }}
            </UBadge>
          </div>
          <p class="text-xs text-muted">
            跟前一期比、方向相反的比例：{{ ratio(prizeSum.alternation.flips, prizeSum.alternation.pairs) }}（{{ prizeSum.alternation.flips }}/{{ prizeSum.alternation.pairs }}）
          </p>
          <div class="flex flex-wrap gap-2 text-xs">
            <span
              v-for="r in prizeSum.runDist"
              :key="r.label"
              class="text-muted"
            >
              {{ r.label }}：{{ r.count }} 段（{{ pct(r.pct) }}）
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

        <!-- 3. 尾數 -->
        <div
          v-if="card.id === 'tails' && expanded.has(card.id)"
          class="mt-3 space-y-4 rounded-lg bg-elevated/50 p-3 text-sm"
        >
          <div class="space-y-2">
            <p class="text-xs font-medium text-muted">
              五顆獎號的尾數，跟上一期完全沒有重覆
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
                平均 {{ num1(tails.noRepeatIntervalMean) }} 期一次 · 最久 {{ tails.noRepeatIntervalMax ?? '—' }} 期沒出現
              </UBadge>
              <UBadge
                v-if="tails.lastNoRepeat"
                color="neutral"
                variant="subtle"
              >
                最近一次 {{ tails.lastNoRepeat.issue }}（{{ tails.lastNoRepeat.date }}）· 已隔 {{ tails.sinceLastNoRepeat }} 期
              </UBadge>
            </div>
          </div>

          <USeparator />

          <div class="space-y-2">
            <p class="text-xs font-medium text-muted">
              某期剛好兩顆同尾（三顆以上不算）→ 下一期那個尾的狀況（共 {{ tails.pairJudged }} 次）
            </p>
            <div class="flex flex-wrap gap-2">
              <UBadge
                color="success"
                variant="subtle"
              >
                又成對・帶到原本的號 {{ tails.pairNextPairCarry }}（{{ ratio(tails.pairNextPairCarry, tails.pairJudged) }}）
              </UBadge>
              <UBadge
                color="info"
                variant="subtle"
              >
                又成對・換兩顆新號 {{ tails.pairNextPairFresh }}（{{ ratio(tails.pairNextPairFresh, tails.pairJudged) }}）
              </UBadge>
              <UBadge
                color="neutral"
                variant="subtle"
              >
                只出 1 顆 {{ tails.pairNextSingle }}（{{ ratio(tails.pairNextSingle, tails.pairJudged) }}）
              </UBadge>
              <UBadge
                color="neutral"
                variant="subtle"
              >
                沒出 {{ tails.pairNextNone }}（{{ ratio(tails.pairNextNone, tails.pairJudged) }}）
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

        <!-- 4. 隔期分桶 -->
        <div
          v-if="card.id === 'gap-buckets' && expanded.has(card.id)"
          class="mt-3 space-y-3 rounded-lg bg-elevated/50 p-3 text-sm"
        >
          <p class="text-xs text-muted">
            每顆獎號都能回溯到它上一次出現是幾期前（= 隔期）。這裡分三段：0-5 期前（近）、6-9 期前（中）、10 期以上（遠）。
          </p>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="d in gapBuckets.totalDist"
              :key="d.label"
              color="primary"
              variant="subtle"
            >
              {{ d.label }} 期前：{{ d.count }} 顆（{{ pct(d.pct) }}）
            </UBadge>
          </div>
          <p class="text-xs text-muted">
            平均每期五顆裡：近 {{ gapBuckets.perPeriodAvg.low.toFixed(2) }} 顆 · 中 {{ gapBuckets.perPeriodAvg.mid.toFixed(2) }} 顆 · 遠 {{ gapBuckets.perPeriodAvg.high.toFixed(2) }} 顆
          </p>
          <div class="space-y-1 text-xs">
            <p class="font-medium text-muted">
              常見組成（近-中-遠 顆數）：
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

        <!-- 5. 數值頻率 -->
        <div
          v-if="card.id === 'value-freq' && expanded.has(card.id)"
          class="mt-3 space-y-3 rounded-lg bg-elevated/50 p-3 text-sm"
        >
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="f in valueFreq.freqs"
              :key="f.label"
              :color="f.label === '>5' ? 'neutral' : 'primary'"
              variant="subtle"
            >
              數值 {{ f.label === '>5' ? '超過 5' : f.label }}：{{ f.count }} 顆（{{ pct(f.pct) }}）
            </UBadge>
          </div>
          <p class="text-xs text-muted">
            分母 = 載入歷史裡全部 {{ valueFreq.totalNums }} 顆獎號的數值。
          </p>
        </div>

        <!-- 6. 數值0 -->
        <div
          v-if="card.id === 'value-zero' && expanded.has(card.id)"
          class="mt-3 space-y-3 rounded-lg bg-elevated/50 p-3 text-sm"
        >
          <p class="text-xs text-muted">
            數值 0 的意思：那顆獎號的來源格子，前一期才剛被撈中過。
          </p>
          <div class="flex flex-wrap gap-2">
            <UBadge
              color="primary"
              variant="subtle"
            >
              有數值 0 的期：{{ valueZero.periodsWithZero }}/{{ valueZero.totalPeriods }}（{{ pct(valueZero.periodsWithZeroRate) }}）
            </UBadge>
            <UBadge
              color="neutral"
              variant="subtle"
            >
              完全沒有數值 0 的期：{{ valueZero.noZeroCount }} 次 · 平均 {{ num1(valueZero.noZeroIntervalMean) }} 期一次 · 最久 {{ valueZero.noZeroIntervalMax ?? '—' }} 期
            </UBadge>
            <UBadge
              v-if="valueZero.lastNoZero"
              color="neutral"
              variant="subtle"
            >
              最近一次沒有 0：{{ valueZero.lastNoZero.issue }}（{{ valueZero.lastNoZero.date }}）· 已隔 {{ valueZero.sinceLastNoZero }} 期
            </UBadge>
            <UBadge
              color="neutral"
              variant="subtle"
            >
              連續都有 0 最長 {{ valueZero.maxZeroStreak }} 期 · 目前連續 {{ valueZero.currentZeroStreak }} 期
            </UBadge>
          </div>
          <div class="flex flex-wrap gap-2 text-xs">
            <span
              v-for="d in valueZero.countDist"
              :key="d.label"
              class="text-muted"
            >
              一期出 {{ d.label }} 0：{{ d.count }} 期（{{ pct(d.pct) }}）
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
      </li>
    </ul>
  </UCard>
</template>
