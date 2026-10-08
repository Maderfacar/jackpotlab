<script setup lang="ts">
useSeoMeta({ title: '規律驗證' })

const tab = ref<'dependence' | 'uniform'>('dependence')
const tabs = [
  { label: '持續性與相關性（第 2–4 組）', value: 'dependence' },
  { label: '短期均勻（第 1 組）', value: 'uniform' }
]
</script>

<template>
  <UContainer class="space-y-6 py-10">
    <div class="space-y-2">
      <h1 class="text-2xl font-semibold tracking-tight">
        規律驗證
      </h1>
      <p class="text-sm text-muted">
        今彩 539 · 只用真實開獎號碼與其衍生參數（隔期／現值／位置），檢查偏差是否持續、前後期是否相關
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
