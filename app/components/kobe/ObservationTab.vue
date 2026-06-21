<script setup lang="ts">
/**
 * /kobe Tab 1 「觀察紀錄」
 *
 * 每一期一張卡：按來源隔期分組、列出 K/X、位置 Y、數值 V。
 * 從 /kobe 主頁第一版抽出，邏輯不變。
 *
 * 為了 2000 期渲染順、預設只顯示最近 200 期（含「全部展開」按鈕）。
 * 2000 期 × 平均 6 群 × 平均 3 號 = ~36000 DOM 節點；先 cap 在最近 200 期。
 */
import type { PerDrawSnapshot } from '~/utils/kobe-stats'
import { bingoTimeFromMap, buildBingoMinTermByDate } from '~/utils/bingo-time'

interface Props {
  snapshots: PerDrawSnapshot[]
  intervalCount: number
}
const props = defineProps<Props>()

const DEFAULT_VISIBLE_COUNT = 200
const showAll = ref(false)

interface KobeEntry { n: number, posY: number }
interface KobeGroup {
  interval: number
  hitCount: number
  originalCount: number
  recordValue: number | null
  entries: KobeEntry[]
}
interface KobeRow {
  drawTerm: number
  drawDate: string
  dateLabel: string
  totalCount: number
  groups: KobeGroup[]
  /** 新號（找不到於任何 slot）— 沒有位置/數值資訊 */
  newcomers: number[]
}

const bingoMinTermByDate = computed<Map<string, number>>(() => {
  const drawsLike = props.snapshots.map(s => ({ drawTerm: s.drawTerm, drawDate: s.drawDate }))
  return buildBingoMinTermByDate(drawsLike)
})

function timeOf(date: string, term: number): string {
  return bingoTimeFromMap(bingoMinTermByDate.value, date, term)
}
function dateLabel(date: string, term: number): string {
  if (!date || date.length < 10) return ''
  const md = `${date.slice(5, 7)}/${date.slice(8, 10)}`
  const time = timeOf(date, term)
  return time ? `${md} ${time}` : md
}
function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

/**
 * 將 snapshot 轉成顯示用 row：用 snapshot.slots 的 hitNumbers 反推哪些號是新號。
 * 新號 = actualNumbers - 全部 hit 號的 union。
 */
function buildRow(snap: PerDrawSnapshot): KobeRow | null {
  if (!Number.isFinite(snap.drawTerm)) return null
  const groups: KobeGroup[] = []
  const hitSet = new Set<number>()
  for (const slot of snap.slots) {
    if (slot.hitsThisDraw === 0) continue
    // hitNumbers 已 sorted asc、hitPositions 與其同步、皆為該號在原 slot sorted 序列的 1-indexed 位置
    const entries: KobeEntry[] = slot.hitNumbers.map((n, idx) => ({
      n,
      posY: slot.hitPositions[idx] ?? (idx + 1)
    }))
    for (const n of slot.hitNumbers) hitSet.add(n)
    groups.push({
      interval: slot.interval,
      hitCount: slot.hitsThisDraw,
      originalCount: slot.remainingBefore,
      recordValue: slot.recordValueBefore,
      entries
    })
  }
  groups.sort((a, b) => a.interval - b.interval)
  const newcomers: number[] = []
  for (const n of snap.actualNumbers) {
    if (!hitSet.has(n)) newcomers.push(n)
  }
  newcomers.sort((a, b) => a - b)
  return {
    drawTerm: snap.drawTerm,
    drawDate: snap.drawDate,
    dateLabel: dateLabel(snap.drawDate, snap.drawTerm),
    totalCount: snap.actualNumbers.length,
    groups,
    newcomers
  }
}

const rows = computed<KobeRow[]>(() => {
  const out: KobeRow[] = []
  // 跳過第一期（snapshot.slots 為初始狀態、無命中資訊）
  for (let i = 1; i < props.snapshots.length; i++) {
    const row = buildRow(props.snapshots[i]!)
    if (row) out.push(row)
  }
  out.reverse()
  return out
})

const visibleRows = computed<KobeRow[]>(() => {
  if (showAll.value) return rows.value
  return rows.value.slice(0, DEFAULT_VISIBLE_COUNT)
})

function groupHeaderText(g: KobeGroup): string {
  return `隔期 ${g.interval} — 開出 ${g.hitCount} / ${g.originalCount} 顆`
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-2 text-xs text-muted">
      <span>共 {{ rows.length }} 期</span>
      <UButton
        v-if="rows.length > DEFAULT_VISIBLE_COUNT"
        color="neutral"
        variant="ghost"
        size="xs"
        @click="showAll = !showAll"
      >
        {{ showAll ? `只看最近 ${DEFAULT_VISIBLE_COUNT} 期` : `展開全部 ${rows.length} 期` }}
      </UButton>
    </div>

    <div
      v-if="rows.length === 0"
      class="rounded-md border border-dashed border-default p-6 text-center text-sm text-muted"
    >
      尚無資料
    </div>

    <UCard
      v-for="row in visibleRows"
      :key="`kobe-obs-${row.drawTerm}`"
      :ui="{ body: 'p-3 sm:p-4' }"
    >
      <div class="space-y-3 text-xs">
        <div class="flex items-baseline gap-2 flex-wrap">
          <span class="font-mono text-sm font-semibold">{{ row.drawTerm }}</span>
          <span class="text-[10px] text-muted">{{ row.dateLabel || '—' }}</span>
          <span class="text-[10px] text-muted">共 {{ row.totalCount }} 顆</span>
        </div>

        <div
          v-for="g in row.groups"
          :key="`kobe-obs-${row.drawTerm}-int-${g.interval}`"
          class="space-y-1"
        >
          <div class="flex items-baseline gap-2 flex-wrap text-[10px]">
            <span class="font-mono text-muted">{{ groupHeaderText(g) }}</span>
            <span
              v-if="g.recordValue != null"
              class="font-mono tabular-nums text-muted"
              title="該隔期 record CSV 首碼 at pre-T、即「獎號關聯」的「數值」欄位"
            >
              · 數值 {{ g.recordValue }}
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <UBadge
              v-for="e in g.entries"
              :key="`kobe-obs-${row.drawTerm}-${g.interval}-${e.n}`"
              color="warning"
              variant="solid"
              size="md"
              class="relative min-w-8 justify-center font-mono"
            >
              {{ pad(e.n) }}
              <span class="absolute bottom-0 right-0.5 text-[9px] leading-none font-normal text-black">
                {{ e.posY }}
              </span>
            </UBadge>
          </div>
        </div>

        <div
          v-if="row.newcomers.length > 0"
          class="space-y-1"
        >
          <div class="text-[10px] font-mono text-blue-500">
            新號（超出 N={{ intervalCount }} 範圍） — {{ row.newcomers.length }} 顆
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <UBadge
              v-for="n in row.newcomers"
              :key="`kobe-new-${row.drawTerm}-${n}`"
              color="info"
              variant="solid"
              size="md"
              class="min-w-8 justify-center font-mono"
            >
              {{ pad(n) }}
            </UBadge>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
