<script setup lang="ts">
/**
 * 賓果海尼根歷史分析 /bingo-heineken-stats
 *
 * 跑當前 brain state 內 scorecard.recentFirings + drawsAsc 的全壘打 evidence、
 * 對每隔期分別統計：
 *   - 樣本數 / 長期 mean / std
 *   - rolling mean std（N=5/10/20/30 窗口）
 *   - 熱期 / 冷期平均長度（mean ± 1σ）
 *   - rate 落在 1σ band 內外的分布
 *
 * 目的：給使用者實測數字決定「紅綠藍閾值」與「窗口大小」、不要再憑感覺猜。
 */

import { useHindsight } from '~/composables/useHindsight'
import { computeHomeRunEvidence } from '~/hindsight/home-run-evidence'
import { analyzeIntervalStats, type IntervalStats } from '~/hindsight/home-run-stats'
import { slotCountForOriginDistribution } from '~/hindsight/signals/bingo-origin-distribution'

definePageMeta({
  title: '賓果海尼根歷史分析'
})

const gameId = ref<'bingo_bingo'>('bingo_bingo')

const {
  loading,
  error,
  drawsAsc,
  brainState,
  refresh
} = useHindsight(gameId)

const slotCount = computed(() => slotCountForOriginDistribution(gameId.value))

const stats = computed<IntervalStats[]>(() => {
  const evidence = computeHomeRunEvidence(gameId.value, brainState.value, drawsAsc.value)
  return analyzeIntervalStats(evidence, slotCount.value)
})

const totalSampleN = computed<number>(() => {
  return stats.value.reduce((max, s) => Math.max(max, s.n), 0)
})

function pct(r: number | null, digits = 1): string {
  if (r == null) return '—'
  return `${(r * 100).toFixed(digits)}%`
}

function num(v: number | null, digits = 2): string {
  if (v == null) return '—'
  return v.toFixed(digits)
}

function bandPct(count: number, total: number): string {
  if (total === 0) return '—'
  return `${count} (${((count / total) * 100).toFixed(0)}%)`
}

/**
 * 推薦閾值：mean ± 1σ rounded to 1 decimal percent。
 * 用「該隔期自己的 mean / std」給每個隔期分別的建議邊界。
 */
function suggestedThreshold(s: IntervalStats, k: number): string {
  if (s.mean == null || s.std == null) return '—'
  const low = (s.mean - k * s.std) * 100
  const high = (s.mean + k * s.std) * 100
  return `${low.toFixed(1)}% / ${high.toFixed(1)}%`
}

/**
 * 給每個隔期推薦窗口：找 rolling std ≈ 1/3 單期 std 的最小 N（noise 降到 1/3 就夠用）。
 */
function suggestedWindow(s: IntervalStats): string {
  if (s.std == null) return '—'
  const target = s.std / 3
  const candidates: Array<[number, number | null]> = [
    [5, s.rollingStd5],
    [10, s.rollingStd10],
    [20, s.rollingStd20],
    [30, s.rollingStd30]
  ]
  for (const [n, rs] of candidates) {
    if (rs != null && rs <= target) return `N=${n}`
  }
  return '> 30'
}
</script>

