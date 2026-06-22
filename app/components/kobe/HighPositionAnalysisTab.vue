<script setup lang="ts">
/**
 * /kobe Tab 8 「高位來源」
 *
 * 統計：開出的號碼中、位置 > 10 (位置 11+) 的、來自哪些隔期、各隔期內佔比。
 *
 * 規格（使用者拍板）：
 *   Q1：放 kobe 內 tab
 *   Q2：每個隔期縱向佔比（位置 > 10 / 該隔期總開出）
 *   Q3：全 2000 期統計範圍
 *   Q4：只列「位置 > 10 出現過的隔期」(highPositionHits > 0)
 */
import type { PerDrawSnapshot, HighPositionDistRow } from '~/utils/kobe-stats'
import { buildHighPositionDistribution } from '~/utils/kobe-stats'

interface Props { snapshots: PerDrawSnapshot[] }
const props = defineProps<Props>()

const rows = computed<HighPositionDistRow[]>(() =>
  [...buildHighPositionDistribution(props.snapshots)].sort((a, b) => b.ratio - a.ratio)
)

const maxRatio = computed(() => {
  let m = 0
  for (const r of rows.value) if (r.ratio > m) m = r.ratio
  return m
})

const totalDraws = computed(() => Math.max(0, props.snapshots.length - 1))

const overallStats = computed(() => {
  let totalH = 0
  let highH = 0
  for (const r of rows.value) {
    totalH += r.totalHits
    highH += r.highPositionHits
  }
  return { totalH, highH, ratio: totalH > 0 ? highH / totalH : 0 }
})

function fmtPct(v: number): string {
  const pct = v * 100
  if (Math.abs(pct) >= 10) return `${pct.toFixed(1)}%`
  return `${pct.toFixed(2)}%`
}

function barWidth(ratio: number): string {
  if (maxRatio.value <= 0) return '0%'
  return `${(ratio / maxRatio.value) * 100}%`
}

function rowColor(r: HighPositionDistRow): string {
  if (r.ratio >= 0.4) return 'bg-emerald-500/70'
  if (r.ratio >= 0.3) return 'bg-emerald-500/55'
  if (r.ratio >= 0.2) return 'bg-emerald-500/35'
  if (r.ratio >= 0.1) return 'bg-emerald-500/20'
  return 'bg-emerald-500/10'
}
</script>

<template>
  <div class="space-y-4">
    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="位置 > 10 來源隔期分布"
      :description="`統計範圍：全 ${totalDraws} 期。位置 > 10 = 在該隔期 pre-T sorted 序列中、位置 11 或以上。只列「曾經有位置 > 10 命中」的隔期、依該隔期內位置 > 10 佔比 (ratio) 由高到低排序。`"
    />

    <!-- 整體統計卡 -->
    <UCard :ui="{ body: 'p-4' }">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div class="space-y-1">
          <div class="text-xs text-muted">
            全期累計開出顆數
          </div>
          <div class="font-mono text-lg tabular-nums">
            {{ overallStats.totalH }}
          </div>
        </div>
        <div class="space-y-1">
          <div class="text-xs text-muted">
            位置 &gt; 10 累計開出
          </div>
          <div class="font-mono text-lg tabular-nums text-emerald-600 dark:text-emerald-400">
            {{ overallStats.highH }}
          </div>
        </div>
        <div class="space-y-1">
          <div class="text-xs text-muted">
            整體佔比
          </div>
          <div class="font-mono text-lg tabular-nums">
            {{ fmtPct(overallStats.ratio) }}
          </div>
        </div>
      </div>
    </UCard>

    <!-- 分布表 -->
    <section class="space-y-2">
      <header>
        <h3 class="text-base font-semibold">
          各隔期 · 位置 &gt; 10 佔比
        </h3>
        <p class="text-xs text-muted">
          佔比 = 該隔期位置 &gt; 10 開出顆數 / 該隔期總開出顆數。曝光期數 = 該隔期 pre-T 剩餘 ≥ 11 顆的期數
          （位置 11+ 才有機會出現）。共 {{ rows.length }} 個有資料的隔期。
        </p>
      </header>

      <div class="overflow-x-auto rounded-md border border-default">
        <table class="min-w-max w-full text-[11px]">
          <thead>
            <tr class="border-b border-default text-muted">
              <th class="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                隔期
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                歷史最大剩餘
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                曝光期數
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                該隔期總開出
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                位置 &gt; 10 開出
              </th>
              <th class="px-2 py-1.5 text-left font-medium whitespace-nowrap min-w-[200px]">
                佔比
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in rows"
              :key="`hpos-${r.interval}`"
              class="border-b border-default/60"
            >
              <td class="px-2 py-1 font-mono whitespace-nowrap font-semibold">
                隔期 {{ r.interval }}
              </td>
              <td class="px-2 py-1 text-right font-mono tabular-nums text-muted">
                {{ r.maxRemaining }}
              </td>
              <td class="px-2 py-1 text-right font-mono tabular-nums text-muted">
                {{ r.exposureCount }}
              </td>
              <td class="px-2 py-1 text-right font-mono tabular-nums">
                {{ r.totalHits }}
              </td>
              <td class="px-2 py-1 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {{ r.highPositionHits }}
              </td>
              <td class="px-2 py-1">
                <div class="flex items-center gap-2">
                  <div class="relative flex-1 h-3 bg-elevated rounded overflow-hidden min-w-[80px]">
                    <div
                      class="absolute inset-y-0 left-0 rounded"
                      :class="rowColor(r)"
                      :style="{ width: barWidth(r.ratio) }"
                    />
                  </div>
                  <span class="font-mono tabular-nums w-14 text-right">
                    {{ fmtPct(r.ratio) }}
                  </span>
                </div>
              </td>
            </tr>
            <tr v-if="rows.length === 0">
              <td
                colspan="6"
                class="px-3 py-3 text-center text-muted"
              >
                尚無位置 &gt; 10 命中紀錄
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
