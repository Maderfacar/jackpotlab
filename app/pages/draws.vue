<script setup lang="ts">
import { GAMES, GAME_IDS, type GameId } from '~~/shared/lotto/games'
import type { DrawResult, DrawQueryResponse } from '~~/shared/lotto/types'
import {
  type AnalysisState, type AnalysisDrawInput,
  hydrateFromDraws, applyNewDraws, loadState, saveState, stateKey,
  sweepStaleAnalysisStorage,
  defaultD, defaultN, clampD, clampN, averageOfCsvFirst
} from '~/utils/analysis'

definePageMeta({
  title: '開獎號碼'
})

const gameId = ref<GameId>('lotto539')
const showAll = ref(false)
const subTab = ref<'list' | 'periods' | 'relations' | 'tails'>('list')

const LEGACY_STORAGE_KEY = 'jackpotlab-show-legacy-analysis'

const showLegacyAnalysis = ref(false)

function loadLegacyPref() {
  if (typeof window === 'undefined') return
  showLegacyAnalysis.value = window.localStorage.getItem(LEGACY_STORAGE_KEY) === 'true'
}

watch(showLegacyAnalysis, (val) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, String(val))
  }
  if (!val && subTab.value !== 'list') {
    subTab.value = 'list'
  }
})

const game = computed(() => GAMES[gameId.value])
const isBingo = computed(() => gameId.value === 'bingo_bingo')

const tabs = GAME_IDS.map(id => ({
  label: GAMES[id].name,
  value: id,
  description: GAMES[id].cadenceLabel
}))

type SubTabValue = 'list' | 'periods' | 'relations' | 'tails'
const subTabItems = computed((): Array<{ label: string, value: SubTabValue }> => {
  const base: Array<{ label: string, value: SubTabValue }> = [
    { label: '各期獎號列表', value: 'list' }
  ]
  if (showLegacyAnalysis.value) {
    base.push(
      { label: '隔期狀態', value: 'periods' },
      { label: '獎號關聯', value: 'relations' },
      { label: '尾數', value: 'tails' }
    )
  }
  return base
})

const BINGO_REFRESH_SEC = 60
const NON_BINGO_LIMIT = 5
const BINGO_PAGE_SIZE = 20

const remainingSec = ref(BINGO_REFRESH_SEC)

function todayInTaipei(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit'
  })
  return fmt.format(new Date())
}

const dateInput = ref(todayInTaipei())
const queryDate = ref<string | null>(null)
const isByDateMode = computed(() => queryDate.value !== null)

const listUrl = computed(() => {
  const g = gameId.value
  if (queryDate.value) return `/api/draws/${g}/by-date?date=${queryDate.value}`
  if (g === 'bingo_bingo') return `/api/draws/bingo_bingo/by-date?date=${todayInTaipei()}`
  return `/api/draws/${g}/recent?limit=${NON_BINGO_LIMIT}`
})

const drawsQuery = useFetch<DrawQueryResponse>(() => listUrl.value, {
  key: () => `draws-page-${gameId.value}-${queryDate.value ?? 'default'}`,
  watch: [gameId, queryDate],
  server: false
})

const allResults = computed<DrawResult[]>(() => drawsQuery.data.value?.results ?? [])

const visibleResults = computed<DrawResult[]>(() => {
  if (!isBingo.value) return allResults.value
  if (showAll.value || allResults.value.length <= BINGO_PAGE_SIZE) {
    return allResults.value
  }
  return allResults.value.slice(0, BINGO_PAGE_SIZE)
})

const hiddenCount = computed(() => Math.max(0, allResults.value.length - visibleResults.value.length))

const loading = computed(() => drawsQuery.status.value === 'pending')
const error = computed(() => drawsQuery.error.value)
const fromCache = computed(() => drawsQuery.data.value?.fromCache)
const isLive = computed(() => isBingo.value && !isByDateMode.value)
const lastFetchedAt = computed<string | null>(() => allResults.value[0]?.fetchedAt ?? null)

