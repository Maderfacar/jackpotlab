<script setup lang="ts">
/**
 * 「連 N 期之後」樓梯：只對最近 1 期、最近 2 期……一路往上對，每階列出以前出現幾次、下一期開什麼。
 * 點一階 → 下面展開那一階的下一期／下下期／第三期、出現在哪幾年、每一次的明細。
 */
import type { PlainDraw } from '~~/shared/lotto/history-file'
import { orderStates, type CoordSeries } from '~~/shared/lotto/overview/coords'
import { ladder, type Dist, type LadderStep } from '~~/shared/lotto/overview/streak'
import { mdw, pad2, pct, shortIssue, toneStyle } from '~/utils/overview-format'

const props = defineProps<{
  series: CoordSeries
  draws: PlainDraw[]
}>()

const AHEAD_LABEL = ['下一期', '下下期', '第三期'] as const
const CASES_STEP = 12
/** 長條裡一段至少這麼寬才寫字 */
const LABEL_MIN = 12

const def = computed(() => props.series.def)
const steps = computed<LadderStep[]>(() => ladder(props.series.seq))
const pickedK = ref<number | null>(null)
const showCases = ref(CASES_STEP)

/** 預設選最深、以前還出現過的那一階 */
const defaultK = computed(() => [...steps.value].reverse().find(s => s.hits.length > 0)?.k ?? 1)
const selected = computed(() => steps.value.find(s => s.k === (pickedK.value ?? defaultK.value)) ?? null)
watch(() => props.series.def.id, () => {
  pickedK.value = null
  showCases.value = CASES_STEP
})
watch(pickedK, () => {
  showCases.value = CASES_STEP
})

function segments(d: Dist, total: number) {
  return orderStates(def.value, Object.keys(d)).map(s => ({ s, n: d[s]!, w: pct(d[s]!, total), style: toneStyle(def.value.tone(s)) }))
}
function rows(d: Dist, total: number) {
  const segs = segments(d, total)
  const max = Math.max(1, ...segs.map(x => x.n))
  return segs.map(x => ({ ...x, bar: (x.n / max) * 100 }))
}

const cases = computed(() => {
  const st = selected.value
  if (!st) return []
  return [...st.hits].reverse().map((i) => {
    const after = [1, 2, 3].map(a => props.series.seq[i + a] ?? null)
    return { i, draw: props.draws[i]!, after, next: props.draws[i + 1] ?? null }
  })
})
const lastStep = computed(() => steps.value.at(-1))
</script>

