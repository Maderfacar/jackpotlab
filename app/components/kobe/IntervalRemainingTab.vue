<script setup lang="ts">
/**
 * /kobe Tab 2 「隔期剩餘 → 下期開出」（Phase 0 + Phase 1）
 *
 * 顯示三塊：
 *   1. 資料一致性檢查（Phase 0）— 小張、過了就綠燈、有問題列在小卡裡。
 *   2. 主對照表 — 列 = 隔期 0..MAX_SHOWN_INTERVAL、欄 = 剩餘顆數 1..MAX_X、cell = 平均開出顆數 + 樣本數。
 *   3. 驗證可信度（Phase 1b 後段保留期）— 條件預測 vs 不分剩餘的對照基準。
 *
 * 用語規則（柯比頁全頁守則）：
 *   - 不用英文代數變數（K/X/J 不出現在 UI）。
 *   - 不用統計術語（不出現 MAE / holdout / chi-square 等）。
 *   - 用「隔期」「剩餘顆數」「開出顆數」「樣本數」「平均誤差」「對照基準」。
 */
import type {
  PerDrawSnapshot,
  IntervalRemainingCell,
  IdentityReport,
  HoldoutResult
} from '~/utils/kobe-stats'
import { checkIdentity, buildIntervalRemainingTable, holdoutValidate } from '~/utils/kobe-stats'

interface Props { snapshots: PerDrawSnapshot[] }
const props = defineProps<Props>()

const MAX_SHOWN_INTERVAL = 19
const MAX_X = 20
const SAMPLE_TRUST_THRESHOLD = 20

const identity = computed<IdentityReport>(() => checkIdentity(props.snapshots))
const cells = computed<IntervalRemainingCell[]>(() => buildIntervalRemainingTable(props.snapshots))
const holdout = computed<HoldoutResult>(() => holdoutValidate(props.snapshots, 0.8))

const cellMap = computed<Map<string, IntervalRemainingCell>>(() => {
  const m = new Map<string, IntervalRemainingCell>()
  for (const c of cells.value) m.set(`${c.interval}|${c.remaining}`, c)
  return m
})

const maxMean = computed(() => {
  let m = 0
  for (const c of cells.value) {
    if (c.interval <= MAX_SHOWN_INTERVAL && c.sampleCount >= SAMPLE_TRUST_THRESHOLD && c.meanHits > m) {
      m = c.meanHits
    }
  }
  return m
})

interface CellView {
  interval: number
  remaining: number
  cell: IntervalRemainingCell | null
}
const grid = computed<CellView[][]>(() => {
  const rows: CellView[][] = []
  for (let j = 0; j <= MAX_SHOWN_INTERVAL; j++) {
    const row: CellView[] = []
    for (let x = 1; x <= MAX_X; x++) {
      row.push({ interval: j, remaining: x, cell: cellMap.value.get(`${j}|${x}`) ?? null })
    }
    rows.push(row)
  }
  return rows
})

function cellBgClass(cell: IntervalRemainingCell | null): string {
  if (!cell || cell.sampleCount < SAMPLE_TRUST_THRESHOLD) return 'bg-default'
  const max = maxMean.value
  if (max <= 0) return 'bg-default'
  const ratio = Math.min(1, cell.meanHits / max)
  if (ratio < 0.2) return 'bg-elevated'
  if (ratio < 0.4) return 'bg-emerald-500/10'
  if (ratio < 0.6) return 'bg-emerald-500/20'
  if (ratio < 0.8) return 'bg-emerald-500/35'
  return 'bg-emerald-500/55'
}
function cellOpacityClass(cell: IntervalRemainingCell | null): string {
  if (!cell) return 'opacity-30'
  if (cell.sampleCount < SAMPLE_TRUST_THRESHOLD) return 'opacity-50'
  return ''
}
function fmtMean(v: number): string {
  return v.toFixed(2)
}
function fmtPct(v: number): string {
  const pct = v * 100
  if (Math.abs(pct) >= 10) return `${pct.toFixed(1)}%`
  return `${pct.toFixed(2)}%`
}

const verdict = computed(() => {
  const h = holdout.value
  if (h.testObservations === 0) return { label: '樣本不足', color: 'neutral' as const, hint: '無法驗證，先把資料拉到更多期。' }
  if (h.improvement <= 0) return {
    label: '無顯著預測力',
    color: 'warning' as const,
    hint: '依「剩餘顆數」條件預測的平均誤差，並沒有比「不分剩餘、用該隔期整體平均」更好。代表剩餘顆數對下一期開出顆數沒明顯幫助、規律弱、可能要再加上其他切片條件（時段、波段）才看得出來。'
  }
  if (h.improvementRatio < 0.05) return {
    label: '微弱預測力',
    color: 'info' as const,
    hint: '條件預測有些微優勢、但改善幅度小，先不要當成可信規律，等加上其他條件後再回來驗證。'
  }
  return {
    label: '有預測力',
    color: 'success' as const,
    hint: '依「剩餘顆數」條件預測的平均誤差，比對照基準更低，代表剩餘顆數對下一期該隔期會開出多少顆有實質參考價值。'
  }
})
</script>

