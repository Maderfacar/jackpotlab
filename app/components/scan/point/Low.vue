<script setup lang="ts">
/** ① 0~5 開幾顆：分佈、徘徊之後、0~5 桶子現在裝幾顆、開 k 顆的隔期、存摺 */
import { lowDetail } from '~~/shared/lotto/scan/points/details'
import { LOW_RUN, type PointEval } from '~~/shared/lotto/scan/points/evaluate'
import type { NumberInfo } from '~~/shared/lotto/scan/points/board-prob'
import type { Row } from '~~/shared/lotto/scan/points/rows'
import type { PointSummary } from '~~/shared/lotto/scan/points/stats'

const props = defineProps<{ rows: Row[], infos: NumberInfo[][], t: number, now: PointEval, summary: PointSummary, hNow: PointEval, hSummary: PointSummary }>()
const d = computed(() => lowDetail(props.rows, props.t, props.infos))
const total = computed(() => d.value.dist.reduce((a, b) => a + b, 0))
const runRows = computed(() => d.value.runs.map(r => ({
  label: r.k === 7 ? '連 7+ 期' : `連 ${r.k} 期`,
  hit: r.next[0]! + r.next[1]! + r.next[2]!,
  n: r.n,
  expect: r.expect,
  highlight: Math.min(d.value.current, 7) === r.k
})))
const mean = computed(() => (total.value ? d.value.dist.reduce((a, c, k) => a + c * k, 0) / total.value : 0))
</script>

<template>
  <ScanPointCard
    point-key="low"
    :now="now"
    :summary="summary"
    :h-now="hNow"
    :h-summary="hSummary"
  >
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="space-y-1">
        <div class="text-xs text-muted">
          20 年來，每期 5 顆裡有幾顆是從隔期 0~5 開出來的（這期 <b class="text-highlighted">{{ d.now }}</b> 顆）
        </div>
        <ScanVizBars :items="d.dist.map((v, k) => ({ label: `${k} 顆`, value: v, highlight: k === d.now }))" />
      </div>
      <div class="space-y-1">
        <div class="text-xs text-muted">
          最近 {{ d.recent.length }} 期，每期從 0~5 開幾顆（橫線＝平常大約 {{ mean.toFixed(1) }} 顆）
        </div>
        <ScanVizSeries
          :items="d.recent.map(r => ({ issue: r.issue, value: r.value }))"
          :guide="mean"
          :height="96"
        />
      </div>
    </div>
    <div class="space-y-1">
      <div class="text-xs text-muted">
        0~5 每期都開 3～4 顆、連續幾期之後，下一期只開 0～2 顆的比例（現在已經連 <b class="text-highlighted">{{ d.current }}</b> 期；連到 {{ LOW_RUN }} 期就亮燈）
      </div>
      <ScanVizRuns
        :rows="runRows"
        what="下一期只開 0～2 顆"
      />
      <div class="text-[11px] text-muted">
        放寬成「接下來兩期內」：連 {{ LOW_RUN }} 期以上之後，下一期或下下期有一期只開 0～2 顆的比例（這一項還沒有盤面對照）：
        <b class="font-mono text-highlighted">{{ d.within2.n ? Math.round(d.within2.hit / d.within2.n * 100) : 0 }}%</b>（{{ d.within2.hit }}/{{ d.within2.n }}）
      </div>
    </div>
    <template #side>
      <div class="flex items-baseline gap-2">
        <span class="text-xs text-muted">隔期 0~5 這幾個桶子現在一共裝了</span>
        <span class="font-mono text-2xl font-semibold">{{ d.boardLow }}</span>
        <span class="text-xs text-muted">顆號碼</span>
      </div>
      <div class="space-y-1">
        <div class="text-xs text-muted">
          「0~5 開出 0 顆、1 顆……5 顆」這幾種情況，各自已經隔幾期沒出現
        </div>
        <ScanVizDue :items="d.each.map(e => ({ label: `開 ${e.k} 顆`, stats: e.stats, highlight: e.k === d.now }))" />
      </div>
      <ScanVizLedger
        :points="d.ledger.points"
        unit=" 顆"
      />
    </template>
  </ScanPointCard>
</template>
