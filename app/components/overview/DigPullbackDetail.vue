<script setup lang="ts">
/**
 * 回拉詳細（滑出面板）：目前這趟撐了幾期、以前撐到這裡的後來幾期回；
 * 高處、低處各自拉回要幾期、下一期拉回多少；最近幾趟的走法。
 */
import type { PlainDraw } from '~~/shared/lotto/history-file'
import { RETURN_GROUPS, type Pullback, type Side, type SideStats } from '~~/shared/lotto/overview/pullback'
import { mdw, pct } from '~/utils/overview-format'

const props = defineProps<{
  name: string
  values: (number | null)[]
  pb: Pullback
  draws: PlainDraw[]
}>()

const RECENT = 12
const SIDE_NAME: Record<Side, string> = { high: '高處', low: '低處' }

const sides = computed(() => (['high', 'low'] as const).map(side => ({
  side,
  stats: props.pb[side] as SideStats,
  edge: side === 'high' ? `≥ ${props.pb.band.p90}` : `≤ ${props.pb.band.p10}`
})))
const recent = computed(() => [...props.pb.trips].reverse().slice(0, RECENT).map((t) => {
  const stop = t.end ?? props.values.length - 1
  return { ...t, date: props.draws[t.start]?.date ?? '', path: props.values.slice(t.start, stop + 1) }
}))
const maxOf = (xs: number[]) => Math.max(1, ...xs)
const signed = (x: number | null) => (x == null ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(1)}`)
</script>

<template>
  <div class="ov-root space-y-5 px-1 pb-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-xs font-semibold text-[var(--ov-ink-soft)]">
          {{ name }}・目前排在歷史第 {{ pb.rank ?? '—' }}
        </p>
        <p class="font-mono text-4xl font-black leading-none">
          {{ pb.current ?? '—' }}
        </p>
      </div>
      <dl class="grid grid-cols-3 gap-x-4 text-center text-[11px] tabular-nums">
        <div>
          <dt class="text-[var(--ov-ink-soft)]">
            低處
          </dt>
          <dd class="text-base font-bold text-[var(--ov-cool)]">
            ≤ {{ pb.band.p10 }}
          </dd>
        </div>
        <div>
          <dt class="text-[var(--ov-ink-soft)]">
            中位數
          </dt>
          <dd class="text-base font-bold">
            {{ pb.band.p50 }}
          </dd>
        </div>
        <div>
          <dt class="text-[var(--ov-ink-soft)]">
            高處
          </dt>
          <dd class="text-base font-bold text-[var(--ov-warm-ink)]">
            ≥ {{ pb.band.p90 }}
          </dd>
        </div>
      </dl>
    </div>

    <section
      v-if="pb.ongoing"
      class="ov-now rounded-2xl p-3"
    >
      <p class="text-sm">
        目前在<b>{{ SIDE_NAME[pb.ongoing.side] }}第 {{ pb.ongoing.elapsed + 1 }} 期</b>
        <span class="text-[11px] text-[var(--ov-ink-soft)]">（{{ mdw(draws[pb.ongoing.start]!.date) }} 出去，那期 {{ values[pb.ongoing.start] }}）</span>
      </p>
      <p class="mt-1 text-[12px] text-[var(--ov-ink-soft)]">
        以前撐到這裡還沒回的 <b class="text-[var(--ov-ink)]">{{ pb.ongoing.survived }}</b> 次，後來再過幾期回到中位數：
      </p>
      <div class="mt-2 grid grid-cols-6 items-end gap-1.5">
        <div
          v-for="(g, i) in RETURN_GROUPS"
          :key="g.label"
          class="flex flex-col items-center gap-1"
        >
          <span class="text-[10.5px] font-bold tabular-nums">{{ pct(pb.ongoing.remaining[i]!, pb.ongoing.survived) }}%</span>
          <span
            class="ov-bar w-full rounded-t"
            :style="{ height: `${4 + (pb.ongoing.remaining[i]! / maxOf(pb.ongoing.remaining)) * 56}px` }"
          />
          <span class="text-[10px] text-[var(--ov-ink-soft)]">{{ g.label }}</span>
        </div>
      </div>
    </section>

    <section
      v-for="s in sides"
      :key="s.side"
      class="space-y-2"
    >
      <h3 class="text-sm font-black">
        從{{ SIDE_NAME[s.side] }}（{{ s.edge }}）拉回
        <span class="ml-1 text-[11px] font-normal text-[var(--ov-ink-soft)]">以前 {{ s.stats.count }} 趟</span>
      </h3>
      <template v-if="s.stats.count">
        <div class="grid grid-cols-6 items-end gap-1.5">
          <div
            v-for="(g, i) in RETURN_GROUPS"
            :key="g.label"
            class="flex flex-col items-center gap-1"
          >
            <span class="text-[10.5px] font-bold tabular-nums">{{ pct(s.stats.groups[i]!, s.stats.count) }}%</span>
            <span
              class="w-full rounded-t"
              :class="s.side === 'high' ? 'ov-bar' : 'ov-bar-cool'"
              :style="{ height: `${4 + (s.stats.groups[i]! / maxOf(s.stats.groups)) * 56}px` }"
            />
            <span class="text-[10px] text-[var(--ov-ink-soft)]">{{ g.label }}</span>
          </div>
        </div>
        <p class="text-[12px] leading-relaxed">
          通常 <b>{{ s.stats.medianLen }}</b> 期回；下一期平均 <b class="tabular-nums">{{ signed(s.stats.avgNextMove) }}</b>，
          拉回到中位數距離的 <b class="tabular-nums">{{ s.stats.avgNextShare == null ? '—' : Math.round(s.stats.avgNextShare * 100) }}%</b>
          <span
            v-if="(s.stats.avgNextShare ?? 0) > 1"
            class="text-[var(--ov-ink-soft)]"
          >（平均一次就衝過中位數）</span>
        </p>
      </template>
      <p
        v-else
        class="text-[12px] text-[var(--ov-ink-soft)]"
      >
        這串數字沒有{{ SIDE_NAME[s.side] }}可言（歷史上這一端跟中位數一樣）。
      </p>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-sm font-black">
        最近 {{ recent.length }} 趟
      </h3>
      <ul class="divide-y divide-[var(--ov-line)] text-[12px]">
        <li
          v-for="t in recent"
          :key="t.start"
          class="flex items-center gap-2 py-1.5"
        >
          <span class="w-[5.6rem] shrink-0 tabular-nums text-[var(--ov-ink-soft)]">{{ mdw(t.date) }}</span>
          <span
            class="w-9 shrink-0 text-[11px] font-bold"
            :class="t.side === 'high' ? 'text-[var(--ov-warm-ink)]' : 'text-[var(--ov-cool)]'"
          >{{ SIDE_NAME[t.side] }}</span>
          <span class="min-w-0 flex-1 truncate font-mono tabular-nums">{{ t.path.map(v => v ?? '—').join(' → ') }}</span>
          <b class="shrink-0 tabular-nums">{{ t.end == null ? '還沒回' : `${t.end - t.start} 期` }}</b>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.ov-now { background: color-mix(in oklab, var(--ov-warm) 10%, var(--ov-card)); border: 1px solid color-mix(in oklab, var(--ov-warm) 40%, var(--ov-line)); }
.ov-bar { background: var(--ov-warm); }
.ov-bar-cool { background: var(--ov-cool); }
</style>
