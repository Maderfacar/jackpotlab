<script setup lang="ts">
/** ⑥ 第 1～5 顆各自的隔期：每個隔期一格的熱度圖、連 k 期 > 5 之後回到 0～5、存摺 */
import { POS_GAP_COLS, posDetail, posLedger } from '~~/shared/lotto/scan/points/details'
import type { PointEval } from '~~/shared/lotto/scan/points/evaluate'
import type { Row } from '~~/shared/lotto/scan/points/rows'
import type { PointSummary } from '~~/shared/lotto/scan/points/stats'

const props = defineProps<{ rows: Row[], t: number, now: PointEval, summary: PointSummary }>()
/** 下面的「連 k 期」與存摺看哪一顆；預設跟著亮燈的那顆 */
const chosen = ref<number | null>(null)
const litPos = computed(() => (props.now.lit ? Number(props.now.target.replace(/\D/g, '')) - 1 : 0))
const pick = computed(() => chosen.value ?? litPos.value)
const d = computed(() => posDetail(props.rows, props.t))
const led = computed(() => posLedger(props.rows, props.t, pick.value))
const cols = Array.from({ length: POS_GAP_COLS + 1 }, (_, i) => (i === POS_GAP_COLS ? '30+' : String(i)))
const heatRows = computed(() => d.value.grid.map((values, p) => ({
  label: `第 ${p + 1} 顆`,
  values,
  mark: d.value.now[p] == null ? POS_GAP_COLS : Math.min(d.value.now[p]!, POS_GAP_COLS)
})))
const runRows = computed(() => d.value.rules[pick.value]!.map(r => ({
  label: r.k === 5 ? '連 5+ 期' : `連 ${r.k} 期`,
  hit: r.hit,
  n: r.n,
  highlight: Math.min(d.value.runs[pick.value]!, 5) === r.k
})))
const base = computed(() => {
  const b = d.value.base[pick.value]!
  return b.n ? b.hit / b.n : null
})
</script>

<template>
  <ScanPointCard
    point-key="pos"
    :now="now"
    :summary="summary"
  >
    <div class="space-y-1">
      <div class="text-xs text-muted">
        5 顆號碼由小到大排，每一顆通常從哪個隔期開出來：一個隔期一格，顏色越深＝越常見，橘框＝這期
      </div>
      <ScanVizHeat
        :rows="heatRows"
        :cols="cols"
      />
    </div>
    <div class="space-y-2">
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="text-xs text-muted">要看第幾顆：</span>
        <UButton
          v-for="p in 5"
          :key="p"
          size="xs"
          :color="pick === p - 1 ? 'primary' : 'neutral'"
          :variant="pick === p - 1 ? 'solid' : 'outline'"
          @click="chosen = p - 1"
        >
          {{ p }}<span
            v-if="d.runs[p - 1]! >= 2"
            class="ml-0.5 text-[10px]"
          >（連 {{ d.runs[p - 1] }}）</span>
        </UButton>
      </div>
      <div class="text-xs text-muted">
        第 {{ pick + 1 }} 顆連續幾期都從隔期 6 以上開出之後，下一期回到 0～5 的比例（現在已經連 <b class="text-highlighted">{{ d.runs[pick] }}</b> 期）
      </div>
      <ScanVizRuns
        :rows="runRows"
        :base="base"
        :base-label="`第 ${pick + 1} 顆`"
        what="下一期回到 0～5"
      />
    </div>
    <template #side>
      <div class="space-y-1">
        <div class="text-xs text-muted">
          這期 5 顆的隔期
        </div>
        <div class="flex gap-1.5">
          <span
            v-for="(g, i) in d.now"
            :key="i"
            class="po-chip"
            :class="g != null && g <= 5 ? 'po-low' : ''"
          >{{ g ?? '—' }}</span>
        </div>
      </div>
      <ScanVizLedger
        :points="led.points"
        :unit="` 次（第 ${pick + 1} 顆在 0～5）`"
      />
    </template>
  </ScanPointCard>
</template>

<style scoped>
.po-chip {
  display: inline-flex;
  min-width: 2rem;
  justify-content: center;
  border-radius: 6px;
  padding: 2px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  font-weight: 600;
  background: var(--viz-mid);
}
.po-low {
  background: color-mix(in oklab, var(--viz-blue) 30%, var(--viz-mid));
}
</style>
