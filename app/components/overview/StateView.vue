<script setup lang="ts">
/**
 * 顯示一個座標狀態：一般狀態用色牌（4單、升…）；「各段幾顆」的（頭數、大小三段、隔期格局）畫成一排小格，
 * 格子裡是顆數，越多越深；md 以上在格子下面標段名（0頭、小、0~5…）。
 */
import type { CoordDef } from '~~/shared/lotto/overview/coords'

const props = withDefaults(defineProps<{
  def: CoordDef
  state: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
}>(), { size: 'sm' })

const counts = computed(() => (props.def.parts ? props.state.split('·').map(Number) : null))
const CELL = {
  xs: 'w-[15px] h-[18px] text-[10px] rounded-[3px]',
  sm: 'w-5 h-6 text-xs rounded',
  md: 'w-7 h-8 text-sm rounded-md',
  lg: 'w-9 h-11 text-lg rounded-md'
} as const
const labeled = computed(() => props.size === 'md' || props.size === 'lg')

function cellStyle(n: number) {
  const pct = n === 0 ? 0 : Math.round(22 + (Math.min(n, 4) / 4) * 66)
  return {
    background: n === 0 ? 'transparent' : `color-mix(in oklab, var(--ov-warm) ${pct}%, var(--ov-paper))`,
    color: pct >= 60 ? 'var(--ov-ink-on)' : n === 0 ? 'var(--ov-ink-soft)' : 'var(--ov-ink)',
    boxShadow: n === 0 ? 'inset 0 0 0 1px var(--ov-line)' : 'none'
  }
}
</script>

<template>
  <span
    v-if="counts"
    class="inline-flex shrink-0 items-start gap-[2px]"
    :title="def.parts!.map((p, i) => `${p} ${counts![i]} 顆`).join('、')"
  >
    <span
      v-for="(n, i) in counts"
      :key="i"
      class="flex flex-col items-center gap-0.5"
    >
      <span
        class="flex items-center justify-center font-bold tabular-nums"
        :class="CELL[size]"
        :style="cellStyle(n)"
      >{{ n }}</span>
      <span
        v-if="labeled"
        class="whitespace-nowrap text-[9.5px] leading-none text-[var(--ov-ink-soft)]"
      >{{ def.parts![i] }}</span>
    </span>
  </span>
  <OverviewStateChip
    v-else
    :label="state"
    :tone="def.tone(state)"
    :size="size"
  />
</template>
