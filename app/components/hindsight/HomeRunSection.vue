<script setup lang="ts">
/**
 * 賓果海尼根「全壘打」 section
 *
 * 來源：訊號 10「隔期剩餘號碼」上方卡 post-T periods[0..(slotCount-1)] sorted ascending
 *
 * 套用兩層過濾後顯示剩餘號碼：
 *   1. **位置把關**：把最新一期 firing perInterval[j].positionYs 視為「要排除的位置（1-indexed）」，
 *      直接套用到上方卡同 index 隔期、同 1-indexed 位置移除。
 *      若上方卡 rawSorted.length < y → 略過該位置（安靜跳過、不報錯）。
 *   2. **紅框移除**：上方卡 隔期 0 上紅框（連莊 = T csv=0 對應 sorted-unique T 號 = T ∩ T-1）
 *      從 隔期 0 過濾結果中再移除一遍，過濾後全壘打 隔期 0 不再有任何紅框。
 *
 * 不顯示紅框；4 排 badges 與「隔期剩餘號碼」風格一致。
 */

import type { GameId } from '~~/shared/lotto/games'
import type { AnalysisState } from '~/utils/analysis'
import { slotCountForOriginDistribution } from '~/hindsight/signals/bingo-origin-distribution'
import type {
  BrainState,
  OriginDistributionData,
  OriginIntervalEntry,
  SignalFiringRecord
} from '~/hindsight/types'

interface Props {
  gameId: GameId
  analysisState: AnalysisState | null
  brainState: BrainState | null
}

const props = defineProps<Props>()

interface HomeRunInterval {
  interval: number
  numbers: number[]
}

interface HomeRunData {
  perInterval: HomeRunInterval[]
}

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

  const perInterval: HomeRunInterval[] = []
  for (let j = 0; j < slotCount; j++) {
    const slot = as.periods[j]
    if (!slot) {
      perInterval.push({ interval: j, numbers: [] })
      continue
    }
    const rawSorted = [...slot.prizes].sort((a, b) => a - b)

    // 位置過濾：positionYs 是 1-indexed
    const positionYs = firingPerInterval[j]?.positionYs ?? []
    const removePos = new Set<number>()
    for (const y of positionYs) {
      // 上方卡此隔期長度 < y → 該位置不存在，跳過
      if (y >= 1 && y <= rawSorted.length) removePos.add(y)
    }

    let afterPositionFilter: number[] = rawSorted.filter((_, idx) => !removePos.has(idx + 1))

    // 隔期 0：再移除紅框（連莊）
    if (j === 0 && carryoverSet.size > 0) {
      afterPositionFilter = afterPositionFilter.filter(n => !carryoverSet.has(n))
    }

    perInterval.push({ interval: j, numbers: afterPositionFilter })
  }

  return { perInterval }
})

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}
</script>

<template>
  <section
    v-if="homeRun"
    class="space-y-2"
  >
    <h4 class="text-sm font-semibold">
      全壘打
    </h4>
    <UCard :ui="{ body: 'p-4' }">
      <div class="space-y-3">
        <div
          v-for="p in homeRun.perInterval"
          :key="`home-run-row-${p.interval}`"
          class="space-y-1"
        >
          <div class="text-[11px] text-muted">
            隔期 {{ p.interval }}（{{ p.numbers.length }} 顆）
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <UBadge
              v-for="n in p.numbers"
              :key="`home-run-${p.interval}-${n}`"
              color="warning"
              variant="solid"
              size="md"
              class="min-w-8 justify-center font-mono"
            >
              {{ pad(n) }}
            </UBadge>
            <span
              v-if="p.numbers.length === 0"
              class="text-xs text-muted"
            >—</span>
          </div>
        </div>
      </div>
    </UCard>
  </section>
</template>
