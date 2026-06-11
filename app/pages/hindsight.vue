<script setup lang="ts">
/**
 * 鑑古主頁 /hindsight
 *
 * - 彩種小框框 UTabs（沿用 draws.vue 寫法）
 * - 三個次分頁：當下 / 訊號牆 / 大局
 * - 釘選頂部 tabs
 * - 警示橫幅釘在當下頁頂部
 */

import { GAME_IDS, GAMES, type GameId } from '~~/shared/lotto/games'
import { useHindsight } from '~/composables/useHindsight'

definePageMeta({
  title: '鑑古'
})

const gameId = ref<GameId>('lotto539')
const subTab = ref<'now' | 'book' | 'big'>('now')
const openedSignalId = ref<string | null>(null)

const tabs = GAME_IDS.map(id => ({
  label: GAMES[id].name,
  value: id,
  description: GAMES[id].cadenceLabel
}))

const subTabItems = [
  { label: '當下', value: 'now' as const },
  { label: '訊號牆', value: 'book' as const },
  { label: '大局', value: 'big' as const }
]

const {
  loading,
  error,
  drawsAsc,
  brainState,
  analysisState,
  currentFirings,
  ranking,
  currentAlerts,
  refresh
} = useHindsight(gameId)

watch(subTab, (next) => {
  if (next !== 'book') openedSignalId.value = null
})

function openSignal(id: string) {
  openedSignalId.value = id
}

function closeSignal() {
  openedSignalId.value = null
}
</script>

<template>
  <UContainer class="py-10 space-y-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="space-y-2">
        <h1 class="text-3xl font-semibold tracking-tight">
          鑑古
        </h1>
        <p class="text-sm text-muted">
          每彩種一顆腦，按時間順序看訊號是怎麼推、怎麼錯。
        </p>
      </div>
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-refresh-cw"
        :loading="loading"
        @click="refresh"
      >
        重新整理
      </UButton>
    </header>

    <UCard>
      <div class="space-y-5">
        <UTabs
          v-model="gameId"
          :items="tabs"
          :unmount-on-hide="false"
          variant="link"
          color="primary"
          :content="false"
        />

        <div class="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-default/95 backdrop-blur supports-[backdrop-filter]:bg-default/70">
          <UTabs
            v-model="subTab"
            :items="subTabItems"
            :unmount-on-hide="false"
            variant="pill"
            color="neutral"
            size="sm"
            :content="false"
          />
        </div>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="`鑑古載入失敗：${error}`"
        />

        <div
          v-if="loading && drawsAsc.length === 0"
          class="space-y-3"
        >
          <USkeleton
            v-for="i in 3"
            :key="i"
            class="h-24 w-full rounded-lg"
          />
        </div>

        <template v-else>
          <!-- 當下 -->
          <template v-if="subTab === 'now'">
            <HindsightAlertBanner
              v-if="currentAlerts.length > 0"
              :alerts="currentAlerts"
            />
            <HindsightRightNowTab
              :game-id="gameId"
              :draws-asc="drawsAsc"
              :brain-state="brainState"
              :analysis-state="analysisState"
              :current-firings="currentFirings"
              :ranking="ranking"
            />
          </template>

          <!-- 訊號牆 -->
          <template v-else-if="subTab === 'book'">
            <HindsightSignalDetail
              v-if="openedSignalId"
              :game-id="gameId"
              :signal-id="openedSignalId"
              :brain-state="brainState"
              :draws-asc="drawsAsc"
              :analysis-state="analysisState"
              @close="closeSignal"
            />
            <HindsightSignalBookTab
              v-else
              :game-id="gameId"
              :brain-state="brainState"
              @open="openSignal"
            />
          </template>

          <!-- 大局 -->
          <template v-else>
            <HindsightBigPictureTab
              :game-id="gameId"
              :draws-asc="drawsAsc"
              :brain-state="brainState"
            />
          </template>
        </template>
      </div>
    </UCard>
  </UContainer>
</template>

<style scoped>
/* tab 上滑鼠移過去顯示連結指標（彩種切換 + 次分頁切換都套用） */
:deep([role="tab"]) {
  cursor: pointer;
}
</style>
