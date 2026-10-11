<script setup lang="ts">
/** ④ 同尾對：這期的同尾與候選號、下一期怎麼帶（連莊 / 不連莊 / 沒開）、前 10 期的同尾對結果、存摺 */
import { pairDetail } from '~~/shared/lotto/scan/points/details'
import type { PointEval } from '~~/shared/lotto/scan/points/evaluate'
import type { Row } from '~~/shared/lotto/scan/points/rows'
import type { PointSummary } from '~~/shared/lotto/scan/points/stats'

const props = defineProps<{ rows: Row[], t: number, now: PointEval, summary: PointSummary }>()
const d = computed(() => pairDetail(props.rows, props.t))
const outcome = computed(() => [
  { label: '連莊', value: d.value.repeat, title: `下一期開出同一顆（連莊）：${d.value.repeat} 次` },
  { label: '不連莊', value: d.value.other, title: `下一期開出同尾別的號：${d.value.other} 次` },
  { label: '兩種都有', value: d.value.both, title: `兩種都有：${d.value.both} 次` },
  { label: '沒開', value: d.value.none, title: `下一期沒開出這個尾數：${d.value.none} 次` }
])
const nextText: Record<string, string> = { repeat: '連莊', other: '不連莊', both: '兩種', none: '沒開' }
</script>

<template>
  <ScanPointCard
    point-key="pair"
    :now="now"
    :summary="summary"
  >
    <div class="space-y-1">
      <div class="text-xs text-muted">
        20 年來同尾對（共 {{ d.total }} 組，一期可能有兩組）的下一期
      </div>
      <ScanVizBars
        :items="outcome"
        :total="d.total"
        :height="96"
      />
      <div class="text-[11px] text-muted">
        下一期沒開時，下下期補開：<b class="font-mono text-highlighted">{{ d.skip.n ? Math.round(d.skip.hit / d.skip.n * 100) : 0 }}%</b>（{{ d.skip.hit }}/{{ d.skip.n }}）
      </div>
    </div>
    <div class="space-y-1">
      <div class="text-xs text-muted">
        前 10 期的同尾對：下一期有帶出同尾 <b class="text-highlighted">{{ d.last10Hit }}/{{ d.last10N }}</b>
      </div>
      <div
        v-if="d.last10.length"
        class="flex flex-wrap gap-1.5"
      >
        <span
          v-for="e in d.last10"
          :key="`${e.issue}-${e.tail}`"
          class="pa-ev"
          :class="e.next == null ? '' : e.next === 'none' ? 'pa-miss' : 'pa-hit'"
          :title="`第 ${e.issue} 期 尾${e.tail}（${e.nums.map(scanPad2).join('、')}）→ ${e.next == null ? '還沒開' : nextText[e.next]}${e.next === 'none' && e.skipHit != null ? (e.skipHit ? '，下下期補開' : '，下下期也沒') : ''}`"
        >尾{{ e.tail }} {{ e.next == null ? '…' : nextText[e.next] }}</span>
      </div>
      <div
        v-else
        class="text-xs text-muted"
      >
        前 10 期沒有同尾對
      </div>
    </div>
    <template #side>
      <div
        v-if="d.now.length"
        class="space-y-2"
      >
        <div
          v-for="p in d.now"
          :key="p.tail"
          class="space-y-1"
        >
          <div class="text-xs text-muted">
            這期 尾{{ p.tail }}：
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <ScanBall
              v-for="n in p.nums"
              :key="n"
              :n="n"
              size="sm"
            />
            <span class="text-xs text-muted">連莊 ／ 不連莊</span>
            <ScanBall
              v-for="n in p.others"
              :key="n"
              :n="n"
              size="sm"
              tone="ghost"
            />
          </div>
        </div>
      </div>
      <div
        v-else
        class="text-xs text-muted"
      >
        這期沒有同尾對
      </div>
      <ScanVizLedger
        :points="d.ledger.points"
        unit=" 組"
      />
    </template>
  </ScanPointCard>
</template>

<style scoped>
.pa-ev {
  border-radius: 9999px;
  padding: 1px 8px;
  font-size: 11px;
  background: var(--viz-mid);
}
.pa-hit {
  background: color-mix(in oklab, var(--viz-blue) 22%, transparent);
  box-shadow: inset 0 0 0 1px var(--viz-blue);
}
.pa-miss {
  color: var(--ui-text-muted);
  box-shadow: inset 0 0 0 1px var(--ui-border-accented);
}
</style>
