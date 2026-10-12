<script setup lang="ts">
/**
 * 四種均值的一張表（隔期 0～19、隔期／值 第 1～5 顆共用）。
 * - 目前的值大於平均 → 橘底粗體。
 * - 最後一欄輸入「下一期開完後的目前值」→ 目前與四個平均下面即時顯示下一期會變成怎樣（predictNext）。
 *   隔期格：0 = 下一期從這格開出；比目前大 1 以上 = 還沒開出。
 * - 點一列或在那一列輸入 → 上層畫這一列的走勢（輸入的預期會畫成最右邊的「下期」）。
 */
import type { WaveRow } from '~/utils/wave'
import { predictNext } from '~/utils/wave-series'

const props = defineProps<{
  title: string
  note: string
  keyLabel: string
  /** 這張表的代號（走勢與輸入用，例：gap、gapBall、value） */
  tableId: string
  rows: WaveRow[]
  selectedId: string | null
}>()

const emit = defineEmits<{ select: [id: string] }>()

/** 列代號 → 輸入的預期數字（字串，空白 = 沒輸入） */
const expected = defineModel<Record<string, string>>('expected', { required: true })

const COLUMNS = ['5 個', '10 個', '15 個', '歷史']

const rowId = (r: WaveRow) => `${props.tableId}:${r.key}`
const aboveCount = (r: WaveRow) => r.avgs.filter(a => a.above).length

function setExpected(r: WaveRow, value: string) {
  expected.value = { ...expected.value, [rowId(r)]: value }
  // 輸入哪一列，走勢圖就切到那一列
  emit('select', rowId(r))
}

interface Prediction {
  next: { current: number, avgs: number[] } | null
}

const predictions = computed(() => new Map(props.rows.map((r): [string, Prediction | null] => {
  const raw = (expected.value[rowId(r)] ?? '').trim()
  if (raw === '') return [r.key, null]
  return [r.key, { next: predictNext(r.open, r.current, r.recent, r.histSum, r.histCount, Number(raw)) }]
})))

const fmtDelta = (d: number) => (Math.abs(d) < 0.005 ? '不變' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}`)
</script>

<template>
  <section>
    <h3 class="mb-1 text-sm font-semibold">
      {{ title }}
    </h3>
    <p class="mb-2 text-xs text-muted">
      {{ note }}
    </p>
    <div class="overflow-x-auto">
      <table class="wave-table">
        <thead>
          <tr>
            <th>{{ keyLabel }}</th>
            <th>目前</th>
            <th
              v-for="c in COLUMNS"
              :key="c"
            >
              {{ c }}
            </th>
            <th>高於</th>
            <th>下一期目前</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="r.key"
            class="wave-row"
            :class="selectedId === rowId(r) ? 'is-selected' : ''"
            :title="`點一下看「${title.replace(/（.*$/, '')} ${r.key}」的走勢`"
            @click="emit('select', rowId(r))"
          >
            <td class="whitespace-nowrap">
              {{ r.key }}
            </td>
            <td class="font-semibold">
              <div>{{ r.current }}</div>
              <div
                v-if="predictions.get(r.key)?.next"
                class="wave-pred"
              >
                → {{ predictions.get(r.key)!.next!.current }}
              </div>
            </td>
            <td
              v-for="(a, k) in r.avgs"
              :key="a.label"
              :class="a.above ? 'is-above' : ''"
            >
              <div>{{ a.avg.toFixed(2) }}</div>
              <div
                v-if="predictions.get(r.key)?.next"
                class="wave-pred"
                :class="predictions.get(r.key)!.next!.current > predictions.get(r.key)!.next!.avgs[k]! ? 'pred-above' : ''"
              >
                → {{ predictions.get(r.key)!.next!.avgs[k]!.toFixed(2) }}
                <span class="wave-delta">{{ fmtDelta(predictions.get(r.key)!.next!.avgs[k]! - a.avg) }}</span>
              </div>
            </td>
            <td :class="aboveCount(r) ? 'font-semibold' : 'text-muted'">
              {{ aboveCount(r) }}
            </td>
            <td
              class="wave-input-cell"
              @click.stop
            >
              <input
                type="number"
                inputmode="numeric"
                min="0"
                step="1"
                class="wave-input"
                :aria-label="`${r.key} 下一期開完後的目前值`"
                placeholder="輸入"
                :value="expected[rowId(r)] ?? ''"
                @input="setExpected(r, ($event.target as HTMLInputElement).value)"
              >
              <div
                v-if="predictions.get(r.key) && !predictions.get(r.key)!.next"
                class="mt-0.5 text-[10px] leading-tight text-error"
              >
                {{ r.open ? `0＝開出；${r.current + 1} 以上＝沒開` : '要 0 以上的整數' }}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.wave-table {
  border-collapse: separate;
  border-spacing: 2px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.wave-table th {
  padding: 2px 6px;
  font-weight: 500;
  color: var(--ui-text-muted);
  white-space: nowrap;
}
.wave-table td {
  padding: 3px 8px;
  text-align: right;
  vertical-align: top;
  border-radius: 4px;
  background: var(--ui-bg-elevated);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.wave-table td:first-child {
  text-align: left;
  font-family: inherit;
}
.wave-row { cursor: pointer; }
.wave-row:hover td:first-child { color: var(--ui-text-highlighted); font-weight: 600; }
.wave-row.is-selected td:first-child {
  box-shadow: inset 3px 0 0 var(--ui-text-highlighted);
  color: var(--ui-text-highlighted);
  font-weight: 700;
}
.wave-table td.is-above {
  background: color-mix(in oklab, var(--drawn) 38%, var(--ui-bg));
  color: var(--ui-text-highlighted);
  font-weight: 700;
}
.wave-pred {
  margin-top: 2px;
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
  color: var(--ui-text-toned);
}
.wave-pred.pred-above {
  border-radius: 3px;
  padding: 0 3px;
  box-shadow: inset 0 0 0 1.5px var(--drawn);
  color: var(--ui-text-highlighted);
  font-weight: 700;
}
.wave-delta { color: var(--ui-text-muted); }
.wave-input-cell {
  background: transparent !important;
  cursor: default;
}
.wave-input {
  width: 3.6rem;
  border: 1px solid var(--ui-border-accented);
  border-radius: 4px;
  padding: 1px 4px;
  background: var(--ui-bg);
  color: var(--ui-text-highlighted);
  text-align: right;
}
.wave-input:focus { outline: 2px solid var(--drawn); outline-offset: 0; }
</style>
