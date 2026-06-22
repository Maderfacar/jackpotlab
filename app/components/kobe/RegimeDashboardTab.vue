<script setup lang="ts">
/**
 * /kobe Tab 7 「波段儀表板」（Phase 6 + 7）
 *
 * 五塊：
 *   1. 切換開關選擇器（radio：時段 / 冷度 / 上期形態）
 *   2. 目前這期屬於哪個波段（大字卡）
 *   3. 每波段對照表（簡化版 Phase 1 + 該波段內 holdout 改善）
 *   4. 波段顯著差異 Top 10
 *   5. 波段切換可信度結論卡（嚴格 holdout：weighted MAE vs 全期單一規則）
 *
 * 用語規則：
 *   - 不出現 regime / dispatcher / mixture / HMM。
 *   - 改寫：regime → 「波段」；dispatcher → 「切換開關」；mixture → 「多套規則」；
 *     HMM → 「隱形切換」。
 */
import type {
  PerDrawSnapshot,
  RegimeKey,
  PerRegimeAnalysis,
  RegimeBucketResult
} from '~/utils/kobe-stats'
import {
  buildPerRegimeAnalysis,
  findCurrentBucket
} from '~/utils/kobe-stats'

interface Props { snapshots: PerDrawSnapshot[] }
const props = defineProps<Props>()

const REGIME_SIGNIFICANT = 0.03
const SAMPLE_TRUST = 20

interface RegimeOption {
  key: RegimeKey
  label: string
  description: string
}
const REGIME_OPTIONS: RegimeOption[] = [
  {
    key: 'timeSlot',
    label: '時段',
    description: '凌晨 0-6 / 上午 6-12 / 下午 12-18 / 晚上 18-24'
  },
  {
    key: 'globalColdness',
    label: '整盤冷度',
    description: '全期累計沒命中次數加總、依 33% / 66% 百分位切「低 / 中 / 高」'
  },
  {
    key: 'prevShape',
    label: '上期形態',
    description: '上期隔期 0 開出 ≥ 6 顆 = 集中、否則 散開'
  }
]

const activeRegime = ref<RegimeKey>('timeSlot')
const activeOption = computed(() =>
  REGIME_OPTIONS.find(o => o.key === activeRegime.value) ?? REGIME_OPTIONS[0]!
)

const analysis = computed<PerRegimeAnalysis>(() =>
  buildPerRegimeAnalysis(props.snapshots, activeRegime.value)
)

const currentBucket = computed(() => findCurrentBucket(props.snapshots, activeRegime.value))

// 顯示用：每波段熱度地圖維度（簡化版 Phase 1）
const MAX_SHOWN_INTERVAL = 9
const MAX_SHOWN_REMAINING = 15

interface MiniCell {
  interval: number
  remaining: number
  meanHits: number
  sampleCount: number
  trustworthy: boolean
}

function miniGrid(bucket: RegimeBucketResult): MiniCell[][] {
  const map = new Map<string, MiniCell>()
  for (const c of bucket.cells) {
    map.set(`${c.interval}|${c.remaining}`, {
      interval: c.interval,
      remaining: c.remaining,
      meanHits: c.meanHits,
      sampleCount: c.sampleCount,
      trustworthy: c.sampleCount >= SAMPLE_TRUST
    })
  }
  const grid: MiniCell[][] = []
  for (let j = 0; j <= MAX_SHOWN_INTERVAL; j++) {
    const row: MiniCell[] = []
    for (let x = 1; x <= MAX_SHOWN_REMAINING; x++) {
      const c = map.get(`${j}|${x}`)
      row.push(c ?? {
        interval: j,
        remaining: x,
        meanHits: 0,
        sampleCount: 0,
        trustworthy: false
      })
    }
    grid.push(row)
  }
  return grid
}

function bucketMaxMean(bucket: RegimeBucketResult): number {
  let m = 0
  for (const c of bucket.cells) {
    if (c.interval > MAX_SHOWN_INTERVAL) continue
    if (c.remaining > MAX_SHOWN_REMAINING) continue
    if (c.sampleCount < SAMPLE_TRUST) continue
    if (c.meanHits > m) m = c.meanHits
  }
  return m
}

function cellBgClass(cell: MiniCell, maxMean: number): string {
  if (!cell.trustworthy) return 'bg-default'
  if (maxMean <= 0) return 'bg-default'
  const ratio = Math.min(1, cell.meanHits / maxMean)
  if (ratio < 0.2) return 'bg-elevated'
  if (ratio < 0.4) return 'bg-emerald-500/10'
  if (ratio < 0.6) return 'bg-emerald-500/25'
  if (ratio < 0.8) return 'bg-emerald-500/40'
  return 'bg-emerald-500/55'
}
function cellOpacityClass(cell: MiniCell): string {
  if (cell.sampleCount === 0) return 'opacity-25'
  if (!cell.trustworthy) return 'opacity-55'
  return ''
}

