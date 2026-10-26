<script setup lang="ts">
/**
 * 號碼之間：最新一期跟歷史最多同幾顆、完整重覆、4 顆一起開、兩顆一起開、牽引（開出後下一期常跟著誰）。
 */
import type { PlainDraw } from '~~/shared/lotto/history-file'
import { byTimes, combos, follows, groupRepeats, latestOverlap } from '~~/shared/lotto/overview/numbers'
import { pad2 } from '~/utils/overview-format'

const props = defineProps<{ draws: PlainDraw[] }>()

const TOP_QUADS = 8
const TOP_PAIRS = 10

const latest = computed(() => props.draws.at(-1)!)
const latestSet = computed(() => new Set(latest.value.nums))
const overlap = computed(() => latestOverlap(props.draws))
const showOverlap = ref(false)

const fulls = computed(() => groupRepeats(props.draws, 5))
const latestIsRepeat = computed(() => fulls.value.find(r => r.at.at(-1) === props.draws.length - 1) ?? null)
const showFulls = ref(false)

const quads = computed(() => groupRepeats(props.draws, 4))
const topQuads = computed(() => byTimes(quads.value).slice(0, TOP_QUADS))
/** 最新一期五個 4 顆組合，各自以前一起開過幾次（不含這期） */
const latestQuads = computed(() => {
  const map = new Map(quads.value.map(r => [r.nums.join(','), r.at]))
  return combos(latest.value.nums, 4).map(c => ({ nums: c, before: (map.get(c.join(',')) ?? []).filter(i => i < props.draws.length - 1) }))
})
const pairs = computed(() => byTimes(groupRepeats(props.draws, 2)).slice(0, TOP_PAIRS))
const pulls = computed(() => follows(props.draws, latest.value.nums))

const dateOf = (i: number) => props.draws[i]!.date
const yearsOf = (at: number[]) => at.map(i => `${dateOf(i).slice(2, 4)}'${dateOf(i).slice(5, 7)}`).join('・')
</script>

