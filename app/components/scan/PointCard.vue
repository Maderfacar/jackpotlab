<script setup lang="ts">
/** 八點細節卡外框：標題、這期亮燈狀態、亮燈後成真 vs 平常；內容由各點放進 slot */
import type { PointEval, PointKey } from '~~/shared/lotto/scan/points/evaluate'
import { metaOf } from '~~/shared/lotto/scan/points/meta'
import type { PointSummary } from '~~/shared/lotto/scan/points/stats'

const props = defineProps<{
  pointKey: PointKey
  now: PointEval
  summary: PointSummary
}>()
const meta = computed(() => metaOf(props.pointKey))
</script>

<template>
  <UCard :id="`point-${pointKey}`">
    <div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div class="min-w-0 space-y-1">
        <div class="flex items-center gap-2">
          <span
            class="pc-lamp"
            :class="now.lit ? (now.strong ? 'pc-strong' : 'pc-on') : ''"
          />
          <h3 class="text-base font-semibold">
            {{ meta.no }} {{ meta.name }}
          </h3>
          <span
            v-if="now.lit"
            class="text-sm font-medium text-highlighted"
          >{{ now.target }}</span>
          <span
            v-if="now.lit && now.hit != null"
            class="text-xs font-semibold"
            :class="now.hit ? 'pc-ok' : 'pc-no'"
          >{{ now.hit ? '✓ 成真' : '✗ 沒成真' }}</span>
        </div>
        <p class="text-xs text-muted">
          亮燈：{{ meta.when }} → {{ meta.claim }}
        </p>
      </div>
      <div class="w-full sm:w-64">
        <ScanVizRateBars
          :hit="summary.hit"
          :n="summary.n"
          :base="summary.base"
        />
      </div>
    </div>
    <div class="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
      <div class="min-w-0 space-y-4">
        <slot />
      </div>
      <div class="min-w-0 space-y-4">
        <slot name="side" />
      </div>
    </div>
  </UCard>
</template>

<style scoped>
.pc-lamp {
  display: inline-block;
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 9999px;
  background: var(--viz-mid);
  box-shadow: inset 0 0 0 1px var(--ui-border-accented);
}
.pc-on {
  background: var(--viz-orange);
}
.pc-strong {
  background: var(--viz-red);
  box-shadow: 0 0 8px var(--viz-red);
}
.pc-ok {
  color: var(--viz-good-text);
}
.pc-no {
  color: var(--viz-bad);
}
</style>