// 結論判定
interface Verdict {
  label: string
  description: string
  color: 'success' | 'warning' | 'neutral'
}
const verdict = computed<Verdict>(() => {
  const a = analysis.value
  if (a.totalTestObs === 0) {
    return {
      label: '樣本不足',
      description: '考試集裡沒有可歸到波段的樣本、無法判定。',
      color: 'neutral'
    }
  }
  if (a.improvement <= 0) {
    return {
      label: '波段化反而更差',
      description: `波段化加權平均誤差 ${a.weightedMAE.toFixed(3)} 顆比全期單一規則 ${a.baselineMAE.toFixed(3)} 顆還高（${fmtSignedPct(a.improvementRatio)}）— 切換開關沒抓到真實的規則差異、可能是雜訊。`,
      color: 'warning'
    }
  }
  if (a.improvementRatio < REGIME_SIGNIFICANT) {
    return {
      label: '波段化無實質改善、可能是雜訊',
      description: `改善幅度 ${fmtPct(a.improvementRatio)} < 門檻 ${fmtPct(REGIME_SIGNIFICANT)}。切片切細任何噪音都會「顯著」、這個切換開關沒帶來足夠的預測力提升。`,
      color: 'warning'
    }
  }
  return {
    label: '波段切換確實存在',
    description: `波段化加權平均誤差 ${a.weightedMAE.toFixed(3)} 顆 vs 全期單一規則 ${a.baselineMAE.toFixed(3)} 顆，改善 ${fmtPct(a.improvementRatio)}（≥ 門檻 ${fmtPct(REGIME_SIGNIFICANT)}）。此切換開關抓到了真實的規則差異。`,
    color: 'success'
  }
})

const orderedBucketNames = computed(() => analysis.value.buckets.map(b => b.bucket))

// 動態 grid 欄數：Tailwind JIT 需要 class string 在原始碼裡能掃到、不能用拼接、
// 因此這裡用顯式 mapping。
const bucketGridClass = computed(() => {
  const n = analysis.value.buckets.length
  if (n <= 1) return 'grid-cols-1'
  if (n === 2) return 'grid-cols-1 md:grid-cols-2'
  if (n === 3) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
  return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
})

function fmtPct(v: number): string {
  const pct = v * 100
  if (Math.abs(pct) >= 10) return `${pct.toFixed(1)}%`
  return `${pct.toFixed(2)}%`
}
function fmtSignedPct(v: number): string {
  return `${v > 0 ? '+' : ''}${fmtPct(v)}`
}
function fmtMean(v: number): string {
  return v.toFixed(2)
}
function fmtErr(v: number): string {
  return v.toFixed(3)
}
function sign(v: number): string {
  return v > 0 ? '+' : ''
}

function bucketImprovementClass(b: RegimeBucketResult): string {
  if (b.testObs < SAMPLE_TRUST) return 'text-muted'
  if (b.improvement <= 0) return 'text-sky-600 dark:text-sky-400'
  if (b.improvementRatio < REGIME_SIGNIFICANT) return ''
  return 'text-emerald-600 dark:text-emerald-400'
}
</script>

