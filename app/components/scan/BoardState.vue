<script setup lang="ts">
/** 隔期狀態：四段整段加總、20 以上的值 vs 近期開過的值、剩幾顆時下一期的查找表、五顆隔期配置 */
import { CONFIG_NORM } from '~~/shared/lotto/scan/scan'
import type { ScanView } from '~~/shared/lotto/scan/view'

const props = defineProps<{ view: ScanView }>()
const recentN = defineModel<number>('recentN', { required: true })

const recentOptions = [
  { label: '近 10 期', value: 10 },
  { label: '近 20 期', value: 20 },
  { label: '近 50 期', value: 50 }
]

const b = computed(() => props.view.board)
const farTotal = computed(() => b.value.farTable.reduce((a, r) => ({ n: a.n + r.n, hit: a.hit + r.hit }), { n: 0, hit: 0 }))

const CONFIG_ROWS = [
  { key: 'low', label: '隔期 0～5', norm: CONFIG_NORM.low },
  { key: 'mid', label: '隔期 6～9', norm: CONFIG_NORM.mid },
  { key: 'high', label: '隔期 10 以上', norm: CONFIG_NORM.high }
] as const
const inNorm = (v: number, norm: readonly [number, number]) => v >= norm[0] && v <= norm[1]
</script>

<template>
  <UCard id="board">
    <template #header>
      <h2 class="font-semibold">
        隔期狀態（第 {{ view.draw.issue }} 期開完的盤面）
      </h2>
      <p class="text-xs text-muted">
        每一格 = 某一期開出、到現在還沒再開的號碼。「隔 k」= 已隔 k 期；「值」= 這一格已連續幾期沒有號碼被開走。顆數是整段加總。
      </p>
    </template>

    <div class="space-y-6">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div
          v-for="(bk, i) in b.buckets"
          :key="bk.key"
          class="rounded-lg p-3"
          :class="i === 3 ? 'bg-elevated ring-1 ring-primary/40' : 'bg-elevated/60'"
        >
          <div class="flex items-baseline justify-between">
            <span class="text-sm font-medium">隔期 {{ bk.label }}</span>
            <span class="font-mono text-2xl font-semibold">{{ bk.count }}<span class="ml-0.5 text-xs font-normal text-muted">顆</span></span>
          </div>
          <div class="mt-2 space-y-1.5">
            <div
              v-for="sl in bk.slots"
              :key="sl.gap"
              class="flex items-center gap-2"
            >
              <span class="w-16 shrink-0 font-mono text-[11px] text-muted">隔{{ sl.gap }}・值{{ sl.value }}</span>
              <span class="flex flex-wrap gap-1">
                <ScanBall
                  v-for="n in sl.nums"
                  :key="n"
                  :n="n"
                  size="sm"
                />
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold">
            20 以上的值，近期有沒有開過這麼大的值
          </h3>
          <USelect
            v-model="recentN"
            :items="recentOptions"
            size="sm"
            class="w-28"
          />
        </div>
        <ul
          v-if="b.farNums.length"
          class="space-y-1.5 text-sm"
        >
          <li
            v-for="f in b.farNums"
            :key="f.num"
            class="flex flex-wrap items-center gap-2"
          >
            <ScanBall
              :n="f.num"
              size="sm"
            />
            <span class="font-mono text-xs text-muted">隔 {{ f.gap }}・值 {{ f.value }}</span>
            <span>近 {{ b.recentN }} 期開出值 ≥ {{ f.value }}：<b class="font-mono">{{ f.atLeast }}</b> 次</span>
            <span
              v-if="f.latest"
              class="text-xs text-muted"
            >最近一次第 {{ f.latest.issue }} 期 {{ scanPad2(f.latest.num) }}（值 {{ f.latest.value }}）</span>
          </li>
        </ul>
        <p
          v-else
          class="text-sm text-muted"
        >
          目前 20 以上沒有號碼。
        </p>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>近 {{ b.recentN }} 期開出的最大值：</span>
          <span
            v-for="r in b.recentTop"
            :key="`${r.s}-${r.num}`"
            class="font-mono"
          >{{ r.value }}<span class="text-dimmed">（{{ scanShortIssue(r.issue) }}・{{ scanPad2(r.num) }}）</span></span>
        </div>
      </div>

      <div class="space-y-2">
        <h3 class="text-sm font-semibold">
          20 以上剩幾顆時，下一期有沒有開出隔期 20 以上
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full min-w-80 text-sm">
            <thead class="text-xs text-muted">
              <tr class="border-b border-default">
                <th class="py-1.5 text-left font-normal">
                  20 以上剩
                </th>
                <th class="py-1.5 text-left font-normal">
                  出現過
                </th>
                <th class="py-1.5 text-left font-normal">
                  下一期開出 20 以上
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in b.farTable"
                :key="r.count"
                class="border-b border-default/60"
                :class="r.count === Math.min(6, b.farNow) ? 'bg-primary/10 font-medium' : ''"
              >
                <td class="py-1.5 font-mono">
                  {{ r.count }}{{ r.count === 6 ? '+' : '' }} 顆{{ r.count === Math.min(6, b.farNow) ? ' ← 現在' : '' }}
                </td>
                <td class="py-1.5 font-mono">
                  {{ r.n }} 期
                </td>
                <td class="py-1.5">
                  <ScanRate :rate="{ hit: r.hit, n: r.n }" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-xs text-muted">
          不分剩幾顆，下一期開出隔期 20 以上的平常比例：{{ scanPct(farTotal) }}（{{ farTotal.hit }}/{{ farTotal.n }}）。
        </p>
      </div>

      <div class="space-y-2">
        <h3 class="text-sm font-semibold">
          五顆隔期配置（本期：0～5 有 {{ b.config.low }}、6～9 有 {{ b.config.mid }}、10 以上 {{ b.config.high }}）
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full min-w-96 text-sm">
            <thead class="text-xs text-muted">
              <tr class="border-b border-default">
                <th class="py-1.5 text-left font-normal">
                  每期開出幾顆
                </th>
                <th
                  v-for="k in 6"
                  :key="k"
                  class="py-1.5 text-center font-normal"
                >
                  {{ k - 1 }} 顆
                </th>
                <th class="py-1.5 text-left font-normal">
                  你說的多數
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in CONFIG_ROWS"
                :key="row.key"
                class="border-b border-default/60"
              >
                <td class="py-1.5">
                  {{ row.label }}
                </td>
                <td
                  v-for="k in 6"
                  :key="k"
                  class="py-1.5 text-center font-mono"
                  :class="[
                    inNorm(k - 1, row.norm) ? 'bg-primary/10' : '',
                    b.config[row.key] === k - 1 ? 'font-bold text-highlighted underline underline-offset-4' : 'text-toned'
                  ]"
                >
                  {{ scanPct({ hit: b.dist[row.key][k - 1] ?? 0, n: view.idx.length }) }}
                </td>
                <td class="py-1.5">
                  <ScanRate :rate="b.normRates[row.key]" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-xs text-muted">
          底色 = 你說的「絕大多數」範圍；底線 = 本期。三項同時符合：<ScanRate :rate="b.normRates.all" />
        </p>
      </div>
    </div>
  </UCard>
</template>
