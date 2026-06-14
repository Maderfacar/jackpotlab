<script setup lang="ts">
/**
 * 賓果海尼根「全壘打」 section + 歷史證據鏈
 *
 * **全壘打過濾後剩餘號碼**：來源 = 訊號 10「隔期剩餘號碼」上方卡 post-T periods[0..(slotCount-1)] sorted ascending
 *
 *   套用兩層過濾後顯示剩餘號碼：
 *   1. **位置把關**：把最新一期 firing perInterval[j].positionYs 視為「要排除的位置（1-indexed）」，
 *      直接套用到上方卡同 index 隔期、同 1-indexed 位置移除。
 *      若上方卡 rawSorted.length < y → 略過該位置（安靜跳過、不報錯）。
 *   2. **紅框移除**：上方卡 隔期 0 上紅框（連莊 = T csv=0 對應 sorted-unique T 號 = T ∩ T-1）
 *      從 隔期 0 過濾結果中再移除一遍，過濾後全壘打 隔期 0 不再有任何紅框。
 *
 *   不顯示紅框；4 排 badges 與「隔期剩餘號碼」風格一致。
 *
 * **歷史證據鏈**：對 scorecard.recentFirings 每筆 firing f：
 *   - 用 firing 內保存的 perInterval[j].remainingNumbers / positionYs / carryoverInPeriod0 套相同兩層過濾
 *   - 對 4 隔期 union 得 picks（升序、去重）
 *   - 「目標期 targetTerm = f.drawTerm + 1」（在 f.drawTerm 期觀察後、預測下一期）
 *   - actual = drawByTerm.get(targetTerm).numbers（未開出時為空）
 *   - hits = picks ∩ actual、機率 = hits / picks.length
 *   - 表格 UI 與訊號牆「歷史證據鏈」一致（命中號碼染綠 emerald、actual 用 warning solid）
 */

import type { GameId } from '~~/shared/lotto/games'
import type { AnalysisState } from '~/utils/analysis'
import { slotCountForOriginDistribution } from '~/hindsight/signals/bingo-origin-distribution'
import { RECENT_AVG_WINDOW, computeHomeRunByInterval, computeHomeRunEvidence } from '~/hindsight/home-run-evidence'
import type { HomeRunEvidenceRow } from '~/hindsight/home-run-evidence'
import { analyzeIntervalStats, type IntervalStats } from '~/hindsight/home-run-stats'
import { bingoTimeFromMap, buildBingoMinTermByDate } from '~/utils/bingo-time'
import type {
  BrainDraw,
  BrainState,
  OriginDistributionData,
  OriginIntervalEntry,
  SignalFiringRecord
} from '~/hindsight/types'

interface Props {
  gameId: GameId
  analysisState: AnalysisState | null
  brainState: BrainState | null
  drawsAsc: BrainDraw[]
  /**
   * 全壘打 section sticky top 偏移（px）。由 SignalDetail 的 #before-origin slot
   * 動態量條件區高度傳入；未提供時 fallback 到合理估值。
   */
  stickyTopOffset?: number
}

const props = withDefaults(defineProps<Props>(), {
  stickyTopOffset: 0
})

const stickyTopStyle = computed(() => {
  // 直接用父層傳入的 px 值。條件區不 sticky 時父傳 0、全壘打就黏 top:0。
  // hydrate 之前可能短暫為 0（SSR 階段 ResizeObserver 還沒跑），onMounted 後即時校正。
  return { top: `${props.stickyTopOffset}px` }
})

/**
 * 全壘打過濾後每顆號碼 + 它在「隔期剩餘號碼」（= post-T periods[j] sorted）內的
 * 1-indexed 位置（originPos）。使用者拍板：badge 右下角小字標 originPos，幫忙對齊
 * 上方訊號 10「隔期剩餘號碼」內的真實位置。
 */
interface HomeRunEntry {
  n: number
  originPos: number
}

interface HomeRunInterval {
  interval: number
  entries: HomeRunEntry[]
}

interface HomeRunData {
  perInterval: HomeRunInterval[]
}

