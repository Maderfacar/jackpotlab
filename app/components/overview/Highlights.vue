<script setup lang="ts">
/**
 * 頁首下方「這期特別的地方」：所有座標裡，連的期數或等的期數正處於歷史高位的，集中列出來，點了跳到那個座標。
 */
import { isWaitHigh, type CoordSummary } from '~/composables/useOverview'

const props = defineProps<{ summaries: CoordSummary[] }>()
const emit = defineEmits<{ select: [id: string, target: 'ladder' | 'waits'] }>()

/** 等待只提常見的狀態（出現過 ≥ 全部期數 5%），少見的區段組合等很久是常態，放進來只會很雜 */
const WAIT_COMMON_SHARE = 0.05

const runs = computed(() => props.summaries.filter(s => s.runHigh && s.run && s.stats))
const longWaits = computed(() => props.summaries.flatMap((s) => {
  const total = s.series.seq.filter(x => x != null).length
  return s.waits.filter(w => isWaitHigh(w) && w.count >= total * WAIT_COMMON_SHARE).map(w => ({ s, w }))
}))
</script>

<template>
  <section
    v-if="runs.length || longWaits.length"
    class="ov-high rounded-2xl p-4"
  >
    <h2 class="mb-3 flex items-center gap-2 text-sm font-bold">
      <span class="ov-pulse size-2 rounded-full bg-[var(--ov-warm)]" />
      這期正處於歷史高位的
    </h2>
    <ul class="flex flex-col gap-2">
      <li
        v-for="{ series, run, stats } in runs"
        :key="`r-${series.def.id}`"
      >
        <button
          type="button"
          class="ov-high-row flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-2 py-1.5 text-left text-sm"
          @click="emit('select', series.def.id, 'ladder')"
        >
          <span class="w-20 shrink-0 text-xs text-[var(--ov-ink-soft)]">{{ series.def.name }}</span>
          <OverviewStateChip
            :label="run!.state"
            :tone="series.def.tone(run!.state)"
          />
          <span>已連 <b>{{ run!.length }}</b> 期</span>
          <span class="text-xs text-[var(--ov-ink-soft)]">以前 {{ stats!.runs.toLocaleString() }} 段只有 {{ stats!.reached }} 段連到這麼久</span>
        </button>
      </li>
      <li
        v-for="{ s, w } in longWaits"
        :key="`w-${s.series.def.id}-${w.state}`"
      >
        <button
          type="button"
          class="ov-high-row flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-2 py-1.5 text-left text-sm"
          @click="emit('select', s.series.def.id, 'waits')"
        >
          <span class="w-20 shrink-0 text-xs text-[var(--ov-ink-soft)]">{{ s.series.def.name }}</span>
          <OverviewStateChip
            :label="w.state"
            :tone="s.series.def.tone(w.state)"
          />
          <span>已 <b>{{ w.waited }}</b> 期沒出現</span>
          <span class="text-xs text-[var(--ov-ink-soft)]">以前隔 {{ w.gaps.toLocaleString() }} 次只有 {{ w.reachedNow }} 次等到這麼久</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.ov-high {
  background: color-mix(in oklab, var(--ov-warm) 9%, var(--ov-card));
  border: 1px solid color-mix(in oklab, var(--ov-warm) 45%, var(--ov-line));
}
.ov-high-row { transition: background 140ms ease; }
.ov-high-row:hover { background: color-mix(in oklab, var(--ov-warm) 14%, transparent); }
.ov-pulse { animation: ov-pulse 1.8s ease-in-out infinite; }
@keyframes ov-pulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--ov-warm) 60%, transparent); }
  50% { box-shadow: 0 0 0 6px transparent; }
}
@media (prefers-reduced-motion: reduce) { .ov-pulse { animation: none; } }
</style>
