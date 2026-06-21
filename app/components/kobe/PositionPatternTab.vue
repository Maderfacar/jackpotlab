<script setup lang="ts">
/**
 * /kobe Tab 4 「位置規律」（Phase 3）
 *
 * 兩塊：
 *   1. 每隔期位置分布條形圖 — 偏離平均的隔期排前面、每隔期一個小條形圖。
 *      虛線參考 = 完全均勻時、每個位置應佔的命中比例。
 *   2. 位置黏性表 — 列 = 隔期 0..19、欄 = 同位置接續次數 / 獨立期望 / 提升幅度。
 *      提升 > 10% 標亮。
 *
 * 用語規則（柯比頁全頁守則）：
 *   - 不出現 chi-square / autocorrelation / lag-1 等英文/術語。
 *   - 改寫：chi-square → 「偏離平均的程度」；
 *     lag-1 autocorrelation → 「上下兩期同位置接續出現的機率」/「位置黏性」。
 */
import type {
  PerDrawSnapshot,
  PositionDistributionRow,
  PositionAutoCorrelationRow
} from '~/utils/kobe-stats'
import { buildPositionDistribution, buildPositionAutoCorrelation } from '~/utils/kobe-stats'

interface Props { snapshots: PerDrawSnapshot[] }
const props = defineProps<Props>()

const MAX_SHOWN_INTERVAL = 19
const SAMPLE_TRUST_THRESHOLD = 20
const STICKINESS_THRESHOLD = 0.10
const STRONG_DEVIATION_RATIO = 0.10

// SVG 條形圖規格
const CHART_W = 220
const CHART_H = 70
const CHART_PAD_T = 4
const CHART_PAD_B = 14
const CHART_PAD_L = 4
const CHART_PAD_R = 4

const distRows = computed<PositionDistributionRow[]>(() =>
  buildPositionDistribution(props.snapshots)
    .filter(r => r.interval <= MAX_SHOWN_INTERVAL)
    .sort((a, b) => b.deviationScore - a.deviationScore)
)
const stickyRows = computed<PositionAutoCorrelationRow[]>(() =>
  buildPositionAutoCorrelation(props.snapshots)
    .filter(r => r.interval <= MAX_SHOWN_INTERVAL)
    .sort((a, b) => a.interval - b.interval)
)

interface BarItem {
  position: number
  count: number
  exposure: number
  /** 命中率 = count / exposure（在「位置存在」的期數中、被開出的比例） */
  hitRate: number
}

function bars(row: PositionDistributionRow): BarItem[] {
  const out: BarItem[] = []
  for (let y = 1; y <= row.maxPosition; y++) {
    const cnt = row.positionCounts[y] ?? 0
    const exp = row.positionExposure[y] ?? 0
    out.push({
      position: y,
      count: cnt,
      exposure: exp,
      hitRate: exp > 0 ? cnt / exp : 0
    })
  }
  return out
}

function expectedHitRate(row: PositionDistributionRow): number {
  let totalExp = 0
  for (let y = 1; y <= row.maxPosition; y++) totalExp += row.positionExposure[y] ?? 0
  return totalExp > 0 ? row.totalSamples / totalExp : 0
}

function maxRate(row: PositionDistributionRow): number {
  let m = 0
  for (let y = 1; y <= row.maxPosition; y++) {
    const e = row.positionExposure[y] ?? 0
    const c = row.positionCounts[y] ?? 0
    const r = e > 0 ? c / e : 0
    if (r > m) m = r
  }
  // 確保 y 軸至少包含期望線、避免畫面太空
  const exp = expectedHitRate(row)
  if (exp > m) m = exp
  if (m <= 0) return 1
  // 上方留一點 headroom
  return m * 1.15
}

function barX(idx: number, total: number): number {
  const innerW = CHART_W - CHART_PAD_L - CHART_PAD_R
  return CHART_PAD_L + (idx / total) * innerW
}
function barWidth(total: number): number {
  const innerW = CHART_W - CHART_PAD_L - CHART_PAD_R
  return Math.max(1, (innerW / total) - 1)
}
function barY(rate: number, max: number): number {
  const innerH = CHART_H - CHART_PAD_T - CHART_PAD_B
  return CHART_PAD_T + (1 - rate / max) * innerH
}
function barHeight(rate: number, max: number): number {
  const innerH = CHART_H - CHART_PAD_T - CHART_PAD_B
  return (rate / max) * innerH
}
function expectedY(row: PositionDistributionRow): number {
  return barY(expectedHitRate(row), maxRate(row))
}
function barColor(rate: number, expected: number): string {
  if (expected <= 0) return 'rgb(148 163 184)'
  const diff = (rate - expected) / expected
  if (diff >= STRONG_DEVIATION_RATIO) return 'rgb(16 185 129)'
  if (diff <= -STRONG_DEVIATION_RATIO) return 'rgb(56 189 248)'
  return 'rgb(148 163 184)'
}