// computeHomeRunByInterval 已搬到 ~/hindsight/home-run-evidence.ts。
// 全壘打 section、歷史證據鏈、歷史分析頁共用同一份。

/**
 * 第三層過濾：「過去 10 期高頻位置」黑名單
 *
 * 規格（使用者拍板）：
 *   - 看 scorecard.recentFirings 最近 10 期（不足就用實際數）
 *   - 對每期 firing：把所有隔期 j 的 positionYs union 成一個 Set（同期重複算一次）
 *   - 對每個位置 y、計算「過去 10 期內、有幾期 firing 出現過 y」
 *   - y ≥ 5（POSITION_THRESHOLD）且 出現期數 ≥ 8（FREQUENCY_THRESHOLD）→ 加入黑名單
 *   - 全壘打 隔期 0..(slotCount-1) 內、移除所有 originPos 在黑名單內的號碼
 *
 * 每期重新評估、不延續上期黑名單（每筆 firing 都會重算 recentFirings 視窗）。
 */
const RECENT_WINDOW_FOR_BLACKLIST = 10
const POSITION_BLACKLIST_THRESHOLD_Y = 5 // 位置數字 y 需 >= 5 才會被考慮
const POSITION_BLACKLIST_THRESHOLD_FREQ = 8 // 過去 10 期 >= 8 期出現

const blacklistedPositions = computed<Set<number>>(() => {
  const brain = props.brainState
  if (!brain) return new Set()
  const sc = brain.scorecards['bingo_origin_distribution']
  if (!sc) return new Set()

  const recent = sc.recentFirings.slice(-RECENT_WINDOW_FOR_BLACKLIST)
  const countByPos = new Map<number, number>()
  for (const firing of recent) {
    const od = firing.observationData?.originDistribution
    if (!od) continue
    // 同期重複算一期 → 用 Set 去重
    const positionsThisFiring = new Set<number>()
    for (const p of od.perInterval) {
      for (const y of p.positionYs ?? []) positionsThisFiring.add(y)
    }
    for (const y of positionsThisFiring) {
      countByPos.set(y, (countByPos.get(y) ?? 0) + 1)
    }
  }

  const blacklist = new Set<number>()
  for (const [y, count] of countByPos) {
    if (y >= POSITION_BLACKLIST_THRESHOLD_Y && count >= POSITION_BLACKLIST_THRESHOLD_FREQ) {
      blacklist.add(y)
    }
  }
  return blacklist
})

const homeRun = computed<HomeRunData | null>(() => {
  const as = props.analysisState
  const brain = props.brainState
  if (!as || !brain) return null
  if (as.history.length === 0) return null

  const slotCount = slotCountForOriginDistribution(props.gameId)
  if (as.periods.length < slotCount) return null

  const scorecard = brain.scorecards['bingo_origin_distribution']
  if (!scorecard) return null

  const latestFiring: SignalFiringRecord | undefined = scorecard.recentFirings.at(-1)
  const od: OriginDistributionData | undefined = latestFiring?.observationData?.originDistribution
  // 沒最新 firing perInterval 時，位置過濾失效；用空陣列代表「不過濾任何位置」
  const firingPerInterval: OriginIntervalEntry[] = od?.perInterval ?? []
  const carryoverSet = new Set<number>(od?.carryoverInPeriod0 ?? [])

  const rawByInterval: number[][] = []
  const positionYsByInterval: number[][] = []
  for (let j = 0; j < slotCount; j++) {
    const slot = as.periods[j]
    const rawSorted = slot ? [...slot.prizes].sort((a, b) => a - b) : []
    rawByInterval.push(rawSorted)
    positionYsByInterval.push(firingPerInterval[j]?.positionYs ?? [])
  }

  const filtered = computeHomeRunByInterval(rawByInterval, positionYsByInterval, carryoverSet, slotCount)
  const blacklist = blacklistedPositions.value
  // 對每隔期：建 raw → 1-indexed 位置 map，把過濾後號碼配上 originPos，
  // 並過濾掉 originPos 在「過去 10 期高頻位置」黑名單內的號。
  const perInterval: HomeRunInterval[] = filtered.map((numbers, j) => {
    const raw = rawByInterval[j] ?? []
    const posMap = new Map<number, number>()
    raw.forEach((v, idx) => posMap.set(v, idx + 1))
    const entries: HomeRunEntry[] = []
    for (const n of numbers) {
      const originPos = posMap.get(n) ?? 0
      if (originPos > 0 && blacklist.has(originPos)) continue
      entries.push({ n, originPos })
    }
    return { interval: j, entries }
  })
  return { perInterval }
})

