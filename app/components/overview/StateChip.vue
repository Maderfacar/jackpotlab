<script setup lang="ts">
/**
 * 一個座標狀態的小牌子（4單、2·2·1、升…）。偏一邊琥珀、另一邊天藍，越偏越深。
 */
import type { StateTone } from '~~/shared/lotto/overview/coords'
import { toneStyle } from '~/utils/overview-format'

const props = withDefaults(defineProps<{
  label: string
  tone: StateTone
  size?: 'xs' | 'sm' | 'md' | 'lg'
}>(), { size: 'sm' })

const style = computed(() => toneStyle(props.tone))
const SIZE = {
  xs: 'h-5 min-w-5 px-1 text-[11px] rounded',
  sm: 'h-6 min-w-6 px-1.5 text-xs rounded-md',
  md: 'h-8 min-w-8 px-2 text-sm rounded-md',
  lg: 'h-11 min-w-11 px-3 text-xl rounded-lg'
} as const
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center whitespace-nowrap font-semibold tabular-nums"
    :class="SIZE[size]"
    :style="style"
  >{{ label }}</span>
</template>
