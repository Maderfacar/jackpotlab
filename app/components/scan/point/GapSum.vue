<script setup lang="ts">
/** ② 隔期和：最近走勢（變大橘、變小藍）、連 k 次同方向之後反轉的比例、存摺 */
import { gapSumDetail } from '~~/shared/lotto/scan/points/details'
import { GAPSUM_STRONG, GAPSUM_WATCH, type PointEval } from '~~/shared/lotto/scan/points/evaluate'
import type { Row } from '~~/shared/lotto/scan/points/rows'
import type { PointSummary } from '~~/shared/lotto/scan/points/stats'

const props = defineProps<{ rows: Row[], t: number, now: PointEval, summary: PointSummary }>()
const d = computed(() => gapSumDetail(props.rows, props.t))
const all = computed(() => d.value.runs.reduce((a, r) => ({ hit: a.hit + r.hit, n: a.n + r.n }), { hit: 0, n: 0 }))
const runRows = computed(() => d.value.runs.map(r => ({
  label: r.k === 5 ? '連 5+ 次' : `連 ${r.k} 次`,
  hit: r.hit,
  n: r.n,
  highlight: Math.min(d.value.current, 5) === r.k
})))
const dirText = computed(() => (d.value.dir > 0 ? '變大' : d.value.dir < 0 ? '變小' : '一樣'))
</script>

<template>
  <ScanPointCard
    point-key="gapsum"
    :now="now"
    :summary="summary"
  >
    <div class="space-y-1">
      <div class="flex flex-wrap items-baseline gap-x-3 text-xs text-muted">
        <span>最近 {{ d.recent.length }} 期的隔期和（跟上一期比）</span>
        <span class="flex items-center gap-1"><span
          class="gs-key"
          style="background: var(--viz-orange)"
        />變大</span>
        <span class="flex items-center gap-1"><span
          class="gs-key"
          style="background: var(--viz-blue)"
        />變小</span>
      </div>
      <ScanVizSeries
        :items="d.recent.map(r => ({ issue: r.issue, value: r.value, dir: r.dir }))"
        :height="110"
      />
    </div>
    <div class="space-y-1">
      <div class="text-xs text-muted">
        隔期和連續幾次都變大（或都變小）之後，下一期反過來的比例（現在已經連 <b class="text-highlighted">{{ d.current }}</b> 次{{ dirText }}；連 {{ GAPSUM_WATCH }} 次開始看、連 {{ GAPSUM_STRONG }} 次算很強）
      </div>
      <ScanVizRuns
        :rows="runRows"
        :base="all.n ? all.hit / all.n : null"
        what="下一期反過來"
      />
    </div>
    <template #side>
      <div class="flex items-baseline gap-2">
        <span class="text-xs text-muted">這期的隔期和</span>
        <span class="font-mono text-2xl font-semibold">{{ d.now }}</span>
        <span
          class="text-sm font-semibold"
          :class="d.strong ? 'gs-strong' : 'text-muted'"
        >已連 {{ d.current }} 次{{ dirText }}</span>
      </div>
      <ScanVizLedger :points="d.ledger.points" />
    </template>
  </ScanPointCard>
</template>

<style scoped>
.gs-key {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
}
.gs-strong {
  color: var(--viz-red);
}
</style>
