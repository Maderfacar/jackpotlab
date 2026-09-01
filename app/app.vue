<script setup lang="ts">
const config = useRuntimeConfig()
const title = config.public.appName
const description = '台灣彩券今彩 539 隔期狀態分析 — Jackpot Lab'

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'zh-TW'
  }
})

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  twitterCard: 'summary_large_image'
})

interface NavItem {
  label: string
  icon: string
  to: string
}

const navItems: NavItem[] = [
  { label: '訊號', icon: 'i-lucide-lightbulb', to: '/signals' },
  { label: '賓果訊號', icon: 'i-lucide-grid-3x3', to: '/bingo-signals' },
  { label: '開獎號碼', icon: 'i-lucide-list-checks', to: '/draws' },
  { label: '系統健康', icon: 'i-lucide-activity', to: '/admin/health' }
]

const navMenuItems = computed(() => navItems.map(item => ({
  label: item.label,
  icon: item.icon,
  to: item.to
})))
</script>

<template>
  <UApp>
    <UHeader>
      <template #left>
        <NuxtLink
          to="/"
          class="flex items-center gap-2 font-semibold tracking-tight"
        >
          <UIcon
            name="i-lucide-dices"
            class="size-5 text-primary"
          />
          {{ title }}
        </NuxtLink>
      </template>

      <template #right>
        <UDropdownMenu
          :items="navMenuItems"
          :ui="{ content: 'min-w-44' }"
        >
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-menu"
            size="md"
            aria-label="導覽選單"
          />
        </UDropdownMenu>
        <UColorModeButton />
      </template>
    </UHeader>

    <UMain>
      <NuxtPage />
    </UMain>

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          © {{ new Date().getFullYear() }} {{ title }}
        </p>
      </template>
    </UFooter>
  </UApp>
</template>