<template>
  <div class="space-y-6">
    <!-- Section 1: 切換開關選擇器 -->
    <section class="space-y-2">
      <header class="space-y-1">
        <h3 class="text-base font-semibold">
          切換開關
        </h3>
        <p class="text-xs text-muted">
          選一個切換開關、把全部期數分到不同波段、看每波段下「隔期剩餘 → 開出」的規律是否真的不同。
          僅做這三個開關（跳過星期幾 / 節日 / 月初月底、因為 2000 期樣本不夠分這麼細）。
        </p>
      </header>
      <div class="flex flex-wrap gap-2">
        <label
          v-for="opt in REGIME_OPTIONS"
          :key="opt.key"
          class="cursor-pointer rounded-md border border-default px-3 py-2 text-xs hover:bg-elevated"
          :class="activeRegime === opt.key ? 'border-emerald-500/60 bg-emerald-500/10' : ''"
        >
          <input
            v-model="activeRegime"
            type="radio"
            :value="opt.key"
            class="mr-2 accent-emerald-500"
          >
          <span class="font-mono font-semibold">{{ opt.label }}</span>
          <span class="ml-2 text-muted">— {{ opt.description }}</span>
        </label>
      </div>
    </section>

    <!-- Section 2: 目前這期屬於哪個波段 -->
    <section>
      <UCard :ui="{ body: 'p-5' }">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="space-y-1">
            <div class="text-xs text-muted">
              目前這期（{{ activeOption.label }}）屬於波段
            </div>
            <div class="text-2xl font-semibold font-mono">
              {{ currentBucket?.bucket ?? '無法判定' }}
            </div>
            <div
              v-if="currentBucket"
              class="text-[11px] text-muted"
            >
              最新期 {{ currentBucket.drawTerm }}（{{ currentBucket.drawDate }}）
            </div>
          </div>
          <div class="text-right space-y-0.5 text-xs text-muted">
            <div>切換開關依據</div>
            <div class="font-mono">
              {{ activeOption.description }}
            </div>
          </div>
        </div>
      </UCard>
    </section>

    <!-- Section 3: 每波段對照表 -->
    <section class="space-y-2">
      <header class="space-y-1">
        <h3 class="text-base font-semibold">
          每波段對照表（簡化）
        </h3>
        <p class="text-xs text-muted">
          每張卡 = 一個波段。內格 = 該波段下「(隔期, 剩餘顆數) → 下期平均開出顆數」、隔期 0-{{ MAX_SHOWN_INTERVAL }} × 剩餘 1-{{ MAX_SHOWN_REMAINING }}、樣本 &lt; {{ SAMPLE_TRUST }} 半透明。
          下方「改善」= 在該波段考試樣本上、用波段自己的對照表預測 vs 用全期合一對照表預測的平均誤差差距。
        </p>
      </header>

      <div
        class="grid gap-3"
        :class="bucketGridClass"
      >
        <UCard
          v-for="b in analysis.buckets"
          :key="`bucket-${b.bucket}`"
          :ui="{ body: 'p-3' }"
        >
          <div class="space-y-2">
            <div class="flex items-baseline justify-between gap-2 flex-wrap text-xs">
              <span class="font-mono font-semibold text-sm">
                {{ b.bucket }}
              </span>
              <span class="text-muted">
                {{ b.drawCount }} 期
              </span>
            </div>
            <div class="overflow-x-auto rounded border border-default">
              <table class="text-[9px]">
                <thead>
                  <tr class="border-b border-default text-muted">
                    <th class="px-1 py-0.5 text-left font-medium">
                      隔期 ↓
                    </th>
                    <th
                      v-for="x in MAX_SHOWN_REMAINING"
                      :key="`hd-${b.bucket}-${x}`"
                      class="px-1 py-0.5 text-center font-medium"
                    >
                      {{ x }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, idx) in miniGrid(b)"
                    :key="`row-${b.bucket}-${idx}`"
                    class="border-b border-default/60"
                  >
                    <td class="px-1 py-0.5 font-mono text-muted">
                      {{ row[0]?.interval ?? idx }}
                    </td>
                    <td
                      v-for="cell in row"
                      :key="`c-${b.bucket}-${cell.interval}-${cell.remaining}`"
                      class="px-1 py-0.5 text-center align-middle font-mono tabular-nums"
                      :class="[cellBgClass(cell, bucketMaxMean(b)), cellOpacityClass(cell)]"
                    >
                      <template v-if="cell.sampleCount > 0">
                        {{ fmtMean(cell.meanHits) }}
                      </template>
                      <template v-else>
                        <span class="text-muted">·</span>
                      </template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="grid grid-cols-3 gap-2 text-[10px]">
              <div>
                <div class="text-muted">
                  波段預測誤差
                </div>
                <div class="font-mono tabular-nums">
                  {{ fmtErr(b.meanError) }} 顆
                </div>
              </div>
              <div>
                <div class="text-muted">
                  全期單一規則誤差
                </div>
                <div class="font-mono tabular-nums">
                  {{ fmtErr(b.baselineError) }} 顆
                </div>
              </div>
              <div>
                <div class="text-muted">
                  改善
                </div>
                <div
                  class="font-mono tabular-nums"
                  :class="bucketImprovementClass(b)"
                >
                  {{ sign(b.improvement) }}{{ fmtErr(Math.abs(b.improvement)) }}（{{ sign(b.improvementRatio) }}{{ fmtPct(b.improvementRatio) }}）
                </div>
              </div>
            </div>
            <div class="text-[10px] text-muted">
              該波段考試樣本：{{ b.testObs }} 筆
            </div>
          </div>
        </UCard>
      </div>
    </section>

    <!-- Section 4: 波段顯著差異 Top 10 -->
    <section class="space-y-2">
      <header class="space-y-1">
        <h3 class="text-base font-semibold">
          波段顯著差異 Top 10
        </h3>
        <p class="text-xs text-muted">
          (隔期, 剩餘顆數) 在不同波段下平均開出顆數差距最大的前 10 個。樣本 ≥ {{ SAMPLE_TRUST }} 的波段才入比較、至少要 2 個波段都有資料。
          差距越大、代表這個 (隔期, 剩餘) 組合在不同波段下的行為差異越明顯。
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
                剩餘顆數
              </th>
              <th
                v-for="bname in orderedBucketNames"
                :key="`hd-diff-${bname}`"
                class="px-2 py-1.5 text-right font-medium whitespace-nowrap"
              >
                {{ bname }}
              </th>
              <th class="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                差距
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(d, idx) in analysis.topDifferences"
              :key="`diff-${idx}`"
              class="border-b border-default/60"
            >
              <td class="px-2 py-1 font-mono whitespace-nowrap">
                隔期 {{ d.interval }}
              </td>
              <td class="px-2 py-1 text-right font-mono tabular-nums">
                {{ d.remaining }}
              </td>
              <td
                v-for="bname in orderedBucketNames"
                :key="`c-diff-${idx}-${bname}`"
                class="px-2 py-1 text-right font-mono tabular-nums"
              >
                <template v-if="d.bucketMeans[bname] != null">
                  {{ fmtMean(d.bucketMeans[bname]!) }}
                  <span class="text-[9px] text-muted">（n={{ d.bucketSamples[bname] }}）</span>
                </template>
                <template v-else>
                  <span class="text-muted">—</span>
                </template>
              </td>
              <td class="px-2 py-1 text-right font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                {{ fmtMean(d.spread) }}
              </td>
            </tr>
            <tr v-if="analysis.topDifferences.length === 0">
              <td
                :colspan="2 + orderedBucketNames.length + 1"
                class="px-3 py-3 text-center text-muted"
              >
                尚無可比較的 cell（每個 (隔期, 剩餘) 至少要在 2 個波段都有 ≥ {{ SAMPLE_TRUST }} 樣本）。
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Section 5: 波段切換可信度結論 -->
    <section class="space-y-2">
      <header class="space-y-1">
        <h3 class="text-base font-semibold">
          波段切換可信度
        </h3>
        <p class="text-xs text-muted">
          嚴格 holdout：全期 80/20 切點（前 {{ analysis.trainDrawCount }} 期訓練、後 {{ analysis.testDrawCount }} 期考試）。
          訓練 = 每個波段各自累計 (隔期, 剩餘) → 平均開出 lookup；考試 = 把每筆考試樣本歸到它的波段、用波段自己的 lookup 預測，
          跨波段加權平均誤差 vs 全期單一規則平均誤差。
        </p>
      </header>

      <UCard :ui="{ body: 'p-4' }">
        <div class="space-y-3 text-sm">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="rounded-md border border-default p-3 space-y-1">
              <div class="text-xs text-muted">
                波段化加權平均誤差
              </div>
              <div class="font-mono text-lg tabular-nums">
                {{ fmtErr(analysis.weightedMAE) }} 顆
              </div>
              <div class="text-[11px] text-muted">
                每筆考試樣本用「該樣本所屬波段」的對照表預測
              </div>
            </div>
            <div class="rounded-md border border-default p-3 space-y-1">
              <div class="text-xs text-muted">
                全期單一規則平均誤差
              </div>
              <div class="font-mono text-lg tabular-nums">
                {{ fmtErr(analysis.baselineMAE) }} 顆
              </div>
              <div class="text-[11px] text-muted">
                忽略波段、所有考試樣本用同一張全期合算的對照表預測
              </div>
            </div>
          </div>

          <div class="rounded-md border border-default p-3 space-y-2">
            <div class="flex items-baseline gap-2 flex-wrap">
              <span class="text-xs text-muted">改善幅度：</span>
              <span
                class="font-mono text-base tabular-nums"
                :class="analysis.improvement > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-sky-600 dark:text-sky-400'"
              >
                {{ analysis.improvement > 0 ? '−' : '+' }}{{ fmtErr(Math.abs(analysis.improvement)) }} 顆
                （{{ fmtSignedPct(analysis.improvementRatio) }}）
              </span>
              <UBadge
                :color="verdict.color"
                variant="subtle"
                size="sm"
              >
                {{ verdict.label }}
              </UBadge>
            </div>
            <p class="text-xs text-muted leading-relaxed">
              {{ verdict.description }}
            </p>
            <p class="text-[11px] text-muted">
              共同考試樣本：{{ analysis.totalTestObs }} 筆（剩餘 = 0 不計、無法歸波段的期也不計）。
              判定門檻 {{ fmtPct(REGIME_SIGNIFICANT) }} — 切片切細任何噪音都會「顯著」，必須跨過這個門檻才算真的有規則切換。
            </p>
          </div>
        </div>
      </UCard>
    </section>
  </div>
</template>
