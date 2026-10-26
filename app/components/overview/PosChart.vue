<script setup lang="ts">
/**
 * 位置波段的波形圖：一個位置最近 N 期的隔期（或值）折線。
 * - 背景兩層色帶：歷史中間一半（p25～p75）、大部分（p10～p90）
 * - 虛線：分檔的界線（隔期 5|6、9|10；值 0|1、2|3、5|6、9|10）
 * - 最右邊的扇形：以前相似波形之後 1～3 期的中間一半與中位數（虛線）
 * 超過上限的點壓在頂端，detail 模式下標出實際數字。
 */
import type { PosKind, Spread } from '~~/shared/lotto/overview/position'

const props = withDefaults(defineProps<{
  values: (number | null)[]
  kind: PosKind
  band: Spread | null
  fan?: (Spread | null)[]
  height?: number
  detail?: boolean
}>(), { fan: () => [], height: 64, detail: false })

const BOUNDS: Record<PosKind, number[]> = { gap: [5.5, 9.5], value: [0.5, 2.5, 5.5, 9.5] }
const PAD_TOP = 8
const PAD_BOTTOM = 4

const fanSteps = computed(() => (props.fan.some(f => f) ? props.fan : []))
/** 扇形固定佔右邊這麼寬（%），不然 30 期擠 3 格看不清楚 */
const fanWidth = computed(() => (fanSteps.value.length ? (props.detail ? 18 : 24) : 0))
const cap = computed(() => {
  const base = props.kind === 'gap' ? 20 : 15
  const p90 = props.band?.p90 ?? 0
  const fanTop = Math.max(0, ...fanSteps.value.map(f => f?.p90 ?? 0))
  return Math.max(base, Math.ceil(p90 * 1.4), Math.ceil(fanTop))
})
/** i < 期數：歷史那段；之後是扇形的第 1～3 期 */
function x(i: number): number {
  const n = props.values.length
  const histW = 100 - fanWidth.value
  if (i < n) return n <= 1 ? histW : (i / (n - 1)) * histW
  return histW + ((i - n + 1) / fanSteps.value.length) * fanWidth.value
}
const y = (v: number) => PAD_TOP + (1 - Math.min(v, cap.value) / cap.value) * (100 - PAD_TOP - PAD_BOTTOM)

const linePath = computed(() => {
  let d = ''
  let pen = false
  props.values.forEach((v, i) => {
    if (v == null) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`
    pen = true
  })
  return d
})
const lastIdx = computed(() => props.values.length - 1)
const lastVal = computed(() => props.values.at(-1) ?? null)

function fanArea(lo: keyof Spread, hi: keyof Spread): string {
  const start = lastVal.value
  if (start == null || !fanSteps.value.length) return ''
  const top: string[] = [`${x(lastIdx.value)},${y(start)}`]
  const bottom: string[] = []
  fanSteps.value.forEach((f, a) => {
    if (!f) return
    const xi = x(lastIdx.value + 1 + a)
    top.push(`${xi},${y(f[hi])}`)
    bottom.unshift(`${xi},${y(f[lo])}`)
  })
  return `M${[...top, ...bottom].join('L')}Z`
}
const fanMid = computed(() => {
  const start = lastVal.value
  if (start == null || !fanSteps.value.length) return ''
  const pts = [`${x(lastIdx.value)},${y(start)}`]
  fanSteps.value.forEach((f, a) => {
    if (f) pts.push(`${x(lastIdx.value + 1 + a)},${y(f.p50)}`)
  })
  return `M${pts.join('L')}`
})
const histEnd = computed(() => x(lastIdx.value))
const overflow = computed(() => props.values
  .map((v, i) => ({ v, i }))
  .filter((p): p is { v: number, i: number } => p.v != null && p.v > cap.value))
</script>

<template>
  <div
    class="ov-chart relative w-full"
    :style="{ height: `${height}px` }"
  >
    <svg
      class="absolute inset-0 size-full overflow-visible"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <template v-if="band">
        <rect
          x="0"
          :y="y(band.p90)"
          :width="histEnd"
          :height="Math.max(0, y(band.p10) - y(band.p90))"
          class="fill-[var(--ov-cool)] opacity-[0.07]"
        />
        <rect
          x="0"
          :y="y(band.p75)"
          :width="histEnd"
          :height="Math.max(0, y(band.p25) - y(band.p75))"
          class="fill-[var(--ov-cool)] opacity-[0.14]"
        />
      </template>
      <line
        v-for="b in BOUNDS[kind]"
        :key="b"
        x1="0"
        x2="100"
        :y1="y(b)"
        :y2="y(b)"
        class="stroke-[var(--ov-ink-soft)] opacity-30"
        stroke-dasharray="1.5 2"
        vector-effect="non-scaling-stroke"
      />
      <line
        v-if="fanSteps.length"
        :x1="histEnd"
        :x2="histEnd"
        y1="0"
        y2="100"
        class="stroke-[var(--ov-line)]"
        vector-effect="non-scaling-stroke"
      />
      <path
        :d="fanArea('p10', 'p90')"
        class="fill-[var(--ov-warm)] opacity-[0.14]"
      />
      <path
        :d="fanArea('p25', 'p75')"
        class="fill-[var(--ov-warm)] opacity-[0.32]"
      />
      <path
        :d="fanMid"
        class="fill-none stroke-[var(--ov-warm)]"
        stroke-width="1.6"
        stroke-dasharray="3 2.5"
        vector-effect="non-scaling-stroke"
      />
      <path
        :d="linePath"
        class="ov-line fill-none stroke-[var(--ov-ink)]"
        :stroke-width="detail ? 1.6 : 1.4"
        stroke-linejoin="round"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <span
      v-if="lastVal != null"
      class="ov-dot absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--ov-warm)]"
      :style="{ left: `${histEnd}%`, top: `${y(lastVal)}%` }"
    />
    <template v-if="detail">
      <span
        v-for="p in overflow"
        :key="p.i"
        class="absolute -translate-x-1/2 -translate-y-full text-[10px] font-bold text-[var(--ov-warm-ink)]"
        :style="{ left: `${x(p.i)}%`, top: `${PAD_TOP}%` }"
      >{{ p.v }}</span>
      <span
        v-for="b in BOUNDS[kind]"
        :key="`l${b}`"
        class="absolute left-0 -translate-y-1/2 rounded bg-[var(--ov-card)] px-0.5 text-[9.5px] text-[var(--ov-ink-soft)]"
        :style="{ top: `${y(b)}%` }"
      >{{ Math.ceil(b) }}</span>
    </template>
  </div>
</template>

<style scoped>
.ov-line { stroke-dasharray: 2000; stroke-dashoffset: 0; animation: ov-draw 900ms cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes ov-draw { from { stroke-dashoffset: 2000; } to { stroke-dashoffset: 0; } }
.ov-dot { box-shadow: 0 0 0 3px color-mix(in oklab, var(--ov-warm) 30%, transparent); animation: ov-beat 2.2s ease-in-out infinite; }
@keyframes ov-beat {
  0%, 100% { box-shadow: 0 0 0 2px color-mix(in oklab, var(--ov-warm) 35%, transparent); }
  50% { box-shadow: 0 0 0 6px transparent; }
}
@media (prefers-reduced-motion: reduce) { .ov-line, .ov-dot { animation: none; } }
</style>
