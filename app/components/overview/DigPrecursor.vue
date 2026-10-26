<script setup lang="ts">
/**
 * 例外前兆：選一個盤面當目標（例：單雙，常見 3單／3雙、例外 4單～5雙），
 * 看「前一期是什麼盤面」時，下一期出例外的比例跟平常比。
 * 上半：這期的 13 個盤面各自對下一期的比例；下半：歷史上最容易／最不容易引出例外的前一期盤面。
 */
import { exceptionSplit, precursors, rateOf } from '~~/shared/lotto/overview/precursor'
import type { CoordSummary } from '~/composables/useOverview'

const props = defineProps<{ summaries: CoordSummary[] }>()

/** 前一期這個盤面出現少於這麼多次的，畫淡一點、不進排行 */
const MIN_N = 30
const TOP = 8
const BOTTOM = 5

const targets = computed(() => props.summaries.flatMap((s) => {
  const split = exceptionSplit(s.series.seq)
  return split ? [{ s, split }] : []
}))
const targetId = ref('oddEven')
const target = computed(() => targets.value.find(t => t.s.series.def.id === targetId.value) ?? targets.value[0] ?? null)
const result = computed(() => (target.value ? precursors(target.value.s.series, target.value.split, props.summaries.map(s => s.series)) : null))
const baseRate = computed(() => (result.value ? rateOf(result.value.base) : 0))
const defOf = (id: string) => props.summaries.find(s => s.series.def.id === id)!.series.def

const nowRows = computed(() => {
  const r = result.value
  if (!r) return []
  return props.summaries.flatMap((s) => {
    const state = s.series.seq.at(-1)
    const row = state == null ? null : r.rows.find(x => x.coordId === s.series.def.id && x.state === state)
    return row ? [row] : []
  }).sort((a, b) => Number(b.n >= MIN_N) - Number(a.n >= MIN_N) || rateOf(b) - rateOf(a))
})
const ranked = computed(() => (result.value?.rows ?? []).filter(r => r.n >= MIN_N).sort((a, b) => rateOf(b) - rateOf(a)))
const top = computed(() => ranked.value.slice(0, TOP))
const bottom = computed(() => ranked.value.slice(-BOTTOM).reverse())
const aboveNow = computed(() => nowRows.value.filter(r => r.n >= MIN_N && rateOf(r) > baseRate.value).length)
/** 條的一半代表差多少：取畫面上差最多的那列，至少 5 個百分點 */
const span = computed(() => 1.1 * Math.max(0.05, ...[...nowRows.value.filter(r => r.n >= MIN_N), ...top.value, ...bottom.value].map(r => Math.abs(rateOf(r) - baseRate.value))))
const pctOf = (x: number) => `${Math.round(x * 100)}%`
</script>

<template>
  <div class="space-y-4">
    <div class="ov-dig-card space-y-2 rounded-2xl p-3">
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="text-[11px] text-[var(--ov-ink-soft)]">看哪個盤面的例外</span>
        <select
          v-model="targetId"
          class="ov-select"
        >
          <option
            v-for="t in targets"
            :key="t.s.series.def.id"
            :value="t.s.series.def.id"
          >
            {{ t.s.series.def.name }}
          </option>
        </select>
      </div>
      <div
        v-if="target"
        class="flex flex-wrap items-center gap-1.5 text-[11px]"
      >
        <span class="text-[var(--ov-ink-soft)]">常見</span>
        <OverviewStateView
          v-for="st in target.split.common"
          :key="st"
          :def="target.s.series.def"
          :state="st"
          size="xs"
        />
        <span class="ml-1 text-[var(--ov-ink-soft)]">其他 {{ target.split.rare.length }} 種算例外，平常每期 <b class="text-[var(--ov-ink)]">{{ pctOf(baseRate) }}</b></span>
      </div>
    </div>

    <template v-if="result && target">
      <section class="space-y-1.5">
        <h3 class="text-sm font-black">
          這期的盤面 → 下一期出例外
          <span class="ml-1 text-[11px] font-normal text-[var(--ov-ink-soft)]">{{ aboveNow }} 項比平常高</span>
        </h3>
        <div class="ov-dig-card overflow-hidden rounded-2xl">
          <OverviewDigPreRow
            v-for="r in nowRows"
            :key="r.coordId"
            :row="r"
            :def="defOf(r.coordId)"
            :base-rate="baseRate"
            :span="span"
            :thin="r.n < MIN_N"
          />
        </div>
        <p class="text-[11px] text-[var(--ov-ink-soft)]">
          中間黑線 = 平常 {{ pctOf(baseRate) }}，往右橘色 = 比平常高、往左藍色 = 比平常低。淡色的列：以前這個盤面出現不到 {{ MIN_N }} 次。
        </p>
      </section>

      <section
        v-for="block in [{ title: '最容易引出例外的前一期盤面', rows: top }, { title: '最不容易的', rows: bottom }]"
        :key="block.title"
        class="space-y-1.5"
      >
        <h3 class="text-sm font-black">
          {{ block.title }}
          <span class="ml-1 text-[11px] font-normal text-[var(--ov-ink-soft)]">出現 ≥ {{ MIN_N }} 次的</span>
        </h3>
        <div class="ov-dig-card overflow-hidden rounded-2xl">
          <OverviewDigPreRow
            v-for="r in block.rows"
            :key="`${r.coordId}-${r.state}`"
            :row="r"
            :def="defOf(r.coordId)"
            :base-rate="baseRate"
            :span="span"
          />
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.ov-dig-card { background: var(--ov-card); border: 1px solid var(--ov-line); }
</style>
