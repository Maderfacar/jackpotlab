<script setup lang="ts">
useSeoMeta({ title: '規律驗證' })

const tab = ref<'dependence' | 'uniform'>('dependence')
const tabs = [
  { label: '順序有沒有規律', value: 'dependence' },
  { label: '短期是否平均', value: 'uniform' }
]
</script>

<template>
  <UContainer class="space-y-6 py-10">
    <div class="space-y-2">
      <h1 class="text-2xl font-semibold tracking-tight">
        規律驗證
      </h1>
      <p class="text-sm text-muted">
        今彩 539 · 用真實開獎紀錄，檢查號碼裡有沒有藏著規律
      </p>
    </div>

    <UTabs
      v-model="tab"
      :items="tabs"
      :content="false"
      variant="link"
      color="primary"
      :ui="{ list: 'overflow-x-auto max-w-full' }"
    />

    <VerifyDependenceSection v-if="tab === 'dependence'" />
    <VerifyUniformSection v-else />
  </UContainer>
</template>
