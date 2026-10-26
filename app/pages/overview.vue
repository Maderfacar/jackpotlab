<script setup lang="ts">
/**
 * 一頁總覽（2026-10-27 使用者：問過的、建議的、可探索的都放進一頁；不想多頁切換，UI 要高度直觀）。
 *
 * 一、頁首 + 正處於歷史高位的集中提示
 * 二、這期的樣子：每個盤面座標（單雙、大小、格局…）這期的狀態與連幾期
 * 三、連 N 期之後：選一個座標，最近幾期的走法以前出現幾次、之後開什麼
 * 四、等多久了：那個座標每種狀態已經幾期沒出現
 * 五、號碼之間：完整重覆、4 顆一起開、牽引
 * 六、波段：原 /trend 與 /board 四種均值
 * 計算：shared/lotto/overview/*（測試 shared/lotto/__tests__/overview.test.ts）。
 */
useSeoMeta({ title: '一頁總覽 — 今彩 539' })

const { draws, feats, summaries, status, error } = useOverview()

const route = useRoute()
const router = useRouter()

const SECTIONS = [
  { id: 'now', label: '這期' },
  { id: 'ladder', label: '連 N 期' },
  { id: 'waits', label: '等多久' },
  { id: 'numbers', label: '號碼之間' },
  { id: 'waves', label: '波段' }
] as const

const coordId = computed<string>({
  get: () => {
    const q = typeof route.query.c === 'string' ? route.query.c : ''
    if (summaries.value.some(s => s.series.def.id === q)) return q
    return summaries.value.find(s => s.runHigh)?.series.def.id ?? 'oddEven'
  },
  set: v => router.replace({ query: { ...route.query, c: v } })
})
const current = computed(() => summaries.value.find(s => s.series.def.id === coordId.value) ?? summaries.value[0] ?? null)

function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function pick(id: string, target?: 'ladder' | 'waits') {
  coordId.value = id
  if (target) nextTick(() => jump(target))
}
</script>

