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

/**
 * 共用 helper：對 4 隔期 raw（已 sorted ascending）套位置 + 紅框過濾。
 * 全壘打 section 與歷史證據鏈都用這個算。
 */
function computeHomeRunByInterval(
  rawByInterval: number[][],
  positionYsByInterval: number[][],
  carryoverSet: ReadonlySet<number>,
  slotCount: number
): number[][] {
  const out: number[][] = []
  for (let j = 0; j < slotCount; j++) {
    const raw = rawByInterval[j] ?? []
    const positionYs = positionYsByInterval[j] ?? []
    const removePos = new Set<number>()
    for (const y of positionYs) {
      // 上方卡此隔期長度 < y → 該位置不存在，跳過
      if (y >= 1 && y <= raw.length) removePos.add(y)
    }
    let after = raw.filter((_, idx) => !removePos.has(idx + 1))
    if (j === 0 && carryoverSet.size > 0) {
      after = after.filter(n => !carryoverSet.has(n))
    }
    out.push(after)
  }
  return out
}

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

interface HomeRunEvidenceRow {
  /** 被預測的目標期（= f.drawTerm + 1） */
  drawTerm: number
  drawDate: string
  /** 4 (或 6) 排按隔期分排的 picks，依 slotCount 動態 */
  picksByInterval: number[][]
  /** 每隔期命中數（picksByInterval[j] ∩ actual.length） */
  hitsByInterval: number[]
  /** 每隔期命中機率（hits / picks.length；該排 picks 為空時 null） */
  rateByInterval: Array<number | null>
  /**
   * 該筆 row 的「之前最近 5 期」內、每隔期 mean(rate)（picks=0 的期不計）；
   * 若 5 期內全部 null → null。
   */
  past5AvgRateByInterval: Array<number | null>
  /** picksByInterval union（去重升序），用來算總命中 */
  picks: number[]
  actual: number[]
  hits: number
  hitNumbers: number[]
  /** 0-3（或 0-5）總命中機率（hits / picks.length），picks 為空時為 null */
  rate: number | null
}

const PAST_AVG_WINDOW = 5

const evidence = computed<HomeRunEvidenceRow[]>(() => {
  const brain = props.brainState
  if (!brain) return []
  const sc = brain.scorecards['bingo_origin_distribution']
  if (!sc) return []
  const slotCount = slotCountForOriginDistribution(props.gameId)
  const dbt = drawByTerm.value

  const out: HomeRunEvidenceRow[] = []
  // 新的在上面（與訊號牆 evidence 排序一致）
  for (const f of [...sc.recentFirings].reverse()) {
    const od = f.observationData?.originDistribution
    if (!od) continue

    const rawByInterval = od.perInterval.map(p => [...(p.remainingNumbers ?? [])].sort((a, b) => a - b))
    const positionYsByInterval = od.perInterval.map(p => p.positionYs ?? [])
    const carryoverSet = new Set<number>(od.carryoverInPeriod0 ?? [])
    const filtered = computeHomeRunByInterval(rawByInterval, positionYsByInterval, carryoverSet, slotCount)
    // 按隔期分排（升序、已由 helper 保證 raw 升序、filtered 仍保留升序）
    const picksByInterval = filtered.map(arr => [...arr])

    // 4 (或 6) 隔期 union、去重、升序 — 用來算命中
    const picksSet = new Set<number>()
    for (const arr of filtered) {
      for (const n of arr) picksSet.add(n)
    }
    const picks = [...picksSet].sort((a, b) => a - b)

    const targetTerm = f.drawTerm + 1
    const targetDraw = dbt.get(targetTerm)
    const actual = targetDraw?.numbers ?? []
    // 跳過「下一期待開出」row（最新一期 firing 的 targetTerm = T+1 還沒開）
    // 或 drawByTerm 缺資料的中間 row。歷史證據鏈只顯示已開出可驗證的紀錄。
    if (actual.length === 0) continue
    const actualDate = targetDraw?.drawDate ?? ''
    const actualSet = new Set(actual)
    const hitNumbers = picks.filter(p => actualSet.has(p))
    const hits = hitNumbers.length
    const rate = picks.length > 0 ? hits / picks.length : null

    // 每隔期命中數與命中機率
    const hitsByInterval = picksByInterval.map(arr => arr.filter(p => actualSet.has(p)).length)
    const rateByInterval = picksByInterval.map((arr, j) => arr.length > 0 ? (hitsByInterval[j] ?? 0) / arr.length : null)

    out.push({
      drawTerm: targetTerm,
      drawDate: actualDate,
      picksByInterval,
      hitsByInterval,
      rateByInterval,
      past5AvgRateByInterval: [], // 先佔位、第二輪填入
      picks,
      actual,
      hits,
      hitNumbers,
      rate
    })
  }

  // 第二輪：對每筆 row 計算「過去 5 期該隔期的平均命中機率」
  // out 順序：最新在前（reverse 過的）。對 row i、「過去 5 期」= 時間上更早的 5 筆 = out[i+1..i+5]。
  for (let i = 0; i < out.length; i++) {
    const past = out.slice(i + 1, i + 1 + PAST_AVG_WINDOW)
    const avgs: Array<number | null> = []
    const slotCount = out[i]!.picksByInterval.length
    for (let j = 0; j < slotCount; j++) {
      let sum = 0
      let n = 0
      for (const p of past) {
        const r = p.rateByInterval[j]
        if (r != null) {
          sum += r
          n++
        }
      }
      avgs.push(n > 0 ? sum / n : null)
    }
    out[i]!.past5AvgRateByInterval = avgs
  }
  return out
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

// 過去 5 期平均染色門檻（使用者拍板）：< 24% 綠、24%-26% 藍、> 26% 紅
function avgRateColorClass(r: number | null): string {
  if (r == null) return 'text-muted'
  if (r < 0.24) return 'text-emerald-500'
  if (r > 0.26) return 'text-red-500'
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
                  v-if="row.past5AvgRateByInterval[j] != null"
                  class="font-mono tabular-nums"
                  :class="avgRateColorClass(row.past5AvgRateByInterval[j] ?? null)"
                  :title="`過去 5 期該隔期命中機率平均（門檻：< 24% 綠、24%-26% 藍、> 26% 紅）`"
                >
                  · 過去 5 期平均 {{ rateText(row.past5AvgRateByInterval[j] ?? null) }}
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
