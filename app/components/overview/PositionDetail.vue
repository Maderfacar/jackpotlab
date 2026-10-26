<script setup lang="ts">
/**
 * 位置波段詳細（滑出面板）：長一點的波形、相似波形之後 1～3 期、出現年份、每一次明細。
 */
import type { PlainDraw } from '~~/shared/lotto/history-file'
import { BUCKETS, bucketOf, similar, type PositionStats, type PosKind } from '~~/shared/lotto/overview/position'
import { mdw, pct } from '~/utils/overview-format'

const props = defineProps<{
  draws: PlainDraw[]
  pos: number
  kind: PosKind
  values: (number | null)[]
  stats: PositionStats
  l: number
}>()
const emit = defineEmits<{ 'update:l': [n: number] }>()

const RANGES = [30, 50, 100, 200]
const L_OPTIONS = [2, 3, 4, 5, 6, 8]
const AHEAD = ['下一期', '下下期', '第三期']
const CASES_STEP = 15

const range = ref(50)
const showCases = ref(CASES_STEP)
watch(() => props.l, () => {
  showCases.value = CASES_STEP
})

const kindName = computed(() => (props.kind === 'gap' ? '隔期' : '值'))
const buckets = computed(() => BUCKETS[props.kind])
const sim = computed(() => similar(props.values, props.kind, props.l))
const bucketMax = computed(() => Math.max(1, ...(sim.value?.nextBuckets ?? [0])))
const label = (v: number | null) => (v == null ? '—' : buckets.value[bucketOf(props.kind, v)]!.label)
const cases = computed(() => {
  const s = sim.value
  if (!s) return []
  return [...s.hits].reverse().map(i => ({
    i,
    date: props.draws[i]!.date,
    before: props.values.slice(i - props.l + 1, i + 1),
    after: [1, 2, 3].map(a => (i + a < props.values.length ? props.values[i + a] ?? null : undefined))
  }))
})
</script>

