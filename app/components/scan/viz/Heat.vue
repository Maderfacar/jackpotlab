<script setup lang="ts">
/**
 * 熱度圖：列 × 欄，顏色越深 = 次數佔該列越多（每列各自比，看「這一列通常落在哪」）。
 * mark = 外框標出的格子（例：這期落在哪一格）。
 */
const props = defineProps<{
  rows: { label: string, values: number[], mark?: number | null }[]
  cols: string[]
  /** 每隔幾欄寫一次欄名 */
  labelEvery?: number
}>()

const shares = computed(() => props.rows.map((r) => {
  const total = r.values.reduce((a, b) => a + b, 0)
  const max = Math.max(1, ...r.values)
  return r.values.map(v => ({ v, share: total ? v / total : 0, level: v / max }))
}))
const every = computed(() => props.labelEvery ?? 5)
</script>

<template>
  <div class="overflow-x-auto">
    <div
      class="grid min-w-[520px] items-center gap-px"
      :style="{ gridTemplateColumns: `3.5rem repeat(${cols.length}, minmax(0, 1fr))` }"
    >
      <template
        v-for="(r, ri) in rows"
        :key="r.label"
      >
        <span class="pr-1 text-right text-[11px] text-muted">{{ r.label }}</span>
        <span
          v-for="(c, ci) in shares[ri]"
          :key="ci"
          class="viz-cell"
          :class="r.mark === ci ? 'viz-cell-mark' : ''"
          :style="{ background: `color-mix(in oklab, var(--viz-blue) ${Math.round(c.level * 92)}%, var(--viz-mid))` }"
          :title="`${r.label}・${cols[ci]}：${c.v} 次（${Math.round(c.share * 100)}%）${r.mark === ci ? '・這期' : ''}`"
        />
      </template>
      <span />
      <span
        v-for="(c, ci) in cols"
        :key="`l${ci}`"
        class="text-center font-mono text-[10px] text-muted"
      >{{ ci % every === 0 || ci === cols.length - 1 ? c : '' }}</span>
    </div>
  </div>
</template>

<style scoped>
.viz-cell {
  display: block;
  height: 20px;
  border-radius: 2px;
}
.viz-cell-mark {
  box-shadow: inset 0 0 0 2px var(--viz-orange);
}
</style>
