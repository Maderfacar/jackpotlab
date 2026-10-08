<script setup lang="ts">
/**
 * 小型直條圖（期別由舊到新）：柱頂寫數值，柱下寫一個字（例：大/小），可加橫線刻度（mark）與柱頂圓點（dot）。
 * 一律附 <title> 給滑鼠停留；寬度超過容器時可橫向捲動。
 */
import type { ScanBarItem } from '~/utils/scan-format'

const props = withDefaults(defineProps<{
  items: ScanBarItem[]
  height?: number
}>(), { height: 120 })

const STEP = 28
const BAR = 16
const TOP = 18
const BOTTOM = 34
const width = computed(() => Math.max(1, props.items.length) * STEP + 8)
const max = computed(() => Math.max(1, ...props.items.map(i => Math.max(i.value, i.mark ?? 0))))
const y = (v: number) => TOP + (props.height - TOP - BOTTOM) * (1 - v / max.value)
const base = computed(() => props.height - BOTTOM)
</script>

<template>
  <div class="overflow-x-auto">
    <svg
      :width="width"
      :height="height"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      class="block"
    >
      <line
        x1="0"
        :x2="width"
        :y1="base"
        :y2="base"
        stroke="var(--ui-border)"
        stroke-width="1"
      />
      <g
        v-for="(it, i) in items"
        :key="it.key"
      >
        <title>{{ it.title }}</title>
        <rect
          :x="4 + i * STEP + (STEP - BAR) / 2"
          :y="y(it.value)"
          :width="BAR"
          :height="Math.max(1, base - y(it.value))"
          rx="3"
          :fill="it.color"
        />
        <line
          v-if="it.mark != null"
          :x1="4 + i * STEP + 3"
          :x2="4 + i * STEP + STEP - 3"
          :y1="y(it.mark)"
          :y2="y(it.mark)"
          stroke="var(--ui-text)"
          stroke-width="2"
        />
        <circle
          v-if="it.dot"
          :cx="4 + i * STEP + STEP / 2"
          :cy="y(Math.max(it.value, it.mark ?? 0)) - 13"
          r="3"
          fill="var(--scan-orange)"
        />
        <text
          :x="4 + i * STEP + STEP / 2"
          :y="y(it.value) - 3"
          text-anchor="middle"
          class="scan-bar-value"
        >{{ it.value }}</text>
        <text
          v-if="it.below"
          :x="4 + i * STEP + STEP / 2"
          :y="base + 13"
          text-anchor="middle"
          class="scan-bar-below"
          :fill="it.belowColor ?? 'var(--ui-text-muted)'"
        >{{ it.below }}</text>
        <text
          :x="4 + i * STEP + STEP / 2"
          :y="base + 27"
          text-anchor="middle"
          class="scan-bar-label"
        >{{ it.label }}</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.scan-bar-value {
  fill: var(--ui-text-toned);
  font: 600 10px ui-monospace, SFMono-Regular, Menlo, monospace;
}
.scan-bar-below {
  font: 700 11px system-ui, sans-serif;
}
.scan-bar-label {
  fill: var(--ui-text-dimmed);
  font: 9px ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
