<script setup lang="ts">
/**
 * 盤面畫面：13 種看法一張看盤表（一列一指高）。點一列從下面滑出：連 N 期之後／等多久。
 * 正處於歷史高位的列左邊一條橘邊；表下面是「很久沒出現」的狀態。
 */
import type { PlainDraw } from '~~/shared/lotto/history-file'
import { isWaitHigh, type CoordSummary } from '~/composables/useOverview'
import { toneStyle } from '~/utils/overview-format'

const props = defineProps<{
  summaries: CoordSummary[]
  draws: PlainDraw[]
}>()

const RIBBON = 12
/** 「很久沒出現」只列常見狀態（≥ 全部期數 5%） */
const WAIT_COMMON_SHARE = 0.05

const openId = ref<string | null>(null)
const panel = ref<'ladder' | 'waits'>('ladder')
const opened = computed(() => props.summaries.find(s => s.series.def.id === openId.value) ?? null)
const drawerOpen = computed({
  get: () => openId.value != null,
  set: (v) => {
    if (!v) openId.value = null
  }
})
function open(id: string, target: 'ladder' | 'waits' = 'ladder') {
  panel.value = target
  openId.value = id
}

function ribbon(s: CoordSummary) {
  const seq = s.series.seq
  const start = Math.max(0, seq.length - RIBBON)
  const runLen = s.run?.length ?? 0
  return seq.slice(start).map((st, j) => ({
    st,
    inRun: start + j >= seq.length - runLen,
    style: st ? toneStyle(s.series.def.tone(st)) : {}
  }))
}
const highCount = computed(() => props.summaries.filter(s => s.runHigh).length)
const longWaits = computed(() => props.summaries.flatMap((s) => {
  const total = s.series.seq.filter(x => x != null).length
  return s.waits.filter(w => isWaitHigh(w) && w.count >= total * WAIT_COMMON_SHARE).map(w => ({ s, w }))
}))
const valueLine = (s: CoordSummary) => {
  const v = s.series.values
  const cur = v?.at(-1)
  return cur == null ? null : `${v!.at(-2) ?? '—'}→${cur}`
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-baseline justify-between">
      <h2 class="text-lg font-black tracking-tight">
        盤面
      </h2>
      <p class="text-[11px] text-[var(--ov-ink-soft)]">
        <span class="mr-1 inline-block size-2 rounded-full bg-[var(--ov-warm)] align-middle" />連到歷史高位 {{ highCount }} 項・點一列看走法
      </p>
    </div>

    <div class="ov-board overflow-hidden rounded-2xl">
      <div class="ov-board-head grid grid-cols-[4.6rem_5.6rem_minmax(0,1fr)_2.6rem] items-center gap-2 px-3 py-1.5 text-[10px] font-semibold text-[var(--ov-ink-soft)]">
        <span>看法</span>
        <span>這期</span>
        <span>最近 {{ RIBBON }} 期 →</span>
        <span class="text-right">連</span>
      </div>
      <button
        v-for="s in summaries"
        :key="s.series.def.id"
        type="button"
        class="ov-board-row grid w-full grid-cols-[4.6rem_5.6rem_minmax(0,1fr)_2.6rem] items-center gap-2 px-3 py-2 text-left"
        :class="{ 'is-high': s.runHigh }"
        @click="open(s.series.def.id)"
      >
        <span class="min-w-0">
          <span class="block truncate text-[13px] font-bold leading-tight">{{ s.series.def.name }}</span>
          <span
            v-if="valueLine(s)"
            class="block font-mono text-[10px] text-[var(--ov-ink-soft)]"
          >{{ valueLine(s) }}</span>
        </span>
        <span class="flex items-center">
          <OverviewStateView
            v-if="s.run"
            :def="s.series.def"
            :state="s.run.state"
            size="sm"
          />
        </span>
        <span
          class="ov-ribbon"
          aria-hidden="true"
        >
          <span
            v-for="(c, i) in ribbon(s)"
            :key="i"
            class="ov-rcell"
            :class="{ 'in-run': c.inRun, 'is-empty': !c.st }"
            :style="c.style"
          />
        </span>
        <span class="text-right leading-none tabular-nums">
          <b
            class="text-lg"
            :class="s.runHigh ? 'text-[var(--ov-warm-ink)]' : ''"
          >{{ s.run?.length ?? '—' }}</b>
          <span class="block text-[9.5px] text-[var(--ov-ink-soft)]">最長{{ s.stats?.max ?? '—' }}</span>
        </span>
      </button>
    </div>

    <div v-if="longWaits.length">
      <h3 class="mb-2 text-sm font-black">
        很久沒出現
        <span class="ml-1 text-[11px] font-normal text-[var(--ov-ink-soft)]">以前很少等到這麼久</span>
      </h3>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button
          v-for="{ s, w } in longWaits"
          :key="`${s.series.def.id}-${w.state}`"
          type="button"
          class="ov-wait-card flex flex-col gap-1 rounded-xl px-3 py-2 text-left"
          @click="open(s.series.def.id, 'waits')"
        >
          <span class="text-[10.5px] text-[var(--ov-ink-soft)]">{{ s.series.def.name }}</span>
          <span class="flex items-center gap-2">
            <OverviewStateView
              :def="s.series.def"
              :state="w.state"
              size="sm"
            />
            <span class="text-sm"><b class="text-lg">{{ w.waited }}</b> 期</span>
          </span>
          <span class="text-[10px] text-[var(--ov-ink-soft)] tabular-nums">以前 {{ w.gaps.toLocaleString() }} 次只有 {{ w.reachedNow }} 次這麼久</span>
        </button>
      </div>
    </div>

    <details class="rounded-xl border border-dashed border-[var(--ov-line)] px-3 py-2 text-xs text-[var(--ov-ink-soft)]">
      <summary class="cursor-pointer font-semibold">
        還在挖的 4 項
      </summary>
      <ul class="mt-1 list-disc space-y-0.5 pl-5">
        <li>實際開出順序（球掉出來的先後）</li>
        <li>交叉：連開 4單 時，那幾顆單號是從哪幾個隔期格出來的</li>
        <li>回拉的力道和速度</li>
        <li>例外前兆：常見配置不成立的那幾期，前面是什麼盤面</li>
      </ul>
    </details>

    <UDrawer
      v-model:open="drawerOpen"
      :ui="{ content: 'max-h-[90dvh]', body: 'overflow-y-auto' }"
    >
      <template #body>
        <div
          v-if="opened"
          class="ov-root space-y-4 px-1 pb-6"
        >
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-semibold text-[var(--ov-ink-soft)]">
                {{ opened.series.def.hint }}
              </p>
              <p class="mt-1 flex items-center gap-2 text-xl font-black">
                {{ opened.series.def.name }}
                <OverviewStateView
                  v-if="opened.run"
                  :def="opened.series.def"
                  :state="opened.run.state"
                  size="md"
                />
                <span
                  v-if="opened.run"
                  class="text-sm font-bold"
                >連 {{ opened.run.length }} 期</span>
              </p>
            </div>
          </div>
          <div class="ov-seg-group">
            <button
              type="button"
              :class="{ 'is-on': panel === 'ladder' }"
              @click="panel = 'ladder'"
            >
              連 N 期之後
            </button>
            <button
              type="button"
              :class="{ 'is-on': panel === 'waits' }"
              @click="panel = 'waits'"
            >
              等多久了
            </button>
          </div>
          <OverviewLadder
            v-if="panel === 'ladder'"
            :series="opened.series"
            :draws="draws"
          />
          <OverviewWaits
            v-else
            :summary="opened"
          />
        </div>
      </template>
    </UDrawer>
  </div>
</template>

<style scoped>
.ov-board { background: var(--ov-card); border: 1px solid var(--ov-line); }
.ov-board-head { border-bottom: 1px solid var(--ov-line); background: color-mix(in oklab, var(--ov-ink) 3%, var(--ov-card)); }
.ov-board-row {
  position: relative;
  border-bottom: 1px solid var(--ov-line);
  transition: background 120ms ease;
}
.ov-board-row:last-child { border-bottom: none; }
.ov-board-row:hover, .ov-board-row:active { background: color-mix(in oklab, var(--ov-ink) 5%, transparent); }
.ov-board-row.is-high { background: color-mix(in oklab, var(--ov-warm) 8%, transparent); }
.ov-board-row.is-high::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--ov-warm);
}
/* 色條用固定寬度的格子（Safari 在按鈕裡用 flex:1 會縮成一條） */
.ov-ribbon {
  display: grid;
  grid-template-columns: repeat(12, minmax(6px, 1fr));
  gap: 2px;
  width: 100%;
}
.ov-rcell { display: block; height: 16px; border-radius: 3px; }
.ov-rcell.is-empty { background: var(--ov-line); }
.ov-rcell.in-run { box-shadow: inset 0 0 0 1.5px var(--ov-ink); }
.ov-wait-card { background: var(--ov-card); border: 1px solid color-mix(in oklab, var(--ov-warm) 45%, var(--ov-line)); }
</style>
