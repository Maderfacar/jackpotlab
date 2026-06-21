<script setup lang="ts">
/**
 * 柯比 /kobe
 *
 * 賓果賓果的「獎號來源觀察紀錄」即時頁。
 *   - 來源資料：隔期狀態 + 獎號關聯（hydrate 自 utils/analysis）
 *   - 每一期一張卡：顯示獎號被歸入哪個隔期、該隔期原本有 X 顆、本期開出 K 顆、位置 Y、最新數值 V
 *   - 不只 0-3，所有 N=60 隔期都列；找不到於任何隔期的號碼歸為「新號」群
 *
 * UI 承襲自 /bingo-heineken HomeRunSection 觀察紀錄：UCard、UBadge size=md warning solid、min-w-8、stacked。
 *
 * 「數值 V」= `values` CSV 第 k 項 = parseLeftValue(row.record) at time of T，
 *   也就是該隔期在「獎號關聯」表的「數值」欄位，亦即「該隔期 record CSV 首碼」at T。
 *   同一期多顆獎號落在同一隔期 → 共用同一個 V（因為它們讀的是同一個 row.record）。
 */
import type { DrawQueryResponse } from '~~/shared/lotto/types'
import {
  hydrateFromDraws,
  defaultN,
  defaultD,
  type AnalysisDrawInput,
  type HistoryEntry
} from '~/utils/analysis'
import { bingoTimeFromMap, buildBingoMinTermByDate } from '~/utils/bingo-time'

definePageMeta({
  title: '柯比'
})

const KOBE_ANALYSIS_N = defaultN()
const KOBE_FETCH_LIMIT = defaultD('bingo_bingo')
const BINGO_POLL_MS = 30_000

interface NormalizedDraw {
  drawTerm: number
  drawDate: string
  numbers: number[]
}

const loading = ref(false)
const error = ref<string | null>(null)
const allDraws = ref<NormalizedDraw[]>([])

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<DrawQueryResponse>('/api/draws/bingo_bingo/recent', {
      params: { limit: KOBE_FETCH_LIMIT }
    })
    allDraws.value = [...res.results]
      .sort((a, b) => a.drawTerm - b.drawTerm)
      .map((r) => {
        const merged = r.special != null ? [...r.numbers, r.special] : r.numbers
        return {
          drawTerm: r.drawTerm,
          drawDate: r.drawDate,
          numbers: [...new Set(merged)].sort((a, b) => a - b)
        }
      })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'unknown error'
  } finally {
    loading.value = false
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  load()
  if (typeof window === 'undefined') return
  pollTimer = setInterval(async () => {
    if (loading.value) return
    try {
      const res = await $fetch<DrawQueryResponse>('/api/draws/bingo_bingo/latest')
      const latestServer = res.results[0]?.drawTerm
      if (latestServer == null) return
      const local = allDraws.value
      const localLatest = local.length > 0 ? local[local.length - 1]!.drawTerm : null
      if (localLatest == null || latestServer > localLatest) {
        await load()
      }
    } catch {
      // 單次 poll 失敗忽略
    }
  }, BINGO_POLL_MS)
})

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})

const bingoMinTermByDate = computed<Map<string, number>>(() => buildBingoMinTermByDate(allDraws.value))

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

const analysisState = computed(() => {
  if (allDraws.value.length === 0) return null
  const inputs: AnalysisDrawInput[] = allDraws.value.map(d => ({
    drawTerm: d.drawTerm,
    drawDate: d.drawDate,
    prizes: d.numbers
  }))
  return hydrateFromDraws('bingo_bingo', KOBE_ANALYSIS_N, inputs)
})

interface KobeEntry {
  n: number
  /** 1-indexed 位置 Y（origPos）；新號為 null */
  posY: number | null
}

interface KobeGroup {
  /** -1 = 新號（找不到於任何 slot）；否則為 foundIdx（pre-T-shift 隔期索引） */
  interval: number
  /** 該隔期本期開出顆數（K） */
  hitCount: number
  /** 該隔期本期之前剩餘顆數（X，即 positions 字串的 X） */
  originalCount: number | null
  /** 該隔期 record CSV 首碼 leftVal at time of T；新號無值 */
  recordValue: number | null
  entries: KobeEntry[]
}

interface KobeRow {
  drawTerm: number
  drawDate: string
  dateLabel: string
  totalCount: number
  groups: KobeGroup[]
}

