<script setup lang="ts">
/**
 * 號碼走勢（2026-10-08 使用者拍板：一整頁同時看開獎、隔期狀態、獎號關聯、尾數）。
 *
 * 資料：/api/analysis/lotto539?format=json（與 LLM 讀的同一支，CDN 快取）。
 *   - 走勢格：列 = 每一期（新在上）、欄 = 1～39 號。開出 = 橘色球；沒開 = 藍色深淺表示已連續幾期沒開。
 *   - 號碼欄正上方「目前隔期」= 現在每個號碼隔了幾期沒開（就是隔期狀態表的 slot 編號）。
 *   - 每顆球的隔期 / 現值 / 位置 x-y 來自 API history（與 /draws 頁同一套演算法）。
 *   - 右側 10 欄 = 尾數 0～9 各開出幾顆；再右邊 = 五顆的隔期與隔期和。
 * 顏色：藍（sequential，遺漏期數）+ 橘（開出），已用 dataviz validator 驗證亮 / 暗模式皆通過。
 */
interface HistoryEntry {
  issue: string
  date: string
  prizes: string
  tails: number[]
  periods?: string
  sum?: number | ''
  values?: string
  positions?: string
}
interface SlotPeriod {
  period: number
  issue: string
  date: string
  prizes: number[]
  record: string
}
interface AnalysisJson {
  range: { drawCount: number }
  periods: SlotPeriod[]
  history: HistoryEntry[]
}

useSeoMeta({ title: '號碼走勢 — 今彩 539' })

const NUMBER_MAX = 39
const NUMBERS = Array.from({ length: NUMBER_MAX }, (_, i) => i + 1)
const TAILS = Array.from({ length: 10 }, (_, i) => i)
const HEAT_CAP = 30

const { data, status, error } = useFetch<AnalysisJson>('/api/analysis/lotto539', {
  query: { format: 'json' },
  server: false
})

const rowCount = ref(50)
const rowOptions = [
  { label: '近 30 期', value: 30 },
  { label: '近 50 期', value: 50 },
  { label: '近 100 期', value: 100 },
  { label: '近 200 期', value: 200 }
]
const showMissNumbers = ref(false)
const focusNumber = ref<number | null>(null)

interface BallInfo {
  gap: number | null
  value: number | null
  pos: string | null
}
interface Row {
  index: number
  issue: string
  date: string
  drawn: Map<number, BallInfo>
  /** 號碼 → 這一期結束時已連續幾期沒開（開出 = 0；從未出現 = null） */
  miss: (number | null)[]
  tails: number[]
  gaps: string
  gapSum: number | ''
  prevIssue: Map<number, string | null>
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const toNum = (s: string | undefined) => (s == null || s === '' ? null : Number(s))

const allRows = computed<Row[]>(() => {
  const hist = data.value?.history ?? []
  const lastSeen = new Array<number>(NUMBER_MAX + 1).fill(-1)
  const lastIssue = new Array<string | null>(NUMBER_MAX + 1).fill(null)
  return hist.map((h, t) => {
    const prizes = h.prizes.split(',').map(Number)
    const gaps = (h.periods ?? '').split(',')
    const values = (h.values ?? '').split(',')
    const positions = (h.positions ?? '').split(',')
    const drawn = new Map<number, BallInfo>()
    const prevIssue = new Map<number, string | null>()
    prizes.forEach((x, i) => {
      drawn.set(x, { gap: toNum(gaps[i]), value: toNum(values[i]), pos: positions[i] || null })
      prevIssue.set(x, lastIssue[x] ?? null)
    })
    for (const x of prizes) {
      lastSeen[x] = t
      lastIssue[x] = h.issue
    }
    const miss = NUMBERS.map(x => (lastSeen[x] === -1 ? null : t - lastSeen[x]!))
    return {
      index: t,
      issue: h.issue,
      date: h.date,
      drawn,
      miss: [null, ...miss],
      tails: h.tails,
      gaps: h.periods ? h.periods.split(',').map(g => (g === '' ? '—' : g)).join(' ') : '—',
      gapSum: h.sum ?? '',
      prevIssue
    }
  })
})

const rows = computed(() => allRows.value.slice(-rowCount.value).reverse())
const latest = computed(() => allRows.value.at(-1) ?? null)

/** 目前隔期：每個號碼現在隔了幾期沒開（= 隔期狀態表的 slot 編號） */
const currentGap = computed(() => latest.value?.miss ?? [])

const slots = computed(() => (data.value?.periods ?? [])
  .filter(p => p.prizes.length > 0)
  .map(p => ({ ...p, value: Number.parseInt(p.record.split(',')[0] ?? '0', 10) || 0 })))

// ---------- 顏色 ----------

function heatStyle(miss: number | null) {
  if (miss == null || miss === 0) return {}
  const f = Math.min(miss, HEAT_CAP) / HEAT_CAP
  return { '--mix': `${Math.round(8 + f * 72)}%` }
}

function tailStyle(c: number) {
  if (c === 0) return {}
  return { '--mix': `${Math.min(70, 22 + (c - 1) * 24)}%` }
}

// ---------- 詳細資訊（hover / 點選） ----------

interface Pick {
  row: Row
  x: number
}
const hovered = ref<Pick | null>(null)
const pinned = ref<Pick | null>(null)
const active = computed(() => hovered.value ?? pinned.value)

const info = computed(() => {
  const a = active.value
  if (!a) return null
  const ball = a.row.drawn.get(a.x)
  const head = `第 ${a.row.issue} 期（${a.row.date}）· ${pad2(a.x)} 號`
  if (ball) {
    const prev = a.row.prevIssue.get(a.x)
    return {
      head,
      drawn: true,
      lines: [
        `隔期 ${ball.gap ?? '—'}${prev ? `（上次開出：第 ${prev} 期）` : ''}`,
        `現值 ${ball.value ?? '—'}`,
        `位置 ${ball.pos ?? '—'}`,
        `尾數 ${a.x % 10}`
      ]
    }
  }
  const m = a.row.miss[a.x]
  return { head, drawn: false, lines: [m == null ? '資料範圍內尚未開出' : `沒開出，已連續 ${m} 期沒開`] }
})

function toggleFocus(x: number) {
  focusNumber.value = focusNumber.value === x ? null : x
}
</script>

<template>
  <div class="board-root mx-auto w-full max-w-[1440px] space-y-5 px-4 py-8 sm:px-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">
        號碼走勢 · 今彩 539
      </h1>
      <p class="text-sm text-muted">
        一張表同時看：每期開了哪些號碼、每個號碼隔了幾期沒開、每顆獎號從哪來（隔期／現值／位置）、尾數分布
      </p>
    </div>

