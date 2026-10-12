<script setup lang="ts">
/**
 * 四種均值（2026-10-12 使用者：放在 /board，對照隔期、值、位置）。
 * 算法見 app/utils/wave.ts；目前的值大於均值 → 橘底粗體。
 * 位置 y 不用平均，改看次數（BoardYCounts）；值另外翻過來看盤面（BoardValueBoard）。
 */
import type { WaveRow, WaveResult } from '~/utils/wave'

defineProps<{
  wave: WaveResult | null
  loading: boolean
  errorMessage: string
}>()

const COLUMNS = ['5 個', '10 個', '15 個', '歷史']

const aboveCount = (r: WaveRow) => r.avgs.filter(a => a.above).length
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
      class="grid gap-6 lg:grid-cols-[1.3fr_1fr]"
    >
      <section>
        <h3 class="mb-1 text-sm font-semibold">
          隔期 0～19
        </h3>
        <p class="mb-2 text-xs text-muted">
          目前 = 這格已經幾期沒開出（還在加）；平均 = 這格往前已結束的數字
        </p>
        <div class="overflow-x-auto">
          <table class="wave-table">
            <thead>
              <tr>
                <th>隔期</th>
                <th>目前</th>
                <th
                  v-for="c in COLUMNS"
                  :key="c"
                >
                  {{ c }}
                </th>
                <th>高於幾種</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in wave.gap"
                :key="r.key"
              >
                <td>{{ r.key }}</td>
                <td class="font-semibold">
                  {{ r.current }}
                </td>
                <td
                  v-for="a in r.avgs"
                  :key="a.label"
                  :class="a.above ? 'is-above' : ''"
                >
                  {{ a.avg.toFixed(2) }}
                </td>
                <td :class="aboveCount(r) ? 'font-semibold' : 'text-muted'">
                  {{ aboveCount(r) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div class="space-y-6">
        <section
          v-for="part in [
            { title: '隔期（第 1～5 顆，小→大）', note: '目前 = 最新一期這顆的隔期；平均 = 這之前的期數', rows: wave.gapBall },
            { title: '值（第 1～5 顆，小→大）', note: '目前 = 最新一期這顆的值；平均 = 這之前的期數', rows: wave.value }
          ]"
          :key="part.title"
        >
          <h3 class="mb-1 text-sm font-semibold">
            {{ part.title }}
          </h3>
          <p class="mb-2 text-xs text-muted">
            {{ part.note }}
          </p>
          <div class="overflow-x-auto">
            <table class="wave-table">
              <thead>
                <tr>
                  <th>球</th>
                  <th>目前</th>
                  <th
                    v-for="c in COLUMNS"
                    :key="c"
                  >
                    {{ c }}
                  </th>
                  <th>高於幾種</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="r in part.rows"
                  :key="r.key"
                >
                  <td class="whitespace-nowrap">
                    {{ r.key }}
                  </td>
                  <td class="font-semibold">
                    {{ r.current }}
                  </td>
                  <td
                    v-for="a in r.avgs"
                    :key="a.label"
                    :class="a.above ? 'is-above' : ''"
                  >
                    {{ a.avg.toFixed(2) }}
                  </td>
                  <td :class="aboveCount(r) ? 'font-semibold' : 'text-muted'">
                    {{ aboveCount(r) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <BoardValueBoard :groups="wave.valueBoard" />
      </div>
      <BoardYCounts
        class="lg:col-span-2"
        :rows="wave.yCounts"
      />
    </div>
  </UCard>
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
  border-radius: 4px;
  background: var(--ui-bg-elevated);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.wave-table td:first-child {
  text-align: left;
  font-family: inherit;
}
.wave-table td.is-above,
.wave-legend {
  background: color-mix(in oklab, var(--drawn) 38%, var(--ui-bg));
  color: var(--ui-text-highlighted);
  font-weight: 700;
}
.wave-legend {
  padding: 0 4px;
  border-radius: 3px;
}
</style>