<template>
  <div class="space-y-4">
    <ol class="space-y-1.5">
      <li
        v-for="st in steps"
        :key="st.k"
      >
        <button
          type="button"
          class="ov-step grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-xl px-2.5 py-2 text-left sm:grid-cols-[minmax(0,15rem)_5.5rem_minmax(0,1fr)]"
          :class="{ 'is-picked': selected?.k === st.k, 'is-new': st.hits.length === 0 }"
          :disabled="st.hits.length === 0"
          @click="pickedK = st.k"
        >
          <span class="flex min-w-0 items-center justify-end gap-1 overflow-hidden">
            <span class="mr-auto shrink-0 text-[11px] text-[var(--ov-ink-soft)]">最近 {{ st.k }} 期</span>
            <template
              v-for="(s, j) in st.pattern"
              :key="j"
            >
              <span
                v-if="j > 0"
                class="text-[10px] text-[var(--ov-ink-soft)]"
              >›</span>
              <OverviewStateView
                :def="def"
                :state="s"
                size="xs"
              />
            </template>
          </span>
          <span class="text-right text-sm tabular-nums sm:text-left">
            <template v-if="st.hits.length"><b class="text-base">{{ st.hits.length.toLocaleString() }}</b> 次</template>
            <b
              v-else
              class="text-[var(--ov-warm-ink)]"
            >第一次</b>
          </span>
          <span
            v-if="st.nextCount[0]"
            class="col-span-2 flex h-5 overflow-hidden rounded-md sm:col-span-1"
            :title="`${AHEAD_LABEL[0]}：${segments(st.next[0], st.nextCount[0]).map(x => `${x.s} ${x.n}`).join('、')}`"
          >
            <span
              v-for="seg in segments(st.next[0], st.nextCount[0])"
              :key="seg.s"
              class="ov-seg flex items-center justify-center overflow-hidden text-[10px] font-semibold"
              :style="{ ...seg.style, width: `${seg.w}%` }"
            >{{ seg.w >= LABEL_MIN && !def.parts ? seg.s : '' }}</span>
          </span>
          <span
            v-else-if="st.hits.length === 0"
            class="col-span-2 text-xs text-[var(--ov-ink-soft)] sm:col-span-1"
          >以前沒有這樣走過，下一期開出來就是第一筆紀錄</span>
        </button>
      </li>
    </ol>

    <p
      v-if="lastStep && lastStep.hits.length > 0 && steps.length >= 8"
      class="text-xs text-[var(--ov-ink-soft)]"
    >
      最多往上對 8 期。
    </p>

    <div
      v-if="selected && selected.hits.length"
      class="ov-detail space-y-5 rounded-2xl p-4"
    >
      <div class="flex flex-wrap items-center gap-1.5 text-sm">
        <span class="text-[var(--ov-ink-soft)]">走法</span>
        <template
          v-for="(s, j) in selected.pattern"
          :key="j"
        >
          <span
            v-if="j > 0"
            class="text-[var(--ov-ink-soft)]"
          >›</span>
          <OverviewStateView
            :def="def"
            :state="s"
          />
        </template>
        <span class="ml-1">以前出現 <b>{{ selected.hits.length }}</b> 次，之後開出：</span>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div
          v-for="(label, a) in AHEAD_LABEL"
          :key="label"
        >
          <p class="mb-1.5 text-xs font-bold">
            {{ label }}
            <span class="font-normal text-[var(--ov-ink-soft)]">（{{ selected.nextCount[a] }} 次）</span>
          </p>
          <ul class="space-y-1">
            <li
              v-for="r in rows(selected.next[a]!, selected.nextCount[a]!)"
              :key="r.s"
              class="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-xs tabular-nums"
            >
              <OverviewStateView
                :def="def"
                :state="r.s"
                size="xs"
              />
              <span class="h-2.5 overflow-hidden rounded-full bg-[var(--ov-line)]">
                <span
                  class="ov-bar block h-full rounded-full"
                  :style="{ ...r.style, width: `${r.bar}%`, background: 'var(--ov-edge)' }"
                />
              </span>
              <span class="text-right"><b>{{ r.n }}</b> 次・{{ r.w }}%</span>
            </li>
          </ul>
        </div>
      </div>

      <div>
        <p class="mb-1 text-xs font-bold">
          出現在哪幾年
        </p>
        <OverviewTimeline
          :draws="draws"
          :indices="selected.hits"
        />
      </div>

      <div>
        <p class="mb-2 text-xs font-bold">
          每一次（新 → 舊）
        </p>
        <ul class="divide-y divide-[var(--ov-line)] text-xs">
          <li
            v-for="c in cases.slice(0, showCases)"
            :key="c.i"
            class="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5"
          >
            <span class="w-28 shrink-0 tabular-nums text-[var(--ov-ink-soft)]">{{ c.draw.date.slice(0, 4) }}・{{ mdw(c.draw.date) }}</span>
            <span class="flex items-center gap-1">
              <span class="text-[var(--ov-ink-soft)]">之後</span>
              <template
                v-for="(s, a) in c.after"
                :key="a"
              >
                <OverviewStateView
                  v-if="s"
                  :def="def"
                  :state="s"
                  size="xs"
                />
                <span
                  v-else
                  class="text-[var(--ov-ink-soft)]"
                >…</span>
              </template>
            </span>
            <span
              v-if="c.next"
              class="font-mono text-[var(--ov-ink-soft)]"
            >{{ shortIssue(c.next.issue) }}：{{ c.next.nums.map(pad2).join(' ') }}</span>
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
    </div>
  </div>
</template>

<style scoped>
.ov-step {
  border: 1px solid transparent;
  transition: background 140ms ease, border-color 140ms ease;
}
.ov-step:not(:disabled):hover { background: color-mix(in oklab, var(--ov-ink) 5%, transparent); }
.ov-step.is-picked { background: var(--ov-card); border-color: var(--ov-ink); }
.ov-step.is-new { border: 1px dashed color-mix(in oklab, var(--ov-warm) 70%, var(--ov-line)); cursor: default; }
.ov-seg + .ov-seg { border-left: 1.5px solid var(--ov-paper); }
.ov-detail { background: var(--ov-card); border: 1px solid var(--ov-line); }
.ov-bar { transform-origin: left; animation: ov-grow 600ms cubic-bezier(0.16, 1, 0.3, 1) both; }
@keyframes ov-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@media (prefers-reduced-motion: reduce) { .ov-bar { animation: none; } }
</style>
