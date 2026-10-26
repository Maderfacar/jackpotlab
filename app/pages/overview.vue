<script setup lang="ts">
/**
 * 一頁總覽（2026-10-27 使用者：問過的、建議的、可探索的都放進一頁；不要往下捲那麼多，大破大立改版）。
 *
 * 像 App：頂部固定最新一期球條，底部四個按鈕切畫面，一次只看一個。
 * - 盤面：13 種看法一張看盤表，點一列滑出「連 N 期之後」「等多久」
 * - 位置波段：第 1～5 顆（由小到大）的隔期／值波形＋相似波形引出的下一期
 * - 號碼：同幾顆、整組重覆、4 顆、牽引
 * - 波段：原 /trend 近期波段與 /board 四種均值
 * 計算：shared/lotto/overview/*（測試 shared/lotto/__tests__/overview.test.ts）。
 */
import { OVERVIEW_VIEWS, type OverviewView } from '~/utils/overview-format'

useSeoMeta({ title: '一頁總覽 — 今彩 539' })

const { draws, feats, summaries, status, error } = useOverview()

const route = useRoute()
const router = useRouter()
const view = computed<OverviewView>({
  get: () => {
    const q = route.query.v
    return OVERVIEW_VIEWS.includes(q as OverviewView) ? q as OverviewView : 'board'
  },
  set: (v) => {
    router.replace({ query: { ...route.query, v } })
    if (import.meta.client) window.scrollTo({ top: 0 })
  }
})
</script>

<template>
  <div class="ov-root min-h-[calc(100dvh-var(--ui-header-height,4rem))] bg-[var(--ov-paper)]">
    <div
      v-if="status === 'pending' || (status === 'idle' && !draws.length)"
      class="flex flex-col items-center gap-3 py-32 text-sm text-[var(--ov-ink-soft)]"
    >
      <span class="ov-loader" />
      載入 20 年資料中…
    </div>
    <div
      v-else-if="error"
      class="p-4"
    >
      <UAlert
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="`載入失敗：${error.statusMessage ?? error.message}`"
      />
    </div>

    <template v-else-if="draws.length">
      <div class="sticky top-[var(--ui-header-height,4rem)] z-20">
        <div class="mx-auto max-w-5xl">
          <OverviewTopStrip
            :draw="draws.at(-1)!"
            :feat="feats.at(-1)"
          />
        </div>
      </div>

      <main class="mx-auto max-w-5xl px-3 pb-28 pt-4 sm:px-5">
        <Transition
          name="ov-view"
          mode="out-in"
        >
          <OverviewBoardView
            v-if="view === 'board'"
            key="board"
            :summaries="summaries"
            :draws="draws"
          />
          <section
            v-else-if="view === 'position'"
            key="position"
            class="space-y-3"
          >
            <h2 class="text-lg font-black tracking-tight">
              位置波段
              <span class="ml-1 text-[11px] font-normal text-[var(--ov-ink-soft)]">由小到大第 1～5 顆・點一列看詳細</span>
            </h2>
            <OverviewPositionView
              :draws="draws"
              :feats="feats"
            />
          </section>
          <section
            v-else-if="view === 'numbers'"
            key="numbers"
            class="space-y-3"
          >
            <h2 class="text-lg font-black tracking-tight">
              號碼之間
            </h2>
            <OverviewNumbers :draws="draws" />
          </section>
          <section
            v-else
            key="waves"
            class="space-y-3"
          >
            <h2 class="text-lg font-black tracking-tight">
              波段
              <span class="ml-1 text-[11px] font-normal text-[var(--ov-ink-soft)]">原「近期波段」「號碼走勢」的波段，算法沒變</span>
            </h2>
            <OverviewWaves :draws="draws" />
          </section>
        </Transition>
      </main>

      <OverviewTabBar v-model="view" />
    </template>
  </div>
</template>

<style>
.ov-root {
  --ov-paper: #f6f4ef;
  --ov-card: #ffffff;
  --ov-line: #e4dfd5;
  --ov-ink: #1c1917;
  --ov-ink-soft: #78716c;
  --ov-ink-on: #ffffff;
  --ov-warm: #e8890c;
  --ov-warm-ink: #b45309;
  --ov-cool: #1f8fd1;
  --ov-mid: #a8a29e;
  color: var(--ov-ink);
}
.dark .ov-root {
  --ov-paper: #121110;
  --ov-card: #1c1a18;
  --ov-line: #322e29;
  --ov-ink: #f5f3ef;
  --ov-ink-soft: #a8a29e;
  --ov-ink-on: #1c1006;
  --ov-warm: #f5a524;
  --ov-warm-ink: #fbbf24;
  --ov-cool: #45a8e6;
  --ov-mid: #78716c;
}
.ov-root .ov-seg-group {
  display: inline-flex;
  max-width: 100%;
  overflow-x: auto;
  gap: 2px;
  padding: 3px;
  border-radius: 9999px;
  background: color-mix(in oklab, var(--ov-ink) 7%, var(--ov-card));
  border: 1px solid var(--ov-line);
}
.ov-root .ov-seg-group > button {
  flex-shrink: 0;
  border-radius: 9999px;
  padding: 0.3rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--ov-ink-soft);
  transition: background 140ms ease, color 140ms ease;
}
.ov-root .ov-seg-group.is-small > button { padding: 0.2rem 0.6rem; font-size: 0.75rem; }
.ov-root .ov-seg-group > button.is-on {
  background: var(--ov-ink);
  color: var(--ov-paper);
  box-shadow: 0 2px 6px -2px rgb(0 0 0 / 0.4);
}
.ov-view-enter-active, .ov-view-leave-active { transition: opacity 160ms ease, transform 200ms cubic-bezier(0.16, 1, 0.3, 1); }
.ov-view-enter-from { opacity: 0; transform: translateY(8px); }
.ov-view-leave-to { opacity: 0; }
.ov-loader {
  width: 28px; height: 28px; border-radius: 9999px;
  border: 3px solid var(--ov-line); border-top-color: var(--ov-warm);
  animation: ov-spin 800ms linear infinite;
}
@keyframes ov-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .ov-view-enter-active, .ov-view-leave-active { transition: none; }
}
</style>