<template>
  <UContainer class="py-10 space-y-6">
    <header class="space-y-2">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="space-y-1">
          <h1 class="text-3xl font-semibold tracking-tight">
            賓果海尼根歷史分析
          </h1>
          <p class="text-sm text-muted">
            跑當前 brain state 的全壘打 evidence、給每隔期實測 mean / std / rolling std /
            熱冷期分布。用這份數字決定染色閾值與窗口大小。
          </p>
        </div>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          :loading="loading"
          @click="refresh"
        >
          重新整理
        </UButton>
      </div>
      <p class="text-xs text-muted">
        樣本數 = 該隔期 picks &gt; 0 的歷史 firing 數量。樣本太少（&lt; 30）時 std 估計
        unreliable，建議多累積資料再判讀。
      </p>
    </header>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="`載入失敗：${error}`"
    />

    <div
      v-if="loading && drawsAsc.length === 0"
      class="space-y-3"
    >
      <USkeleton
        v-for="i in 3"
        :key="i"
        class="h-24 w-full rounded-lg"
      />
    </div>

    <template v-else-if="stats.length > 0">
      <UAlert
        v-if="totalSampleN < 30"
        color="warning"
        variant="subtle"
        icon="i-lucide-info"
        :title="`目前最大樣本數 ${totalSampleN}，建議 ≥ 30 後再正式調整閾值`"
        description="樣本不足時、mean/std 估計會被個別 outlier 帶偏；rolling std 可能還有意義但要審慎判讀。"
      />

      <!-- 主表 -->
      <section class="space-y-2">
        <h2 class="text-lg font-semibold">
          各隔期統計
        </h2>
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-elevated text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th class="px-3 py-2 text-left">
                    指標
                  </th>
                  <th
                    v-for="s in stats"
                    :key="`hdr-${s.interval}`"
                    class="px-3 py-2 text-right whitespace-nowrap"
                  >
                    隔期 {{ s.interval }}
                  </th>
                </tr>
              </thead>
              <tbody class="font-mono tabular-nums">
                <tr class="border-t border-default">
                  <td class="px-3 py-2 text-muted">
                    樣本數 n
                  </td>
                  <td
                    v-for="s in stats"
                    :key="`n-${s.interval}`"
                    class="px-3 py-2 text-right"
                  >
                    {{ s.n }}
                  </td>
                </tr>
                <tr class="border-t border-default">
                  <td class="px-3 py-2 text-muted">
                    長期 mean 命中率
                  </td>
                  <td
                    v-for="s in stats"
                    :key="`mean-${s.interval}`"
                    class="px-3 py-2 text-right font-semibold"
                  >
                    {{ pct(s.mean) }}
                  </td>
                </tr>
                <tr class="border-t border-default">
                  <td class="px-3 py-2 text-muted">
                    單期 std
                  </td>
                  <td
                    v-for="s in stats"
                    :key="`std-${s.interval}`"
                    class="px-3 py-2 text-right"
                  >
                    {{ pct(s.std) }}
                  </td>
                </tr>
                <tr class="border-t border-default bg-elevated/40">
                  <td class="px-3 py-2 text-muted">
                    5 期 rolling mean std
                  </td>
                  <td
                    v-for="s in stats"
                    :key="`rs5-${s.interval}`"
                    class="px-3 py-2 text-right"
                  >
                    {{ pct(s.rollingStd5) }}
                  </td>
                </tr>
                <tr class="border-t border-default bg-elevated/40">
                  <td class="px-3 py-2 text-muted">
                    10 期 rolling mean std
                  </td>
                  <td
                    v-for="s in stats"
                    :key="`rs10-${s.interval}`"
                    class="px-3 py-2 text-right"
                  >
                    {{ pct(s.rollingStd10) }}
                  </td>
                </tr>
                <tr class="border-t border-default bg-elevated/40">
                  <td class="px-3 py-2 text-muted">
                    20 期 rolling mean std
                  </td>
                  <td
                    v-for="s in stats"
                    :key="`rs20-${s.interval}`"
                    class="px-3 py-2 text-right"
                  >
                    {{ pct(s.rollingStd20) }}
                  </td>
                </tr>
                <tr class="border-t border-default bg-elevated/40">
                  <td class="px-3 py-2 text-muted">
                    30 期 rolling mean std
                  </td>
                  <td
                    v-for="s in stats"
                    :key="`rs30-${s.interval}`"
                    class="px-3 py-2 text-right"
                  >
                    {{ pct(s.rollingStd30) }}
                  </td>
                </tr>
                <tr class="border-t border-default">
                  <td class="px-3 py-2 text-muted">
                    熱期平均長度（&gt; mean+σ）
                  </td>
                  <td
                    v-for="s in stats"
                    :key="`hot-${s.interval}`"
                    class="px-3 py-2 text-right text-red-500"
                  >
                    {{ num(s.hotStreakAvg) }} 期<span class="ml-1 text-[10px] text-muted">×{{ s.hotStreakCount }}</span>
                  </td>
                </tr>
                <tr class="border-t border-default">
                  <td class="px-3 py-2 text-muted">
                    冷期平均長度（&lt; mean−σ）
                  </td>
                  <td
                    v-for="s in stats"
                    :key="`cold-${s.interval}`"
                    class="px-3 py-2 text-right text-emerald-500"
                  >
                    {{ num(s.coldStreakAvg) }} 期<span class="ml-1 text-[10px] text-muted">×{{ s.coldStreakCount }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
      </section>

      <!-- 1σ band 分布 -->
      <section class="space-y-2">
        <h2 class="text-lg font-semibold">
          rate 落點分布（用該隔期自己 mean / σ 切）
        </h2>
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-elevated text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th class="px-3 py-2 text-left">
                    帶寬
                  </th>
                  <th
                    v-for="s in stats"
                    :key="`band-hdr-${s.interval}`"
                    class="px-3 py-2 text-right whitespace-nowrap"
                  >
                    隔期 {{ s.interval }}
                  </th>
                </tr>
              </thead>
              <tbody class="font-mono tabular-nums">
                <tr class="border-t border-default">
                  <td class="px-3 py-2 text-emerald-500">
                    &lt; mean − σ（明顯冷）
                  </td>
                  <td
                    v-for="s in stats"
                    :key="`b1-${s.interval}`"
                    class="px-3 py-2 text-right"
                  >
                    {{ bandPct(s.bandCounts.belowMinus1Sigma, s.n) }}
                  </td>
                </tr>
                <tr class="border-t border-default">
                  <td class="px-3 py-2 text-muted">
                    [mean − σ, mean)
                  </td>
                  <td
                    v-for="s in stats"
                    :key="`b2-${s.interval}`"
                    class="px-3 py-2 text-right"
                  >
                    {{ bandPct(s.bandCounts.minus1ToMean, s.n) }}
                  </td>
                </tr>
                <tr class="border-t border-default">
                  <td class="px-3 py-2 text-muted">
                    [mean, mean + σ]
                  </td>
                  <td
                    v-for="s in stats"
                    :key="`b3-${s.interval}`"
                    class="px-3 py-2 text-right"
                  >
                    {{ bandPct(s.bandCounts.meanToPlus1Sigma, s.n) }}
                  </td>
                </tr>
                <tr class="border-t border-default">
                  <td class="px-3 py-2 text-red-500">
                    &gt; mean + σ（明顯熱）
                  </td>
                  <td
                    v-for="s in stats"
                    :key="`b4-${s.interval}`"
                    class="px-3 py-2 text-right"
                  >
                    {{ bandPct(s.bandCounts.abovePlus1Sigma, s.n) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
      </section>

      <!-- 建議 -->
      <section class="space-y-2">
        <h2 class="text-lg font-semibold">
          建議閾值與窗口
        </h2>
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-elevated text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th class="px-3 py-2 text-left">
                    指標
                  </th>
                  <th
                    v-for="s in stats"
                    :key="`sug-hdr-${s.interval}`"
                    class="px-3 py-2 text-right whitespace-nowrap"
                  >
                    隔期 {{ s.interval }}
                  </th>
                </tr>
              </thead>
              <tbody class="font-mono tabular-nums">
                <tr class="border-t border-default">
                  <td class="px-3 py-2 text-muted">
                    閾值 mean ± 1σ（綠 / 紅）
                  </td>
                  <td
                    v-for="s in stats"
                    :key="`sug1-${s.interval}`"
                    class="px-3 py-2 text-right"
                  >
                    {{ suggestedThreshold(s, 1) }}
                  </td>
                </tr>
                <tr class="border-t border-default">
                  <td class="px-3 py-2 text-muted">
                    閾值 mean ± 0.5σ（更敏感）
                  </td>
                  <td
                    v-for="s in stats"
                    :key="`sug05-${s.interval}`"
                    class="px-3 py-2 text-right"
                  >
                    {{ suggestedThreshold(s, 0.5) }}
                  </td>
                </tr>
                <tr class="border-t border-default">
                  <td class="px-3 py-2 text-muted">
                    建議窗口（rolling std ≤ 單期 σ / 3）
                  </td>
                  <td
                    v-for="s in stats"
                    :key="`sugw-${s.interval}`"
                    class="px-3 py-2 text-right font-semibold"
                  >
                    {{ suggestedWindow(s) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
        <p class="text-xs text-muted leading-relaxed">
          • <strong>「閾值 mean ± kσ」</strong> 是該隔期自己的相對閾值、不是全域 25% baseline。
          各隔期長期 mean 不同（隔期 0 是 T 本期 / 隔期 3 是 4 期前的冷號），用絕對閾值會誤判。<br>
          • <strong>「建議窗口」</strong> 找 rolling mean std 衰減到單期 std 三分之一的最小 N。
          噪音降到 1/3 後、藍色帶寬 ±σ/3 ≈ ±1% 已能 capture 真實趨勢。<br>
          • <strong>熱期/冷期平均長度</strong> 告訴你「典型脈動」要多少期 capture。若熱期典型 = 3-4 期、
          窗口 N=5 接近最理想。
        </p>
      </section>
    </template>

    <template v-else-if="!loading">
      <UCard>
        <div class="text-center text-sm text-muted py-8">
          目前沒有 brain state 或 firing 樣本可分析。請先到
          <NuxtLink
            to="/bingo-heineken"
            class="text-primary underline"
          >
            賓果海尼根
          </NuxtLink>
          頁累積資料、或點上方「重新整理」。
        </div>
      </UCard>
    </template>
  </UContainer>
</template>