<template>
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
    <article class="ov-card space-y-3 rounded-2xl p-4">
      <h3 class="text-sm font-bold">
        最新一期跟以前每一期比
      </h3>
      <p class="text-sm">
        最多同 <b class="text-lg">{{ overlap.most }}</b> 顆，這樣的有 <b>{{ overlap.at.length }}</b> 期；
        從來沒有 {{ overlap.most + 1 }} 顆以上相同的。
      </p>
      <ul
        v-if="showOverlap"
        class="space-y-1 text-xs"
      >
        <li
          v-for="i in overlap.at"
          :key="i"
          class="flex items-center gap-2 font-mono"
        >
          <span class="w-24 shrink-0 text-[var(--ov-ink-soft)]">{{ dateOf(i) }}</span>
          <span
            v-for="n in draws[i]!.nums"
            :key="n"
            :class="latestSet.has(n) ? 'rounded bg-[var(--ov-warm)] px-1 font-bold text-[var(--ov-ink-on)]' : 'px-1 text-[var(--ov-ink-soft)]'"
          >{{ pad2(n) }}</span>
        </li>
      </ul>
      <UButton
        size="xs"
        color="neutral"
        variant="soft"
        @click="showOverlap = !showOverlap"
      >
        {{ showOverlap ? '收起' : `看這 ${overlap.at.length} 期` }}
      </UButton>
    </article>

    <article class="ov-card space-y-3 rounded-2xl p-4">
      <h3 class="text-sm font-bold">
        整組完全重覆
      </h3>
      <p
        v-if="latestIsRepeat"
        class="rounded-lg bg-[var(--ov-warm)] px-3 py-2 text-sm font-bold text-[var(--ov-ink-on)]"
      >
        這期跟 {{ yearsOf(latestIsRepeat.at.slice(0, -1)) }} 開的一模一樣
      </p>
      <p class="text-sm">
        {{ draws.length.toLocaleString() }} 期裡，有 <b class="text-lg">{{ fulls.length }}</b> 組號碼完整開過 2 次以上；
        最多的開過 <b>{{ Math.max(0, ...fulls.map(f => f.at.length)) }}</b> 次。下面是第二次開出的年份：
      </p>
      <OverviewTimeline
        :draws="draws"
        :indices="fulls.map(f => f.at[1]!)"
      />
      <ul
        v-if="showFulls"
        class="space-y-1 text-xs"
      >
        <li
          v-for="f in [...fulls].sort((a, b) => b.at.at(-1)! - a.at.at(-1)!)"
          :key="f.nums.join()"
          class="flex flex-wrap items-center gap-x-3 font-mono"
        >
          <span class="font-bold">{{ f.nums.map(pad2).join(' ') }}</span>
          <span class="text-[var(--ov-ink-soft)]">{{ f.at.map(dateOf).join(' ↔ ') }}</span>
          <span class="text-[var(--ov-ink-soft)]">隔 {{ f.at.slice(1).map((v, k) => v - f.at[k]!).join('、') }} 期</span>
        </li>
      </ul>
      <UButton
        size="xs"
        color="neutral"
        variant="soft"
        @click="showFulls = !showFulls"
      >
        {{ showFulls ? '收起' : `看這 ${fulls.length} 組（最近重覆的在上）` }}
      </UButton>
    </article>

    <article class="ov-card space-y-3 rounded-2xl p-4">
      <h3 class="text-sm font-bold">
        4 顆一起開
      </h3>
      <p class="text-xs text-[var(--ov-ink-soft)]">
        最新一期拆成 5 組「4 顆」，以前各自一起開過幾次：
      </p>
      <ul class="space-y-1 text-xs">
        <li
          v-for="q in latestQuads"
          :key="q.nums.join()"
          class="flex flex-wrap items-center gap-x-3 font-mono"
        >
          <span class="font-bold">{{ q.nums.map(pad2).join(' ') }}</span>
          <span :class="q.before.length ? 'font-bold text-[var(--ov-warm-ink)]' : 'text-[var(--ov-ink-soft)]'">
            {{ q.before.length ? `以前 ${q.before.length} 次：${q.before.map(dateOf).join('、')}` : '以前沒有' }}
          </span>
        </li>
      </ul>
      <p class="pt-1 text-xs text-[var(--ov-ink-soft)]">
        歷史上一起開最多次的 4 顆：
      </p>
      <ul class="space-y-1 text-xs">
        <li
          v-for="q in topQuads"
          :key="q.nums.join()"
          class="flex flex-wrap items-center gap-x-3"
        >
          <span class="font-mono font-bold">{{ q.nums.map(pad2).join(' ') }}</span>
          <b>{{ q.at.length }} 次</b>
          <span class="text-[var(--ov-ink-soft)]">{{ yearsOf(q.at) }}</span>
        </li>
      </ul>
    </article>

    <article class="ov-card space-y-3 rounded-2xl p-4">
      <h3 class="text-sm font-bold">
        牽引：這期的號碼開出後，下一期最常跟著誰
      </h3>
      <ul class="space-y-2 text-xs">
        <li
          v-for="p in pulls"
          :key="p.num"
          class="flex flex-wrap items-center gap-x-2 gap-y-1"
        >
          <span class="ov-mini-ball">{{ pad2(p.num) }}</span>
          <span class="text-[var(--ov-ink-soft)]">開過 {{ p.times }} 次，下一期：</span>
          <span
            v-for="t in p.top"
            :key="t.num"
            class="rounded-md bg-[var(--ov-line)] px-1.5 py-0.5 font-mono"
          ><b>{{ pad2(t.num) }}</b> <span class="text-[var(--ov-ink-soft)]">{{ t.count }}</span></span>
        </li>
      </ul>
      <p class="pt-1 text-xs text-[var(--ov-ink-soft)]">
        兩顆一起開最多次：
      </p>
      <div class="flex flex-wrap gap-1.5 text-xs">
        <span
          v-for="pr in pairs"
          :key="pr.nums.join()"
          class="rounded-md bg-[var(--ov-line)] px-2 py-1 font-mono"
        ><b>{{ pr.nums.map(pad2).join(' ') }}</b> <span class="text-[var(--ov-ink-soft)]">{{ pr.at.length }} 次</span></span>
      </div>
    </article>
  </div>
</template>

<style scoped>
.ov-card { background: var(--ov-card); border: 1px solid var(--ov-line); }
.ov-mini-ball {
  display: inline-flex; align-items: center; justify-content: center;
  width: 1.75rem; height: 1.75rem; border-radius: 9999px;
  background: radial-gradient(circle at 32% 28%, #fde68a 0%, #f59e0b 58%, #d97706 100%);
  color: #451a03; font-family: ui-monospace, monospace; font-weight: 700;
}
</style>