async function refresh() {
  // 慢彩種（539/大樂透/威力彩）的 recent endpoint 只讀 Firestore 鏡像、
  // 不會主動去打 taiwanlottery API。如果使用者按重新整理時官方剛開出
  // 新一期、但 cron 還沒跑到，recent 看到的還是舊資料。
  // 解法：先觸發一次 forceFresh 把最新一期寫進 Firestore，再 refresh。
  // 賓果走 by-date?date=today、那條路徑對「今天」本來就會強制現抓、不需要這個。
  if (!isBingo.value && !isByDateMode.value) {
    try {
      await $fetch(`/api/admin/scrape/${gameId.value}`, { method: 'POST' })
    } catch {
      // 上游 503 / 官方 API 抖動時、不阻塞 UI、退回讀快取
    }
  }
  drawsQuery.refresh()
  if (isLive.value) remainingSec.value = BINGO_REFRESH_SEC
  hydrateAnalysis()
}

function applyDate() {
  if (!dateInput.value || !/^\d{4}-\d{2}-\d{2}$/.test(dateInput.value)) return
  queryDate.value = dateInput.value
}

function resetToDefault() {
  queryDate.value = null
  dateInput.value = todayInTaipei()
}

// ---------- D / N preferences ----------

const depthD = ref(defaultD(gameId.value))
const rangeN = ref(defaultN())

function loadDNFor(g: GameId) {
  if (typeof window === 'undefined') {
    depthD.value = defaultD(g)
    rangeN.value = defaultN()
    return
  }
  const dRaw = window.localStorage.getItem(`jackpotlab-d-${g}`)
  const nRaw = window.localStorage.getItem(`jackpotlab-n-${g}`)
  const d = dRaw ? Number.parseInt(dRaw, 10) : Number.NaN
  const n = nRaw ? Number.parseInt(nRaw, 10) : Number.NaN
  depthD.value = Number.isFinite(d) ? clampD(d) : defaultD(g)
  rangeN.value = Number.isFinite(n) ? clampN(n) : defaultN()
}

function saveDN(g: GameId, d: number, n: number) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(`jackpotlab-d-${g}`, String(d))
  window.localStorage.setItem(`jackpotlab-n-${g}`, String(n))
}

// ---------- Analysis state ----------

const analysisState = shallowRef<AnalysisState | null>(null)
const analysisLoading = ref(false)
const analysisError = ref<string | null>(null)

async function hydrateAnalysis() {
  if (typeof window === 'undefined') return
  const g = gameId.value
  const d = depthD.value
  const n = rangeN.value

  analysisLoading.value = true
  analysisError.value = null

  try {
    const res = await $fetch<DrawQueryResponse>(`/api/draws/${g}/recent`, {
      params: { limit: d }
    })
    const drawsAsc = [...res.results].sort((a, b) => a.drawTerm - b.drawTerm)
    const inputs: AnalysisDrawInput[] = drawsAsc.map((r) => {
      // 賓果的「中央彩球」(special) 本來就是 20 主號之一，直接 push 會 dup。
      // 用 Set 去重 — 對 539（無 special）、大樂透、威力彩都無副作用。
      const merged = r.special != null ? [...r.numbers, r.special] : r.numbers
      return {
        drawTerm: r.drawTerm,
        drawDate: r.drawDate,
        prizes: [...new Set(merged)]
      }
    })

    const cached = loadState(g, n)
    if (cached && cached.lastProcessedTerm != null) {
      const last = cached.lastProcessedTerm
      const next = applyNewDraws(cached, inputs.filter(x => x.drawTerm > last))
      analysisState.value = next
      saveState(next)
    } else {
      const next = hydrateFromDraws(g, n, inputs)
      analysisState.value = next
      saveState(next)
    }
  } catch (e) {
    analysisError.value = e instanceof Error ? e.message : 'unknown error'
  } finally {
    analysisLoading.value = false
  }
}

