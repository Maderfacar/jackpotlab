<script setup lang="ts">
import { GAMES, GAME_IDS, type GameId } from '~~/shared/lotto/games'
import type { DrawResult, DrawQueryResponse } from '~~/shared/lotto/types'

definePageMeta({
  title: '開獎號碼'
})

const gameId = ref<GameId>('lotto539')
const showAll = ref(false)

const game = computed(() => GAMES[gameId.value])
const isBingo = computed(() => gameId.value === 'bingo_bingo')

const tabs = GAME_IDS.map(id => ({
  label: GAMES[id].name,
  value: id,
  description: GAMES[id].cadenceLabel
}))

/**
 * 賓果賓果：用 by-date 查今日全部期；其他彩種：用 recent 取最新 5 期。
 * 切彩種時 useFetch 會自動 watch 並重撈。
 */
const BINGO_REFRESH_SEC = 60
const NON_BINGO_LIMIT = 5
const BINGO_PAGE_SIZE = 20

const remainingSec = ref(BINGO_REFRESH_SEC)

const drawsQuery = useFetch<DrawQueryResponse>(
  () => isBingo.value
    ? `/api/draws/bingo_bingo/by-date?date=${todayInTaipei()}`
    : `/api/draws/${gameId.value}/recent?limit=${NON_BINGO_LIMIT}`,
  {
    key: () => `draws-page-${gameId.value}`,
    watch: [gameId],
    server: false
  }
)

watch(gameId, () => {
  showAll.value = false
  remainingSec.value = BINGO_REFRESH_SEC
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
const isLive = computed(() => isBingo.value)

const lastFetchedAt = computed<string | null>(() => allResults.value[0]?.fetchedAt ?? null)

function refresh() {
  drawsQuery.refresh()
  remainingSec.value = BINGO_REFRESH_SEC
}

/**
 * 賓果賓果頁面端 60 秒自動重抓 + 1Hz 倒數。
 * 彩種非賓果時停止 timer；切換時重置倒數。
 */
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
    if (!isBingo.value) return
    remainingSec.value = BINGO_REFRESH_SEC
    timer = setInterval(() => {
      remainingSec.value -= 1
      if (remainingSec.value <= 0) {
        drawsQuery.refresh()
        remainingSec.value = BINGO_REFRESH_SEC
      }
    }, 1000)
  })
  onBeforeUnmount(stop)
}

function todayInTaipei(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit'
  })
  return fmt.format(new Date())
}

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

/** drawTerm → numbers map，用來找前一期（drawTerm - 1）以判斷連莊。 */
const bingoNumbersByTerm = computed<Map<number, number[]>>(() => {
  const m = new Map<number, number[]>()
  if (gameId.value !== 'bingo_bingo') return m
  for (const r of allResults.value) m.set(r.drawTerm, r.numbers)
  return m
})

/** 預先計算每期的連莊號碼 set — 避免在 template 重複建構 Set。 */
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

/** 1–40 ≥ 13 → 小；41–80 ≥ 13 → 大；都 <13 → null（不顯示）。 */
function bingoBigSmall(numbers: number[]): { label: '大' | '小', class: string } | null {
  const smallCount = numbers.reduce((c, n) => c + (n <= 40 ? 1 : 0), 0)
  if (smallCount >= 13) return { label: '小', class: 'text-sky-600' }
  if (numbers.length - smallCount >= 13) return { label: '大', class: 'text-rose-600' }
  return null
}

/** 奇 ≥ 13 → 單；偶 ≥ 13 → 雙；都 <13 → null（不顯示）。 */
function bingoOddEven(numbers: number[]): { label: '單' | '雙', class: string } | null {
  const oddCount = numbers.reduce((c, n) => c + (n % 2 === 1 ? 1 : 0), 0)
  if (oddCount >= 13) return { label: '單', class: 'text-fuchsia-600' }
  if (numbers.length - oddCount >= 13) return { label: '雙', class: 'text-emerald-600' }
  return null
}

/** 20 主號的個位數 (0–9) 出現次數。 */
function bingoTailDigits(numbers: number[]): number[] {
  const counts = new Array(10).fill(0)
  for (const n of numbers) counts[n % 10]++
  return counts
}

/** 尾數出現次數的背景色階：≥2 起漸進，0–1 用底色。 */
function bingoTailClass(count: number): string {
  if (count >= 5) return 'bg-sky-700 text-white'
  if (count >= 4) return 'bg-sky-500 text-white'
  if (count >= 3) return 'bg-sky-400 text-white'
  if (count >= 2) return 'bg-sky-200 text-sky-900'
  return 'bg-elevated text-muted'
}

/** ISO timestamp → "YYYY-MM-DD HH:MM"（台北時區）。 */
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
</script>

<template>
  <UContainer class="py-10 space-y-6">
    <header class="space-y-2">
      <h1 class="text-3xl font-semibold tracking-tight">開獎號碼</h1>
      <p class="text-sm text-muted">資料來源：台灣彩券 taiwanlottery.com</p>
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

        <div class="flex flex-wrap items-center justify-end gap-3">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            :loading="loading"
            @click="refresh"
          >
            重新整理
          </UButton>
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
      </div>
    </UCard>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="`查詢失敗: ${error.message ?? '未知錯誤'}`"
    />

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
            <summary class="cursor-pointer select-none">開出順序 / 詳細</summary>
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
  </UContainer>
</template>
