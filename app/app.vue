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
        <UButton
          to="/iverson"
          color="neutral"
          variant="ghost"
          icon="i-lucide-target"
          size="sm"
        >
          艾佛森
        </UButton>
        <UButton
          to="/draws"
          color="neutral"
          variant="ghost"
          icon="i-lucide-list-checks"
          size="sm"
        >
          開獎號碼
        </UButton>
        <UButton
          to="/hindsight"
          color="neutral"
          variant="ghost"
          icon="i-lucide-brain"
          size="sm"
        >
          鑑古
        </UButton>
        <UButton
          to="/bingo-heineken"
          color="neutral"
          variant="ghost"
          icon="i-lucide-beer"
          size="sm"
        >
          賓果海尼根
        </UButton>
        <UButton
          to="/admin/health"
          color="neutral"
          variant="ghost"
          icon="i-lucide-activity"
          size="sm"
        >
          系統健康
        </UButton>
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
