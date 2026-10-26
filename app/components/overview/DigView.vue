<script setup lang="ts">
/**
 * 挖掘（2026-10-27 使用者：盤面「還在挖」的交叉、回拉、例外前兆補上；實際開出順序先不做）。
 */
import type { PlainDraw } from '~~/shared/lotto/history-file'
import type { DrawFeatures } from '~~/shared/lotto/patterns/features'
import type { CoordSummary } from '~/composables/useOverview'

defineProps<{
  summaries: CoordSummary[]
  draws: PlainDraw[]
  feats: DrawFeatures[]
}>()

type Tab = 'cross' | 'pullback' | 'precursor'
const tab = ref<Tab>('cross')
const TABS: { value: Tab, label: string }[] = [
  { value: 'cross', label: '交叉' },
  { value: 'pullback', label: '回拉' },
  { value: 'precursor', label: '例外前兆' }
]
const HINT: Record<Tab, string> = {
  cross: '盤面跟這期一樣時，五顆球從哪裡來',
  pullback: '衝到高處、低處之後，幾期拉回、拉回多少',
  precursor: '常見配置沒出現的那幾期，前一期是什麼盤面'
}
</script>

<template>
  <section class="space-y-3">
    <h2 class="text-lg font-black tracking-tight">
      挖掘
      <span class="ml-1 text-[11px] font-normal text-[var(--ov-ink-soft)]">{{ HINT[tab] }}</span>
    </h2>
    <div class="ov-seg-group">
      <button
        v-for="t in TABS"
        :key="t.value"
        type="button"
        :class="{ 'is-on': tab === t.value }"
        @click="tab = t.value"
      >
        {{ t.label }}
      </button>
    </div>
    <OverviewDigCross
      v-if="tab === 'cross'"
      :summaries="summaries"
      :draws="draws"
      :feats="feats"
    />
    <OverviewDigPullback
      v-else-if="tab === 'pullback'"
      :summaries="summaries"
      :draws="draws"
      :feats="feats"
    />
    <OverviewDigPrecursor
      v-else
      :summaries="summaries"
    />
  </section>
</template>
