<script setup lang="ts">
/** ⑧ 尾數的隔期：0～9 各隔幾期、照現在隔期歷史上下一期開出幾成（最低 = 排除）、最近 30 期、存摺 */
import { tailDetail, tailLedger } from '~~/shared/lotto/scan/points/details'
import type { PointEval } from '~~/shared/lotto/scan/points/evaluate'
import type { Row } from '~~/shared/lotto/scan/points/rows'
import type { PointSummary } from '~~/shared/lotto/scan/points/stats'

const props = defineProps<{ rows: Row[], t: number, now: PointEval, summary: PointSummary }>()
const chosen = ref<number | null>(null)
const d = computed(() => tailDetail(props.rows, props.t))
const pick = computed(() => chosen.value ?? d.value.excluded ?? 0)
const led = computed(() => tailLedger(props.rows, props.t, pick.value))
const pct = (v: number) => Math.round(v * 100)
const dueItems = computed(() => d.value.tails.map(x => ({
  label: `尾 ${x.d}`,
  stats: x.stats,
  highlight: x.d === d.value.excluded,
  note: x.ratio ? `下期 ${pct(x.ratio.rate)}%／平常 ${pct(x.ratio.own)}%` : ''
})))
const issues = computed(() => props.rows.slice(Math.max(0, props.t - 29), props.t + 1).map(r => r.issue))
const stripRows = computed(() => d.value.tails.map(x => ({
  key: String(x.d),
  label: `尾 ${x.d}`,
  cells: x.recent.map(v => (v ? 'on' : 'off') as 'on' | 'off'),
  active: x.d === d.value.excluded
})))
</script>

<template>
  <ScanPointCard
    point-key="tail"
    :now="now"
    :summary="summary"
  >
    <div class="space-y-1">
      <div class="text-xs text-muted">
        每個尾數已經隔幾期沒開。右邊「下期 x%／平常 y%」：20 年來隔這麼久的時候，下一期有開出的比例，跟它自己平常的比例比。比平常低最多的那個就是排除的尾數（粗體）
      </div>
      <ScanVizDue :items="dueItems" />
    </div>
    <div class="space-y-1">
      <div class="text-xs text-muted">
        最近 30 期，每個尾數哪幾期有開出（實心＝有，右邊最新）
      </div>
      <ScanVizStrip
        :rows="stripRows"
        :issues="issues"
        :label-width="3"
        :min-width="420"
      />
    </div>
    <template #side>
      <div class="flex items-baseline gap-2">
        <span class="text-xs text-muted">這期排除的尾數</span>
        <span class="font-mono text-2xl font-semibold">{{ d.excluded == null ? '—' : `尾 ${d.excluded}` }}</span>
      </div>
      <div class="flex flex-wrap items-center gap-1">
        <span class="text-xs text-muted">存摺要看哪個尾數：</span>
        <UButton
          v-for="x in 10"
          :key="x"
          size="xs"
          :color="pick === x - 1 ? 'primary' : 'neutral'"
          :variant="pick === x - 1 ? 'solid' : 'outline'"
          @click="chosen = x - 1"
        >
          {{ x - 1 }}
        </UButton>
      </div>
      <ScanVizLedger
        :points="led.points"
        :unit="` 次（尾 ${pick}）`"
      />
    </template>
  </ScanPointCard>
</template>
