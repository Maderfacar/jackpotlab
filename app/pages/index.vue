<script setup lang="ts">
const { $firebase } = useNuxtApp()
const user = useState<{ uid: string } | null>('firebase-user')

const status = computed(() => {
  if (!$firebase) return { label: '初始化中…', tone: 'neutral' as const }
  if (!user.value) return { label: '尚未登入', tone: 'warning' as const }
  return { label: `已連線 (uid: ${user.value.uid.slice(0, 8)}…)`, tone: 'success' as const }
})
</script>

<template>
  <UContainer class="py-16">
    <div class="flex flex-col items-center gap-6 text-center">
      <UIcon
        name="i-lucide-dices"
        class="size-12 text-primary"
      />

      <h1 class="text-4xl font-semibold tracking-tight sm:text-5xl">
        Jackpot Lab
      </h1>

      <p class="max-w-xl text-pretty text-muted">
        台灣彩券今彩 539 隔期狀態分析。記憶過去、推論未來、修正自身。
      </p>

      <UBadge
        :color="status.tone"
        variant="subtle"
        size="lg"
        :icon="user ? 'i-lucide-shield-check' : 'i-lucide-loader-circle'"
      >
        {{ status.label }}
      </UBadge>

      <div class="mt-4 text-xs text-muted">
        環境連線測試頁 — 開發範圍待定
      </div>
    </div>
  </UContainer>
</template>
