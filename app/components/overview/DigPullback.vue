<script setup lang="ts">
/**
 * 回拉：每串數字（第 1～5 顆的隔期／值、隔期和、值和、總和、跨度）目前排在歷史第幾、
 * 是不是正在高處／低處，以前從那裡拉回中位數要幾期、一次拉回多少。點一列看詳細。
 */
import type { PlainDraw } from '~~/shared/lotto/history-file'
import type { DrawFeatures } from '~~/shared/lotto/patterns/features'
import { positionValues } from '~~/shared/lotto/overview/position'
import { pullback, type Pullback } from '~~/shared/lotto/overview/pullback'
import type { CoordSummary } from '~/composables/useOverview'
import { pct } from '~/utils/overview-format'

const props = defineProps<{
  summaries: CoordSummary[]
  draws: PlainDraw[]
  feats: DrawFeatures[]
}>()

const SUM_IDS = ['gapSum', 'valueSum', 'total', 'span']

interface Line {
  key: string
  name: string
  values: (number | null)[]
  pb: Pullback
}

function lines(prefix: string, kindName: string, series: (number | null)[][]): Line[] {
  return series.flatMap((values, p) => {
    const pb = pullback(values)
    return pb ? [{ key: `${prefix}${p}`, name: `第 ${p + 1} 顆${kindName}`, values, pb }] : []
  })
}

const groups = computed(() => [
  { title: '第 1～5 顆的隔期', lines: lines('g', '隔期', positionValues(props.feats, 'gap')) },
  { title: '第 1～5 顆的值', lines: lines('v', '值', positionValues(props.feats, 'value')) },
  {
    title: '加總類',
    lines: SUM_IDS.flatMap((id) => {
      const s = props.summaries.find(x => x.series.def.id === id)
      const values = s?.series.values
      const pb = values ? pullback(values) : null
      return s && values && pb ? [{ key: id, name: s.series.def.name, values, pb }] : []
    })
  }
])

const openKey = ref<string | null>(null)
const opened = computed(() => groups.value.flatMap(g => g.lines).find(l => l.key === openKey.value) ?? null)
const drawerOpen = computed({
  get: () => openKey.value != null,
  set: (v) => {
    if (!v) openKey.value = null
  }
})

function status(l: Line) {
  const o = l.pb.ongoing
  if (!o) return null
  return { warm: o.side === 'high', text: `${o.side === 'high' ? '高處' : '低處'}第 ${o.elapsed + 1} 期` }
}
function note(l: Line) {
  const o = l.pb.ongoing
  if (o) return o.survived ? `以前撐到這裡 ${o.survived} 次，下一期回 ${pct(o.remaining[0]!, o.survived)}%` : '以前沒撐這麼久過'
  const h = l.pb.high
  return h.medianLen != null ? `高處通常 ${h.medianLen} 期回` : ''
}
</script>

<template>
  <div class="space-y-4">
    <p class="text-[11px] leading-snug text-[var(--ov-ink-soft)]">
      衝到歷史前 10% 高（或後 10% 低）算出去一趟，回到中位數算拉回。條上的點 = 目前數字排在歷史第幾（左低右高），兩端色塊就是高處、低處。
    </p>
    <section
      v-for="g in groups"
      :key="g.title"
      class="space-y-1.5"
    >
      <h3 class="text-sm font-black">
        {{ g.title }}
      </h3>
      <div class="ov-dig-card overflow-hidden rounded-2xl">
        <button
          v-for="l in g.lines"
          :key="l.key"
          type="button"
          class="ov-pb-row grid w-full grid-cols-[5.2rem_minmax(0,1fr)_6.4rem] items-center gap-2.5 px-3 py-2 text-left"
          :class="l.pb.ongoing ? `is-out is-${l.pb.ongoing.side}` : ''"
          @click="openKey = l.key"
        >
          <span class="min-w-0">
            <span class="block truncate text-[12px] font-bold">{{ l.name }}</span>
            <span class="font-mono text-lg font-black leading-none tabular-nums">{{ l.pb.current ?? '—' }}</span>
            <span
              v-if="status(l)"
              class="ml-1 text-[10px] font-bold"
              :class="status(l)!.warm ? 'text-[var(--ov-warm-ink)]' : 'text-[var(--ov-cool)]'"
            >{{ status(l)!.text }}</span>
          </span>
          <OverviewRankBar :rank="l.pb.rank" />
          <span class="text-right text-[10.5px] leading-snug text-[var(--ov-ink-soft)]">{{ note(l) }}</span>
        </button>
      </div>
    </section>

    <UDrawer
      v-model:open="drawerOpen"
      :ui="{ content: 'max-h-[90dvh]', body: 'overflow-y-auto' }"
    >
      <template #body>
        <OverviewDigPullbackDetail
          v-if="opened"
          :name="opened.name"
          :values="opened.values"
          :pb="opened.pb"
          :draws="draws"
        />
      </template>
    </UDrawer>
  </div>
</template>

<style scoped>
.ov-dig-card { background: var(--ov-card); border: 1px solid var(--ov-line); }
.ov-pb-row { position: relative; border-bottom: 1px solid var(--ov-line); transition: background 120ms ease; }
.ov-pb-row:last-child { border-bottom: none; }
.ov-pb-row:hover, .ov-pb-row:active { background: color-mix(in oklab, var(--ov-ink) 5%, transparent); }
.ov-pb-row.is-out::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--ov-warm); }
.ov-pb-row.is-low::before { background: var(--ov-cool); }
</style>