const blacklistedPositionsSorted = computed<number[]>(() => {
  return [...blacklistedPositions.value].sort((a, b) => a - b)
})

// 賓果開獎時間 util（同 SignalDetail 通則）
const isBingo = computed(() => props.gameId === 'bingo_bingo')
const bingoMinTermByDate = computed<Map<string, number>>(() => {
  if (!isBingo.value) return new Map()
  return buildBingoMinTermByDate(props.drawsAsc)
})
function bingoTime(drawDate: string, drawTerm: number): string {
  return bingoTimeFromMap(bingoMinTermByDate.value, drawDate, drawTerm)
}

const drawByTerm = computed<Map<number, BrainDraw>>(() => {
  const m = new Map<number, BrainDraw>()
  for (const d of props.drawsAsc) m.set(d.drawTerm, d)
  return m
})

// HomeRunEvidenceRow 型別、computeHomeRunEvidence 主邏輯
// 已搬到 ~/hindsight/home-run-evidence.ts。歷史分析頁也用同一份。
const evidence = computed<HomeRunEvidenceRow[]>(() => {
  return computeHomeRunEvidence(props.gameId, props.brainState, props.drawsAsc)
})

/**
 * 各隔期相對閾值：用該隔期長期 mean / std 算 mean ± 0.5σ 當染色邊界。
 *
 * 為什麼用「相對」而非全域 24/26 絕對閾值：
 * stats 頁實測各隔期 mean 差到 5%（隔期 0=24%、隔期 2=29.6%），絕對閾值對
 * 不同隔期會嚴重誤判（隔期 2 平均就 > 26%、整天閃紅）。各隔期自己跟自己比
 * 才能 capture「相對於該隔期常態的冷/熱」。
 *
 * 0.5σ 帶寬：1σ 帶太寬（隔期 3 σ=21%、藍色帶 ±21% 永遠不會閃紅綠）；
 * 0.5σ 對應「中度偏離常態」、保留紅綠的辨識度。
 */
const statsByInterval = computed<IntervalStats[]>(() => {
  const slotCount = evidence.value[0]?.picksByInterval.length ?? 0
  if (slotCount === 0) return []
  return analyzeIntervalStats(evidence.value, slotCount)
})

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function isHit(num: number, hits: number[]): boolean {
  return hits.includes(num)
}

function rateText(r: number | null): string {
  if (r == null) return '—'
  return `${(r * 100).toFixed(1)}%`
}

/**
 * 相對閾值染色：用該隔期自己的 mean ± 0.5σ 切。
 *   - r < mean − 0.5σ → 綠（明顯冷於該隔期常態）
 *   - mean − 0.5σ ≤ r ≤ mean + 0.5σ → 藍（在該隔期常態範圍內）
 *   - r > mean + 0.5σ → 紅（明顯熱於該隔期常態）
 *   - mean / std 為 null（樣本不足）→ muted
 */
const SIGMA_K = 0.5
function avgRateColorClass(r: number | null, intervalIdx: number): string {
  if (r == null) return 'text-muted'
  const s = statsByInterval.value[intervalIdx]
  if (!s || s.mean == null || s.std == null) return 'text-muted'
  const low = s.mean - SIGMA_K * s.std
  const high = s.mean + SIGMA_K * s.std
  if (r < low) return 'text-emerald-500'
  if (r > high) return 'text-red-500'
  return 'text-blue-500'
}

