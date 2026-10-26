<script setup lang="ts">
/**
 * 波段（原本分散在 /board「四種均值」與 /trend「近期波段」，2026-10-27 使用者：收進一頁）。
 * 直接用原本的元件與算法，數字跟原頁一致。
 */
import type { PlainDraw } from '~~/shared/lotto/history-file'
import { analyzeRecentWave, RECENT_WAVE_KEYS, recentWaveDraws, type RecentWave, type RecentWaveKind } from '~/utils/recent-wave'
import { buildWaveContext } from '~/utils/wave'

const props = defineProps<{ draws: PlainDraw[] }>()

type Tab = 'y' | 'value' | 'avg'
const tab = ref<Tab>('y')
const tabs = [
  { label: '位置 y 波段', value: 'y' },
  { label: '值 0～5 波段', value: 'value' },
  { label: '隔期／值 四種均值', value: 'avg' }
]

const inputs = computed(() => props.draws.map(d => ({ drawTerm: Number(d.issue), drawDate: d.date, prizes: d.nums })))
const waveDraws = computed(() => recentWaveDraws(inputs.value))
const waves = computed<RecentWave[]>(() => {
  if (tab.value === 'avg') return []
  const kind: RecentWaveKind = tab.value
  return RECENT_WAVE_KEYS[kind]
    .map(key => analyzeRecentWave(waveDraws.value, kind, key))
    .filter((r): r is RecentWave => r !== null)
})
/** 四種均值比較花時間，切到那一頁才算 */
const ctx = computed(() => (tab.value === 'avg' ? buildWaveContext(inputs.value) : null))
</script>

<template>
  <div class="space-y-4">
    <UTabs
      v-model="tab"
      :items="tabs"
      :content="false"
      size="sm"
      class="w-full sm:w-auto"
    />
    <div
      v-if="tab !== 'avg'"
      class="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3"
    >
      <TrendWaveCard
        v-for="w in waves"
        :key="`${w.kind}-${w.key}`"
        :wave="w"
      />
    </div>
    <BoardWaveAverages
      v-else
      :ctx="ctx"
      :loading="false"
      error-message=""
    />
  </div>
</template>
