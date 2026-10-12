<script setup lang="ts">
/**
 * 四種均值（2026-10-12 使用者：放在 /board，對照隔期、值、位置）。
 * 算法見 app/utils/wave.ts、wave-series.ts；目前的值大於均值 → 橘底粗體。
 * - 每列可輸入預期的下一個數字，平均即時改成加進去之後的值（BoardWaveTable）。
 * - 點一列 → 畫這一列過去每一期的目前值與四種平均（BoardWaveTrend）。
 * - 位置 y 不用平均，改看次數（BoardYCounts）；值另外翻過來看盤面（BoardValueBoard）。
 */
import { waveFromContext, type WaveContext } from '~/utils/wave'
import { trendOf, type WaveSeries } from '~/utils/wave-series'

const props = defineProps<{
  ctx: WaveContext | null
  loading: boolean
  errorMessage: string
}>()

const wave = computed(() => (props.ctx ? waveFromContext(props.ctx) : null))

const TABLES = [
  { id: 'gap', title: '隔期 0～19', keyLabel: '隔期', note: '目前 = 這格已經幾期沒開出（還在加）；平均 = 這格往前已結束的數字' },
  { id: 'gapBall', title: '隔期（第 1～5 顆，小→大）', keyLabel: '球', note: '目前 = 最新一期這顆的隔期；平均 = 這之前的期數' },
  { id: 'value', title: '值（第 1～5 顆，小→大）', keyLabel: '球', note: '目前 = 最新一期這顆的值；平均 = 這之前的期數' }
] as const
type TableId = typeof TABLES[number]['id']

/** 列代號（表:鍵）→ 輸入的預期數字 */
const expected = ref<Record<string, string>>({})
const selectedId = ref<string>('gap:0')

const trendRange = ref(50)
const trendOptions = [
  { label: '近 30 期', value: 30 },
  { label: '近 50 期', value: 50 },
  { label: '近 100 期', value: 100 },
  { label: '近 200 期', value: 200 }
]

const selected = computed<{ table: typeof TABLES[number], series: WaveSeries } | null>(() => {
  if (!props.ctx) return null
  const [tableId, key] = selectedId.value.split(':') as [TableId, string]
  const table = TABLES.find(t => t.id === tableId)
  const series = props.ctx[tableId]?.find(s => s.key === key)
  return table && series ? { table, series } : null
})

const trendPoints = computed(() => {
  if (!props.ctx || !selected.value) return []
  const last = props.ctx.draws.length - 1
  return trendOf(selected.value.series, last - trendRange.value + 1, last)
})

const trendTitle = computed(() => {
  const s = selected.value
  if (!s) return ''
  return s.table.id === 'gap' ? `隔期 ${s.series.key} 的走勢` : `${s.table.title.replace(/（.*$/, '')}・${s.series.key} 的走勢`
})

const issueOf = (t: number) => String(props.ctx?.draws[t]?.drawTerm ?? '')
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">
        四種均值
        <span
          v-if="wave"
          class="ml-1 text-sm font-normal text-muted"
        >第 {{ wave.issue }} 期（{{ wave.date }}）開完的盤面</span>
      </h2>
      <p class="text-xs text-muted">
        隔期、值：每一列的「目前」跟它往前 5、10、15 個數字的平均、還有歷史平均比。
        <span class="wave-legend">橘底粗體</span> = 目前的值比這個平均大。
        歷史 = 2007 年第 101 期之後全部。
        最後一欄輸入你預期的下一個數字，平均下面會顯示加進去之後變多少（<span class="pred-legend">橘框</span> = 你輸入的數字比加進去後的平均大）。
        點任一列，下方畫出它過去每一期的走勢。
      </p>
    </template>

    <div
      v-if="loading"
      class="py-6 text-center text-sm text-muted"
    >
      計算中…
    </div>
    <p
      v-else-if="errorMessage"
      class="text-sm text-error"
    >
      {{ errorMessage }}
    </p>
    <div
      v-else-if="wave"
      class="grid grid-cols-[minmax(0,1fr)] gap-6 *:min-w-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
    >
      <BoardWaveTable
        v-model:expected="expected"
        :title="TABLES[0].title"
        :note="TABLES[0].note"
        :key-label="TABLES[0].keyLabel"
        table-id="gap"
        :rows="wave.gap"
        :selected-id="selectedId"
        @select="selectedId = $event"
      />
      <div class="space-y-6">
        <BoardWaveTable
          v-model:expected="expected"
          :title="TABLES[1].title"
          :note="TABLES[1].note"
          :key-label="TABLES[1].keyLabel"
          table-id="gapBall"
          :rows="wave.gapBall"
          :selected-id="selectedId"
          @select="selectedId = $event"
        />
        <BoardWaveTable
          v-model:expected="expected"
          :title="TABLES[2].title"
          :note="TABLES[2].note"
          :key-label="TABLES[2].keyLabel"
          table-id="value"
          :rows="wave.value"
          :selected-id="selectedId"
          @select="selectedId = $event"
        />
      </div>

      <section
        v-if="selected"
        class="lg:col-span-2"
      >
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold">
            走勢：點上面任一列切換
          </h3>
          <USelect
            v-model="trendRange"
            :items="trendOptions"
            size="sm"
            class="w-28"
          />
        </div>
        <BoardWaveTrend
          :title="trendTitle"
          :points="trendPoints"
          :issue-of="issueOf"
          :open="selected.series.open"
        />
      </section>

      <BoardValueBoard :groups="wave.valueBoard" />
      <BoardYCounts
        class="lg:col-span-2"
        :rows="wave.yCounts"
      />
    </div>
  </UCard>
</template>

<style scoped>
.wave-legend {
  padding: 0 4px;
  border-radius: 3px;
  background: color-mix(in oklab, var(--drawn) 38%, var(--ui-bg));
  color: var(--ui-text-highlighted);
  font-weight: 700;
}
.pred-legend {
  padding: 0 4px;
  border-radius: 3px;
  box-shadow: inset 0 0 0 1.5px var(--drawn);
  color: var(--ui-text-highlighted);
}
</style>
