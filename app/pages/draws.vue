<script setup lang="ts">
import { GAMES, GAME_IDS, type GameId } from '~~/shared/lotto/games'
import type { DrawResult } from '~~/shared/lotto/types'

definePageMeta({
  title: '開獎號碼'
})

const gameId = ref<GameId>('lotto539')
const mode = ref<'latest' | 'by-date'>('latest')
const date = ref<string>(todayInTaipei())
const showAll = ref(false)

const game = computed(() => GAMES[gameId.value])

const tabs = GAME_IDS.map(id => ({
  label: GAMES[id].name,
  value: id,
  description: GAMES[id].cadenceLabel
}))

const modeOptions = [
  { label: '最新', value: 'latest' as const, icon: 'i-lucide-sparkles' },
  { label: '日期查詢', value: 'by-date' as const, icon: 'i-lucide-calendar' }
]

/** 賓果賓果 + 最新模式 → 每 60 秒自動 refresh。其他不輪詢。 */
const pollMs = computed(() => (game.value.realtime && mode.value === 'latest' ? 60_000 : 0))
const latestQuery = useLatestDraw(gameId, { pollMs })
const dateQuery = useDrawsByDate(gameId, date)

watch([mode, date, gameId], () => {
  if (mode.value === 'by-date' && /^\d{4}-\d{2}-\d{2}$/.test(date.value)) {
    dateQuery.refresh()
  } else if (mode.value === 'latest') {
    latestQuery.refresh()
  }
  showAll.value = false
}, { immediate: false })

const allResults = computed<DrawResult[]>(() => {
  if (mode.value === 'latest') {
    return latestQuery.data.value?.results ?? []
  }
  return dateQuery.data.value?.results ?? []
})

/** 賓果賓果一天 226 期，預設顯示前 20 期，展開後全部。 */
const DEFAULT_LIMIT = 20

const visibleResults = computed<DrawResult[]>(() => {
  if (showAll.value || allResults.value.length <= DEFAULT_LIMIT) {
    return allResults.value
  }
  return allResults.value.slice(0, DEFAULT_LIMIT)
})

const hiddenCount = computed(() => Math.max(0, allResults.value.length - visibleResults.value.length))

const loading = computed(() => {
  return mode.value === 'latest' ? latestQuery.status.value === 'pending' : dateQuery.status.value === 'pending'
})

const error = computed(() => {
  return mode.value === 'latest' ? latestQuery.error.value : dateQuery.error.value
})

const fromCache = computed(() => {
  return mode.value === 'latest'
    ? latestQuery.data.value?.fromCache
    : dateQuery.data.value?.fromCache
})

const isLive = computed(() => pollMs.value > 0)

const lastFetchedAt = computed<string | null>(() => {
  const top = allResults.value[0]
  return top?.fetchedAt ?? null
})

function refresh() {
  if (mode.value === 'latest') {
    latestQuery.refresh()
  } else {
    dateQuery.refresh()
  }
}

function todayInTaipei(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit'
  })
  return fmt.format(new Date())
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).format(d)
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

        <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div class="space-y-1">
            <p class="text-xs uppercase tracking-wider text-muted">查詢模式</p>
            <URadioGroup
              v-model="mode"
              orientation="horizontal"
              :items="modeOptions"
              variant="card"
              size="sm"
            />
          </div>

          <UFormField
            v-if="mode === 'by-date'"
            label="開獎日期"
            class="sm:w-56"
          >
            <UInput
              v-model="date"
              type="date"
            />
          </UFormField>

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
            <span class="inline-flex items-center gap-1">
              <span class="size-1.5 rounded-full bg-warning" />
              LIVE · 60s 自動更新
            </span>
          </UBadge>
          <UBadge
            v-else-if="game.realtime"
            color="warning"
            variant="subtle"
            icon="i-lucide-radio"
          >
            即時
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
            {{ formatTime(lastFetchedAt) }}
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
        v-if="mode === 'by-date'"
        class="mt-1 text-xs"
      >
        {{ game.shortName }} 在 {{ date }} 沒有開獎，或資料尚未公告
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
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span class="text-xs uppercase tracking-wider text-muted">期別</span>
            <span class="font-mono text-base font-semibold">{{ result.drawTerm }}</span>
            <span class="text-xs text-muted">{{ result.drawDate }}</span>
            <span
              v-if="gameId === 'bingo_bingo'"
              class="font-mono text-xs text-muted"
            >
              {{ bingoDrawTime(result.drawTerm) }}
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <UBadge
              v-for="(n, i) in result.numbers"
              :key="`${result.drawTerm}-n-${i}`"
              color="primary"
              variant="solid"
              size="lg"
              class="min-w-9 justify-center font-mono"
            >
              {{ n.toString().padStart(2, '0') }}
            </UBadge>

            <template v-if="result.special !== null">
              <span class="mx-1 text-muted">+</span>
              <UBadge
                color="warning"
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
            <div class="mt-2 space-y-1">
              <div>
                <span class="text-muted">開出順序：</span>
                <span class="font-mono">{{ result.drawOrder.join(' → ') }}</span>
              </div>
              <div>
                <span class="text-muted">抓取時間：</span>
                <span class="font-mono">{{ result.fetchedAt }}</span>
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
