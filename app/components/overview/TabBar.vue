<script setup lang="ts">
/**
 * 底部固定五個按鈕：盤面／位置波段／號碼／波段／挖掘。
 */
import type { OverviewView } from '~/utils/overview-format'

defineProps<{ modelValue: OverviewView }>()
defineEmits<{ 'update:modelValue': [v: OverviewView] }>()

const ITEMS: { value: OverviewView, label: string, icon: string }[] = [
  { value: 'board', label: '盤面', icon: 'i-lucide-layout-grid' },
  { value: 'position', label: '位置波段', icon: 'i-lucide-chart-spline' },
  { value: 'numbers', label: '號碼', icon: 'i-lucide-hash' },
  { value: 'waves', label: '波段', icon: 'i-lucide-waves' },
  { value: 'dig', label: '挖掘', icon: 'i-lucide-pickaxe' }
]
</script>

<template>
  <nav
    class="ov-tabbar fixed inset-x-0 bottom-0 z-30"
    aria-label="切換畫面"
  >
    <div class="mx-auto grid max-w-xl grid-cols-5 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5">
      <button
        v-for="it in ITEMS"
        :key="it.value"
        type="button"
        class="ov-tab flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-bold"
        :class="{ 'is-on': modelValue === it.value }"
        :aria-current="modelValue === it.value ? 'page' : undefined"
        @click="$emit('update:modelValue', it.value)"
      >
        <UIcon
          :name="it.icon"
          class="size-5"
          :class="{ 'text-[var(--ov-warm-ink)]': modelValue === it.value }"
        />
        {{ it.label }}
      </button>
    </div>
  </nav>
</template>

<style scoped>
.ov-tabbar {
  background: color-mix(in oklab, var(--ov-card) 90%, transparent);
  backdrop-filter: blur(14px);
  border-top: 1px solid var(--ov-line);
  box-shadow: 0 -8px 24px -18px rgb(0 0 0 / 0.5);
}
.ov-tab { color: var(--ov-ink-soft); transition: color 140ms ease, background 140ms ease; }
.ov-tab.is-on { color: var(--ov-ink); background: color-mix(in oklab, var(--ov-warm) 16%, transparent); }
</style>
