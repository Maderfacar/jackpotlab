<script setup lang="ts">
/**
 * 例外前兆的一列：盤面名稱｜前一期的狀態｜下一期出例外的比例條（黑線 = 平常）｜比例與次數。
 */
import type { CoordDef } from '~~/shared/lotto/overview/coords'
import { rateOf, type PrecursorRow } from '~~/shared/lotto/overview/precursor'

const props = defineProps<{
  row: PrecursorRow
  def: CoordDef
  baseRate: number
  /** 比例條滿格代表多少 */
  scale: number
  thin?: boolean
}>()

const rate = computed(() => rateOf(props.row))
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
        class="absolute inset-y-0 left-0 rounded-full"
        :class="rate > baseRate ? 'bg-[var(--ov-warm)]' : 'bg-[var(--ov-cool)]'"
        :style="{ width: `${(rate / scale) * 100}%` }"
      />
      <span
        class="ov-pre-base absolute -inset-y-0.5 w-0.5"
        :style="{ left: `${(baseRate / scale) * 100}%` }"
      />
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
