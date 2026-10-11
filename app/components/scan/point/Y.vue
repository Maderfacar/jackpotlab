<script setup lang="ts">
/** ⑤ 位置 y：5 顆各自的 y 分佈、每顆 y=1～5 各隔幾期沒出現、連幾期 y≠1、存摺 */
import { yDetail } from '~~/shared/lotto/scan/points/details'
import type { PointEval } from '~~/shared/lotto/scan/points/evaluate'
import type { Row } from '~~/shared/lotto/scan/points/rows'
import type { PointSummary } from '~~/shared/lotto/scan/points/stats'

const props = defineProps<{ rows: Row[], t: number, now: PointEval, summary: PointSummary, hNow: PointEval, hSummary: PointSummary }>()
const d = computed(() => yDetail(props.rows, props.t))
const heatRows = computed(() => d.value.positions.map(p => ({ label: `第 ${p.p + 1} 顆`, values: p.dist, mark: p.now == null ? null : Math.min(p.now, 5) - 1 })))
/** 現在隔幾期 ÷ 平均：> 1 變橘，越久越深 */
function cellStyle(cur: number | null, mean: number | null) {
  if (cur == null || mean == null || cur <= mean) return {}
  const k = Math.min(1, (cur / mean - 1) / 3)
  return { background: `color-mix(in oklab, var(--viz-orange) ${Math.round(25 + k * 65)}%, var(--viz-mid))` }
}
</script>

<template>
  <ScanPointCard
    point-key="y"
    :now="now"
    :summary="summary"
    :h-now="hNow"
    :h-summary="hSummary"
  >
    <div class="space-y-1">
      <div class="text-xs text-muted">
        5 顆號碼由小到大排，每一顆的 y 通常是多少：顏色越深＝越常見，橘框＝這期
      </div>
      <ScanVizHeat
        :rows="heatRows"
        :cols="['y=1', 'y=2', 'y=3', 'y=4', 'y=5+']"
        :label-every="1"
      />
    </div>
    <div class="space-y-1">
      <div class="text-xs text-muted">
        每一顆的 y=1、y=2……各自已經隔幾期沒出現／平常大約隔幾期（比平常久就變橘）
      </div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[420px] border-separate border-spacing-0.5 text-center font-mono text-[11px]">
          <thead>
            <tr class="text-muted">
              <th />
              <th
                v-for="y in 5"
                :key="y"
                class="font-normal"
              >
                y={{ y }}
              </th>
              <th class="font-normal">
                連幾期 y≠1
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in d.positions"
              :key="p.p"
            >
              <td class="pr-1 text-right text-muted">
                第 {{ p.p + 1 }} 顆
              </td>
              <td
                v-for="e in p.each"
                :key="e.y"
                class="y-cell"
                :style="cellStyle(e.stats.current, e.stats.mean)"
                :title="`第 ${p.p + 1} 顆 y=${e.y}：現在隔 ${e.stats.current ?? '—'} 期，平均 ${e.stats.mean?.toFixed(1) ?? '—'}，最長 ${e.stats.max ?? '—'}`"
              >
                <b>{{ e.stats.current ?? '—' }}</b><span class="text-muted">／{{ e.stats.mean?.toFixed(1) ?? '—' }}</span>
              </td>
              <td :class="p.run >= 2 ? 'font-semibold text-highlighted' : 'text-muted'">
                {{ p.run }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <template #side>
      <div class="space-y-1">
        <div class="text-xs text-muted">
          最近 30 期，第 1、2 顆是不是 y=1（實心＝是）
        </div>
        <ScanVizStrip
          :rows="d.positions.slice(0, 2).map(p => ({ key: String(p.p), label: `第 ${p.p + 1} 顆`, cells: p.recent.map(y => (y === 1 ? 'on' : 'off') as 'on' | 'off'), titles: p.recent.map(y => `y=${y ?? '—'}`) }))"
          :issues="[]"
          :min-width="0"
          :label-width="3.5"
        />
      </div>
      <ScanVizLedger
        :points="d.ledger.points"
        unit=" 顆 y=1"
      />
    </template>
  </ScanPointCard>
</template>

<style scoped>
.y-cell {
  border-radius: 4px;
  padding: 3px 2px;
  background: var(--viz-mid);
}
</style>