    <div
      v-if="status === 'pending'"
      class="py-16 text-center text-sm text-muted"
    >
      載入中…
    </div>
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="`載入失敗：${error.statusMessage ?? error.message}`"
    />

    <template v-else-if="latest">
      <!-- 最新一期 -->
      <UCard>
        <div class="flex flex-wrap items-start gap-x-8 gap-y-4">
          <div class="space-y-1">
            <div class="text-xs text-muted">
              最新一期
            </div>
            <div class="font-mono text-lg font-semibold">
              {{ latest.issue }}
            </div>
            <div class="text-xs text-muted">
              {{ latest.date }}
            </div>
          </div>
          <div class="flex flex-wrap gap-3">
            <button
              v-for="[x, b] in latest.drawn"
              :key="x"
              type="button"
              class="flex flex-col items-center gap-1"
              @click="toggleFocus(x)"
            >
              <span
                class="ball size-11 text-base"
                :class="b.gap === 0 ? 'ball-repeat' : ''"
              >{{ pad2(x) }}</span>
              <span class="text-[11px] leading-tight text-muted">隔 {{ b.gap ?? '—' }}・值 {{ b.value ?? '—' }}</span>
              <span class="text-[11px] leading-tight text-muted">位 {{ b.pos ?? '—' }}</span>
            </button>
          </div>
          <div class="space-y-1 text-sm">
            <div class="text-xs text-muted">
              隔期和
            </div>
            <div class="font-mono text-lg font-semibold">
              {{ latest.gapSum || '—' }}
            </div>
          </div>
        </div>
      </UCard>

      <!-- 隔期狀態表（slot） -->
      <UCard>
        <template #header>
          <h2 class="font-semibold">
            隔期狀態（目前）
          </h2>
          <p class="text-xs text-muted">
            每一格 = 某一期開出、到現在還沒再開的號碼。「隔 k」= 已隔 k 期；「值」= 這一格已連續幾期沒有號碼被開走。點號碼可在下方走勢表標出整欄。
          </p>
        </template>
        <div class="flex gap-2 overflow-x-auto pb-1">
          <div
            v-for="s in slots"
            :key="s.period"
            class="min-w-24 shrink-0 rounded-md bg-elevated px-2.5 py-2"
          >
            <div class="flex items-baseline justify-between gap-2 text-xs">
              <span class="font-semibold">隔 {{ s.period }}</span>
              <span class="text-muted">值 {{ s.value }}</span>
            </div>
            <div class="mt-1.5 flex flex-wrap gap-1">
              <button
                v-for="x in s.prizes"
                :key="x"
                type="button"
                class="chip"
                :class="focusNumber === x ? 'chip-focus' : ''"
                @click="toggleFocus(x)"
              >
                {{ pad2(x) }}
              </button>
            </div>
            <div class="mt-1 font-mono text-[10px] text-muted">
              {{ s.issue.slice(-3) }}・{{ s.date.slice(5) }}
            </div>
          </div>
        </div>
      </UCard>

