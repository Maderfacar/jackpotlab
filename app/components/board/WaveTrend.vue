<script setup lang="ts">
/**
 * 一列的走勢（2026-10-12 使用者：要知道這四個欄位在過去每一期的走勢）。
 * 灰色長條 = 每期開完時的「目前」；四條線 = 當期的 5／10／15 個平均與歷史平均。
 * 顏色：dataviz 參考調色盤的類別色前四格（固定順序：藍、橘、青綠、黃），線尾直接標名稱，滑過顯示當期數字。
 */
import type { TrendPoint } from '~/utils/wave-series'

const props = defineProps<{
  title: string
  points: TrendPoint[]
  /** 期序 → 期號 */
  issueOf: (t: number) => string
  /** 隔期格：「目前」是已等幾期 */
  open: boolean
}>()

const SERIES = [
  { label: '5 個', cls: 's1' },
  { label: '10 個', cls: 's2' },
  { label: '15 個', cls: 's3' },
  { label: '歷史', cls: 's4' }
] as const

const HEIGHT = 240
const PAD = { top: 14, right: 58, bottom: 26, left: 34 }

const root = ref<HTMLElement | null>(null)
const width = ref(320)
let observer: ResizeObserver | null = null
onMounted(() => {
  if (!root.value) return
  observer = new ResizeObserver(([entry]) => {
    width.value = Math.max(280, Math.round(entry!.contentRect.width))
  })
  observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())

const innerW = computed(() => width.value - PAD.left - PAD.right)
const innerH = HEIGHT - PAD.top - PAD.bottom

const yMax = computed(() => {
  const vals = props.points.flatMap(p => [p.current, ...p.avgs.filter((a): a is number => a !== null)])
  const m = Math.max(1, ...vals)
  const step = m <= 5 ? 1 : m <= 12 ? 2 : m <= 30 ? 5 : 10
  return Math.ceil((m * 1.05) / step) * step
})
const ticks = computed(() => {
  const n = 4
  return Array.from({ length: n + 1 }, (_, i) => (yMax.value / n) * i)
})

const step = computed(() => innerW.value / Math.max(1, props.points.length))
const xAt = (i: number) => PAD.left + step.value * (i + 0.5)
const yAt = (v: number) => PAD.top + innerH - (v / yMax.value) * innerH

function pathOf(k: number): string {
  let d = ''
  props.points.forEach((p, i) => {
    const v = p.avgs[k]
    if (v === null || v === undefined) return
    d += `${d ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`
  })
  return d
}

/** 線尾標籤：依最後一點的高度排，太近就往下推，避免重疊 */
const endLabels = computed(() => {
  const last = props.points.at(-1)
  if (!last) return []
  const items = SERIES.map((s, k) => ({ ...s, v: last.avgs[k], y: last.avgs[k] == null ? 0 : yAt(last.avgs[k]!) }))
    .filter(it => it.v !== null && it.v !== undefined)
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < items.length; i++) {
    if (items[i]!.y - items[i - 1]!.y < 12) items[i]!.y = items[i - 1]!.y + 12
  }
  return items
})

const xLabels = computed(() => {
  const n = props.points.length
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW.value / 70))))
  return props.points.map((p, i) => ({ i, t: p.t })).filter(({ i }) => i % every === 0 || i === n - 1)
})

const hover = ref<number | null>(null)
const hoverPoint = computed(() => (hover.value === null ? null : props.points[hover.value] ?? null))
const tipLeft = computed(() => {
  if (hover.value === null) return 0
  const x = xAt(hover.value)
  return x > width.value - 170 ? x - 160 : x + 12
})
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(2))
</script>

