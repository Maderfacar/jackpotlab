<script setup lang="ts">
/**
 * 「這期的樣子」一格：座標名稱、這期的狀態、最近 14 期色條（目前連著的那段框起來）、連幾期。
 */
import type { CoordSummary } from '~/composables/useOverview'
import { toneStyle } from '~/utils/overview-format'

const props = defineProps<{
  summary: CoordSummary
  selected: boolean
}>()
defineEmits<{ select: [] }>()

const RIBBON = 14

const def = computed(() => props.summary.series.def)
const cells = computed(() => {
  const seq = props.summary.series.seq
  const start = Math.max(0, seq.length - RIBBON)
  const runLen = props.summary.run?.length ?? 0
  return seq.slice(start).map((s, j) => {
    const i = start + j
    return { s, inRun: i >= seq.length - runLen, style: s ? toneStyle(def.value.tone(s)) : {} }
  })
})
/** 有附帶數字的（隔期和、總和…）顯示這期和上一期 */
const valueLine = computed(() => {
  const v = props.summary.series.values
  if (!v) return null
  const cur = v.at(-1)
  const prev = v.at(-2)
  return cur == null ? null : prev == null ? `${cur}` : `${prev} → ${cur}`
})
</script>

<template>
  <button
    type="button"
    class="ov-tile group flex w-full flex-col gap-2 rounded-xl p-3 text-left"
    :class="[selected ? 'is-selected' : '', summary.runHigh ? 'is-high' : '']"
    :aria-pressed="selected"
    @click="$emit('select')"
  >
    <div class="flex items-start justify-between gap-2">
      <span class="text-xs font-medium text-[var(--ov-ink-soft)]">{{ def.name }}</span>
      <span
        v-if="summary.runHigh"
        class="rounded-full bg-[var(--ov-warm)] px-1.5 py-px text-[10px] font-bold text-[var(--ov-ink-on)]"
      >歷史高位</span>
    </div>
    <div class="flex items-baseline gap-2">
      <OverviewStateChip
        v-if="summary.run"
        :label="summary.run.state"
        :tone="def.tone(summary.run.state)"
        size="lg"
      />
      <span
        v-else
        class="text-xl text-[var(--ov-ink-soft)]"
      >—</span>
      <span
        v-if="valueLine"
        class="font-mono text-xs text-[var(--ov-ink-soft)]"
      >{{ valueLine }}</span>
    </div>
    <div
      class="flex gap-[3px]"
      aria-hidden="true"
    >
      <span
        v-for="(c, i) in cells"
        :key="i"
        class="ov-cell h-3.5 flex-1 rounded-[3px]"
        :class="{ 'in-run': c.inRun, 'is-empty': !c.s }"
        :style="c.style"
      />
    </div>
    <p
      v-if="summary.run && summary.stats"
      class="text-xs leading-snug tabular-nums"
    >
      <b class="text-sm">連 {{ summary.run.length }} 期</b>
      <span
        v-if="summary.run.length > 1"
        class="text-[var(--ov-ink-soft)]"
      >
        ・以前連到這麼久 {{ summary.stats.reached.toLocaleString() }} 次・最長 {{ summary.stats.max }}
      </span>
      <span
        v-else
        class="text-[var(--ov-ink-soft)]"
      >・以前最長連過 {{ summary.stats.max }} 期</span>
    </p>
  </button>
</template>

<style scoped>
.ov-tile {
  background: var(--ov-card);
  border: 1px solid var(--ov-line);
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
}
.ov-tile:hover { transform: translateY(-2px); box-shadow: 0 10px 24px -14px rgb(0 0 0 / 0.35); }
.ov-tile:focus-visible { outline: 2px solid var(--ov-cool); outline-offset: 2px; }
.ov-tile.is-high { border-color: color-mix(in oklab, var(--ov-warm) 70%, var(--ov-line)); }
.ov-tile.is-selected {
  border-color: var(--ov-ink);
  box-shadow: 0 0 0 1px var(--ov-ink), 0 12px 28px -16px rgb(0 0 0 / 0.45);
}
.ov-cell.is-empty { background: var(--ov-line); }
.ov-cell.in-run { box-shadow: 0 0 0 1.5px var(--ov-ink); }
@media (prefers-reduced-motion: reduce) {
  .ov-tile, .ov-tile:hover { transition: none; transform: none; }
}
</style>
