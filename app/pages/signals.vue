<script setup lang="ts">
/**
 * 訊號 /signals
 *
 * 「/draws 獎號關聯」表欄位行為的驗證規則儀表板（539 專用）。
 *   - 資料層與 /draws 完全同一套：抓 recent?limit=D → hydrateFromDraws(N=60)
 *   - 每條規則對載入的歷史即時回測（命中率／平常機率都是活的，不寫死）
 *   - 版面（2026-08-30 改版）：頂部總覽列 → 條件燈表格式清單（點行展開）
 *     → 觀察卡預設收合。全頁文案白話化，術語不上頁面。
 *   - 與鑑古（app/hindsight）獨立；規則定義在 app/signals/rules.ts
 *
 * ⚠️ 動本頁或規則前必看 docs/HINDSIGHT-PRINCIPLE.md（客觀數據分析最高原則）。
 */

import type { DrawQueryResponse } from '~~/shared/lotto/types'
import { hydrateFromDraws, defaultN, clampD, type AnalysisDrawInput } from '~/utils/analysis'
import { toSignalRows } from '~/signals/history'
import { SIGNAL_RULES } from '~/signals/rules'
import { backtestRule, evaluateCurrent } from '~/signals/engine'
import type { SignalRow } from '~/signals/types'

definePageMeta({
  title: '訊號'
})

const GAME_ID = 'lotto539'
const ANALYSIS_N = defaultN()
/** 預設兩年：539 一週 6 期，約 700 期 */
const DEFAULT_DEPTH = 700
const DEPTH_STORAGE_KEY = 'jackpotlab-signals-d'

const depthD = ref(DEFAULT_DEPTH)
const loading = ref(false)
const error = ref<string | null>(null)
const rows = shallowRef<SignalRow[]>([])

function loadDepthPref() {
  if (typeof window === 'undefined') return
  const raw = window.localStorage.getItem(DEPTH_STORAGE_KEY)
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  depthD.value = Number.isFinite(parsed) ? clampD(parsed) : DEFAULT_DEPTH
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<DrawQueryResponse>(`/api/draws/${GAME_ID}/recent`, {
      params: { limit: depthD.value }
    })
    const drawsAsc = [...res.results].sort((a, b) => a.drawTerm - b.drawTerm)
    const inputs: AnalysisDrawInput[] = drawsAsc.map(r => ({
      drawTerm: r.drawTerm,
      drawDate: r.drawDate,
      prizes: [...new Set(r.special != null ? [...r.numbers, r.special] : r.numbers)]
    }))
    const state = hydrateFromDraws(GAME_ID, ANALYSIS_N, inputs)
    rows.value = toSignalRows(state)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'unknown error'
  } finally {
    loading.value = false
  }
}

function commitDepth(rawVal: number | string) {
  const num = typeof rawVal === 'string' ? Number.parseInt(rawVal, 10) : rawVal
  const clamped = clampD(Number.isFinite(num) ? num : DEFAULT_DEPTH)
  depthD.value = clamped
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(DEPTH_STORAGE_KEY, String(clamped))
  }
  load()
}

onMounted(() => {
  loadDepthPref()
  load()
})

const latestRow = computed(() => rows.value.at(-1) ?? null)

interface RuleView {
  rule: (typeof SIGNAL_RULES)[number]
  current: ReturnType<typeof evaluateCurrent>
  backtest: ReturnType<typeof backtestRule>
  lift: number | null
}

const ruleViews = computed<RuleView[]>(() => SIGNAL_RULES.map((rule) => {
  const backtest = backtestRule(rule, rows.value)
  const lift = backtest.hitRate != null && backtest.baselineRate != null && backtest.baselineRate > 0
    ? backtest.hitRate / backtest.baselineRate
    : null
  return {
    rule,
    current: evaluateCurrent(rule, rows.value),
    backtest,
    lift
  }
}))

const litViews = computed(() => ruleViews.value.filter(v => v.current?.met))

// 條件燈清單：點行展開細節
const expandedRules = ref<Set<string>>(new Set())

