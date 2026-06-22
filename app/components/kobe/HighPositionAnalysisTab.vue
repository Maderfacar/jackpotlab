<script setup lang="ts">
/**
 * /kobe Tab 8 「高位來源」
 *
 * 規格（使用者拍板 v2）：
 *   - 按每期開獎為區塊
 *   - 每個區塊內、只列「該期 pre-T 剩餘 ≥ 10 顆的隔期」
 *     （位置 10 才可能存在 → 排除 remainingBefore < 10 的隔期）
 *   - 每個隔期一行：
 *       「隔期 J，位置 10 11 12 ... (raw 位置 ≥ 10 的清單)  開出 X Y Z (命中位置 ≥ 10 的清單)」
 *   - 只列位置數字、不列獎號
 *   - 觀察結果：理應最多從隔期 0-5（隔期 6+ 通常 remainingBefore < 10）
 *
 * 顯示量控制：加「最近 N 期」輸入欄、預設 50；避免 2000 期區塊太多。
 */
import type { PerDrawSnapshot } from '~/utils/kobe-stats'
import { bingoTimeFromMap, buildBingoMinTermByDate } from '~/utils/bingo-time'

interface Props { snapshots: PerDrawSnapshot[] }
const props = defineProps<Props>()

const HIGH_POSITION_THRESHOLD = 10 // 位置 ≥ 10 才列
const DEFAULT_RECENT_N = 50
const MAX_INTERVAL_SHOWN = 9 // 隔期 6+ 通常沒料、cap 一下避免無聊 row

const recentN = ref<number>(DEFAULT_RECENT_N)

const bingoMinTermByDate = computed<Map<string, number>>(() => {
  const drawsLike = props.snapshots.map(s => ({ drawTerm: s.drawTerm, drawDate: s.drawDate }))
  return buildBingoMinTermByDate(drawsLike)
})

interface IntervalRow {
  interval: number
  /** raw 位置中 ≥ 10 的清單 (升序)、長度 = max(0, remainingBefore - 9) */
  rawPositions: number[]
  /** 該期該隔期命中位置中 ≥ 10 的清單 (升序) */
  hitPositions: number[]
}

interface DrawCard {
  snapshotIndex: number
  drawTerm: number
  drawDate: string
  timeLabel: string
  rows: IntervalRow[]
}

const cards = computed<DrawCard[]>(() => {
  const out: DrawCard[] = []
  const snaps = props.snapshots
  // 第 0 期跳過（初始狀態）
  const start = Math.max(1, snaps.length - recentN.value)
  for (let i = start; i < snaps.length; i++) {
    const snap = snaps[i]!
    const rows: IntervalRow[] = []
    for (let j = 0; j <= Math.min(MAX_INTERVAL_SHOWN, snap.slots.length - 1); j++) {
      const slot = snap.slots[j]
      if (!slot) continue
      if (slot.remainingBefore < HIGH_POSITION_THRESHOLD) continue
      const rawPositions: number[] = []
      for (let p = HIGH_POSITION_THRESHOLD; p <= slot.remainingBefore; p++) rawPositions.push(p)
      const hitPositions = [...slot.hitPositions]
        .filter(y => y >= HIGH_POSITION_THRESHOLD)
        .sort((a, b) => a - b)
      rows.push({ interval: j, rawPositions, hitPositions })
    }
    if (rows.length === 0) continue
    out.push({
      snapshotIndex: i,
      drawTerm: snap.drawTerm,
      drawDate: snap.drawDate,
      timeLabel: bingoTimeFromMap(bingoMinTermByDate.value, snap.drawDate, snap.drawTerm),
      rows
    })
  }
  out.reverse() // 最新在上
  return out
})

const totalDraws = computed(() => Math.max(0, props.snapshots.length - 1))
</script>

<template>
  <div class="space-y-4">
    <UCard :ui="{ body: 'p-3' }">
      <div class="flex items-center gap-3 flex-wrap text-xs">
        <label class="flex items-center gap-2">
          <span class="text-muted">顯示最近</span>
          <UInput
            v-model.number="recentN"
            type="number"
            :min="1"
            :max="2000"
            step="1"
            size="sm"
            class="w-24"
          />
          <span class="text-muted">期</span>
        </label>
        <span class="text-[10px] text-muted">
          全期共 {{ totalDraws }} 期 · 位置 ≥ {{ HIGH_POSITION_THRESHOLD }} 才列 · 隔期 0-{{ MAX_INTERVAL_SHOWN }} 範圍內
        </span>
      </div>
    </UCard>

    <div
      v-if="cards.length === 0"
      class="rounded-md border border-dashed border-default p-6 text-center text-sm text-muted"
    >
      尚無資料
    </div>

    <UCard
      v-for="card in cards"
      :key="`hpos-card-${card.drawTerm}`"
      :ui="{ body: 'p-3 sm:p-4' }"
    >
      <div class="space-y-2 text-xs">
        <div class="flex items-baseline gap-2 flex-wrap">
          <span class="font-mono text-sm font-semibold">第 {{ card.drawTerm }} 期</span>
          <span class="text-[10px] text-muted">
            {{ card.drawDate }} {{ card.timeLabel }}
          </span>
        </div>
        <div
          v-for="row in card.rows"
          :key="`hpos-${card.drawTerm}-${row.interval}`"
          class="flex items-baseline gap-2 flex-wrap font-mono"
        >
          <span class="font-semibold whitespace-nowrap">隔期 {{ row.interval }}</span>
          <span class="text-muted">位置</span>
          <span class="tabular-nums">{{ row.rawPositions.join(' ') }}</span>
          <span class="text-muted">開出</span>
          <span
            v-if="row.hitPositions.length === 0"
            class="text-muted"
          >—</span>
          <span
            v-else
            class="tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold"
          >
            {{ row.hitPositions.join(' ') }}
          </span>
        </div>
      </div>
    </UCard>
  </div>
</template>