function commitDepthD(rawVal: number | string) {
  const num = typeof rawVal === 'string' ? Number.parseInt(rawVal, 10) : rawVal
  const clamped = clampD(Number.isFinite(num) ? num : defaultD(gameId.value))
  depthD.value = clamped
  saveDN(gameId.value, clamped, rangeN.value)
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(stateKey(gameId.value, rangeN.value))
  }
  hydrateAnalysis()
}

function commitRangeN(rawVal: number | string) {
  const num = typeof rawVal === 'string' ? Number.parseInt(rawVal, 10) : rawVal
  const clamped = clampN(Number.isFinite(num) ? num : defaultN())
  if (clamped === rangeN.value) return
  rangeN.value = clamped
  saveDN(gameId.value, depthD.value, clamped)
  hydrateAnalysis()
}

watch(gameId, async (g) => {
  showAll.value = false
  remainingSec.value = BINGO_REFRESH_SEC
  queryDate.value = null
  dateInput.value = todayInTaipei()
  loadDNFor(g)
  await hydrateAnalysis()
})

onMounted(() => {
  sweepStaleAnalysisStorage()
  loadDNFor(gameId.value)
  loadLegacyPref()
  hydrateAnalysis()
})

// ---------- Live refresh (bingo only, default mode only) ----------

if (import.meta.client) {
  let timer: ReturnType<typeof setInterval> | null = null
  const stop = () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }
  watchEffect(() => {
    stop()
    if (!isLive.value) return
    remainingSec.value = BINGO_REFRESH_SEC
    timer = setInterval(() => {
      remainingSec.value -= 1
      if (remainingSec.value <= 0) {
        drawsQuery.refresh()
        hydrateAnalysis()
        remainingSec.value = BINGO_REFRESH_SEC
      }
    }, 1000)
  })
  onBeforeUnmount(stop)
}

// ---------- Bingo helpers ----------

/**
 * 賓果賓果每日從 07:05 開始，每 5 分鐘一期，全日 203 期至 23:55，drawTerm 連號跨日遞增。
 * 同日 list 內最小 drawTerm 即當日第一期（07:05），其他由偏移量推算。
 */
const BINGO_START_MIN = 7 * 60 + 5
const BINGO_INTERVAL_MIN = 5

const minBingoTerm = computed<number | null>(() => {
  if (gameId.value !== 'bingo_bingo' || allResults.value.length === 0) return null
  return allResults.value.reduce((min, r) => Math.min(min, r.drawTerm), Number.POSITIVE_INFINITY)
})

function bingoDrawTime(drawTerm: number): string {
  const base = minBingoTerm.value
  if (base == null) return ''
  const offset = drawTerm - base
  const totalMin = BINGO_START_MIN + offset * BINGO_INTERVAL_MIN
  const h = Math.floor(totalMin / 60) % 24
  const m = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const bingoNumbersByTerm = computed<Map<number, number[]>>(() => {
  const m = new Map<number, number[]>()
  if (gameId.value !== 'bingo_bingo') return m
  for (const r of allResults.value) m.set(r.drawTerm, r.numbers)
  return m
})

const bingoConnectByTerm = computed<Map<number, Set<number>>>(() => {
  const out = new Map<number, Set<number>>()
  if (gameId.value !== 'bingo_bingo') return out
  const numsByTerm = bingoNumbersByTerm.value
  for (const r of allResults.value) {
    const prev = numsByTerm.get(r.drawTerm - 1)
    if (!prev) continue
    const prevSet = new Set(prev)
    out.set(r.drawTerm, new Set(r.numbers.filter(n => prevSet.has(n))))
  }
  return out
})

function isBingoConnect(drawTerm: number, num: number): boolean {
  return bingoConnectByTerm.value.get(drawTerm)?.has(num) ?? false
}

function bingoBigSmall(numbers: number[]): { label: '大' | '小', class: string } | null {
  const smallCount = numbers.reduce((c, n) => c + (n <= 40 ? 1 : 0), 0)
  if (smallCount >= 13) return { label: '小', class: 'text-sky-600' }
  if (numbers.length - smallCount >= 13) return { label: '大', class: 'text-rose-600' }
  return null
}

function bingoOddEven(numbers: number[]): { label: '單' | '雙', class: string } | null {
  const oddCount = numbers.reduce((c, n) => c + (n % 2 === 1 ? 1 : 0), 0)
  if (oddCount >= 13) return { label: '單', class: 'text-fuchsia-600' }
  if (numbers.length - oddCount >= 13) return { label: '雙', class: 'text-emerald-600' }
  return null
}

function bingoTailDigits(numbers: number[]): number[] {
  const counts = new Array(10).fill(0)
  for (const n of numbers) counts[n % 10]++
  return counts
}

function bingoTailClass(count: number): string {
  if (count >= 5) return 'bg-sky-700 text-white'
  if (count >= 4) return 'bg-sky-500 text-white'
  if (count >= 3) return 'bg-sky-400 text-white'
  if (count >= 2) return 'bg-sky-200 text-sky-900'
  return 'bg-elevated text-muted'
}

function formatFetchedAt(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false
  }).formatToParts(d)
  const get = (type: string): string => parts.find(p => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}