<template>
  <div class="space-y-4">
    <UAlert
      :color="identity.failedDraws === 0 ? 'success' : 'error'"
      variant="subtle"
      :icon="identity.failedDraws === 0 ? 'i-lucide-check-circle' : 'i-lucide-triangle-alert'"
      :title="identity.failedDraws === 0
        ? `資料一致性檢查 — 通過（共 ${identity.totalDraws} 期、全數對齊）`
        : `資料一致性檢查 — 失敗 ${identity.failedDraws} 期 / 共 ${identity.totalDraws} 期`"
      :description="identity.failedDraws === 0
        ? '每一期「各隔期開出顆數加總 + 新號數」皆等於該期實際開出顆數，資料地基穩。'
        : '部分期數的加總對不上，下面的統計可能不可信，請先排查。'"
    />
    <details
      v-if="identity.issues.length > 0"
      class="rounded-md border border-default p-3 text-xs"
    >
      <summary class="cursor-pointer text-muted">
        不一致明細（最多列前 20 期）
      </summary>
      <div class="mt-2 space-y-1 font-mono">
        <div
          v-for="iss in identity.issues.slice(0, 20)"
          :key="`iss-${iss.drawTerm}`"
        >
          期 {{ iss.drawTerm }}（{{ iss.drawDate }}）：實際 {{ iss.actualTotal }} 顆 / 統計加總 {{ iss.combined }} 顆（命中 {{ iss.hitsSum }} + 新號 {{ iss.newcomerCount }}）
        </div>
      </div>
    </details>

    <section class="space-y-2">
      <header class="space-y-1">
        <h3 class="text-base font-semibold">
          隔期剩餘 → 下期開出
        </h3>
        <p class="text-xs text-muted">
          過去 {{ identity.totalDraws }} 期統計：某個隔期還剩特定顆數時，下一期通常會從這個隔期裡開出多少顆。
          顏色越深 = 該情境下平均開出越多；樣本數低於 {{ SAMPLE_TRUST_THRESHOLD }} 的格子半透明、僅供參考。
        </p>
      </header>

      <div class="overflow-x-auto rounded-md border border-default">
        <table class="min-w-max text-[11px]">
          <thead>
            <tr class="border-b border-default text-muted">
              <th class="sticky left-0 z-10 bg-default px-2 py-1.5 text-left font-medium">
                隔期 ↓ / 剩餘顆數 →
              </th>
              <th
                v-for="x in MAX_X"
                :key="`hd-${x}`"
                class="px-1.5 py-1.5 text-center font-medium"
              >
                {{ x }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in grid"
              :key="`row-${row[0]?.interval}`"
              class="border-b border-default/60"
            >
              <td class="sticky left-0 z-10 bg-default px-2 py-1 font-mono text-muted whitespace-nowrap">
                隔期 {{ row[0]?.interval }}
              </td>
              <td
                v-for="cv in row"
                :key="`cell-${cv.interval}-${cv.remaining}`"
                class="px-1.5 py-1 text-center align-middle font-mono tabular-nums"
                :class="[cellBgClass(cv.cell), cellOpacityClass(cv.cell)]"
              >
                <template v-if="cv.cell">
                  <div class="leading-tight">
                    {{ fmtMean(cv.cell.meanHits) }}
                  </div>
                  <div class="text-[9px] leading-tight text-muted">
                    n={{ cv.cell.sampleCount }}
                  </div>
                </template>
                <template v-else>
                  <span class="text-muted">—</span>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="space-y-2">
      <header class="space-y-1">
        <h3 class="text-base font-semibold">
          驗證可信度
        </h3>
        <p class="text-xs text-muted">
          用前 {{ holdout.trainingCount }} 期當訓練、後 {{ holdout.testCount }} 期當考試。比較兩種預測法在考試期的平均誤差。
        </p>
      </header>

      <UCard :ui="{ body: 'p-4' }">
        <div class="space-y-3 text-sm">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="rounded-md border border-default p-3 space-y-1">
              <div class="text-xs text-muted">
                依「隔期 + 剩餘顆數」條件預測
              </div>
              <div class="font-mono text-lg tabular-nums">
                {{ fmtMean(holdout.conditionalMeanError) }} 顆
              </div>
              <div class="text-[11px] text-muted">
                每個（期、隔期）平均猜錯的顆數
              </div>
            </div>
            <div class="rounded-md border border-default p-3 space-y-1">
              <div class="text-xs text-muted">
                對照基準：只用該隔期整體平均
              </div>
              <div class="font-mono text-lg tabular-nums">
                {{ fmtMean(holdout.baselineMeanError) }} 顆
              </div>
              <div class="text-[11px] text-muted">
                忽略剩餘顆數、所有期一視同仁
              </div>
            </div>
          </div>

          <div class="rounded-md border border-default p-3 space-y-2">
            <div class="flex items-baseline gap-2 flex-wrap">
              <span class="text-xs text-muted">改善幅度：</span>
              <span
                class="font-mono text-base tabular-nums"
                :class="holdout.improvement > 0 ? 'text-emerald-500' : 'text-red-500'"
              >
                {{ holdout.improvement > 0 ? '−' : '+' }}{{ fmtMean(Math.abs(holdout.improvement)) }} 顆
                ({{ fmtPct(holdout.improvementRatio) }})
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
              {{ verdict.hint }}
            </p>
            <p class="text-[11px] text-muted">
              考試樣本數：{{ holdout.testObservations }} 筆（剩餘顆數 = 0 不計）；條件預測覆蓋率 {{ fmtPct(holdout.coverageRatio) }}（剩餘 {{ fmtPct(1 - holdout.coverageRatio) }} 找不到匹配的（隔期、剩餘）組合、退回對照基準預測）。
            </p>
          </div>
        </div>
      </UCard>
    </section>
  </div>
</template>
