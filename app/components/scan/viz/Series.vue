<script setup lang="ts">
/** 最近幾期的數值小直條（左舊右新），可依方向上色：變大 = 橘、變小 = 藍 */
const props = defineProps<{
  items: { issue: string, value: number, dir?: number }[]
  /** 參考線（例：平均） */
  guide?: number | null
  height?: number
}>()
const max = computed(() => Math.max(1, ...props.items.map(i => i.value), props.guide ?? 0))
const color = (d?: number) => (d == null ? 'var(--viz-gray)' : d > 0 ? 'var(--viz-orange)' : d < 0 ? 'var(--viz-blue)' : 'var(--viz-gray)')
</script>

<template>
  <div
    class="relative flex items-end gap-px"
    :style="{ height: `${height ?? 64}px` }"
  >
    <span
      v-if="guide != null"
      class="se-guide"
      :style="{ bottom: `${(guide / max) * 100}%` }"
    />
    <span
      v-for="(it, i) in items"
      :key="it.issue"
      class="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
      :title="`第 ${it.issue} 期：${it.value}${it.dir == null ? '' : it.dir > 0 ? '（變大）' : it.dir < 0 ? '（變小）' : '（一樣）'}`"
    >
      <span
        v-if="i === items.length - 1"
        class="font-mono text-[10px] font-semibold leading-none"
      >{{ it.value }}</span>
      <span
        class="se-bar"
        :class="i === items.length - 1 ? 'se-last' : ''"
        :style="{ height: `${(it.value / max) * 100}%`, background: color(it.dir) }"
      />
    </span>
  </div>
</template>

<style scoped>
.se-bar {
  width: 100%;
  min-height: 2px;
  border-radius: 2px 2px 0 0;
}
.se-last {
  box-shadow: 0 0 0 1.5px var(--ui-text);
}
.se-guide {
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
  border-top: 1px solid var(--ui-border-accented);
  pointer-events: none;
}
</style>
