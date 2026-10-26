<script setup lang="ts">
/**
 * 出現在哪幾年：從資料第一年到今年，每年一欄，一次一顆點往上疊；看得出有沒有擠在某幾年。
 */
import type { PlainDraw } from '~~/shared/lotto/history-file'

const props = defineProps<{
  draws: PlainDraw[]
  indices: number[]
}>()

/** 一年超過這麼多次就改用長條（點疊不下） */
const DOT_CAP = 8

const years = computed(() => {
  const first = Number(props.draws[0]?.date.slice(0, 4) ?? 0)
  const last = Number(props.draws.at(-1)?.date.slice(0, 4) ?? 0)
  const counts: Record<number, number> = {}
  for (const i of props.indices) {
    const y = Number(props.draws[i]!.date.slice(0, 4))
    counts[y] = (counts[y] ?? 0) + 1
  }
  const list = []
  for (let y = first; y <= last; y++) list.push({ y, n: counts[y] ?? 0 })
  return list
})
const max = computed(() => Math.max(1, ...years.value.map(x => x.n)))
const useBars = computed(() => max.value > DOT_CAP)
</script>

<template>
  <div class="overflow-x-auto pb-1">
    <div class="flex min-w-[34rem] items-end gap-[3px]">
      <div
        v-for="x in years"
        :key="x.y"
        class="flex flex-1 flex-col items-center gap-1"
        :title="`${x.y} 年：${x.n} 次`"
      >
        <span class="h-3.5 text-[10px] font-semibold tabular-nums">{{ x.n || '' }}</span>
        <div class="flex h-16 w-full flex-col-reverse items-center gap-[2px]">
          <template v-if="useBars">
            <span
              v-if="x.n"
              class="w-3/4 rounded-sm bg-[var(--ov-warm)]"
              :style="{ height: `${(x.n / max) * 100}%` }"
            />
          </template>
          <template v-else>
            <span
              v-for="k in x.n"
              :key="k"
              class="size-[7px] rounded-full bg-[var(--ov-warm)]"
            />
          </template>
        </div>
        <span class="text-[9.5px] tabular-nums text-[var(--ov-ink-soft)]">{{ String(x.y).slice(2) }}</span>
      </div>
    </div>
  </div>
</template>