// ---------- Analysis derived views ----------

/** 日期紅字（hasEverMatched）僅適用 539 / 大樂透 / 威力彩；賓果不上紅字。 */
const showDateRed = computed(() => gameId.value !== 'bingo_bingo')

const periodsRows = computed(() => analysisState.value?.periods ?? [])
const periodsAverage = computed(() => averageOfCsvFirst(periodsRows.value))

const relationsRows = computed(() => {
  const h = analysisState.value?.history ?? []
  return h.filter(x => x.periods !== undefined).slice(-rangeN.value).reverse()
})

const tailsRows = computed(() => {
  const h = analysisState.value?.history ?? []
  return h.slice(-rangeN.value).reverse()
})

function tailCellClass(count: number): string {
  if (count <= 0) return ''
  if (count === 1) return 'bg-fuchsia-300 text-fuchsia-900'
  if (count === 2) return 'bg-fuchsia-500 text-white'
  return 'bg-red-600 text-white'
}
</script>

<template>
  <UContainer class="py-10 space-y-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="space-y-2">
        <h1 class="text-3xl font-semibold tracking-tight">
          開獎號碼
        </h1>
        <p class="text-sm text-muted">
          資料來源：台灣彩券 taiwanlottery.com
        </p>
      </div>
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-refresh-cw"
        :loading="loading || analysisLoading"
        @click="refresh"
      >
        重新整理
      </UButton>
    </header>

    <UCard>
      <div class="space-y-5">
        <UTabs
          v-model="gameId"
          :items="tabs"
          :unmount-on-hide="false"
          variant="link"
          color="primary"
        />

        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="dateInput"
            type="date"
            size="sm"
            class="w-44"
          />
          <UButton
            color="primary"
            variant="solid"
            size="sm"
            icon="i-lucide-search"
            :disabled="!dateInput"
            @click="applyDate"
          >
            查詢
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-rotate-ccw"
            :disabled="!isByDateMode"
            @click="resetToDefault"
          >
            回到預設
          </UButton>
          <UBadge
            v-if="isByDateMode"
            color="warning"
            variant="subtle"
            size="sm"
          >
            指定日期：{{ queryDate }}
          </UBadge>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
          <UBadge
            color="neutral"
            variant="subtle"
          >
            {{ game.drawSchedule }}
          </UBadge>
          <UBadge
            v-if="isLive"
            color="warning"
            variant="subtle"
            class="animate-pulse"
          >
            <span class="inline-flex items-center gap-1 font-mono">
              <span class="size-1.5 rounded-full bg-warning" />
              LIVE · {{ String(remainingSec).padStart(2, '0') }}s 後更新
            </span>
          </UBadge>
          <UBadge
            v-if="fromCache !== undefined"
            :color="fromCache ? 'success' : 'info'"
            variant="subtle"
            :icon="fromCache ? 'i-lucide-database' : 'i-lucide-cloud-download'"
          >
            {{ fromCache ? '快取' : '現抓' }}
          </UBadge>
          <UBadge
            v-if="lastFetchedAt"
            color="neutral"
            variant="subtle"
            icon="i-lucide-clock"
          >
            {{ formatFetchedAt(lastFetchedAt) }}
          </UBadge>
        </div>

        <USeparator />

        <div class="flex items-center gap-3">
          <UTabs
            v-model="subTab"
            :items="subTabItems"
            :unmount-on-hide="false"
            variant="pill"
            color="neutral"
            size="sm"
          />
          <div class="ml-auto">
            <USwitch
              v-model="showLegacyAnalysis"
              label="顯示原始分析"
              size="sm"
            />
          </div>
        </div>

        <div
          v-if="subTab !== 'list'"
          class="flex flex-wrap items-center gap-3 text-xs"
        >
          <label class="flex items-center gap-2">
            <span class="text-muted">D 灌入深度</span>
            <UInput
              :model-value="depthD"
              type="number"
              size="xs"
              min="1"
              max="5000"
              class="w-24"
              @change="(e: Event) => commitDepthD((e.target as HTMLInputElement).value)"
            />
          </label>
          <label class="flex items-center gap-2">
            <span class="text-muted">N 隔期數量</span>
            <UInput
              :model-value="rangeN"
              type="number"
              size="xs"
              min="1"
              max="200"
              class="w-20"
              @change="(e: Event) => commitRangeN((e.target as HTMLInputElement).value)"
            />
          </label>
          <UBadge
            v-if="analysisLoading"
            color="info"
            variant="subtle"
            size="sm"
            class="animate-pulse"
          >
            分析中…
          </UBadge>
          <UBadge
            v-else-if="analysisError"
            color="error"
            variant="subtle"
            size="sm"
          >
            分析載入失敗：{{ analysisError }}
          </UBadge>
        </div>
      </div>
    </UCard>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="`查詢失敗: ${error.message ?? '未知錯誤'}`"
    />

    <!-- ============ 各期獎號列表 (default sub-tab) ============ -->
    <template v-if="subTab === 'list'">
      <div
        v-if="loading && allResults.length === 0"
        class="space-y-3"
      >
        <USkeleton
          v-for="i in 3"
          :key="i"
          class="h-24 w-full rounded-lg"
        />
      </div>

      <div
        v-else-if="allResults.length === 0"
        class="rounded-lg border border-dashed border-default p-8 text-center text-sm text-muted"
      >
        <UIcon
          name="i-lucide-inbox"
          class="size-8 mx-auto mb-2 text-muted"
        />
        <p>沒有符合的開獎紀錄</p>
        <p
          v-if="isBingo"
          class="mt-1 text-xs"
        >
          賓果賓果今日尚未開出第一期，或資料尚未公告
        </p>
      </div>

      <div
        v-else
        class="space-y-3"
      >
        <div class="flex items-baseline justify-between">
          <p class="text-xs text-muted">
            共 {{ allResults.length }} 期<span v-if="!showAll && allResults.length > visibleResults.length">，顯示前 {{ visibleResults.length }} 期</span>
          </p>
        </div>

        <UCard
          v-for="result in visibleResults"
          :key="result.drawTerm"
          :ui="{ body: 'p-4 sm:p-5' }"
        >
          <div class="space-y-3">
            <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span class="text-xs uppercase tracking-wider text-muted">期別</span>
                <span class="font-mono text-base font-semibold">{{ result.drawTerm }}</span>
                <span class="text-xs text-muted">{{ result.drawDate }}</span>
                <span
                  v-if="isBingo"
                  class="font-mono text-xs text-muted"
                >
                  {{ bingoDrawTime(result.drawTerm) }}
                </span>
              </div>
              <div
                v-if="isBingo"
                class="flex items-baseline gap-2 font-mono text-sm font-bold"
              >
                <span
                  v-if="bingoBigSmall(result.numbers)"
                  :class="bingoBigSmall(result.numbers)!.class"
                >{{ bingoBigSmall(result.numbers)!.label }}</span>
                <span
                  v-if="bingoOddEven(result.numbers)"
                  :class="bingoOddEven(result.numbers)!.class"
                >{{ bingoOddEven(result.numbers)!.label }}</span>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-1.5">
              <UBadge
                v-for="(n, i) in result.numbers"
                :key="`${result.drawTerm}-n-${i}`"
                color="warning"
                variant="solid"
                size="lg"
                class="min-w-9 justify-center font-mono"
                :class="isBingoConnect(result.drawTerm, n) ? 'ring-2 ring-red-500' : ''"
              >
                {{ n.toString().padStart(2, '0') }}
              </UBadge>

              <template v-if="result.special !== null">
                <span class="mx-1 text-muted">+</span>
                <UBadge
                  color="primary"
                  variant="solid"
                  size="lg"
                  class="min-w-9 justify-center font-mono"
                >
                  {{ result.special.toString().padStart(2, '0') }}
                </UBadge>
                <span
                  v-if="game.specialLabel"
                  class="text-xs text-muted"
                >
                  {{ game.specialLabel }}
                </span>
              </template>
            </div>

            <details class="text-xs text-muted">
              <summary class="cursor-pointer select-none">
                開出順序 / 詳細
              </summary>
              <div class="mt-2 space-y-2">
                <div>
                  <span class="text-muted">開出順序：</span>
                  <span class="font-mono">{{ result.drawOrder.join(' → ') }}</span>
                </div>
                <div v-if="isBingo">
                  <span class="text-muted">尾數：</span>
                  <div class="mt-1 flex flex-wrap items-center gap-1">
                    <div
                      v-for="(count, digit) in bingoTailDigits(result.numbers)"
                      :key="`${result.drawTerm}-t-${digit}`"
                      class="flex h-8 min-w-8 flex-col items-center justify-center rounded px-1 font-mono leading-tight"
                      :class="bingoTailClass(count)"
                    >
                      <span class="text-xs font-semibold">{{ digit }}</span>
                      <span class="text-[9px] opacity-80">×{{ count }}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <span class="text-muted">抓取時間：</span>
                  <span class="font-mono">{{ formatFetchedAt(result.fetchedAt) }}</span>
                </div>
              </div>
            </details>
          </div>
        </UCard>

        <div
          v-if="hiddenCount > 0"
          class="flex justify-center pt-2"
        >
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-chevron-down"
            @click="showAll = true"
          >
            展開剩下 {{ hiddenCount }} 期
          </UButton>
        </div>
      </div>
    </template>

    <!-- ============ 隔期狀態 ============ -->
    <template v-else-if="subTab === 'periods'">
      <UCard
        v-if="periodsRows.length > 0"
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-elevated text-xs uppercase tracking-wider text-muted">
              <tr>
                <th class="px-3 py-2 text-left">
                  隔期
                </th>
                <th class="px-3 py-2 text-left">
                  期數
                </th>
                <th class="px-3 py-2 text-left">
                  日期
                </th>
                <th class="px-3 py-2 text-left">
                  獎號
                </th>
                <th class="px-3 py-2 text-left">
                  記錄
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in periodsRows"
                :key="`p-${row.period}`"
                class="border-t border-default"
              >
                <td class="px-3 py-2 font-mono">
                  {{ row.period }}
                </td>
                <td class="px-3 py-2 font-mono">
                  {{ row.issue || '—' }}
                </td>
                <td
                  class="px-3 py-2"
                  :class="showDateRed && row.hasEverMatched ? 'text-rose-600 font-semibold' : ''"
                >
                  {{ row.date || '—' }}
                </td>
                <td class="px-3 py-2 font-mono text-xs">
                  {{ row.prizes.length > 0 ? row.prizes.join(',') : '—' }}
                </td>
                <td class="px-3 py-2 font-mono text-xs">
                  <div class="max-h-[60px] overflow-y-auto whitespace-pre-wrap break-all">
                    <template
                      v-for="(part, idx) in row.record.split(',')"
                      :key="idx"
                    >
                      <span
                        :class="idx === 0 && Number.parseInt(part || '0', 10) >= periodsAverage && row.record !== '' ? 'text-rose-600 font-bold' : ''"
                      >{{ part }}</span><span v-if="idx < row.record.split(',').length - 1">,</span>
                    </template>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
      <div
        v-else
        class="rounded-lg border border-dashed border-default p-8 text-center text-sm text-muted"
      >
        <p>分析資料載入中或資料不足</p>
      </div>
    </template>

    <!-- ============ 獎號關聯 ============ -->
    <template v-else-if="subTab === 'relations'">
      <UCard
        v-if="relationsRows.length > 0"
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-elevated text-xs uppercase tracking-wider text-muted">
              <tr>
                <th class="px-3 py-2 text-left">
                  期數
                </th>
                <th class="px-3 py-2 text-left">
                  隔期
                </th>
                <th class="px-3 py-2 text-right">
                  總和
                </th>
                <th class="px-3 py-2 text-left">
                  數值
                </th>
                <th class="px-3 py-2 text-left">
                  位置
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in relationsRows"
                :key="`r-${row.issue}`"
                class="border-t border-default"
              >
                <td class="px-3 py-2 font-mono">
                  {{ row.issue }}
                </td>
                <td class="px-3 py-2 font-mono text-xs">
                  {{ row.periods }}
                </td>
                <td class="px-3 py-2 text-right font-mono">
                  {{ row.sum === '' || row.sum === undefined ? '' : row.sum }}
                </td>
                <td class="px-3 py-2 font-mono text-xs">
                  {{ row.values }}
                </td>
                <td class="px-3 py-2 font-mono text-xs">
                  {{ row.positions }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
      <div
        v-else
        class="rounded-lg border border-dashed border-default p-8 text-center text-sm text-muted"
      >
        <p>分析資料載入中或資料不足（需至少 2 期）</p>
      </div>
    </template>

    <!-- ============ 尾數 ============ -->
    <template v-else-if="subTab === 'tails'">
      <UCard
        v-if="tailsRows.length > 0"
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-elevated text-xs uppercase tracking-wider text-muted">
              <tr>
                <th class="px-3 py-2 text-left">
                  期數
                </th>
                <th class="px-3 py-2 text-left">
                  日期
                </th>
                <th class="px-3 py-2 text-left">
                  獎號
                </th>
                <th
                  v-for="d in 10"
                  :key="`th-${d - 1}`"
                  class="px-2 py-2 text-center"
                >
                  {{ d - 1 }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in tailsRows"
                :key="`t-${row.issue}`"
                class="border-t border-default"
              >
                <td class="px-3 py-2 font-mono">
                  {{ row.issue }}
                </td>
                <td class="px-3 py-2 font-mono text-xs">
                  {{ row.date }}
                </td>
                <td class="px-3 py-2 font-mono text-xs">
                  {{ row.prizes }}
                </td>
                <td
                  v-for="(count, digit) in row.tails"
                  :key="`t-${row.issue}-${digit}`"
                  class="px-2 py-2 text-center font-mono text-xs"
                  :class="tailCellClass(count)"
                >
                  {{ count === 0 ? '' : count }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
      <div
        v-else
        class="rounded-lg border border-dashed border-default p-8 text-center text-sm text-muted"
      >
        <p>分析資料載入中或資料不足</p>
      </div>
    </template>
  </UContainer>
</template>
