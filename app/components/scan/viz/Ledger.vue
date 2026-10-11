<script setup lang="ts">
/** 存摺：每期（實際 − 平常）一路累加。往上 = 比平常多開，往下 = 比平常少開 */
const props = defineProps<{
  points: { issue: string, total: number }[]
  /** 單位說明，例「顆」 */
  unit?: string
}>()

const W = 300
const H = 64
const PAD = 4
const uid = useId()

const geo = computed(() => {
  const ps = props.points
  const max = Math.max(1, ...ps.map(p => Math.abs(p.total)))
  const x = (i: number) => (ps.length <= 1 ? W / 2 : (i / (ps.length - 1)) * W)
  const y = (v: number) => H / 2 - (v / max) * (H / 2 - PAD)
  const line = ps.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join('')
  const area = ps.length ? `${line}L${x(ps.length - 1).toFixed(1)},${H / 2}L${x(0).toFixed(1)},${H / 2}Z` : ''
  const step = ps.length > 1 ? W / (ps.length - 1) : W
  return { line, area, x, y, step, max }
})
const last = computed(() => props.points.at(-1)?.total ?? 0)
const fmt = (v: number) => `${v > 0 ? '+' : ''}${Math.abs(v) >= 10 ? Math.round(v) : v.toFixed(1)}`
</script>

<template>
  <div class="space-y-1">
    <div class="flex items-baseline justify-between text-[11px] text-muted">
      <span>存摺：最近 {{ points.length }} 期，比平常多開就往上、少開就往下，一路累加</span>
      <span>
        現在
        <b
          class="font-mono text-xs"
          :class="last > 0 ? 'viz-up-text' : last < 0 ? 'viz-down-text' : ''"
        >{{ fmt(last) }}</b>{{ unit ?? '' }}
        <span class="ml-1">{{ last > 0 ? '比平常多' : last < 0 ? '比平常少' : '持平' }}</span>
      </span>
    </div>
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      preserveAspectRatio="none"
      class="block h-16 w-full"
      role="img"
      :aria-label="`存摺，現在 ${fmt(last)}`"
    >
      <defs>
        <clipPath :id="`${uid}-up`"><rect
          x="0"
          y="0"
          :width="W"
          :height="H / 2"
        /></clipPath>
        <clipPath :id="`${uid}-down`"><rect
          x="0"
          :y="H / 2"
          :width="W"
          :height="H / 2"
        /></clipPath>
      </defs>
      <line
        x1="0"
        :x2="W"
        :y1="H / 2"
        :y2="H / 2"
        class="viz-zero"
      />
      <path
        :d="geo.area"
        class="viz-area-up"
        :clip-path="`url(#${uid}-up)`"
      />
      <path
        :d="geo.area"
        class="viz-area-down"
        :clip-path="`url(#${uid}-down)`"
      />
      <path
        :d="geo.line"
        class="viz-line"
        vector-effect="non-scaling-stroke"
      />
      <rect
        v-for="(p, i) in points"
        :key="p.issue"
        :x="geo.x(i) - geo.step / 2"
        y="0"
        :width="geo.step"
        :height="H"
        fill="transparent"
      ><title>第 {{ p.issue }} 期：{{ fmt(p.total) }}{{ unit ?? '' }}</title></rect>
    </svg>
  </div>
</template>

<style scoped>
.viz-zero {
  stroke: var(--ui-border-accented);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.viz-area-up {
  fill: color-mix(in oklab, var(--viz-orange) 35%, transparent);
}
.viz-area-down {
  fill: color-mix(in oklab, var(--viz-blue) 35%, transparent);
}
.viz-line {
  fill: none;
  stroke: var(--ui-text-muted);
  stroke-width: 1.5;
}
.viz-up-text {
  color: var(--viz-orange-text);
}
.viz-down-text {
  color: var(--viz-blue-text);
}
</style>
