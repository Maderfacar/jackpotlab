<script setup lang="ts">
/**
 * 目前數字排在歷史第幾（0～100）：左端後 10% 藍、右端前 10% 橘、中間一條中位線，點 = 目前。
 */
defineProps<{ rank: number | null }>()
</script>

<template>
  <span
    class="ov-rank relative block h-3.5 w-full rounded-full"
    aria-hidden="true"
  >
    <span class="absolute inset-y-0 left-0 w-[10%] rounded-l-full bg-[color-mix(in_oklab,var(--ov-cool)_45%,transparent)]" />
    <span class="absolute inset-y-0 right-0 w-[10%] rounded-r-full bg-[color-mix(in_oklab,var(--ov-warm)_50%,transparent)]" />
    <span class="absolute inset-y-0 left-1/2 w-px bg-[var(--ov-ink-soft)] opacity-50" />
    <span
      v-if="rank != null"
      class="ov-rank-dot absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
      :class="rank >= 90 ? 'bg-[var(--ov-warm)]' : rank <= 10 ? 'bg-[var(--ov-cool)]' : 'bg-[var(--ov-ink)]'"
      :style="{ left: `${Math.min(97, Math.max(3, rank))}%` }"
    />
  </span>
</template>

<style scoped>
.ov-rank { background: color-mix(in oklab, var(--ov-ink) 7%, var(--ov-card)); }
.ov-rank-dot { box-shadow: 0 0 0 2px var(--ov-card); }
</style>
