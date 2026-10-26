<script setup lang="ts">
/**
 * 頁首：最新一期五顆，每顆底下是隔期・值・y（同 /draws 的算法）。
 */
import type { PlainDraw } from '~~/shared/lotto/history-file'
import type { DrawFeatures } from '~~/shared/lotto/patterns/features'
import { mdw, pad2, shortIssue } from '~/utils/overview-format'

const props = defineProps<{
  draw: PlainDraw
  feat: DrawFeatures | undefined
  total: number
  first: PlainDraw | undefined
}>()

const balls = computed(() => props.draw.nums.map((n, i) => ({
  n,
  gap: props.feat?.gaps[i] ?? null,
  value: props.feat?.values[i] ?? null,
  y: props.feat?.ys[i] ?? null
})))
</script>

<template>
  <header class="ov-hero relative overflow-hidden rounded-2xl px-4 py-5 sm:px-6 sm:py-6">
    <div class="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div class="space-y-0.5">
        <p class="text-xs font-medium tracking-wide text-[var(--ov-ink-soft)]">
          最新一期
        </p>
        <p class="font-mono text-3xl font-bold leading-none tracking-tight sm:text-4xl">
          {{ shortIssue(draw.issue) }}
        </p>
        <p class="text-sm text-[var(--ov-ink-soft)]">
          {{ mdw(draw.date) }}
        </p>
      </div>
      <ol class="flex gap-2 sm:gap-3">
        <li
          v-for="(b, i) in balls"
          :key="b.n"
          class="ov-ball-wrap flex flex-col items-center gap-1"
          :style="{ '--i': i }"
        >
          <span class="ov-ball flex size-12 items-center justify-center rounded-full font-mono text-lg font-bold sm:size-14 sm:text-xl">{{ pad2(b.n) }}</span>
          <span class="text-center text-[10.5px] leading-tight text-[var(--ov-ink-soft)] tabular-nums">
            隔{{ b.gap ?? '—' }}・值{{ b.value ?? '—' }}<br>y={{ b.y ?? '—' }}
          </span>
        </li>
      </ol>
    </div>
    <p class="relative mt-4 text-xs text-[var(--ov-ink-soft)]">
      資料從 {{ first?.date ?? '—' }} 起，共 {{ total.toLocaleString() }} 期；每次開獎後打開就是最新的。
    </p>
  </header>
</template>

<style scoped>
.ov-hero {
  background:
    radial-gradient(120% 140% at 100% 0%, color-mix(in oklab, var(--ov-warm) 22%, transparent) 0%, transparent 55%),
    radial-gradient(90% 120% at 0% 100%, color-mix(in oklab, var(--ov-cool) 16%, transparent) 0%, transparent 60%),
    var(--ov-card);
  border: 1px solid var(--ov-line);
}
.ov-ball {
  background: radial-gradient(circle at 32% 28%, #fde68a 0%, #f59e0b 58%, #d97706 100%);
  color: #451a03;
  box-shadow: 0 6px 16px -6px rgb(217 119 6 / 0.6), inset 0 -3px 6px rgb(120 53 15 / 0.25);
}
.ov-ball-wrap {
  animation: ov-drop 520ms cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: calc(var(--i) * 70ms);
}
@keyframes ov-drop {
  from { transform: translateY(-14px) scale(0.9); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .ov-ball-wrap { animation: none; }
}
</style>
