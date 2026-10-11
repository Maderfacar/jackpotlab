<script setup lang="ts">
/** 八點細節卡外框：「你的看法」與「歷史挑」並排（各自猜什麼、20 年說中幾成 vs 平常）；內容由各點放進 slot */
import type { PointEval, PointKey } from '~~/shared/lotto/scan/points/evaluate'
import { metaOf } from '~~/shared/lotto/scan/points/meta'
import type { PointSummary } from '~~/shared/lotto/scan/points/stats'

const props = defineProps<{
  pointKey: PointKey
  now: PointEval
  summary: PointSummary
  hNow: PointEval
  hSummary: PointSummary
}>()
const meta = computed(() => metaOf(props.pointKey))
const mineDefined = computed(() => meta.value.claim !== '—')
</script>

<template>
  <UCard :id="`point-${pointKey}`">
    <h3 class="text-base font-semibold">
      {{ meta.no }} {{ meta.name }}
    </h3>
    <div class="mt-3 grid gap-3 md:grid-cols-2">
      <div
        class="pc-side"
        :class="now.lit ? 'pc-side-lit' : ''"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="pc-lamp"
            :class="now.lit ? (now.strong ? 'pc-strong' : 'pc-on') : ''"
          />
          <span class="text-sm font-semibold">你的看法</span>
          <span
            v-if="now.lit"
            class="text-sm font-medium text-highlighted"
          >{{ now.target }}</span>
          <span
            v-else
            class="text-xs text-muted"
          >這期沒亮</span>
          <span
            v-if="now.lit && now.hit != null"
            class="text-xs font-semibold"
            :class="now.hit ? 'pc-ok' : 'pc-no'"
          >{{ now.hit ? '✓ 說中' : '✗ 沒說中' }}</span>
        </div>
        <p class="text-xs text-muted">
          <b class="font-medium">什麼時候亮：</b>{{ meta.when }}<br>
          <template v-if="mineDefined">
            <b class="font-medium">亮了就猜：</b>{{ meta.claim }}
          </template>
        </p>
        <ScanVizRateBars
          v-if="mineDefined"
          :hit="summary.hit"
          :n="summary.n"
          :base="summary.base"
        />
      </div>
      <div
        class="pc-side"
        :class="hNow.lit ? 'pc-side-hist' : ''"
      >
        <div class="flex flex-wrap items-center gap-2">
          <UIcon
            name="i-lucide-history"
            class="pc-hist-icon"
          />
          <span class="text-sm font-semibold">歷史挑</span>
          <span
            v-if="hNow.lit"
            class="text-sm font-medium text-highlighted"
          >猜：{{ hNow.target }}</span>
          <span
            v-else
            class="text-xs text-muted"
          >這期挑不出來（同樣情況不到 30 次）</span>
          <span
            v-if="hNow.lit && hNow.hit != null"
            class="text-xs font-semibold"
            :class="hNow.hit ? 'pc-ok' : 'pc-no'"
          >{{ hNow.hit ? '✓ 說中' : '✗ 沒說中' }}</span>
        </div>
        <p class="text-xs text-muted">
          <b class="font-medium">怎麼挑：</b>{{ meta.history }}
        </p>
        <ScanVizRateBars
          :hit="hSummary.hit"
          :n="hSummary.n"
          :base="hSummary.base"
          hist
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
.pc-side {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border-radius: 0.6rem;
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--ui-border);
}
.pc-side-lit {
  border-color: color-mix(in oklab, var(--viz-orange) 55%, var(--ui-border));
}
.pc-side-hist {
  border-color: color-mix(in oklab, var(--viz-blue) 45%, var(--ui-border));
}
.pc-hist-icon {
  color: var(--viz-blue);
}
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
