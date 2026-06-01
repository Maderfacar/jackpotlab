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