<template>
  <div class="ov-root mx-auto w-full max-w-[1280px] px-4 pb-24 pt-6 sm:px-6">
    <div
      v-if="status === 'pending' || (status === 'idle' && !draws.length)"
      class="py-24 text-center text-sm text-[var(--ov-ink-soft)]"
    >
      載入 20 年資料中…
    </div>
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="`載入失敗：${error.statusMessage ?? error.message}`"
    />

    <div
      v-else-if="draws.length && current"
      class="space-y-6"
    >
      <OverviewHero
        :draw="draws.at(-1)!"
        :feat="feats.at(-1)"
        :total="draws.length"
        :first="draws[0]"
      />

      <nav
        class="ov-nav sticky top-[var(--ui-header-height,4rem)] z-10 -mx-4 flex gap-1.5 overflow-x-auto px-4 py-2 sm:-mx-6 sm:px-6"
        aria-label="跳到區塊"
      >
        <button
          v-for="s in SECTIONS"
          :key="s.id"
          type="button"
          class="ov-nav-btn shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
          @click="jump(s.id)"
        >
          {{ s.label }}
        </button>
      </nav>

      <OverviewHighlights
        :summaries="summaries"
        @select="pick"
      />

      <section
        id="now"
        class="ov-section space-y-3"
      >
        <div>
          <h2 class="ov-h2">
            這期的樣子
          </h2>
          <p class="ov-sub">
            每一格是一種看法；色條是最近 14 期，框起來的是目前連著的那幾期。點一格，下面的「連 N 期」「等多久」就換成那一格。
          </p>
        </div>
        <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          <OverviewCoordTile
            v-for="s in summaries"
            :key="s.series.def.id"
            :summary="s"
            :selected="s.series.def.id === current.series.def.id"
            @select="pick(s.series.def.id)"
          />
        </div>
      </section>

      <section
        id="ladder"
        class="ov-section space-y-3"
      >
        <div>
          <h2 class="ov-h2">
            連 N 期之後
            <span class="ov-h2-tag">{{ current.series.def.name }}</span>
          </h2>
          <p class="ov-sub">
            {{ current.series.def.hint }}。從最近 1 期往上一期一期對，看以前出現過幾次、下一期開什麼；長條是下一期的分布，點一階看明細。
          </p>
        </div>
        <OverviewCoordSwitch
          :summaries="summaries"
          :model-value="current.series.def.id"
          @update:model-value="pick"
        />
        <OverviewLadder
          :series="current.series"
          :draws="draws"
        />
      </section>

      <section
        id="waits"
        class="ov-section space-y-3"
      >
        <div>
          <h2 class="ov-h2">
            等多久了
            <span class="ov-h2-tag">{{ current.series.def.name }}</span>
          </h2>
          <p class="ov-sub">
            每種狀態已經幾期沒出現。灰軌是以前隔最久，實心是目前已等，細黑線是平均。
          </p>
        </div>
        <OverviewCoordSwitch
          :summaries="summaries"
          :model-value="current.series.def.id"
          @update:model-value="pick"
        />
        <OverviewWaits :summary="current" />
      </section>

      <section
        id="numbers"
        class="ov-section space-y-3"
      >
        <div>
          <h2 class="ov-h2">
            號碼之間
          </h2>
          <p class="ov-sub">
            不看座標，直接看號碼：哪些組合重覆開過、哪幾顆常一起出現、開出後下一期常跟著誰。
          </p>
        </div>
        <OverviewNumbers :draws="draws" />
      </section>

      <section
        id="waves"
        class="ov-section space-y-3"
      >
        <div>
          <h2 class="ov-h2">
            波段
          </h2>
          <p class="ov-sub">
            原本在「近期波段」和「號碼走勢」頁的波段分析，搬到這裡一起看，算法沒變。
          </p>
        </div>
        <OverviewWaves :draws="draws" />
      </section>

      <section class="ov-section rounded-2xl border border-dashed border-[var(--ov-line)] p-4 text-sm">
        <h2 class="mb-2 font-bold">
          還在挖的
        </h2>
        <ul class="list-disc space-y-1 pl-5 text-[var(--ov-ink-soft)]">
          <li>實際開出順序（球掉出來的先後），目前全部分析都用由小到大排</li>
          <li>交叉：例如連開 4單 時，那幾顆單號是從哪幾個隔期格出來的</li>
          <li>回拉的力道和速度：偏離之後是一期回到底，還是分幾期慢慢回</li>
          <li>例外前兆：常見配置不成立的那幾期，前面是什麼盤面</li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style>
.ov-root {
  --ov-paper: #fbfaf7;
  --ov-card: #ffffff;
  --ov-line: #e7e3da;
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
  --ov-paper: #151412;
  --ov-card: #1d1b19;
  --ov-line: #34302b;
  --ov-ink: #f5f3ef;
  --ov-ink-soft: #a8a29e;
  --ov-ink-on: #ffffff;
  --ov-warm: #f59e0b;
  --ov-warm-ink: #fbbf24;
  --ov-cool: #38a3e0;
  --ov-mid: #78716c;
}
.ov-root .ov-h2 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.ov-root .ov-h2-tag {
  border-radius: 9999px;
  background: var(--ov-ink);
  color: var(--ov-paper);
  padding: 0.1rem 0.6rem;
  font-size: 0.75rem;
  font-weight: 700;
}
.ov-root .ov-sub {
  margin-top: 0.15rem;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--ov-ink-soft);
}
.ov-root .ov-section { scroll-margin-top: calc(var(--ui-header-height, 4rem) + 3.25rem); }
.ov-root .ov-nav {
  background: color-mix(in oklab, var(--ui-bg, var(--ov-paper)) 88%, transparent);
  backdrop-filter: blur(8px);
}
.ov-root .ov-nav-btn {
  border: 1px solid var(--ov-line);
  background: var(--ov-card);
  transition: background 140ms ease, color 140ms ease;
}
.ov-root .ov-nav-btn:hover { background: var(--ov-ink); color: var(--ov-paper); }
</style>
