<script setup lang="ts">
/**
 * /kobe Tab 3-7 placeholder（Phase 2-6+7 尚未實作時用）
 *
 * 用 props 傳入下一階段名稱與「白話描述」、避免 UI 露出 phase 編號。
 */
interface Props {
  title: string
  description: string
  /** 預計能回答的問題清單 */
  questions?: string[]
}
defineProps<Props>()
</script>

<template>
  <UCard :ui="{ body: 'p-6' }">
    <div class="space-y-3">
      <div class="flex items-center gap-2">
        <UIcon
          name="i-lucide-clock"
          class="size-5 text-muted"
        />
        <h3 class="text-base font-semibold">
          {{ title }}
        </h3>
        <UBadge
          color="neutral"
          variant="subtle"
          size="sm"
        >
          尚未實作
        </UBadge>
      </div>
      <p class="text-sm text-muted leading-relaxed">
        {{ description }}
      </p>
      <div
        v-if="questions && questions.length > 0"
        class="space-y-1 pt-1"
      >
        <div class="text-xs text-muted">
          完成後預計能回答的問題：
        </div>
        <ul class="list-disc pl-5 space-y-1 text-xs text-muted">
          <li
            v-for="(q, i) in questions"
            :key="i"
          >
            {{ q }}
          </li>
        </ul>
      </div>
    </div>
  </UCard>
</template>
