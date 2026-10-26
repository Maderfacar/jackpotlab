<script setup lang="ts">
/**
 * 換座標的一排按鈕（可左右滑）；正處於歷史高位的加一個橘點。
 */
import type { CoordSummary } from '~/composables/useOverview'

defineProps<{
  summaries: CoordSummary[]
  modelValue: string
}>()
defineEmits<{ 'update:modelValue': [id: string] }>()
</script>

<template>
  <div class="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
    <button
      v-for="s in summaries"
      :key="s.series.def.id"
      type="button"
      class="ov-sw relative shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
      :class="{ 'is-on': s.series.def.id === modelValue }"
      :aria-pressed="s.series.def.id === modelValue"
      @click="$emit('update:modelValue', s.series.def.id)"
    >
      {{ s.series.def.name }}
      <span
        v-if="s.runHigh"
        class="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[var(--ov-warm)]"
      />
    </button>
  </div>
</template>

<style scoped>
.ov-sw {
  border: 1px solid var(--ov-line);
  background: var(--ov-card);
  color: var(--ov-ink-soft);
  transition: background 140ms ease, color 140ms ease;
}
.ov-sw:hover { color: var(--ov-ink); }
.ov-sw.is-on { background: var(--ov-ink); border-color: var(--ov-ink); color: var(--ov-paper); }
</style>
