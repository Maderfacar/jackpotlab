<script setup lang="ts">
/**
 * 純 SVG sparkline，無軸線。
 *
 * 空資料 / 全部 null 時顯示「—」灰字（呼應 [[feedback-no-fake-analysis-output]]
 * 「不知道就顯示『不知道』」，不畫一條假的零線騙人）。
 */

interface Props {
  data: ReadonlyArray<number | null>
  color?: string
  height?: number
  width?: number
}

const props = withDefaults(defineProps<Props>(), {
  color: 'currentColor',
  height: 24,
  width: 120
})

const path = computed<string>(() => {
  const valid = props.data
    .map((v, i) => (v == null ? null : { i, v }))
    .filter((p): p is { i: number, v: number } => p !== null)
  if (valid.length < 2) return ''
  const xs = valid.map(p => p.i)
  const ys = valid.map(p => p.v)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const xSpan = Math.max(1e-9, maxX - minX)
  const ySpan = Math.max(1e-9, maxY - minY)
  const pad = 1
  const w = props.width - pad * 2
  const h = props.height - pad * 2
  let d = ''
  for (let i = 0; i < valid.length; i++) {
    const p = valid[i]!
    const x = pad + ((p.i - minX) / xSpan) * w
    const y = pad + (1 - (p.v - minY) / ySpan) * h
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)} `
  }
  return d.trim()
})

const hasData = computed<boolean>(() => props.data.some(v => v != null))
</script>

<template>
  <span
    v-if="!hasData"
    class="inline-block text-xs text-muted tabular-nums"
    :style="{ width: `${width}px`, height: `${height}px`, lineHeight: `${height}px` }"
  >
    —
  </span>
  <svg
    v-else
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    class="inline-block align-middle"
    aria-hidden="true"
  >
    <path
      :d="path"
      fill="none"
      :stroke="color"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
