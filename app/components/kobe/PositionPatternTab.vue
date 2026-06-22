<script setup lang="ts">
/**
 * /kobe Tab 4 「位置規律」
 *
 * 設計（使用者拍板）：版面採用「高位來源」分頁同一風格，但範圍為位置 1-20。
 *   - 控制台：可調整顯示最近 N 期
 *   - 整體統計：在選擇的期數範圍內、位置 1-20 各被開出幾次（橫跨所有隔期合計）
 *   - 每期一個區塊：列出該期內所有隔期 (0-19)、可用位置 1..min(20, 剩餘) 與命中位置
 *   - 資料源同「觀察紀錄」：snapshot.slots.hitPositions
 */
import type { PerDrawSnapshot } from '~/utils/kobe-stats'
import { bingoTimeFromMap, buildBingoMinTermByDate } from '~/utils/bingo-time'

interface Props { snapshots: PerDrawSnapshot[] }
const props = defineProps<Props>()

const MAX_POSITION = 20
const MAX_INTERVAL_SHOWN = 19
const DEFAULT_RECENT_N = 50

const recentN = ref<number>(DEFAULT_RECENT_N)

const bingoMinTermByDate = computed<Map<string, number>>(() => {
  const drawsLike = props.snapshots.map(s => ({ drawTerm: s.drawTerm, drawDate: s.drawDate }))
  return buildBingoMinTermByDate(drawsLike)
})

interface IntervalRow {
  interval: number
  rawPositions: number[]
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
      if (slot.remainingBefore <= 0) continue
      const cap = Math.min(MAX_POSITION, slot.remainingBefore)
      const rawPositions: number[] = []
      for (let p = 1; p <= cap; p++) rawPositions.push(p)
      const hitPositions = [...slot.hitPositions]
        .filter(y => y >= 1 && y <= MAX_POSITION)
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

interface PositionTotal {
  position: number
  count: number
}

const positionTotals = computed<PositionTotal[]>(() => {
  const counts = new Array<number>(MAX_POSITION + 1).fill(0)
  for (const card of cards.value) {
    for (const row of card.rows) {
      for (const y of row.hitPositions) {
        if (y >= 1 && y <= MAX_POSITION) counts[y]! += 1
      }
    }
  }
  const out: PositionTotal[] = []
  for (let p = 1; p <= MAX_POSITION; p++) {
    out.push({ position: p, count: counts[p]! })
  }
  return out
})

const totalDraws = computed<number>(() => Math.max(0, props.snapshots.length - 1))
const drawsShown = computed<number>(() => cards.value.length)
const totalHits = computed<number>(() => {
  let sum = 0
  for (const t of positionTotals.value) sum += t.count
  return sum
})
const maxTotalCount = computed<number>(() => {
  let m = 0
  for (const t of positionTotals.value) {
    if (t.count > m) m = t.count
  }
  return m
})

function fmtPct(numerator: number, denominator: number): string {
  if (denominator <= 0) return '—'
  const pct = (numerator / denominator) * 100
  if (pct >= 10) return `${pct.toFixed(1)}%`
  return `${pct.toFixed(2)}%`
}
</script>

<template>
  <div class="space-y-4">
    <!-- 控制台 -->
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
          全期共 {{ totalDraws }} 期 · 實際顯示 {{ drawsShown }} 期 · 位置 1-{{ MAX_POSITION }} 範圍 · 隔期 0-{{ MAX_INTERVAL_SHOWN }}
        </span>
      </div>
    </UCard>

    <!-- 整體統計（位置 1-20 各開出幾次） -->
    <UCard :ui="{ body: 'p-3 sm:p-4' }">
      <div class="space-y-2">
        <header class="flex items-baseline gap-2 flex-wrap">
          <h3 class="text-sm font-semibold">
            整體統計 · 位置 1-{{ MAX_POSITION }} 開出次數
          </h3>
          <span class="text-[10px] text-muted">
            最近 {{ drawsShown }} 期、橫跨所有隔期合計 {{ totalHits }} 次命中
          </span>
        </header>
        <div class="grid grid-cols-5 sm:grid-cols-10 gap-1.5 text-xs">
          <div
            v-for="item in positionTotals"
            :key="`pos-total-${item.position}`"
            class="relative rounded border border-default p-2 flex flex-col items-center gap-0.5 overflow-hidden"
          >
            <span class="font-mono text-[10px] text-muted">位 {{ item.position }}</span>
            <span class="font-mono font-semibold text-base tabular-nums">{{ item.count }}</span>
            <span class="text-[9px] text-muted">{{ fmtPct(item.count, totalHits) }}</span>
            <div
              class="absolute bottom-0 left-0 h-0.5 bg-emerald-500/60"
              :style="{ width: maxTotalCount > 0 ? `${(item.count / maxTotalCount) * 100}%` : '0%' }"
            />
          </div>
        </div>
      </div>
    </UCard>

    <!-- 每期區塊 -->
    <div
      v-if="cards.length === 0"
      class="rounded-md border border-dashed border-default p-6 text-center text-sm text-muted"
    >
      尚無資料
    </div>

    <UCard
      v-for="card in cards"
      :key="`pos-card-${card.drawTerm}`"
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
          :key="`pos-${card.drawTerm}-${row.interval}`"
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
