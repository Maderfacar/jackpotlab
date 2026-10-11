<script setup lang="ts">
/** 直條分佈：每根一個類別，比例寫在條上；highlight = 這期 / 現在落在哪一根 */
interface BarItem {
  label: string
  value: number
  highlight?: boolean
  /** 滑過時顯示 */
  title?: string
}

const props = defineProps<{
  items: BarItem[]
  /** 比例的分母；不給就用全部加總 */
  total?: number
  height?: number
}>()

const sum = computed(() => props.total ?? props.items.reduce((a, b) => a + b.value, 0))
const max = computed(() => Math.max(1, ...props.items.map(i => i.value)))
const pct = (v: number) => (sum.value ? `${Math.round((v / sum.value) * 100)}%` : '—')
</script>

<template>
  <div
    class="flex items-end gap-1"
    :style="{ height: `${height ?? 96}px` }"
  >
    <div
      v-for="it in items"
      :key="it.label"
      class="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5"
      :title="it.title ?? `${it.label}：${it.value} 次（${pct(it.value)}）`"
    >
      <span class="font-mono text-[10px] leading-none text-muted">{{ pct(it.value) }}</span>
      <div
        class="viz-col"
        :class="it.highlight ? 'viz-col-on' : ''"
        :style="{ height: `${(it.value / max) * 100}%` }"
      />
      <span
        class="font-mono text-[11px] leading-tight"
        :class="it.highlight ? 'font-bold text-highlighted' : 'text-muted'"
      >{{ it.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.viz-col {
  width: 100%;
  max-width: 40px;
  min-height: 2px;
  border-radius: 4px 4px 0 0;
  background: color-mix(in oklab, var(--viz-blue) 45%, var(--viz-mid));
}
.viz-col-on {
  background: var(--viz-orange);
}
</style>
