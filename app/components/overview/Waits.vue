<script setup lang="ts">
/**
 * 「等多久了」：一個座標的每種狀態，已經幾期沒出現、以前平均隔幾期、最久隔幾期。
 * 長條：灰軌 = 最久，實心 = 目前已等，細線 = 平均。
 */
import { isWaitHigh, type CoordSummary } from '~/composables/useOverview'
import type { Wait } from '~~/shared/lotto/overview/streak'

const props = defineProps<{ summary: CoordSummary }>()

const showRare = ref(false)
watch(() => props.summary.series.def.id, () => {
  showRare.value = false
})

const def = computed(() => props.summary.series.def)
const list = computed(() => (showRare.value ? [...props.summary.waits, ...props.summary.rareWaits] : props.summary.waits))

function bar(w: Wait) {
  const top = Math.max(1, w.maxGap, w.waited ?? 0)
  return { now: ((w.waited ?? 0) / top) * 100, avg: w.avgGap == null ? null : (w.avgGap / top) * 100 }
}
</script>

<template>
  <div class="space-y-3">
    <ul class="space-y-2.5">
      <li
        v-for="w in list"
        :key="w.state"
        class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1"
      >
        <OverviewStateView
          :def="def"
          :state="w.state"
          size="sm"
          class="row-span-2"
        />
        <div class="relative h-3 overflow-hidden rounded-full bg-[var(--ov-line)]">
          <span
            class="ov-now absolute inset-y-0 left-0 rounded-full"
            :class="isWaitHigh(w) ? 'bg-[var(--ov-warm)]' : 'bg-[var(--ov-ink-soft)]'"
            :style="{ width: `${bar(w).now}%` }"
          />
          <span
            v-if="bar(w).avg != null"
            class="absolute inset-y-[-2px] w-[2px] bg-[var(--ov-ink)]"
            :style="{ left: `calc(${bar(w).avg}% - 1px)` }"
          />
        </div>
        <p class="text-xs leading-snug tabular-nums">
          <template v-if="w.waited === 0">
            <b>這期就是它</b>
          </template>
          <template v-else-if="w.waited != null">
            已 <b class="text-sm">{{ w.waited }}</b> 期沒出現
          </template>
          <span class="text-[var(--ov-ink-soft)]">
            ・平均 {{ w.avgGap == null ? '—' : w.avgGap.toFixed(1) }} 期一次・最久隔 {{ w.maxGap }} 期・共出現 {{ w.count.toLocaleString() }} 次
          </span>
          <template v-if="w.waited">
            <br>
            <span :class="isWaitHigh(w) ? 'font-bold text-[var(--ov-warm-ink)]' : 'text-[var(--ov-ink-soft)]'">
              以前隔 {{ w.gaps.toLocaleString() }} 次裡，等到這麼久的有 {{ w.reachedNow.toLocaleString() }} 次{{ isWaitHigh(w) ? '，正處於歷史高位' : '' }}
            </span>
          </template>
        </p>
      </li>
    </ul>
    <UButton
      v-if="summary.rareWaits.length"
      size="xs"
      color="neutral"
      variant="soft"
      @click="showRare = !showRare"
    >
      {{ showRare ? '收起少見的' : `還有 ${summary.rareWaits.length} 種少見的（每 100 期不到 1 次）` }}
    </UButton>
  </div>
</template>

<style scoped>
.ov-now { transform-origin: left; animation: ov-grow 650ms cubic-bezier(0.16, 1, 0.3, 1) both; }
@keyframes ov-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@media (prefers-reduced-motion: reduce) { .ov-now { animation: none; } }
</style>
