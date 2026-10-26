<script setup lang="ts">
/**
 * 交叉：某個盤面座標跟這期一樣（連到這麼多期以上）的那些期，五顆球用兩種分法交叉看落在哪。
 * 每格大字 = 這一列的球有幾成落在這一欄，小字 = 平常幾成；比平常多偏橘、少偏藍。
 * 「這一期」模式下，最新一期五顆球落在哪格用小圓點標出來。
 */
import type { PlainDraw } from '~~/shared/lotto/history-file'
import type { DrawFeatures } from '~~/shared/lotto/patterns/features'
import { BALL_ATTRS, ballAttr, crossTable, sameSituation, type BallAttr } from '~~/shared/lotto/overview/cross'
import type { CoordSummary } from '~/composables/useOverview'

const props = defineProps<{
  summaries: CoordSummary[]
  draws: PlainDraw[]
  feats: DrawFeatures[]
}>()

/** 差幾成算到最深的顏色 */
const FULL_DIFF = 0.25
const ROW_DEFAULT: Record<string, BallAttr> = { oddEven: 'oddEven', bigSmall: 'third', zones: 'head', y1: 'y', firstY: 'y', gapShape: 'gap' }

const coordId = ref('oddEven')
const scope = ref<'run' | 'all'>('run')
const when = ref<0 | 1>(0)
const row = ref<BallAttr>('oddEven')
const col = ref<BallAttr>('gap')
watch(coordId, (id) => {
  row.value = ROW_DEFAULT[id] ?? 'oddEven'
  col.value = row.value === 'gap' ? 'value' : 'gap'
})

