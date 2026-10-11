<script setup lang="ts">
/**
 * 狀況的隔期（B）：每列一種狀況，條 = 現在已隔幾期（相對 20 年最長），細線 = 平均間隔。
 * 超過平均就變橘色。
 */
import type { IntervalStats } from '~~/shared/lotto/scan/points/stats'

const props = defineProps<{
  items: { label: string, stats: IntervalStats, highlight?: boolean, note?: string }[]
}>()

const scale = computed(() => Math.max(1, ...props.items.map(i => Math.max(i.stats.max ?? 0, i.stats.current ?? 0))))
const over = (s: IntervalStats) => s.current != null && s.mean != null && s.current > s.mean
const f1 = (v: number | null) => (v == null ? '—' : v.toFixed(1))
</script>

<template>
  <div class="space-y-1">
    <div class="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-x-2 text-[10px] text-muted">
      <span />
      <span>現在隔幾期（細線 = 平均）</span>
      <span class="text-right">隔・平均・最長</span>
    </div>
    <div
      v-for="it in items"
      :key="it.label"
      class="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-x-2"
      :title="`${it.label}：出現 ${it.stats.count} 次，現在隔 ${it.stats.current ?? '—'} 期，平均 ${f1(it.stats.mean)}，最長 ${it.stats.max ?? '—'}${it.note ? `；${it.note}` : ''}`"
    >
      <span
        class="truncate text-xs"
        :class="it.highlight ? 'font-semibold text-highlighted' : 'text-muted'"
      >{{ it.label }}</span>
      <span class="du-track">
        <span
          class="du-bar"
          :class="over(it.stats) ? 'du-over' : ''"
          :style="{ width: `${((it.stats.current ?? 0) / scale) * 100}%` }"
        />
        <span
          v-if="it.stats.mean != null"
          class="du-mean"
          :style="{ left: `${(it.stats.mean / scale) * 100}%` }"
        />
      </span>
      <span class="whitespace-nowrap text-right font-mono text-[11px]">
        <b :class="over(it.stats) ? 'du-over-text' : ''">{{ it.stats.current ?? '—' }}</b>
        <span class="text-muted">・{{ f1(it.stats.mean) }}・{{ it.stats.max ?? '—' }}</span>
        <span
          v-if="it.note"
          class="ml-1 text-muted"
        >{{ it.note }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.du-track {
  position: relative;
  height: 10px;
  border-radius: 4px;
  background: var(--viz-mid);
}
.du-bar {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 4px;
  background: color-mix(in oklab, var(--viz-blue) 55%, var(--viz-mid));
}
.du-over {
  background: var(--viz-orange);
}
.du-mean {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background: var(--ui-text);
}
.du-over-text {
  color: var(--viz-orange-text);
}
</style>