<template>
  <div class="ov-root space-y-5 px-1 pb-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-xs font-semibold text-[var(--ov-ink-soft)]">
          第 {{ pos + 1 }} 顆（由小到大）・{{ kindName }}
        </p>
        <p class="font-mono text-4xl font-black leading-none">
          {{ stats.current ?? '—' }}
          <span class="ml-1 align-middle text-sm font-bold text-[var(--ov-warm-ink)]">{{ label(stats.current) }}</span>
        </p>
      </div>
      <dl class="grid grid-cols-4 gap-x-3 text-center text-[11px] tabular-nums">
        <div
          v-for="(a, i) in stats.avgs"
          :key="i"
        >
          <dt class="text-[var(--ov-ink-soft)]">
            {{ [5, 10, 15][i] }} 期均
          </dt>
          <dd class="text-base font-bold">
            {{ a?.toFixed(1) ?? '—' }}
          </dd>
        </div>
        <div>
          <dt class="text-[var(--ov-ink-soft)]">
            歷史中位
          </dt>
          <dd class="text-base font-bold">
            {{ stats.band?.p50 ?? '—' }}
          </dd>
        </div>
      </dl>
    </div>

    <div class="space-y-2">
      <div class="ov-seg-group is-small">
        <button
          v-for="r in RANGES"
          :key="r"
          type="button"
          :class="{ 'is-on': range === r }"
          @click="range = r"
        >
          近 {{ r }} 期
        </button>
      </div>
      <OverviewPosChart
        :values="values.slice(-range)"
        :kind="kind"
        :band="stats.band"
        :fan="sim?.fan ?? []"
        :height="190"
        detail
      />
      <p class="text-[11px] text-[var(--ov-ink-soft)]">
        藍帶深＝歷史中間一半（{{ stats.band?.p25 }}～{{ stats.band?.p75 }}），淺＝大部分（{{ stats.band?.p10 }}～{{ stats.band?.p90 }}）；左邊數字是分檔界線。
      </p>
    </div>

    <div class="space-y-3">
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="text-xs font-bold">比最近</span>
        <div class="ov-seg-group is-small">
          <button
            v-for="n in L_OPTIONS"
            :key="n"
            type="button"
            :class="{ 'is-on': l === n }"
            @click="emit('update:l', n)"
          >
            {{ n }}
          </button>
        </div>
        <span class="text-xs font-bold">期的檔位</span>
      </div>

      <template v-if="sim">
        <div class="flex flex-wrap items-center gap-1 text-sm">
          <template
            v-for="(b, j) in sim.pattern"
            :key="j"
          >
            <span
              v-if="j > 0"
              class="text-[var(--ov-ink-soft)]"
            >›</span>
            <span class="rounded-md bg-[var(--ov-line)] px-1.5 py-0.5 text-xs font-bold">{{ buckets[b]!.label }}</span>
          </template>
          <span class="ml-1">以前出現 <b class="text-base">{{ sim.hits.length }}</b> 次</span>
        </div>

        <div
          v-if="sim.nextCount"
          class="grid gap-4 sm:grid-cols-2"
        >
          <div>
            <p class="mb-1.5 text-xs font-bold">
              下一期落在哪一檔
            </p>
            <ul class="space-y-1">
              <li
                v-for="(n, k) in sim.nextBuckets"
                :key="k"
                class="grid grid-cols-[2.6rem_minmax(0,1fr)_4.6rem] items-center gap-2 text-xs tabular-nums"
              >
                <span class="font-bold">{{ buckets[k]!.label }}</span>
                <span class="h-2.5 overflow-hidden rounded-full bg-[var(--ov-line)]">
                  <span
                    class="block h-full rounded-full bg-[var(--ov-warm)]"
                    :style="{ width: `${(n / bucketMax) * 100}%` }"
                  />
                </span>
                <span class="text-right"><b>{{ n }}</b> 次・{{ pct(n, sim.nextCount) }}%</span>
              </li>
            </ul>
          </div>
          <div>
            <p class="mb-1.5 text-xs font-bold">
              之後 3 期的數字（扇形）
            </p>
            <ul class="space-y-1 text-xs tabular-nums">
              <li
                v-for="(f, a) in sim.fan"
                :key="a"
                class="flex items-baseline gap-2"
              >
                <span class="w-12 shrink-0 text-[var(--ov-ink-soft)]">{{ AHEAD[a] }}</span>
                <template v-if="f">
                  <span>中間一半 <b class="text-sm">{{ f.p25 }}～{{ f.p75 }}</b></span>
                  <span class="text-[var(--ov-ink-soft)]">中位 {{ f.p50 }}・大部分 {{ f.p10 }}～{{ f.p90 }}</span>
                </template>
                <span
                  v-else
                  class="text-[var(--ov-ink-soft)]"
                >還沒有資料</span>
              </li>
            </ul>
          </div>
        </div>
        <p
          v-else
          class="rounded-lg border border-dashed border-[var(--ov-warm)] p-3 text-sm"
        >
          這種波形以前沒出現過，下一期開出來就是第一筆紀錄；可以改比少一點期數。
        </p>

        <div v-if="sim.hits.length">
          <p class="mb-1 text-xs font-bold">
            出現在哪幾年
          </p>
          <OverviewTimeline
            :draws="draws"
            :indices="sim.hits"
          />
        </div>

        <div v-if="cases.length">
          <p class="mb-2 text-xs font-bold">
            每一次（新 → 舊）
          </p>
          <ul class="divide-y divide-[var(--ov-line)] text-xs tabular-nums">
            <li
              v-for="c in cases.slice(0, showCases)"
              :key="c.i"
              class="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5"
            >
              <span class="w-28 shrink-0 text-[var(--ov-ink-soft)]">{{ c.date.slice(0, 4) }}・{{ mdw(c.date) }}</span>
              <span class="font-mono text-[var(--ov-ink-soft)]">{{ c.before.join(' ') }}</span>
              <span class="text-[var(--ov-ink-soft)]">→</span>
              <span class="flex gap-1 font-mono">
                <span
                  v-for="(v, a) in c.after"
                  :key="a"
                  class="min-w-6 rounded px-1 text-center"
                  :class="a === 0 ? 'bg-[var(--ov-warm)] font-bold text-[var(--ov-ink-on)]' : 'bg-[var(--ov-line)]'"
                >{{ v === undefined ? '…' : v ?? '—' }}</span>
              </span>
            </li>
          </ul>
          <UButton
            v-if="cases.length > showCases"
            class="mt-2"
            size="xs"
            color="neutral"
            variant="soft"
            @click="showCases += 30"
          >
            再看 {{ Math.min(30, cases.length - showCases) }} 筆（還有 {{ cases.length - showCases }} 筆）
          </UButton>
        </div>
      </template>
    </div>
  </div>
</template>
