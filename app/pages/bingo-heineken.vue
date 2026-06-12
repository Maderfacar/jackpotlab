<script setup lang="ts">
/**
 * 賓果海尼根 /bingo-heineken
 *
 * 固定 gameId = bingo_bingo、signalId = bingo_origin_distribution。
 * 內容 = 訊號 10 詳細頁（SignalDetail）+ 上方多一個「全壘打」section
 *        （插在「隔期剩餘號碼」之上，順序：全壘打 → 隔期剩餘號碼 → 觀察紀錄）。
 *
 * 全壘打邏輯見 HomeRunSection.vue：
 *   - 上方卡 post-T periods[0..3] 套用「觀察最新一期 firing positionYs」位置過濾
 *   - 再從 隔期 0 移除紅框（連莊 T∩T-1）
 *
 * 與 /hindsight 訊號 10 詳細頁互不影響：本頁是獨立路由、SignalDetail 透過 slot 注入全壘打 section。
 */

import { useHindsight } from '~/composables/useHindsight'

definePageMeta({
  title: '賓果海尼根'
})

const gameId = ref<'bingo_bingo'>('bingo_bingo')

const {
  loading,
  error,
  drawsAsc,
  brainState,
  analysisState,
  refresh
} = useHindsight(gameId)

function closeNoop() {
  // 本頁沒有訊號牆切換、close 不做事
}
</script>

<template>
  <UContainer class="py-10 space-y-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="space-y-2">
        <h1 class="text-3xl font-semibold tracking-tight">
          賓果海尼根
        </h1>
        <p class="text-sm text-muted">
          以訊號 10「獎號隔期來源」為基礎，套用觀察最新一期位置過濾與連莊紅框移除，輸出「全壘打」候選號。
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

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="`載入失敗：${error}`"
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
      <HindsightSignalDetail
        :game-id="gameId"
        signal-id="bingo_origin_distribution"
        :brain-state="brainState"
        :draws-asc="drawsAsc"
        :analysis-state="analysisState"
        :hide-back-button="true"
        :sticky-condition-card="false"
        @close="closeNoop"
      >
        <template #before-origin="{ stickyTopOffset }">
          <HindsightHomeRunSection
            :game-id="gameId"
            :analysis-state="analysisState"
            :brain-state="brainState"
            :draws-asc="drawsAsc"
            :sticky-top-offset="stickyTopOffset"
          />
        </template>
      </HindsightSignalDetail>
    </template>
  </UContainer>
</template>

<style scoped>
:deep([role="tab"]) {
  cursor: pointer;
}
</style>
