<script setup lang="ts">
/** 一期開獎：五顆球＋隔期 / 值 / 位置，右邊隔期和、值和、尾數 */
import { gapSum, isComplete, tailsOf, valueSum, type ScanDraw } from '~~/shared/lotto/scan/scan'

const props = defineProps<{
  draw: ScanDraw
  label: string
  highlight?: boolean
}>()

const complete = computed(() => isComplete(props.draw))
</script>

<template>
  <UCard :class="highlight ? 'ring-1 ring-primary/50' : ''">
    <div class="flex flex-wrap items-start gap-x-8 gap-y-4">
      <div class="space-y-1">
        <div class="text-xs text-muted">
          {{ label }}
        </div>
        <div class="font-mono text-lg font-semibold">
          {{ draw.issue }}
        </div>
        <div class="text-xs text-muted">
          {{ draw.date }}
        </div>
      </div>
      <div class="flex flex-wrap gap-3">
        <div
          v-for="(n, i) in draw.nums"
          :key="n"
          class="flex flex-col items-center gap-1"
        >
          <ScanBall
            :n="n"
            size="lg"
            :repeat="draw.gaps[i] === 0"
          />
          <span class="font-mono text-[11px] leading-tight text-muted">隔 {{ draw.gaps[i] ?? '—' }}・值 {{ draw.values[i] ?? '—' }}</span>
          <span class="font-mono text-[11px] leading-tight text-muted">位 {{ draw.xs[i] ?? '—' }}-{{ draw.ys[i] ?? '—' }}</span>
        </div>
      </div>
      <div
        v-if="complete"
        class="grid grid-cols-3 gap-x-6 gap-y-1 text-sm"
      >
        <div class="text-xs text-muted">
          隔期和
        </div>
        <div class="text-xs text-muted">
          值和
        </div>
        <div class="text-xs text-muted">
          尾數
        </div>
        <div class="font-mono text-lg font-semibold">
          {{ gapSum(draw) }}
        </div>
        <div class="font-mono text-lg font-semibold">
          {{ valueSum(draw) }}
        </div>
        <div class="font-mono text-sm leading-7">
          {{ tailsOf(draw.nums).join(' ') }}
        </div>
      </div>
    </div>
  </UCard>
</template>
