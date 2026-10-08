<script setup lang="ts">
/** 一個查找比例：條件成立後 x%（次數），可附「平常」；次數少於 SMALL_SAMPLE 標「樣本少」 */
import { SMALL_SAMPLE, type Rate } from '~~/shared/lotto/scan/scan'

defineProps<{
  rate: Rate
  base?: Rate | null
}>()
</script>

<template>
  <span class="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
    <template v-if="rate.n > 0">
      <span class="font-mono font-semibold text-highlighted">{{ scanPct(rate) }}</span>
      <span class="font-mono text-xs text-muted">（{{ rate.hit }}/{{ rate.n }}）</span>
      <UBadge
        v-if="rate.n < SMALL_SAMPLE"
        color="warning"
        variant="subtle"
        size="sm"
      >
        樣本少
      </UBadge>
    </template>
    <span
      v-else
      class="text-muted"
    >還沒出現過</span>
    <span
      v-if="base"
      class="text-xs text-muted"
    >平常 {{ scanPct(base) }}<span class="font-mono">（{{ base.hit }}/{{ base.n }}）</span></span>
  </span>
</template>