function fmtPct(v: number): string {
  const pct = v * 100
  if (Math.abs(pct) >= 10) return `${pct.toFixed(1)}%`
  return `${pct.toFixed(2)}%`
}
function fmtScore(v: number): string {
  return v.toFixed(2)
}
function fmtExpected(v: number): string {
  return v.toFixed(2)
}

// 提綱卡：找出偏離最大的隔期 / 黏性最強的隔期
const topDeviation = computed(() => {
  const candidates = distRows.value.filter(r => r.totalSamples >= SAMPLE_TRUST_THRESHOLD)
  return candidates[0] ?? null
})
const topStickiness = computed(() => {
  const candidates = stickyRows.value.filter(r => r.sampleCount >= SAMPLE_TRUST_THRESHOLD)
  if (candidates.length === 0) return null
  let best = candidates[0]!
  for (const r of candidates) {
    if (r.liftPct > best.liftPct) best = r
  }
  return best
})
</script>

<template>
  <div class="space-y-6">
    <!-- 概要卡 -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <UCard :ui="{ body: 'p-4' }">
        <div class="space-y-1">
          <div class="text-xs text-muted">
            最偏離平均的隔期
          </div>
          <div
            v-if="topDeviation"
            class="space-y-1"
          >
            <div class="font-mono text-base">
              隔期 {{ topDeviation.interval }}
            </div>
            <div class="text-xs text-muted">
              偏離平均的程度 {{ fmtScore(topDeviation.deviationScore) }}（樣本 {{ topDeviation.totalSamples }}）
            </div>
          </div>
          <div
            v-else
            class="text-xs text-muted"
          >
            樣本不足
          </div>
        </div>
      </UCard>
      <UCard :ui="{ body: 'p-4' }">
        <div class="space-y-1">
          <div class="text-xs text-muted">
            位置黏性最強的隔期
          </div>
          <div
            v-if="topStickiness"
            class="space-y-1"
          >
            <div class="font-mono text-base">
              隔期 {{ topStickiness.interval }}
            </div>
            <div class="text-xs text-muted">
              提升幅度 {{ topStickiness.liftPct > 0 ? '+' : '' }}{{ fmtPct(topStickiness.liftPct) }}（配對 {{ topStickiness.sampleCount }} 期）
            </div>
          </div>
          <div
            v-else
            class="text-xs text-muted"
          >
            樣本不足
          </div>
        </div>
      </UCard>
    </div>

    <!-- Section 1: 位置分布條形圖 -->
    <section class="space-y-2">
      <header class="space-y-1">
        <h3 class="text-base font-semibold">
          每隔期位置分布
        </h3>
        <p class="text-xs text-muted">
          每個隔期內、命中號碼在 pre-T 排序後的「第幾位」。
          y 軸 = 該位置在曾經有效的期數中、被開出的比例（命中次數 / 曝光次數）。
          虛線 = 完全均勻時、每個位置應有的命中率。
          綠 = 比平均高 ≥ {{ fmtPct(STRONG_DEVIATION_RATIO) }}、藍 = 比平均低 ≥ {{ fmtPct(STRONG_DEVIATION_RATIO) }}、灰 = 接近平均。
          樣本 &lt; {{ SAMPLE_TRUST_THRESHOLD }} 半透明僅供參考。已依「偏離平均的程度」由高到低排序。
        </p>
      </header>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <UCard
          v-for="row in distRows"
          :key="`dist-${row.interval}`"
          :ui="{ body: 'p-3' }"
          :class="row.totalSamples < SAMPLE_TRUST_THRESHOLD ? 'opacity-50' : ''"
        >
          <div class="space-y-1.5">
            <div class="flex items-baseline justify-between gap-1 text-[11px]">
              <span class="font-mono">隔期 {{ row.interval }}</span>
              <div class="flex items-baseline gap-2 text-muted">
                <span>偏離 {{ fmtScore(row.deviationScore) }}</span>
                <span>n={{ row.totalSamples }}</span>
              </div>
            </div>
            <svg
              :viewBox="`0 0 ${CHART_W} ${CHART_H}`"
              class="w-full"
              preserveAspectRatio="xMidYMid meet"
            >
              <!-- baseline (x 軸) -->
              <line
                :x1="0"
                :x2="CHART_W"
                :y1="CHART_H - CHART_PAD_B"
                :y2="CHART_H - CHART_PAD_B"
                stroke="currentColor"
                stroke-opacity="0.2"
              />
              <!-- bars -->
              <g>
                <rect
                  v-for="(b, idx) in bars(row)"
                  :key="`b-${row.interval}-${b.position}`"
                  :x="barX(idx, row.maxPosition)"
                  :y="barY(b.hitRate, maxRate(row))"
                  :width="barWidth(row.maxPosition)"
                  :height="barHeight(b.hitRate, maxRate(row))"
                  :fill="barColor(b.hitRate, expectedHitRate(row))"
                  fill-opacity="0.85"
                >
                  <title>位置 {{ b.position }}：命中率 {{ fmtPct(b.hitRate) }}（{{ b.count }} 次 / 曝光 {{ b.exposure }} 期）</title>
                </rect>
              </g>
              <!-- 期望參考線（虛線） -->
              <line
                :x1="CHART_PAD_L"
                :x2="CHART_W - CHART_PAD_R"
                :y1="expectedY(row)"
                :y2="expectedY(row)"
                stroke="currentColor"
                stroke-opacity="0.45"
                stroke-dasharray="3 2"
              />
              <!-- x 軸刻度（1, 中, 末） -->
              <g class="fill-current text-[8px] opacity-60">
                <text
                  :x="barX(0, row.maxPosition) + barWidth(row.maxPosition) / 2"
                  :y="CHART_H - 3"
                  text-anchor="middle"
                >
                  1
                </text>
                <text
                  v-if="row.maxPosition >= 4"
                  :x="barX(Math.floor(row.maxPosition / 2) - 1, row.maxPosition) + barWidth(row.maxPosition) / 2"
                  :y="CHART_H - 3"
                  text-anchor="middle"
                >
                  {{ Math.floor(row.maxPosition / 2) }}
                </text>
                <text
                  :x="barX(row.maxPosition - 1, row.maxPosition) + barWidth(row.maxPosition) / 2"
                  :y="CHART_H - 3"
                  text-anchor="middle"
                >
                  {{ row.maxPosition }}
                </text>
              </g>
            </svg>
            <div class="text-[10px] text-muted">
              均勻參考 {{ fmtPct(expectedHitRate(row)) }}（虛線）·  位置 1-{{ row.maxPosition }}
            </div>
          </div>
        </UCard>
      </div>

      <div
        v-if="distRows.length === 0"
        class="rounded-md border border-dashed border-default p-6 text-center text-sm text-muted"
      >
        尚無樣本可顯示。
      </div>
    </section>

    <!-- Section 2: 位置黏性表 -->
    <section class="space-y-2">
      <header class="space-y-1">
        <h3 class="text-base font-semibold">
          位置黏性
        </h3>
        <p class="text-xs text-muted">
          看上下兩期同隔期、是否傾向開到「同一個位置」（位置黏性）。
          「同位置接續次數」= 觀察到的兩期都開同位置次數合計；
          「獨立期望次數」= 假設兩期獨立時的期望次數合計；
          「提升幅度」= 觀察比期望多出的比例。
          提升 ≥ {{ fmtPct(STICKINESS_THRESHOLD) }} 標亮、樣本 &lt; {{ SAMPLE_TRUST_THRESHOLD }} 半透明。
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
                同位置接續次數
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                獨立期望次數
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                提升幅度
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                配對樣本
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in stickyRows"
              :key="`sticky-${row.interval}`"
              class="border-b border-default/60"
              :class="row.sampleCount < SAMPLE_TRUST_THRESHOLD ? 'opacity-50' : ''"
            >
              <td class="px-2 py-1 font-mono whitespace-nowrap">
                隔期 {{ row.interval }}
              </td>
              <td class="px-2 py-1 text-right font-mono tabular-nums">
                {{ row.jointCount }}
              </td>
              <td class="px-2 py-1 text-right font-mono tabular-nums">
                {{ fmtExpected(row.independentExpected) }}
              </td>
              <td
                class="px-2 py-1 text-right font-mono tabular-nums"
                :class="row.sampleCount >= SAMPLE_TRUST_THRESHOLD && row.liftPct >= STICKINESS_THRESHOLD
                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                  : (row.liftPct < 0 ? 'text-sky-600 dark:text-sky-400' : '')"
              >
                {{ row.liftPct > 0 ? '+' : '' }}{{ fmtPct(row.liftPct) }}
              </td>
              <td class="px-2 py-1 text-right font-mono tabular-nums text-muted">
                {{ row.sampleCount }}
              </td>
            </tr>
            <tr v-if="stickyRows.length === 0">
              <td
                colspan="5"
                class="px-3 py-3 text-center text-muted"
              >
                尚無樣本可顯示。
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
