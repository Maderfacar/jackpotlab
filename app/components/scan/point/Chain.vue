<script setup lang="ts">
/** ⑦ 連莊・梯型：候選號、多久出現一次、間隔、兩種是穿插還是重疊、最近 120 期時間軸、存摺 */
import { chainDetail } from '~~/shared/lotto/scan/points/details'
import type { PointEval } from '~~/shared/lotto/scan/points/evaluate'
import type { Row } from '~~/shared/lotto/scan/points/rows'
import type { PointSummary } from '~~/shared/lotto/scan/points/stats'

const props = defineProps<{ rows: Row[], t: number, now: PointEval, summary: PointSummary, hNow: PointEval, hSummary: PointSummary }>()
const d = computed(() => chainDetail(props.rows, props.t))
const issues = computed(() => d.value.timeline.map(x => x.issue))
const timelineRows = computed(() => [
  { key: 'tri', label: '連莊三期', cells: d.value.timeline.map(x => (x.tri.length ? 'on' : 'off') as 'on' | 'off'), titles: d.value.timeline.map(x => `第 ${x.issue} 期${x.tri.length ? `：${x.tri.map(scanPad2).join('、')} 連三期` : ''}`) },
  { key: 'stair', label: '梯型', cells: d.value.timeline.map(x => (x.stair.length ? 'on' : 'off') as 'on' | 'off'), titles: d.value.timeline.map(x => `第 ${x.issue} 期${x.stair.length ? `：梯型走到 ${x.stair.map(scanPad2).join('、')}` : ''}`) }
])
const mixText = computed(() => {
  const total = d.value.switches + d.value.sames
  if (!total) return '—'
  return `${Math.round((d.value.switches / total) * 100)}%`
})
</script>

<template>
  <ScanPointCard
    point-key="chain"
    :now="now"
    :summary="summary"
    :h-now="hNow"
    :h-summary="hSummary"
  >
    <div class="space-y-1">
      <div class="text-xs text-muted">
        最近 {{ issues.length }} 期，哪幾期出現連莊三期或梯型（實心＝有，右邊最新）
      </div>
      <ScanVizStrip
        :rows="timelineRows"
        :issues="issues"
        :label-width="4.5"
      />
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      <div class="ch-stat">
        <div class="text-xs font-medium">
          連莊三期
        </div>
        <div class="font-mono text-xl font-semibold">
          {{ d.triN }} <span class="text-xs font-normal text-muted">次</span>
        </div>
        <div class="text-[11px] text-muted">
          平常大約隔 {{ d.triStats.mean?.toFixed(1) ?? '—' }} 期出現一次，最久隔過 {{ d.triStats.max ?? '—' }} 期，現在已經隔 <b class="text-highlighted">{{ d.triStats.current ?? '—' }}</b> 期
        </div>
      </div>
      <div class="ch-stat">
        <div class="text-xs font-medium">
          梯型（例如 12→13→14，3 期走同一個方向）
        </div>
        <div class="font-mono text-xl font-semibold">
          {{ d.stairN }} <span class="text-xs font-normal text-muted">次</span>
        </div>
        <div class="text-[11px] text-muted">
          平常大約隔 {{ d.stairStats.mean?.toFixed(1) ?? '—' }} 期出現一次，最久隔過 {{ d.stairStats.max ?? '—' }} 期，現在已經隔 <b class="text-highlighted">{{ d.stairStats.current ?? '—' }}</b> 期
        </div>
      </div>
      <div class="ch-stat sm:col-span-2">
        <div class="text-xs font-medium">
          穿插還是重疊？
        </div>
        <div class="text-[11px] text-muted">
          兩種在同一期一起出現過 <b class="font-mono text-highlighted">{{ d.both }}</b> 次（重疊）。
          照時間排下來，下一次換成另一種的佔 <b class="font-mono text-highlighted">{{ mixText }}</b>（穿插 {{ d.switches }} 次），同一種又接著來 {{ d.sames }} 次
        </div>
      </div>
    </div>
    <template #side>
      <div class="space-y-1">
        <div class="text-xs text-muted">
          下一期如果要走完第 3 步，會是這幾顆
        </div>
        <div
          v-if="d.candidates.length"
          class="flex flex-wrap gap-1.5"
        >
          <ScanBall
            v-for="n in d.candidates"
            :key="n"
            :n="n"
            size="md"
            tone="ghost"
          />
        </div>
        <div
          v-else
          class="text-xs text-muted"
        >
          沒有
        </div>
        <div
          v-if="d.repeatsNow.length"
          class="text-[11px] text-muted"
        >
          其中已經連開 2 期的：{{ d.repeatsNow.map(scanPad2).join('、') }}
        </div>
      </div>
      <ScanVizLedger
        :points="d.ledger.points"
        unit=" 顆連莊"
      />
    </template>
  </ScanPointCard>
</template>

<style scoped>
.ch-stat {
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--ui-bg-elevated);
}
</style>