<template>
  <div>
    <div class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span class="font-semibold">{{ title }}</span>
      <span class="flex items-center gap-1 text-muted">
        <span class="legend-bar" />目前（{{ open ? '這格已等幾期' : '這期這顆的數字' }}）
      </span>
      <span
        v-for="s in SERIES"
        :key="s.label"
        class="flex items-center gap-1 text-muted"
      >
        <span
          class="legend-line"
          :class="s.cls"
        />{{ s.label }}平均
      </span>
    </div>
    <div
      ref="root"
      class="trend-root relative"
      @mouseleave="hover = null"
    >
      <svg
        :width="width"
        :height="HEIGHT"
        role="img"
        :aria-label="`${title}：每期的目前值與 5、10、15、歷史平均`"
      >
        <g class="grid">
          <line
            v-for="tk in ticks"
            :key="tk"
            :x1="PAD.left"
            :x2="PAD.left + innerW"
            :y1="yAt(tk)"
            :y2="yAt(tk)"
          />
          <text
            v-for="tk in ticks"
            :key="`t${tk}`"
            :x="PAD.left - 6"
            :y="yAt(tk) + 3"
            text-anchor="end"
          >{{ Number.isInteger(tk) ? tk : tk.toFixed(1) }}</text>
        </g>
        <g class="bars">
          <rect
            v-for="(p, i) in points"
            :key="p.t"
            :x="xAt(i) - Math.max(1, step * 0.3)"
            :width="Math.max(2, step * 0.6)"
            :y="yAt(p.current)"
            :height="Math.max(0, yAt(0) - yAt(p.current))"
            rx="1.5"
            :class="hover === i ? 'is-hover' : ''"
          />
        </g>
        <path
          v-for="(s, k) in SERIES"
          :key="s.label"
          :d="pathOf(k)"
          class="line"
          :class="s.cls"
        />
        <g
          v-for="l in endLabels"
          :key="l.label"
          class="end-label"
        >
          <circle
            :cx="PAD.left + innerW + 6"
            :cy="l.y"
            r="3.5"
            :class="l.cls"
          />
          <text
            :x="PAD.left + innerW + 13"
            :y="l.y + 3.5"
          >{{ l.label }}</text>
        </g>
        <g class="x-axis">
          <text
            v-for="xl in xLabels"
            :key="xl.t"
            :x="xAt(xl.i)"
            :y="HEIGHT - 8"
            text-anchor="middle"
          >{{ issueOf(xl.t).slice(-3) }}</text>
        </g>
        <line
          v-if="hover !== null"
          class="crosshair"
          :x1="xAt(hover)"
          :x2="xAt(hover)"
          :y1="PAD.top"
          :y2="PAD.top + innerH"
        />
        <g v-if="hoverPoint">
          <circle
            v-for="(s, k) in SERIES"
            v-show="hoverPoint.avgs[k] !== null"
            :key="s.label"
            :cx="xAt(hover!)"
            :cy="yAt(hoverPoint.avgs[k] ?? 0)"
            r="4"
            class="dot"
            :class="s.cls"
          />
        </g>
        <rect
          v-for="(p, i) in points"
          :key="`h${p.t}`"
          :x="PAD.left + step * i"
          :y="PAD.top"
          :width="step"
          :height="innerH"
          fill="transparent"
          @mouseenter="hover = i"
          @click="hover = i"
        />
      </svg>
      <div
        v-if="hoverPoint"
        class="tooltip"
        :style="{ left: `${tipLeft}px` }"
      >
        <div class="font-semibold">
          第 {{ issueOf(hoverPoint.t) }} 期開完
        </div>
        <div>目前 <b>{{ hoverPoint.current }}</b></div>
        <div
          v-for="(s, k) in SERIES"
          :key="s.label"
          class="flex items-center gap-1.5"
        >
          <span
            class="legend-line"
            :class="s.cls"
          />{{ s.label }} {{ fmt(hoverPoint.avgs[k]) }}
          <span
            v-if="hoverPoint.avgs[k] !== null && hoverPoint.current > hoverPoint.avgs[k]!"
            class="text-[10px] text-muted"
          >目前高於</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trend-root {
  --s1: #2a78d6;
  --s2: #eb6834;
  --s3: #1baf7a;
  --s4: #eda100;
  width: 100%;
  min-width: 0;
  overflow: hidden;
}
:global(.dark) .trend-root,
:global(.dark) .legend-line {
  --s1: #3987e5;
  --s2: #d95926;
  --s3: #199e70;
  --s4: #c98500;
}
.legend-line {
  --s1: #2a78d6;
  --s2: #eb6834;
  --s3: #1baf7a;
  --s4: #eda100;
  display: inline-block;
  width: 14px;
  height: 3px;
  border-radius: 2px;
}
.legend-line.s1 { background: var(--s1); }
.legend-line.s2 { background: var(--s2); }
.legend-line.s3 { background: var(--s3); }
.legend-line.s4 { background: var(--s4); }
.legend-bar {
  display: inline-block;
  width: 8px;
  height: 12px;
  border-radius: 2px;
  background: color-mix(in oklab, var(--ui-text-muted) 45%, transparent);
}
svg { display: block; font-size: 10px; }
.grid line { stroke: var(--ui-border); stroke-width: 1; }
.grid text, .x-axis text { fill: var(--ui-text-muted); }
.bars rect { fill: color-mix(in oklab, var(--ui-text-muted) 30%, transparent); }
.bars rect.is-hover { fill: color-mix(in oklab, var(--ui-text-muted) 60%, transparent); }
.line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.line.s1 { stroke: var(--s1); }
.line.s2 { stroke: var(--s2); }
.line.s3 { stroke: var(--s3); }
.line.s4 { stroke: var(--s4); }
.end-label text { fill: var(--ui-text); font-size: 10px; }
circle.s1 { fill: var(--s1); }
circle.s2 { fill: var(--s2); }
circle.s3 { fill: var(--s3); }
circle.s4 { fill: var(--s4); }
.dot { stroke: var(--ui-bg); stroke-width: 2; }
.crosshair { stroke: var(--ui-text-muted); stroke-width: 1; stroke-dasharray: 3 3; }
.tooltip {
  position: absolute;
  top: 8px;
  z-index: 5;
  min-width: 140px;
  pointer-events: none;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  padding: 6px 8px;
  background: var(--ui-bg);
  color: var(--ui-text);
  font-size: 11px;
  line-height: 1.5;
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.15);
}
</style>
