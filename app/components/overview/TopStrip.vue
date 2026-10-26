<script setup lang="ts">
/**
 * 頂部固定條：最新一期期號、日期、五顆球。點球條展開每顆的隔期・值・y。
 */
import type { PlainDraw } from '~~/shared/lotto/history-file'
import type { DrawFeatures } from '~~/shared/lotto/patterns/features'
import { mdw, pad2, shortIssue } from '~/utils/overview-format'

const props = defineProps<{
  draw: PlainDraw
  feat: DrawFeatures | undefined
}>()

const expanded = ref(false)
const balls = computed(() => props.draw.nums.map((n, i) => ({
  n,
  gap: props.feat?.gaps[i] ?? '—',
  value: props.feat?.values[i] ?? '—',
  y: props.feat?.ys[i] ?? '—'
})))
</script>

<template>
  <button
    type="button"
    class="ov-strip flex w-full items-center justify-between gap-3 px-4 py-2 text-left"
    :aria-expanded="expanded"
    @click="expanded = !expanded"
  >
    <span class="flex flex-col leading-tight">
      <span class="font-mono text-lg font-black tracking-tight">{{ shortIssue(draw.issue) }}</span>
      <span class="text-[10.5px] text-[var(--ov-ink-soft)]">{{ mdw(draw.date) }}</span>
    </span>
    <span class="flex gap-1.5">
      <span
        v-for="(b, i) in balls"
        :key="b.n"
        class="flex flex-col items-center"
        :style="{ '--i': i }"
      >
        <span class="ov-ball flex size-9 items-center justify-center rounded-full font-mono text-[15px] font-black">{{ pad2(b.n) }}</span>
        <span
          v-if="expanded"
          class="mt-1 text-center text-[9.5px] leading-tight text-[var(--ov-ink-soft)] tabular-nums"
        >隔{{ b.gap }}<br>值{{ b.value }}<br>y{{ b.y }}</span>
      </span>
    </span>
    <UIcon
      :name="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
      class="size-4 shrink-0 text-[var(--ov-ink-soft)]"
    />
  </button>
</template>

<style scoped>
.ov-strip {
  background: color-mix(in oklab, var(--ov-card) 86%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--ov-line);
}
.ov-ball {
  background: radial-gradient(circle at 32% 28%, #fde68a 0%, #f59e0b 58%, #d97706 100%);
  color: #451a03;
  box-shadow: 0 4px 10px -4px rgb(217 119 6 / 0.6), inset 0 -2px 4px rgb(120 53 15 / 0.25);
  animation: ov-pop 480ms cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: calc(var(--i) * 60ms);
}
@keyframes ov-pop { from { transform: translateY(-8px) scale(0.85); } to { transform: none; } }
@media (prefers-reduced-motion: reduce) { .ov-ball { animation: none; } }
</style>