      <!-- 控制列 -->
      <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
        <USelect
          v-model="rowCount"
          :items="rowOptions"
          class="w-32"
        />
        <label class="flex items-center gap-2 text-sm">
          <USwitch v-model="showMissNumbers" />
          格子內顯示沒開期數
        </label>
        <UButton
          v-if="focusNumber"
          size="sm"
          color="neutral"
          variant="subtle"
          trailing-icon="i-lucide-x"
          @click="focusNumber = null"
        >
          已標出 {{ pad2(focusNumber) }} 號
        </UButton>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span class="flex items-center gap-1.5"><span class="ball size-4 text-[0px]">·</span>開出</span>
          <span class="flex items-center gap-1.5"><span class="ball ball-repeat size-4 text-[0px]">·</span>外框 = 上期也開過（隔期 0）</span>
          <span class="flex items-center gap-1.5">
            <span class="legend-ramp" />沒開：越深 = 越久沒開（{{ HEAT_CAP }} 期以上最深）
          </span>
        </div>
      </div>

      <!-- 走勢表 -->
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <div class="info-bar border-b border-default px-4 py-2 text-sm">
          <template v-if="info">
            <span class="font-semibold">{{ info.head }}</span>
            <span
              v-for="l in info.lines"
              :key="l"
              class="ml-3 text-muted"
            >{{ l }}</span>
            <button
              v-if="pinned"
              type="button"
              class="ml-3 text-xs text-muted underline"
              @click="pinned = null"
            >
              清除
            </button>
          </template>
          <span
            v-else
            class="text-muted"
          >滑過或點一下格子，這裡會顯示該期、該號碼的隔期／現值／位置</span>
        </div>
        <div
          class="max-h-[75vh] overflow-auto"
          @mouseleave="hovered = null"
        >
          <table class="board">
            <thead>
              <tr>
                <th class="col-issue sticky-left">
                  期別
                </th>
                <th
                  v-for="x in NUMBERS"
                  :key="x"
                  class="col-num cursor-pointer"
                  :class="[x % 10 === 0 ? 'sep' : '', focusNumber === x ? 'is-focus' : '']"
                  @click="toggleFocus(x)"
                >
                  {{ pad2(x) }}
                </th>
                <th
                  v-for="d in TAILS"
                  :key="`t${d}`"
                  class="col-tail"
                  :class="d === 0 ? 'gap-left' : ''"
                >
                  尾{{ d }}
                </th>
                <th class="col-gaps gap-left">
                  五顆隔期
                </th>
                <th class="col-sum">
                  和
                </th>
              </tr>
              <tr class="row-current">
                <th class="col-issue sticky-left text-[10px] font-normal">
                  目前隔期
                </th>
                <th
                  v-for="x in NUMBERS"
                  :key="x"
                  class="heat-cell font-mono font-normal"
                  :class="[x % 10 === 0 ? 'sep' : '', focusNumber === x ? 'is-focus' : '']"
                  :style="heatStyle(currentGap[x] ?? null)"
                >
                  {{ currentGap[x] ?? '—' }}
                </th>
                <th
                  colspan="12"
                  class="gap-left text-left text-[10px] font-normal text-muted"
                >
                  ← 現在每個號碼隔了幾期沒開（0 = 最新一期剛開）
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in rows"
                :key="r.issue"
              >
                <td class="col-issue sticky-left">
                  <span class="font-mono">{{ r.issue.slice(-3) }}</span>
                  <span class="ml-1 text-[10px] text-muted">{{ r.date.slice(5) }}</span>
                </td>
                <td
                  v-for="x in NUMBERS"
                  :key="x"
                  class="heat-cell"
                  :class="[x % 10 === 0 ? 'sep' : '', focusNumber === x ? 'is-focus' : '']"
                  :style="r.drawn.has(x) ? {} : heatStyle(r.miss[x] ?? null)"
                  @mouseenter="hovered = { row: r, x }"
                  @click="pinned = { row: r, x }"
                >
                  <span
                    v-if="r.drawn.has(x)"
                    class="ball size-[22px] text-[11px]"
                    :class="r.drawn.get(x)!.gap === 0 ? 'ball-repeat' : ''"
                  >{{ pad2(x) }}</span>
                  <span
                    v-else-if="showMissNumbers && r.miss[x] != null"
                    class="font-mono text-[10px]"
                  >{{ r.miss[x] }}</span>
                </td>
                <td
                  v-for="d in TAILS"
                  :key="`t${d}`"
                  class="tail-cell font-mono"
                  :class="d === 0 ? 'gap-left' : ''"
                  :style="tailStyle(r.tails[d] ?? 0)"
                >
                  {{ r.tails[d] ? r.tails[d] : '' }}
                </td>
                <td class="col-gaps gap-left font-mono">
                  {{ r.gaps }}
                </td>
                <td class="col-sum font-mono">
                  {{ r.gapSum || '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <p class="text-xs text-muted">
        尾數欄：該期 5 顆號碼中，個位數為 0～9 的各有幾顆（橘色越深越多）。五顆隔期：依號碼由小到大，每顆隔了幾期才開出。
        資料：<a
          href="/api/analysis/lotto539"
          target="_blank"
          class="underline"
        >/api/analysis/lotto539</a>（與給 LLM 讀的同一份）。
      </p>
    </template>
  </div>
</template>

<style scoped>
.board-root {
  --heat: #2a78d6;
  --drawn: #eb6834;
  --drawn-ink: #0b0b0b;
}
:global(.dark) .board-root {
  --heat: #3987e5;
  --drawn: #d95926;
  --drawn-ink: #0b0b0b;
}

.ball {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: var(--drawn);
  color: var(--drawn-ink);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
  line-height: 1;
}
.ball-repeat {
  box-shadow: 0 0 0 2px var(--ui-bg), 0 0 0 4px var(--ui-text);
}

.chip {
  border-radius: 4px;
  padding: 1px 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  background: var(--ui-bg);
}
.chip-focus {
  background: var(--drawn);
  color: var(--drawn-ink);
}

.legend-ramp {
  display: inline-block;
  width: 64px;
  height: 10px;
  border-radius: 3px;
  background: linear-gradient(90deg,
    color-mix(in oklab, var(--heat) 8%, var(--ui-bg)),
    color-mix(in oklab, var(--heat) 80%, var(--ui-bg)));
}

.board {
  border-collapse: separate;
  border-spacing: 2px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.board th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--ui-bg);
  font-weight: 500;
  color: var(--ui-text-muted);
  white-space: nowrap;
  padding: 2px 0;
}
.board .row-current th {
  top: 22px;
}
.board .sticky-left {
  position: sticky;
  left: 0;
  z-index: 3;
  background: var(--ui-bg);
  text-align: left;
  padding: 0 6px 0 8px;
}
.board thead .sticky-left {
  z-index: 4;
}
.col-issue { min-width: 78px; }
.col-num { width: 24px; min-width: 24px; text-align: center; }
.col-tail { width: 22px; min-width: 22px; text-align: center; font-size: 10px; }
.col-gaps { min-width: 104px; text-align: left; padding: 0 6px; white-space: nowrap; }
.col-sum { min-width: 32px; text-align: right; padding-right: 8px; }
.gap-left { padding-left: 10px; }
.board td.gap-left, .board th.gap-left { border-left: 8px solid var(--ui-bg); }

.heat-cell {
  width: 24px;
  height: 24px;
  text-align: center;
  border-radius: 4px;
  background: color-mix(in oklab, var(--heat) var(--mix, 0%), var(--ui-bg));
  color: var(--ui-text-toned);
  cursor: pointer;
}
.board td.heat-cell:hover { outline: 2px solid var(--ui-text); outline-offset: -2px; }
.sep { box-shadow: inset -1px 0 0 var(--ui-border); }
.is-focus { box-shadow: inset 2px 0 0 var(--drawn), inset -2px 0 0 var(--drawn); }
.board th.is-focus { color: var(--ui-text); font-weight: 700; }

.tail-cell {
  width: 22px;
  height: 24px;
  text-align: center;
  border-radius: 4px;
  font-size: 11px;
  background: color-mix(in oklab, var(--drawn) var(--mix, 0%), var(--ui-bg));
  color: var(--ui-text);
}
.board tbody tr:hover td.col-issue { color: var(--ui-text); font-weight: 600; }
.info-bar { min-height: 38px; }
</style>
