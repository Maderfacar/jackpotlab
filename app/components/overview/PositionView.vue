<script setup lang="ts">
/**
 * 位置波段畫面：第 1～5 顆（由小到大）各一列，切換看隔期或值、比最近幾期。
 * 每列：目前數字＋檔位｜最近 30 期波形＋相似波形引出的扇形｜下一期最常落在哪檔。點一列看詳細。
 */
import type { PlainDraw } from '~~/shared/lotto/history-file'
import type { DrawFeatures } from '~~/shared/lotto/patterns/features'
import { BUCKETS, bucketOf, positionStats, positionValues, similar, type PosKind } from '~~/shared/lotto/overview/position'
import { pct } from '~/utils/overview-format'

const props = defineProps<{
  draws: PlainDraw[]
  feats: DrawFeatures[]
}>()

const WINDOW = 30
const L_OPTIONS = [2, 3, 4, 5, 6, 8]

const kind = ref<PosKind>('gap')
const L = ref(3)
const openPos = ref<number | null>(null)

const KIND_TABS = [
  { label: '看隔期', value: 'gap' },
  { label: '看值', value: 'value' }
]

const rows = computed(() => positionValues(props.feats, kind.value).map((values, p) => {
  const stats = positionStats(values)
  const sim = similar(values, kind.value, L.value)
  const best = sim && sim.nextCount ? sim.nextBuckets.indexOf(Math.max(...sim.nextBuckets)) : -1
  return { p, values, stats, sim, best, window: values.slice(-WINDOW) }
}))
const bucketLabel = (v: number | null) => (v == null ? '—' : BUCKETS[kind.value][bucketOf(kind.value, v)]!.label)
const opened = computed(() => (openPos.value == null ? null : rows.value[openPos.value] ?? null))
const drawerOpen = computed({
  get: () => openPos.value != null,
  set: (v) => {
    if (!v) openPos.value = null
  }
})
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="ov-seg-group">
        <button
          v-for="t in KIND_TABS"
          :key="t.value"
          type="button"
          :class="{ 'is-on': kind === t.value }"
          @click="kind = t.value as PosKind"
        >
          {{ t.label }}
        </button>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-[11px] text-[var(--ov-ink-soft)]">比最近</span>
        <div class="ov-seg-group is-small">
          <button
            v-for="n in L_OPTIONS"
            :key="n"
            type="button"
            :class="{ 'is-on': L === n }"
            @click="L = n"
          >
            {{ n }}
          </button>
        </div>
        <span class="text-[11px] text-[var(--ov-ink-soft)]">期</span>
      </div>
    </div>

    <p class="text-[11px] leading-snug text-[var(--ov-ink-soft)]">
      檔位：{{ BUCKETS[kind].map(b => b.label).join('｜') }}。藍帶＝這個位置歷史上大部分落的範圍；右邊橘色扇形＝以前最近 {{ L }} 期檔位一樣時，之後 3 期的走向。
    </p>

    <ul class="space-y-2">
      <li
        v-for="r in rows"
        :key="r.p"
      >
        <button
          type="button"
          class="ov-pos-row grid w-full grid-cols-[3.4rem_minmax(0,1fr)_4.6rem] items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left"
          @click="openPos = r.p"
        >
          <span class="flex flex-col">
            <span class="text-[10.5px] font-semibold text-[var(--ov-ink-soft)]">第 {{ r.p + 1 }} 顆</span>
            <span class="font-mono text-[26px] font-black leading-none tabular-nums">{{ r.stats.current ?? '—' }}</span>
            <span class="mt-0.5 whitespace-nowrap text-[10px] text-[var(--ov-ink-soft)] tabular-nums">{{ bucketLabel(r.stats.current) }}・均{{ r.stats.avgs[0]?.toFixed(1) ?? '—' }}</span>
          </span>
          <OverviewPosChart
            :values="r.window"
            :kind="kind"
            :band="r.stats.band"
            :fan="r.sim?.fan ?? []"
            :height="62"
          />
          <span class="flex flex-col items-end gap-0.5 text-right">
            <template v-if="r.sim && r.sim.nextCount">
              <span class="whitespace-nowrap text-[10px] text-[var(--ov-ink-soft)]">相似 {{ r.sim.hits.length }} 次</span>
              <span class="whitespace-nowrap text-[10px] text-[var(--ov-ink-soft)]">下一期最常</span>
              <span class="ov-next-chip">{{ BUCKETS[kind][r.best]!.label }}</span>
              <span class="text-[11px] font-bold tabular-nums">{{ pct(r.sim.nextBuckets[r.best]!, r.sim.nextCount) }}%</span>
            </template>
            <template v-else>
              <span class="text-[10px] text-[var(--ov-ink-soft)]">這種波形</span>
              <span class="text-sm font-black text-[var(--ov-warm-ink)]">第一次</span>
              <span class="text-[10px] text-[var(--ov-ink-soft)]">試試比少一點</span>
            </template>
          </span>
        </button>
      </li>
    </ul>

    <UDrawer
      v-model:open="drawerOpen"
      :ui="{ content: 'max-h-[90dvh]', body: 'overflow-y-auto' }"
    >
      <template #body>
        <OverviewPositionDetail
          v-if="opened"
          :draws="draws"
          :pos="opened.p"
          :kind="kind"
          :values="opened.values"
          :stats="opened.stats"
          :l="L"
          @update:l="L = $event"
        />
      </template>
    </UDrawer>
  </div>
</template>

<style scoped>
.ov-pos-row {
  background: var(--ov-card);
  border: 1px solid var(--ov-line);
  transition: transform 150ms ease, border-color 150ms ease;
}
.ov-pos-row:hover { border-color: var(--ov-ink-soft); }
.ov-pos-row:active { transform: scale(0.99); }
.ov-next-chip {
  border-radius: 0.4rem;
  background: var(--ov-warm);
  color: var(--ov-ink-on);
  padding: 0.05rem 0.45rem;
  font-size: 0.95rem;
  font-weight: 800;
}
</style>
