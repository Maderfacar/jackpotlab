<script setup lang="ts">
/**
 * 柯比 /kobe
 *
 * 賓果賓果的「獎號來源觀察 + 多面向分析」頁。
 * 7 個 tab，從觀察紀錄逐步深入到波段儀表板。
 *
 * 用語守則（柯比頁全頁）：
 *   - 不在 UI 用英文代數變數（K/X/J/V/Y）。
 *   - 不在 UI 用統計術語（MAE / holdout / chi-square / autocorrelation / regime…）。
 *   - 改用：「隔期」「剩餘顆數」「開出顆數」「樣本數」「平均誤差」「對照基準」「波段」「切換開關」。
 *
 * 詳細 phase 規格見 docs/KOBE-PHASES.md。
 */
import type { DrawQueryResponse } from '~~/shared/lotto/types'
import { defaultN } from '~/utils/analysis'
import { buildSnapshots, type KobeDraw, type PerDrawSnapshot } from '~/utils/kobe-stats'

definePageMeta({
  title: '柯比'
})

const KOBE_ANALYSIS_N = defaultN()
const KOBE_FETCH_LIMIT = 2000
const BINGO_POLL_MS = 30_000

const loading = ref(false)
const error = ref<string | null>(null)
const allDraws = ref<KobeDraw[]>([])

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

// 集中算 snapshots — 所有 tab 共用同一份、避免重複 hydrate。
// 2000 期 × 60 slot ≈ 120k slot snapshots，hydrate 約 1-2s。
const snapshots = computed<PerDrawSnapshot[]>(() => {
  if (allDraws.value.length === 0) return []
  return buildSnapshots(allDraws.value, KOBE_ANALYSIS_N)
})

const latestDrawInfo = computed(() => {
  const arr = allDraws.value
  if (arr.length === 0) return null
  const latest = arr[arr.length - 1]!
  const date = latest.drawDate
  return {
    term: latest.drawTerm,
    date
  }
})

interface TabDef {
  value: string
  label: string
  description?: string
}
const tabs: TabDef[] = [
  { value: 'observation', label: '觀察紀錄' },
  { value: 'remaining', label: '隔期剩餘 → 開出' },
  { value: 'cycle', label: '冷熱波段' },
  { value: 'position', label: '位置規律' },
  { value: 'journey', label: '號碼軌跡' },
  { value: 'compare', label: '訊號比拚' },
  { value: 'regime', label: '波段儀表板' }
]
const activeTab = ref<string>('observation')
</script>

<template>
  <UContainer class="py-10 space-y-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="space-y-2">
        <h1 class="text-3xl font-semibold tracking-tight">
          柯比
        </h1>
        <p class="text-sm text-muted">
          每期獎號的「來源隔期」觀察紀錄 + 多面向分析（共 7 個分頁）。資料源：隔期狀態（N={{ KOBE_ANALYSIS_N }}）+ 獎號關聯，hydrate 自過去 {{ KOBE_FETCH_LIMIT }} 期。
        </p>
        <p
          v-if="latestDrawInfo"
          class="text-xs text-muted"
        >
          最新期：<span class="font-mono">{{ latestDrawInfo.term }}</span>
          <span class="ml-1">{{ latestDrawInfo.date }}</span>
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
      v-if="loading && snapshots.length === 0"
      class="space-y-3"
    >
      <USkeleton
        v-for="i in 3"
        :key="i"
        class="h-32 w-full rounded-lg"
      />
    </div>

    <UTabs
      v-else
      v-model="activeTab"
      :items="tabs"
      :ui="{ list: 'overflow-x-auto' }"
    >
      <template #content="{ item }">
        <div class="pt-4">
          <KobeObservationTab
            v-if="item.value === 'observation'"
            :snapshots="snapshots"
            :interval-count="KOBE_ANALYSIS_N"
          />
          <KobeIntervalRemainingTab
            v-else-if="item.value === 'remaining'"
            :snapshots="snapshots"
          />
          <KobePendingTab
            v-else-if="item.value === 'cycle'"
            title="冷熱波段"
            description="觀察每個隔期『記錄裡的數值』在時間序上的變化。一個隔期的數值是它連續幾期沒被開到的計數；越大代表越冷。這分頁要看：(1) 數值飆高之後、後面幾期該隔期是否真的更容易反彈被開；(2) 把全部隔期的數值加總當作『整盤冷度』，看一天當中是否有時段性的高低起伏。"
            :questions="[
              '某個隔期冷到一定程度後，下一期或下兩三期會反彈嗎？',
              '整盤的整體冷度有沒有規律時段（早盤偏熱、晚盤偏冷之類）？',
              '哪幾個隔期最常飆高？飆高之後反彈的時間差是多少？'
            ]"
          />
          <KobePendingTab
            v-else-if="item.value === 'position'"
            title="位置規律"
            description="每個隔期內，被開出的號碼處於該隔期排序後的第幾位（位置）。理論上若完全隨機，位置應該平均分布。這分頁要看：(1) 每個隔期的位置分布是否真的平均、還是有偏好；(2) 相鄰兩期同一隔期的位置是否會重複（位置黏性）。"
            :questions="[
              '熱門隔期（0、1、2）的位置選擇是平均分散還是偏向特定位置？',
              '上一期在某隔期開了第幾位、下一期同隔期會傾向開附近的位置嗎？',
              '位置 1（最小號）與最末位有沒有比中間位置常被開？'
            ]"
          />
          <KobePendingTab
            v-else-if="item.value === 'journey'"
            title="號碼軌跡"
            description="追蹤每個號碼（1-80）一路的『隔期旅程』：它上一次被開時是從第幾隔期出來、再下一次被開又從第幾隔期出來。可以看到哪些號習慣『連莊跳階』、哪些號習慣『沉睡很久才回來』。"
            :questions="[
              '某個號平均隔多少期會再被開？',
              '有沒有號特別容易連兩期被開（隔期 0 持續命中）？',
              '所有號的回歸間隔是否符合理論（每號平均 4 期一次）？'
            ]"
          />
          <KobePendingTab
            v-else-if="item.value === 'compare'"
            title="訊號比拚"
            description="把『隔期的數值』與『位置』兩個訊號放一起比預測力。同樣的後段考試期、各自獨立做預測、平均誤差比一比，看哪個對下一期該隔期開出多少顆更有解釋力。結果可以直接餵回艾佛森頁的規則調整。"
            :questions="[
              '數值跟位置誰對下一期開出數更有預測力？',
              '兩個訊號同時用、會比單獨用更好嗎（互補還是重疊）？',
              '哪些隔期靠數值好用、哪些靠位置好用？'
            ]"
          />
          <KobePendingTab
            v-else-if="item.value === 'regime'"
            title="波段儀表板"
            description="先用 2-3 個切換開關（時段、整盤冷度、上一期形態）把全部期數分成幾堆，看不同堆的『隔期剩餘 → 開出』平均值是否真的不同。若是 → 代表有波段切換、規則會分時段啟用。儀表板會標出『現在這期屬於哪個波段』、並列出該波段下其他分頁的條件結果。"
            :questions="[
              '是不是真的存在多套規則、每個時段用不同套？',
              '目前這一期屬於哪個波段？該波段下隔期剩餘 → 開出的規律是什麼？',
              '若波段確實存在、它的切換頻率是多少（每幾期換一次）？'
            ]"
          />
        </div>
      </template>
    </UTabs>
  </UContainer>
</template>