// 歷史證據鏈可收合（預設展開）
const evidenceOpen = ref(true)
function toggleEvidence() {
  evidenceOpen.value = !evidenceOpen.value
}
</script>

<template>
  <!--
    全壘打 section sticky 在「獎號隔期來源」條件區下方、與條件區堆疊不被滾走。
    top 偏移用條件區高度估值（觀察型訊號條件區約 130-150px）。賓果一輪 5 分鐘、
    使用者多會邊滾動歷史證據鏈邊看上方候選號、sticky 體驗較好。
  -->
  <section
    v-if="homeRun"
    class="sticky z-10 -mx-2 sm:-mx-4 px-2 sm:px-4 pt-2 pb-3 space-y-2 bg-default/95 backdrop-blur supports-[backdrop-filter]:bg-default/70"
    :style="stickyTopStyle"
  >
    <h4 class="text-sm font-semibold">
      全壘打過濾後剩餘號碼
    </h4>
    <div
      v-if="blacklistedPositionsSorted.length > 0"
      class="text-[11px] text-muted"
    >
      高頻位置已過濾（過去 10 期 ≥ 8 期、位置 ≥ 5）：
      <span
        v-for="y in blacklistedPositionsSorted"
        :key="`blpos-${y}`"
        class="ml-1 inline-flex min-w-5 justify-center rounded border border-default px-1 py-0.5 font-mono text-[10px] text-default"
      >{{ y }}</span>
    </div>
    <UCard :ui="{ body: 'p-4' }">
      <div class="space-y-3">
        <div
          v-for="p in homeRun.perInterval"
          :key="`home-run-row-${p.interval}`"
          class="space-y-1"
        >
          <div class="text-[11px] text-muted">
            隔期 {{ p.interval }}（{{ p.entries.length }} 顆）
          </div>
          <!-- badge 尺寸與「隔期剩餘號碼」一致（size="md" + min-w-8、gap-1.5），
               保留 relative + 右下角 originPos 角標
               = 該號在「隔期剩餘號碼」rawSorted 內 1-indexed 位置 -->
          <div class="flex flex-wrap items-center gap-1.5">
            <UBadge
              v-for="e in p.entries"
              :key="`home-run-${p.interval}-${e.n}`"
              color="warning"
              variant="solid"
              size="md"
              class="relative min-w-8 justify-center font-mono"
            >
              {{ pad(e.n) }}
              <span
                v-if="e.originPos > 0"
                class="absolute bottom-0 right-0.5 text-[9px] leading-none font-normal text-black"
              >{{ e.originPos }}</span>
            </UBadge>
            <span
              v-if="p.entries.length === 0"
              class="text-xs text-muted"
            >—</span>
          </div>
        </div>
      </div>
    </UCard>
  </section>

  <!--
    歷史證據鏈：對每筆 firing 算當時的全壘打 picks、對比下一期 actual
    手機版改用 stacked 卡片 layout（避免擠成一直行）：
      期數 + 日期 + 時間
      命中機率（放在期數正下方）
      實際開出 一橫排
      隔期 0 一橫排
      隔期 1 一橫排
      ... 依 slotCount 排
    顏色不變：命中 emerald solid、未命中 neutral subtle、actual 黃色 warning solid。
    標題右側可收合按鈕、收合時隱藏整個 evidence 列表。
  -->
  <section
    v-if="homeRun"
    class="space-y-2"
  >
    <div class="flex items-center justify-between gap-2">
      <h4 class="text-sm font-semibold">
        歷史證據鏈
      </h4>
      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        :icon="evidenceOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        :aria-expanded="evidenceOpen"
        aria-controls="home-run-evidence-list"
        @click="toggleEvidence"
      >
        {{ evidenceOpen ? '收合' : '展開' }}
      </UButton>
    </div>
    <div
      v-if="evidenceOpen"
      id="home-run-evidence-list"
    >
      <div
        v-if="evidence.length === 0"
        class="rounded-md border border-dashed border-default p-4 text-center text-xs text-muted"
      >
        尚無亮燈紀錄
      </div>
      <div
        v-else
        class="space-y-3"
      >
        <UCard
          v-for="row in evidence"
          :key="`home-run-ev-${row.drawTerm}`"
          :ui="{ body: 'p-3 sm:p-4' }"
        >
          <div class="space-y-3 text-xs">
            <!-- 期數 + 日期 + 時間、命中機率放在正下方 -->
            <div class="space-y-1">
              <div class="flex items-baseline gap-2 flex-wrap">
                <span class="font-mono text-sm font-semibold">{{ row.drawTerm }}</span>
                <span class="text-[10px] text-muted">
                  {{ row.drawDate || '—' }}
                  <span
                    v-if="isBingo && row.drawDate && bingoTime(row.drawDate, row.drawTerm)"
                    class="ml-1"
                  >{{ bingoTime(row.drawDate, row.drawTerm) }}</span>
                </span>
              </div>
              <div
                class="font-mono tabular-nums text-[11px]"
                :class="row.hits > 0 ? 'text-emerald-500' : 'text-muted'"
              >
                命中機率 {{ row.hits }}/{{ row.picks.length }}
                <span class="ml-1">{{ rateText(row.rate) }}</span>
              </div>
            </div>

            <!-- 第一列：實際開出 -->
            <div class="space-y-1">
              <div class="text-[10px] text-muted">
                實際開出（{{ row.actual.length }} 顆）
              </div>
              <div
                v-if="row.actual.length === 0"
                class="text-[10px] text-muted"
              >
                —
              </div>
              <div
                v-else
                class="flex flex-wrap items-center gap-1"
              >
                <UBadge
                  v-for="n in row.actual"
                  :key="`hr-a-${row.drawTerm}-${n}`"
                  color="warning"
                  variant="solid"
                  size="sm"
                  class="min-w-7 justify-center font-mono"
                >
                  {{ pad(n) }}
                </UBadge>
              </div>
            </div>

            <!-- 第二列起：隔期 0、1、2、3 依 slotCount 排（每排顯示該排命中機率） -->
            <div
              v-for="(arr, j) in row.picksByInterval"
              :key="`hr-row-${row.drawTerm}-int-${j}`"
              class="space-y-1"
            >
              <div class="flex items-baseline gap-2 flex-wrap text-[10px]">
                <span class="text-muted">
                  隔期 {{ j }}（{{ arr.length }} 顆）
                </span>
                <span
                  v-if="arr.length > 0"
                  class="font-mono tabular-nums"
                  :class="(row.hitsByInterval[j] ?? 0) > 0 ? 'text-emerald-500' : 'text-muted'"
                >
                  命中 {{ row.hitsByInterval[j] ?? 0 }}/{{ arr.length }}
                  <span class="ml-0.5">{{ rateText(row.rateByInterval[j] ?? null) }}</span>
                </span>
                <span
                  v-if="row.recentAvgRateByInterval[j] != null"
                  class="font-mono tabular-nums"
                  :class="avgRateColorClass(row.recentAvgRateByInterval[j] ?? null, j)"
                  :title="`含當期在內的最近 ${RECENT_AVG_WINDOW} 期該隔期命中機率平均；染色用該隔期自己的 mean ± 0.5σ（綠 = 明顯冷、藍 = 常態、紅 = 明顯熱）`"
                >
                  · 過去 {{ RECENT_AVG_WINDOW }} 期平均 {{ rateText(row.recentAvgRateByInterval[j] ?? null) }}
                </span>
              </div>
              <div
                v-if="arr.length === 0"
                class="text-[10px] text-muted"
              >
                —
              </div>
              <div
                v-else
                class="flex flex-wrap items-center gap-1"
              >
                <UBadge
                  v-for="n in arr"
                  :key="`hr-p-${row.drawTerm}-${j}-${n}`"
                  :color="isHit(n, row.hitNumbers) ? 'success' : 'neutral'"
                  :variant="isHit(n, row.hitNumbers) ? 'solid' : 'subtle'"
                  size="sm"
                  class="min-w-7 justify-center font-mono"
                >
                  {{ pad(n) }}
                </UBadge>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </section>

</template>
