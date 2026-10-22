<script setup lang="ts">
/**
 * 逗號分隔的一串數字，每個數字固定寬度、靠右，讓上下列對齊（2026-10-22）。
 * 空字串照樣佔一格，不會讓後面的數字往前擠。
 */
const props = defineProps<{
  items: Array<string | number>
  /** 每格幾個字寬 */
  width: number
  /** 號碼補成兩位數（4 → 04） */
  pad?: boolean
}>()

const cells = computed(() => props.items.map(x => (props.pad && x !== '' ? String(x).padStart(2, '0') : String(x))))
</script>

<template>
  <span class="inline-flex whitespace-nowrap"><template
    v-for="(c, i) in cells"
    :key="i"
  ><span
    class="inline-block text-right"
    :style="{ width: `${width}ch` }"
  >{{ c }}</span><span v-if="i < cells.length - 1">,</span></template></span>
</template>