function toggleExpanded(id: string): void {
  const next = new Set(expandedRules.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedRules.value = next
}

function pct(v: number | null): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
</script>

<template>
  <UContainer class="py-10 space-y-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="space-y-2">
        <h1 class="text-3xl font-semibold tracking-tight">
          訊號
        </h1>
        <p class="text-sm text-muted">
          今彩 539 · 看的是 /draws「獎號關聯」表的「數值」和「總和」兩欄 — 條件成立就亮燈，說中的比例用載入的歷史即時重算
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

    <!-- ====== 頂部總覽列 ====== -->
    <UCard>
      <div class="space-y-3">
        <div
          v-if="latestRow"
          class="flex flex-wrap items-center gap-2"
        >
          <span class="text-sm font-medium">最新一期 {{ latestRow.issue }}（{{ latestRow.date }}）</span>
          <UBadge
            v-for="num in latestRow.prizes"
            :key="num"
            color="warning"
            variant="solid"
            size="lg"
            class="min-w-9 justify-center font-mono"
          >
            {{ pad2(num) }}
          </UBadge>
          <span class="text-xs text-muted">五顆數值加起來 {{ latestRow.values.reduce((a, b) => a + b, 0) }} · 總和 {{ latestRow.sum }}</span>
        </div>

        <div
          v-if="rows.length > 0"
          class="flex flex-wrap items-center gap-2"
        >
          <UBadge
            :color="litViews.length > 0 ? 'success' : 'neutral'"
            variant="solid"
            size="lg"
            icon="i-lucide-lightbulb"
          >
            本期亮燈 {{ litViews.length }} / {{ ruleViews.length }}
          </UBadge>
          <UBadge
            v-for="v in litViews"
            :key="v.rule.id"
            color="success"
            variant="subtle"
            size="lg"
          >
            {{ v.rule.code }} · {{ v.rule.expectation }}
          </UBadge>
          <span
            v-if="litViews.length === 0"
            class="text-xs text-muted"
          >這期沒有任何條件成立</span>
        </div>

        <div class="flex flex-wrap items-center gap-3 text-xs text-muted">
          <label class="flex items-center gap-2">
            <span>載入期數</span>
            <UInput
              :model-value="depthD"
              type="number"
              size="xs"
              min="100"
              max="5000"
              class="w-24"
              @change="(e: Event) => commitDepth((e.target as HTMLInputElement).value)"
            />
          </label>
          <span v-if="rows.length > 0">預設 700 期 ≒ 兩年 · 前 {{ ANALYSIS_N }} 期表格還沒填滿不列入 · 實際計算 {{ rows.length }} 期（{{ rows[0]?.date }} ～ {{ latestRow?.date }}）</span>
          <UBadge
            v-if="loading"
            color="info"
            variant="subtle"
            size="sm"
            class="animate-pulse"
          >
            載入中…
          </UBadge>
        </div>
      </div>
    </UCard>

    <!-- ====== 條件燈清單 ====== -->
    <UCard>
      <template #header>
        <div class="space-y-1">
          <p class="font-semibold">
            條件燈
          </p>
          <p class="text-xs text-muted">
            一行一條規則，點右邊箭頭看說明、相關獎號和過去的亮燈紀錄。「平常機率」= 不管任何條件、隨便一期也會發生的機率 — 命中率要明顯高於它，這條規則才算有料。
          </p>
        </div>
      </template>

      <ul class="divide-y divide-default">
        <li
          v-for="view in ruleViews"
          :key="view.rule.id"
          class="py-3"
        >
          <!-- 主行 -->
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              :color="view.current?.met ? 'success' : 'neutral'"
              :variant="view.current?.met ? 'solid' : 'subtle'"
              size="sm"
              class="w-14 justify-center shrink-0"
            >
              {{ view.current?.met ? '亮燈' : '未亮' }}
            </UBadge>
            <UBadge
              color="neutral"
              variant="outline"
              size="sm"
              class="w-12 justify-center shrink-0 font-mono"
            >
              {{ view.rule.code }}
            </UBadge>
            <span class="text-sm font-medium">{{ view.rule.name }}</span>
            <div class="ml-auto flex items-center gap-2">
              <span class="text-xs text-muted">
                說中 {{ pct(view.backtest.hitRate) }}（平常 {{ pct(view.backtest.baselineRate) }}）
              </span>
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                :icon="expandedRules.has(view.rule.id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                :aria-label="expandedRules.has(view.rule.id) ? '收合' : '展開'"
                @click="toggleExpanded(view.rule.id)"
              />
            </div>
          </div>

          <!-- 本期狀況一行 -->
          <p
            class="mt-1 pl-1 text-xs"
            :class="view.current?.met ? 'text-success' : 'text-muted'"
          >
            <template v-if="view.current">
              {{ view.current.detail }}<template v-if="view.current.met">
                → 預期：{{ view.rule.expectation }}
              </template>
            </template>
            <template v-else>
              資料不足，無法判定本期
            </template>
          </p>

          <!-- 展開細節 -->
          <div
            v-if="expandedRules.has(view.rule.id)"
            class="mt-3 space-y-3 rounded-lg bg-elevated/50 p-3 text-sm"
          >
            <p class="text-xs text-muted">
              {{ view.rule.description }}
            </p>

            <div
              v-if="view.current?.met && view.current.related.length > 0"
              class="space-y-1"
            >
              <p class="text-xs font-medium text-muted">
                這期湊成條件的五顆獎號：
              </p>
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="item in view.current.related"
                  :key="item.num"
                  class="flex flex-col items-center gap-0.5"
                >
                  <UBadge
                    color="warning"
                    variant="solid"
                    size="md"
                    class="min-w-8 justify-center font-mono"
                  >
                    {{ pad2(item.num) }}
                  </UBadge>
                  <span class="text-[10px] text-muted">{{ item.note }}</span>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 text-xs">
              <UBadge
                color="primary"
                variant="subtle"
              >
                歷史上亮過 {{ view.backtest.fired }} 次、說中 {{ view.backtest.hit }} 次（{{ pct(view.backtest.hitRate) }}）
              </UBadge>
              <UBadge
                color="neutral"
                variant="subtle"
              >
                平常機率 {{ pct(view.backtest.baselineRate) }}
              </UBadge>
              <UBadge
                v-if="view.lift != null"
                :color="view.lift >= 1.3 ? 'success' : view.lift >= 1.05 ? 'info' : 'error'"
                variant="subtle"
              >
                是平常的 {{ view.lift.toFixed(2) }} 倍
              </UBadge>
            </div>

            <div v-if="view.backtest.recentFirings.length > 0">
              <p class="mb-1 text-xs font-medium text-muted">
                最近幾次亮燈：
              </p>
              <ul class="space-y-1.5 text-xs">
                <li
                  v-for="firing in view.backtest.recentFirings"
                  :key="firing.issue"
                  class="flex flex-wrap items-center gap-2"
                >
                  <UBadge
                    :color="firing.hit ? 'success' : 'error'"
                    variant="subtle"
                    size="sm"
                  >
                    {{ firing.hit ? '✓ 說中' : '✗ 沒中' }}
                  </UBadge>
                  <span class="font-mono">{{ firing.issue }}</span>
                  <span class="text-muted">{{ firing.date }}</span>
                  <span class="text-muted">{{ firing.detail }} → 下期 {{ firing.nextIssue }}</span>
                </li>
              </ul>
            </div>
            <p
              v-else
              class="text-xs text-muted"
            >
              載入的歷史裡沒有亮燈紀錄
            </p>
          </div>
        </li>
      </ul>
    </UCard>

    <SignalsObservationCards
      v-if="rows.length > 0"
      :rows="rows"
    />

    <p class="text-xs text-muted">
      誠實註記：B1／B2／C1／C2 這類規則說的是「衝太高就會掉回來、掉太低就會彈回去」— 數字是真的、穩定度是真的，但它們描述的是整體數字的走向，不直接指向哪一顆號碼。所有比例都用載入的歷史即時重算，沒中的照登不藏。
    </p>
  </UContainer>
</template>