function parsePositionXY(s: string | undefined): { x: number, y: number } | null {
  if (!s) return null
  const dash = s.indexOf('-')
  if (dash < 0) return null
  const x = Number.parseInt(s.slice(0, dash), 10)
  const y = Number.parseInt(s.slice(dash + 1), 10)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

function buildRowFromHistory(h: HistoryEntry): KobeRow | null {
  const termNum = Number.parseInt(h.issue, 10)
  if (!Number.isFinite(termNum)) return null
  if (!h.periods) return null

  const nums = h.prizes
    ? h.prizes.split(',').map(s => Number.parseInt(s, 10)).filter(Number.isFinite)
    : []
  const periodsParts = h.periods.split(',')
  const positionsParts = (h.positions ?? '').split(',')
  const valuesParts = (h.values ?? '').split(',')

  interface Builder {
    interval: number
    originalCount: number | null
    recordValue: number | null
    entries: KobeEntry[]
  }
  const groupMap = new Map<number, Builder>()
  const newGroup: Builder = { interval: -1, originalCount: null, recordValue: null, entries: [] }

  for (let k = 0; k < nums.length; k++) {
    const n = nums[k]!
    const pStr = periodsParts[k]
    const xyStr = positionsParts[k]
    const vStr = valuesParts[k]
    const pNum = pStr ? Number.parseInt(pStr, 10) : Number.NaN
    if (!Number.isFinite(pNum)) {
      newGroup.entries.push({ n, posY: null })
      continue
    }
    const xy = parsePositionXY(xyStr)
    const vNum = vStr ? Number.parseInt(vStr, 10) : Number.NaN
    let g = groupMap.get(pNum)
    if (!g) {
      g = {
        interval: pNum,
        originalCount: xy ? xy.x : null,
        recordValue: Number.isFinite(vNum) ? vNum : null,
        entries: []
      }
      groupMap.set(pNum, g)
    }
    g.entries.push({ n, posY: xy ? xy.y : null })
  }

  const groups: KobeGroup[] = [...groupMap.values()]
    .sort((a, b) => a.interval - b.interval)
    .map(g => ({
      interval: g.interval,
      hitCount: g.entries.length,
      originalCount: g.originalCount,
      recordValue: g.recordValue,
      entries: [...g.entries].sort((a, b) => a.n - b.n)
    }))

  if (newGroup.entries.length > 0) {
    groups.push({
      interval: -1,
      hitCount: newGroup.entries.length,
      originalCount: null,
      recordValue: null,
      entries: [...newGroup.entries].sort((a, b) => a.n - b.n)
    })
  }

  return {
    drawTerm: termNum,
    drawDate: h.date,
    dateLabel: dateLabel(h.date, termNum),
    totalCount: nums.length,
    groups
  }
}

const rows = computed<KobeRow[]>(() => {
  const s = analysisState.value
  if (!s) return []
  const out: KobeRow[] = []
  for (const h of s.history) {
    const row = buildRowFromHistory(h)
    if (row) out.push(row)
  }
  out.reverse()
  return out
})

const latestDrawInfo = computed<{ term: number, label: string } | null>(() => {
  const arr = allDraws.value
  if (arr.length === 0) return null
  const latest = arr[arr.length - 1]!
  return {
    term: latest.drawTerm,
    label: dateLabel(latest.drawDate, latest.drawTerm)
  }
})

function groupHeaderText(g: KobeGroup): string {
  if (g.interval === -1) return `新號（超出 N=${KOBE_ANALYSIS_N} 範圍） — ${g.hitCount} 顆`
  const original = g.originalCount ?? '?'
  return `隔期 ${g.interval} — 開出 ${g.hitCount} / ${original} 顆`
}
</script>

<template>
  <UContainer class="py-10 space-y-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="space-y-2">
        <h1 class="text-3xl font-semibold tracking-tight">
          柯比
        </h1>
        <p class="text-sm text-muted">
          每一期獎號的「來源隔期」觀察紀錄：以隔期狀態（N={{ KOBE_ANALYSIS_N }}）+ 獎號關聯為資料源，列出每顆獎號從哪個隔期被命中、該隔期原本有幾顆、本期開出幾顆、位置與「最新數值」。
        </p>
        <p
          v-if="latestDrawInfo"
          class="text-xs text-muted"
        >
          最新期：<span class="font-mono">{{ latestDrawInfo.term }}</span>
          <span class="ml-1">{{ latestDrawInfo.label }}</span>
        </p>
      </div>
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-refresh-cw"
        :loading="loading"
        @click="load"
      >
        重新整理
      </UButton>
    </header>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="`載入失敗：${error}`"
    />

    <div
      v-if="loading && rows.length === 0"
      class="space-y-3"
    >
      <USkeleton
        v-for="i in 3"
        :key="i"
        class="h-32 w-full rounded-lg"
      />
    </div>

    <div
      v-else-if="rows.length === 0"
      class="rounded-md border border-dashed border-default p-6 text-center text-sm text-muted"
    >
      尚無資料
    </div>

    <div
      v-else
      class="space-y-3"
    >
      <UCard
        v-for="row in rows"
        :key="`kobe-row-${row.drawTerm}`"
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
            :key="`kobe-${row.drawTerm}-int-${g.interval}`"
            class="space-y-1"
          >
            <div class="flex items-baseline gap-2 flex-wrap text-[10px]">
              <span
                class="font-mono"
                :class="g.interval === -1 ? 'text-blue-500' : 'text-muted'"
              >{{ groupHeaderText(g) }}</span>
              <span
                v-if="g.recordValue != null"
                class="font-mono tabular-nums text-muted"
                :title="`該隔期在「獎號關聯」表的「數值」欄位 = record CSV 首碼（at T 時刻）`"
              >
                · 數值 {{ g.recordValue }}
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              <UBadge
                v-for="e in g.entries"
                :key="`kobe-${row.drawTerm}-${g.interval}-${e.n}`"
                :color="g.interval === -1 ? 'info' : 'warning'"
                variant="solid"
                size="md"
                class="relative min-w-8 justify-center font-mono"
              >
                {{ pad(e.n) }}
                <span
                  v-if="e.posY != null"
                  class="absolute bottom-0 right-0.5 text-[9px] leading-none font-normal text-black"
                >{{ e.posY }}</span>
              </UBadge>
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>
