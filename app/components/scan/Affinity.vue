<script setup lang="ts">
/**
 * 相吸相斥（使用者：不會每期每點都亮，找出相吸相斥的搭配）
 *   1. 亮燈條：最近 40 期，八點各自亮了沒、亮了有沒有成真
 *   2. 兩兩一格：一起亮 / 一起成真，比本來該有的多（相吸）還是少（相斥）
 *   3. 同一期亮 k 點時，下一期成真幾點；全部成真的實際 vs 照各點成真率相乘該有的
 */
import { POINT_KEYS, type PointKey } from '~~/shared/lotto/scan/points/evaluate'
import { POINT_META } from '~~/shared/lotto/scan/points/meta'
import type { AllTrueRow, PairCell, StripCell } from '~~/shared/lotto/scan/points/stats'

const props = defineProps<{
  strip: Record<PointKey, StripCell[]>
  matrix: PairCell[][]
  allTrue: AllTrueRow[]
}>()
const emit = defineEmits<{ jump: [key: PointKey] }>()

const labels = POINT_META.map(m => `${m.no} ${m.name}`)
const issues = computed(() => props.strip.low.map(c => c.issue))
const stripRows = computed(() => POINT_KEYS.map((k, i) => ({
  key: k,
  label: labels[i]!,
  cells: props.strip[k].map(c => (!c.lit ? 'off' : c.hit == null ? 'on' : c.hit ? 'hit' : 'miss') as 'off' | 'on' | 'hit' | 'miss'),
  titles: props.strip[k].map(c => `第 ${c.issue} 期：${!c.lit ? '沒亮' : c.hit == null ? '亮（下一期還沒對）' : c.hit ? '亮・成真' : '亮・沒成真'}`),
  active: props.strip[k].at(-1)?.lit ?? false
})))

const mode = ref<'hit' | 'lit'>('hit')
const modeItems = [
  { label: '一起成真', value: 'hit' },
  { label: '一起亮', value: 'lit' }
]
const cells = computed(() => props.matrix.map(row => row.map(c => (mode.value === 'lit'
  ? { actual: c.litBoth, expected: c.litExpected }
  : { actual: c.hitBoth, expected: c.hitExpected }))))

const shown = computed(() => props.allTrue.filter(r => r.lit >= 1))
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const shade = (h: number, k: number) => `color-mix(in oklab, var(--viz-blue) ${Math.round(18 + (h / Math.max(1, k)) * 74)}%, var(--viz-mid))`
</script>

<template>
  <section class="space-y-4">
    <h2 class="text-lg font-semibold">
      相吸相斥
    </h2>

    <UCard>
      <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span class="text-sm font-medium">亮燈條（最近 {{ issues.length }} 期，右邊最新）</span>
        <span class="flex flex-wrap gap-3 text-[11px] text-muted">
          <span class="flex items-center gap-1"><span class="af-dot af-hit" />亮・成真</span>
          <span class="flex items-center gap-1"><span class="af-dot af-miss" />亮・沒成真</span>
          <span class="flex items-center gap-1"><span class="af-dot af-on" />亮・還沒對</span>
          <span class="flex items-center gap-1"><span class="af-dot af-off" />沒亮</span>
        </span>
      </div>
      <ScanVizStrip
        :rows="stripRows"
        :issues="issues"
        clickable
        @pick="k => emit('jump', k as PointKey)"
      />
    </UCard>

    <div class="grid gap-4 lg:grid-cols-2">
      <UCard>
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span class="text-sm font-medium">兩點搭配</span>
          <UTabs
            v-model="mode"
            :items="modeItems"
            :content="false"
            size="xs"
            variant="pill"
            color="neutral"
          />
        </div>
        <ScanVizMatrix
          :labels="labels"
          :cells="cells"
          :what="mode === 'lit' ? '一起亮' : '兩點都亮時一起成真'"
        />
        <p class="mt-2 text-[11px] text-muted">
          數字 = 實際 ÷ 本來該有；1 = 沒關係，越大越常一起，越小越少一起。
        </p>
      </UCard>

      <UCard>
        <div class="mb-3 text-sm font-medium">
          同一期亮幾點 → 下一期成真幾點
        </div>
        <div class="space-y-2.5">
          <div
            v-for="r in shown"
            :key="r.lit"
            class="space-y-1"
          >
            <div class="flex items-baseline justify-between text-xs">
              <span><b>亮 {{ r.lit }} 點</b><span class="text-muted">（{{ r.n }} 期）</span></span>
              <span class="text-muted">
                全部成真 <b class="font-mono text-highlighted">{{ pct(r.allTrue, r.n) }}%</b>
                ・本來該有 <span class="font-mono">{{ pct(r.expected, r.n) }}%</span>
              </span>
            </div>
            <div class="af-stack">
              <span
                v-for="(c, h) in r.hits"
                :key="h"
                class="af-seg"
                :style="{ width: `${(c / r.n) * 100}%`, background: shade(h, r.lit) }"
                :title="`成真 ${h} 點：${c} 期（${pct(c, r.n)}%）`"
              >{{ c / r.n >= 0.09 ? h : '' }}</span>
            </div>
          </div>
        </div>
        <p class="mt-3 text-[11px] text-muted">
          色塊裡的數字 = 成真幾點，越深成真越多。「本來該有」= 各點成真率相乘：亮越多點，全部成真本來就越難。
        </p>
      </UCard>
    </div>
  </section>
</template>

<style scoped>
.af-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 9999px;
}
.af-hit {
  background: var(--viz-blue);
  box-shadow: 0 0 0 1.5px var(--ui-bg), 0 0 0 3px var(--viz-good);
}
.af-miss {
  box-shadow: inset 0 0 0 2px var(--viz-blue);
}
.af-on {
  background: var(--viz-blue);
}
.af-off {
  width: 4px;
  height: 4px;
  background: var(--viz-gray);
}
.af-stack {
  display: flex;
  height: 18px;
  gap: 2px;
  overflow: hidden;
  border-radius: 4px;
}
.af-seg {
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  color: var(--ui-text);
}
</style>
