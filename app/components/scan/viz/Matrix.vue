<script setup lang="ts">
/**
 * 相吸相斥：兩點一格。實際 ÷ 本來該有（照各自頻率相乘）
 *   > 1 紅 = 相吸（比本來更常一起）  < 1 藍 = 相斥（比本來更少一起）  ≈ 1 灰 = 沒關係
 * 本來該有 < 5 次的格子太少，打斜線不上色。
 */
const MIN_EXPECTED = 5

const props = defineProps<{
  labels: string[]
  /** [i][j] = { actual, expected } */
  cells: { actual: number, expected: number }[][]
  what: string
}>()

function ratio(c: { actual: number, expected: number }): number | null {
  return c.expected >= MIN_EXPECTED ? c.actual / c.expected : null
}
/** 0.5 以下、2 以上算滿色 */
function color(r: number | null): string {
  if (r == null) return 'transparent'
  const k = Math.min(1, Math.abs(Math.log2(r)))
  const pole = r >= 1 ? 'var(--viz-red)' : 'var(--viz-blue)'
  return `color-mix(in oklab, ${pole} ${Math.round(k * 90)}%, var(--viz-mid))`
}
const fmt = (r: number | null) => (r == null ? '' : r.toFixed(2))
const grid = computed(() => props.cells.map(row => row.map(c => ({ ...c, r: ratio(c) }))))
</script>

<template>
  <div class="overflow-x-auto">
    <div
      class="grid min-w-[420px] gap-0.5"
      :style="{ gridTemplateColumns: `5.5rem repeat(${labels.length}, minmax(0, 1fr))` }"
    >
      <span />
      <span
        v-for="l in labels"
        :key="`h${l}`"
        class="truncate text-center text-[11px] text-muted"
      >{{ l.slice(0, 1) }}</span>
      <template
        v-for="(row, i) in grid"
        :key="labels[i]"
      >
        <span class="truncate pr-1 text-right text-[11px] text-muted">{{ labels[i] }}</span>
        <span
          v-for="(c, j) in row"
          :key="j"
          class="viz-mcell"
          :class="[i === j ? 'viz-diag' : '', c.r == null && i !== j ? 'viz-thin' : '']"
          :style="{ background: i === j ? undefined : color(c.r) }"
          :title="i === j ? `${labels[i]}：自己` : `${labels[i]} × ${labels[j]}：${what} ${c.actual} 次，照機率本來該有 ${c.expected.toFixed(1)} 次${c.r == null ? '（次數太少，不比）' : `，是平常的 ${fmt(c.r)} 倍`}`"
        >{{ i === j ? '' : fmt(c.r) }}</span>
      </template>
    </div>
    <div class="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted">
      <span class="flex items-center gap-1"><span
        class="viz-key"
        style="background: var(--viz-red)"
      />常一起說中</span>
      <span class="flex items-center gap-1"><span
        class="viz-key"
        style="background: var(--viz-mid)"
      />沒什麼關係</span>
      <span class="flex items-center gap-1"><span
        class="viz-key"
        style="background: var(--viz-blue)"
      />很少一起說中</span>
      <span class="flex items-center gap-1"><span class="viz-key viz-thin" />次數太少，不比</span>
    </div>
  </div>
</template>

<style scoped>
.viz-mcell {
  display: flex;
  height: 30px;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  color: var(--ui-text);
}
.viz-diag {
  background: var(--ui-bg-elevated);
}
.viz-thin {
  background-image: repeating-linear-gradient(45deg, var(--ui-border) 0 1px, transparent 1px 5px);
}
.viz-key {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
}
</style>
