<script setup lang="ts">
/**
 * 紅色警示橫幅。在當下頁頂部釘住，可關閉（僅 client 端記憶該 alert id）。
 *
 * 顯示「最新一條未閱讀」的當期警示。多條警示時，按 createdAt 倒序取第一條。
 */
import type { BrainAlert } from '~/hindsight/types'

interface Props {
  alerts: BrainAlert[]
}

const props = defineProps<Props>()
const dismissedIds = ref<Set<string>>(new Set())

const visible = computed<BrainAlert | null>(() => {
  const list = [...props.alerts]
    .filter(a => !dismissedIds.value.has(a.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return list[0] ?? null
})

function typeLabel(t: BrainAlert['type']): string {
  switch (t) {
    case 'multi_signal': return '多訊號集中'
    case 'rare_combination': return '罕見組合'
    case 'signal_drift': return '訊號漂移'
    case 'overall_drift': return '整體漂移'
  }
}

function dismiss() {
  if (!visible.value) return
  const next = new Set(dismissedIds.value)
  next.add(visible.value.id)
  dismissedIds.value = next
}
</script>

<template>
  <UAlert
    v-if="visible"
    color="error"
    variant="subtle"
    icon="i-lucide-triangle-alert"
    :title="`${typeLabel(visible.type)}（${visible.drawTerm} 期）`"
    :description="visible.detail"
    :close="{ color: 'error' }"
    @close="dismiss"
  />
</template>
