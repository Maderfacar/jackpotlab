<script setup lang="ts">
/**
 * 例外前兆的一列：盤面名稱｜前一期的狀態｜比平常高（往右、橘）或低（往左、藍）多少｜比例與次數。
 * 中間黑線 = 平常；條的長度只比差多少，差越多越長。
 */
import type { CoordDef } from '~~/shared/lotto/overview/coords'
import { rateOf, type PrecursorRow } from '~~/shared/lotto/overview/precursor'

const props = defineProps<{
  row: PrecursorRow
  def: CoordDef
  baseRate: number
  /** 條從中線到一端代表差多少（例 0.1 = 差 10 個百分點） */
  span: number
  thin?: boolean
}>()

const rate = computed(() => rateOf(props.row))
const bar = computed(() => {
  const d = rate.value - props.baseRate
  const w = Math.min(50, (Math.abs(d) / props.span) * 50)
  return { left: `${d >= 0 ? 50 : 50 - w}%`, width: `${w}%` }
})
</script>

<template>
  <div
    class="ov-pre-row grid grid-cols-[4.6rem_5.4rem_minmax(0,1fr)_3.4rem] items-center gap-2 px-3 py-1.5"
    :class="{ 'is-thin': thin }"
  >
    <span class="truncate text-[12px] font-bold">{{ def.name }}</span>
    <span class="flex items-center">
      <OverviewStateView
        :def="def"
        :state="row.state"
        size="xs"
      />
    </span>
    <span class="ov-pre-track relative block h-3 rounded-full">
      <span
        class="absolute inset-y-0 rounded-full"
        :class="rate > baseRate ? 'bg-[var(--ov-warm)]' : 'bg-[var(--ov-cool)]'"
        :style="bar"
      />
      <span class="ov-pre-base absolute -inset-y-0.5 left-1/2 w-0.5 -translate-x-1/2" />
    </span>
    <span class="text-right leading-tight tabular-nums">
      <b class="text-[13px]">{{ Math.round(rate * 100) }}%</b>
      <span class="block text-[9.5px] text-[var(--ov-ink-soft)]">{{ row.e }}/{{ row.n }}</span>
    </span>
  </div>
</template>

<style scoped>
.ov-pre-row { border-bottom: 1px solid var(--ov-line); }
.ov-pre-row:last-child { border-bottom: none; }
.ov-pre-row.is-thin { opacity: 0.45; }
.ov-pre-track { background: color-mix(in oklab, var(--ov-ink) 7%, var(--ov-card)); }
.ov-pre-base { background: var(--ov-ink); }
</style>
