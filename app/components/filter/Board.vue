<script setup lang="ts">
/**
 * 隔期狀態的排法（四段、一格一格），號碼依篩選結果上色：
 * 還出現在剩下組合裡 = 橘球＋出現在幾組；一組都沒有 = 灰白；回看時下一期實際開出的號碼加白框。
 */
import type { BoardState } from '~~/shared/lotto/scan/board-states'
import { boardBuckets } from '~~/shared/lotto/scan/scan'

const props = defineProps<{
  state: BoardState
  counts: number[]
  /** 下一期實際開出的號碼（回看時才有） */
  actual: number[] | null
}>()

const buckets = computed(() => boardBuckets(props.state))
const alive = computed(() => props.counts.filter(c => c > 0).length)
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">
        隔期狀態
        <span class="ml-1 text-sm font-normal text-muted">還能用 {{ alive }} 個號碼、灰掉 {{ 39 - alive }} 個</span>
      </h2>
      <div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span class="flex items-center gap-1.5"><span class="filter-ball size-4" />還在剩下的組合裡（下面數字 = 出現在幾組）</span>
        <span class="flex items-center gap-1.5"><span class="filter-ball filter-off size-4" />一組都沒有</span>
        <span
          v-if="actual"
          class="flex items-center gap-1.5"
        ><span class="filter-ball filter-actual size-4" />下一期實際開出</span>
      </div>
    </template>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div
        v-for="bk in buckets"
        :key="bk.key"
        class="rounded-lg bg-elevated/60 p-3"
      >
        <div class="mb-2 flex items-baseline justify-between">
          <span class="text-sm font-medium">隔期 {{ bk.label }}</span>
          <span class="font-mono text-xs text-muted">{{ bk.count }} 顆</span>
        </div>
        <div class="space-y-2">
          <div
            v-for="sl in bk.slots"
            :key="sl.gap"
            class="flex items-start gap-2"
          >
            <span class="w-16 shrink-0 pt-1.5 font-mono text-[11px] text-muted">隔{{ sl.gap }}・值{{ sl.value }}</span>
            <div class="flex flex-wrap gap-1.5">
              <div
                v-for="(n, i) in sl.nums"
                :key="n"
                class="flex w-8 flex-col items-center"
                :title="`${String(n).padStart(2, '0')}：隔 ${sl.gap}・值 ${sl.value}・位 ${sl.nums.length}-${i + 1}・出現在 ${counts[n] ?? 0} 組`"
              >
                <span
                  class="filter-ball size-8 text-xs"
                  :class="[(counts[n] ?? 0) > 0 ? '' : 'filter-off', actual?.includes(n) ? 'filter-actual' : '']"
                >{{ String(n).padStart(2, '0') }}</span>
                <span
                  class="font-mono text-[10px] leading-4"
                  :class="(counts[n] ?? 0) > 0 ? 'text-toned' : 'text-dimmed'"
                >{{ (counts[n] ?? 0) > 0 ? counts[n] : '—' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<style scoped>
.filter-ball {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: var(--filter-orange);
  color: #0b0b0b;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
  line-height: 1;
}
.filter-off {
  background: transparent;
  color: var(--ui-text-dimmed);
  box-shadow: inset 0 0 0 1px var(--ui-border-accented);
  opacity: 0.55;
}
.filter-actual {
  box-shadow: 0 0 0 2px var(--ui-bg), 0 0 0 4px var(--ui-text);
  opacity: 1;
}
.filter-off.filter-actual {
  box-shadow: inset 0 0 0 1px var(--ui-border-accented), 0 0 0 2px var(--ui-bg), 0 0 0 4px var(--ui-error);
}
</style>