const nums = computed(() => props.draws.map(d => d.nums))
const last = computed(() => props.draws.length - 1)
const summary = computed(() => props.summaries.find(s => s.series.def.id === coordId.value) ?? null)
const run = computed(() => summary.value?.run ?? null)
const idxs = computed(() => (run.value ? sameSituation(summary.value!.series.seq, run.value.state, scope.value === 'run' ? run.value.length : 1, when.value) : []))
const table = computed(() => crossTable(nums.value, props.feats, idxs.value, row.value, col.value))
const base = computed(() => crossTable(nums.value, props.feats, nums.value.map((_, i) => i).slice(0, -1), row.value, col.value))
const current = computed(() => (when.value === 0 ? crossTable(nums.value, props.feats, [last.value], row.value, col.value) : null))
const rowAttr = computed(() => ballAttr(row.value))
const colAttr = computed(() => ballAttr(col.value))

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const share = (cells: number[][], r: number, c: number) => {
  const t = sum(cells[r]!)
  return t ? cells[r]![c]! / t : null
}
function cellStyle(r: number, c: number) {
  const s = share(table.value.cells, r, c)
  const b = share(base.value.cells, r, c)
  if (s == null || b == null) return {}
  const d = s - b
  const pctMix = Math.round(Math.min(1, Math.abs(d) / FULL_DIFF) * 70)
  return { background: `color-mix(in oklab, ${d >= 0 ? 'var(--ov-warm)' : 'var(--ov-cool)'} ${pctMix}%, var(--ov-card))`, color: pctMix >= 50 ? 'var(--ov-ink-on)' : 'var(--ov-ink)' }
}
const fmtPct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`)
const perDraw = (cells: number[][], r: number, draws: number) => (draws ? (sum(cells[r]!) / draws).toFixed(1) : '—')
const gridCols = computed(() => ({ gridTemplateColumns: `3.2rem repeat(${colAttr.value.labels.length}, minmax(0, 1fr)) 3rem` }))
</script>

<template>
  <div class="space-y-3">
    <div class="ov-dig-card space-y-2.5 rounded-2xl p-3">
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="text-[11px] text-[var(--ov-ink-soft)]">盤面</span>
        <select
          v-model="coordId"
          class="ov-select"
        >
          <option
            v-for="s in summaries"
            :key="s.series.def.id"
            :value="s.series.def.id"
          >
            {{ s.series.def.name }}
          </option>
        </select>
        <template v-if="run && summary">
          <span class="text-[11px] text-[var(--ov-ink-soft)]">這期</span>
          <OverviewStateView
            :def="summary.series.def"
            :state="run.state"
            size="sm"
          />
          <b>連 {{ run.length }} 期</b>
        </template>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="ov-seg-group is-small">
          <button
            type="button"
            :class="{ 'is-on': scope === 'run' }"
            @click="scope = 'run'"
          >
            連 {{ run?.length ?? '—' }} 期以上
          </button>
          <button
            type="button"
            :class="{ 'is-on': scope === 'all' }"
            @click="scope = 'all'"
          >
            所有 {{ run?.state ?? '' }}
          </button>
        </div>
        <div class="ov-seg-group is-small">
          <button
            type="button"
            :class="{ 'is-on': when === 0 }"
            @click="when = 0"
          >
            那一期
          </button>
          <button
            type="button"
            :class="{ 'is-on': when === 1 }"
            @click="when = 1"
          >
            的下一期
          </button>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2 text-[11px] text-[var(--ov-ink-soft)]">
        列
        <select
          v-model="row"
          class="ov-select is-small"
        >
          <option
            v-for="a in BALL_ATTRS"
            :key="a.id"
            :value="a.id"
          >
            {{ a.name }}
          </option>
        </select>
        × 欄
        <select
          v-model="col"
          class="ov-select is-small"
        >
          <option
            v-for="a in BALL_ATTRS.filter(a => a.id !== row)"
            :key="a.id"
            :value="a.id"
          >
            {{ a.name }}
          </option>
        </select>
      </div>
    </div>

    <p
      v-if="!run"
      class="text-sm text-[var(--ov-ink-soft)]"
    >
      這個盤面這期算不出來。
    </p>
    <template v-else>
      <p class="text-[12px] leading-snug">
        以前 <b>{{ summary!.series.def.name }} {{ run.state }}{{ scope === 'run' ? ` 連 ${run.length} 期以上` : '' }}</b>
        {{ when === 0 ? '的那一期' : '之後的下一期' }}：<b class="text-[var(--ov-warm-ink)]">{{ table.draws }}</b> 次
      </p>

      <div
        v-if="table.draws"
        class="ov-dig-card overflow-x-auto rounded-2xl p-2"
      >
        <div
          class="grid min-w-[18rem] gap-1 text-center"
          :style="gridCols"
        >
          <span />
          <span
            v-for="c in colAttr.labels"
            :key="c"
            class="py-1 text-[11px] font-bold text-[var(--ov-ink-soft)]"
          >{{ c }}</span>
          <span class="py-1 text-[10px] font-bold text-[var(--ov-ink-soft)]">每期幾顆</span>

          <template
            v-for="(rl, r) in rowAttr.labels"
            :key="rl"
          >
            <span class="flex items-center justify-center text-[13px] font-black">{{ rl }}</span>
            <span
              v-for="(_, c) in colAttr.labels"
              :key="c"
              class="relative flex flex-col items-center justify-center rounded-lg px-0.5 py-1.5 leading-tight"
              :style="cellStyle(r, c)"
            >
              <b class="text-[15px] tabular-nums">{{ fmtPct(share(table.cells, r, c)) }}</b>
              <span class="text-[9.5px] tabular-nums opacity-80">平常 {{ fmtPct(share(base.cells, r, c)) }}</span>
              <span
                v-if="current?.draws && current.cells[r]![c]"
                class="absolute right-0.5 top-0.5 flex gap-px"
              >
                <i
                  v-for="k in current.cells[r]![c]"
                  :key="k"
                  class="ov-dot-now"
                />
              </span>
            </span>
            <span class="flex flex-col items-center justify-center leading-tight tabular-nums">
              <b class="text-[13px]">{{ perDraw(table.cells, r, table.draws) }}</b>
              <span class="text-[9.5px] text-[var(--ov-ink-soft)]">平常 {{ perDraw(base.cells, r, base.draws) }}</span>
            </span>
          </template>
        </div>
      </div>
      <p class="text-[11px] leading-snug text-[var(--ov-ink-soft)]">
        每格 = 這一列的球，有幾成落在這一欄。比平常多偏橘、少偏藍。
        <span v-if="when === 0"><i class="ov-dot-now align-middle" /> = 這期的球落在這格。</span>
      </p>
    </template>
  </div>
</template>

<style scoped>
.ov-dig-card { background: var(--ov-card); border: 1px solid var(--ov-line); }
.ov-dot-now { display: inline-block; width: 6px; height: 6px; border-radius: 9999px; background: var(--ov-ink); box-shadow: 0 0 0 1.5px var(--ov-card); }
</style>
