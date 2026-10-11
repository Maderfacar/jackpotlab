<script setup lang="ts">
/** ③ 值：每個值各隔幾期沒出現（何時輪到值 1、2、3…）、5 顆小／中／大的搭配、存摺 */
import { valueDetail } from '~~/shared/lotto/scan/points/details'
import { VALUE_DUE, type PointEval } from '~~/shared/lotto/scan/points/evaluate'
import type { Row } from '~~/shared/lotto/scan/points/rows'
import type { PointSummary } from '~~/shared/lotto/scan/points/stats'

const props = defineProps<{ rows: Row[], t: number, now: PointEval, summary: PointSummary }>()
const d = computed(() => valueDetail(props.rows, props.t))
const comboLabel = (key: string) => {
  const [s, m, b] = key.split('-')
  return `${s}小${m}中${b}大`
}
const topCombos = computed(() => d.value.combos.slice(0, 10).map(c => ({ label: comboLabel(c.key), value: c.count, highlight: c.key === d.value.nowCombo })))
const dueItems = computed(() => d.value.levels.map(l => ({
  label: `值 ${l.label}`,
  stats: l.stats,
  highlight: props.now.lit && props.now.target === `值 ${l.label}`,
  note: l.ratio != null && l.ratio >= VALUE_DUE ? `${l.ratio.toFixed(1)} 倍` : undefined
})))
</script>

<template>
  <ScanPointCard
    point-key="value"
    :now="now"
    :summary="summary"
  >
    <div class="space-y-1">
      <div class="text-xs text-muted">
        每個值各隔幾期沒開出（超過平均變橘；隔到平均 {{ VALUE_DUE }} 倍以上 = 亮燈）
      </div>
      <ScanVizDue :items="dueItems" />
    </div>
    <div class="space-y-1">
      <div class="text-xs text-muted">
        5 顆的搭配（小 = 值 0～1、中 = 2～9、大 = 10 以上），最常見的 10 種；這期 <b class="text-highlighted">{{ comboLabel(d.nowCombo) }}</b>
      </div>
      <ScanVizBars
        :items="topCombos"
        :total="d.n"
        :height="110"
      />
    </div>
    <template #side>
      <div class="space-y-1">
        <div class="text-xs text-muted">
          這期 5 顆的值
        </div>
        <div class="flex gap-1.5">
          <span
            v-for="(v, i) in d.values"
            :key="i"
            class="va-chip"
          >{{ v ?? '—' }}</span>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2 text-center">
        <div class="va-stat">
          <div class="font-mono text-xl font-semibold">
            {{ d.allSmall }}
          </div>
          <div class="text-[11px] text-muted">
            5 顆全小（{{ d.n ? (d.allSmall / d.n * 100).toFixed(1) : 0 }}%）
          </div>
        </div>
        <div class="va-stat">
          <div class="font-mono text-xl font-semibold">
            {{ d.allBig }}
          </div>
          <div class="text-[11px] text-muted">
            5 顆全大（{{ d.n ? (d.allBig / d.n * 100).toFixed(1) : 0 }}%）
          </div>
        </div>
      </div>
      <ScanVizLedger
        :points="d.ledger.points"
        unit=" 顆小值"
      />
    </template>
  </ScanPointCard>
</template>

<style scoped>
.va-chip {
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
.va-stat {
  border-radius: 8px;
  padding: 6px;
  background: var(--ui-bg-elevated);
}
</style>
