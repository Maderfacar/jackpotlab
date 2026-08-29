<script setup lang="ts">
/**
 * 訊號 /signals
 *
 * 「/draws 獎號關聯表」欄位行為的驗證規則儀表板（539 專用）。
 *   - 資料層與 /draws 完全同一套：抓 recent?limit=D → hydrateFromDraws(N=60)
 *   - 每條規則對載入視窗即時回測（命中率／基準率都是活的，不寫死）
 *   - 本期條件成立 → 亮燈 + 攤出湊成條件的獎號明細
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

const litCount = computed(() => ruleViews.value.filter(v => v.current?.met).length)

// 每張卡「最近亮燈紀錄」展開狀態
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
          今彩 539 · 基於 /draws「獎號關聯」表的驗證規則 — 條件成立亮燈，命中率對載入視窗即時回測
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

    <UCard>
      <div class="space-y-4">
        <div class="flex flex-wrap items-center gap-3 text-xs">
          <label class="flex items-center gap-2">
            <span class="text-muted">D 灌入深度</span>
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
          <span class="text-muted">預設 700 期 ≒ 兩年 · N 固定 {{ ANALYSIS_N }} · 暖機前 {{ ANALYSIS_N }} 期不入樣本</span>
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

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="`載入失敗：${error}`"
        />

        <div
          v-if="rows.length > 0"
          class="flex flex-wrap items-center gap-2 text-xs text-muted"
        >
          <UBadge
            color="neutral"
            variant="subtle"
          >
            樣本 {{ rows.length }} 期
          </UBadge>
          <UBadge
            color="neutral"
            variant="subtle"
          >
            {{ rows[0]?.issue }}（{{ rows[0]?.date }}）→ {{ latestRow?.issue }}（{{ latestRow?.date }}）
          </UBadge>
          <UBadge
            :color="litCount > 0 ? 'success' : 'neutral'"
            variant="subtle"
          >
            本期亮燈 {{ litCount }} / {{ ruleViews.length }}
          </UBadge>
        </div>

        <div
          v-if="latestRow"
          class="flex flex-wrap items-center gap-2"
        >
          <span class="text-xs text-muted">最新一期 {{ latestRow.issue }}（{{ latestRow.date }}）：</span>
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
          <span class="text-xs text-muted">數值加總 {{ latestRow.values.reduce((a, b) => a + b, 0) }} · 總和 {{ latestRow.sum }}</span>
        </div>
      </div>
    </UCard>

    <div class="grid gap-4 lg:grid-cols-2">
      <UCard
        v-for="view in ruleViews"
        :key="view.rule.id"
        :class="view.current?.met ? 'ring-2 ring-success' : ''"
      >
        <template #header>
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1">
              <p class="font-semibold leading-snug">
                {{ view.rule.name }}
              </p>
              <p class="text-xs text-muted">
                {{ view.rule.description }}
              </p>
            </div>
            <UBadge
              :color="view.current?.met ? 'success' : 'neutral'"
              :variant="view.current?.met ? 'solid' : 'subtle'"
              size="lg"
              class="shrink-0"
              :icon="view.current?.met ? 'i-lucide-lightbulb' : 'i-lucide-lightbulb-off'"
            >
              {{ view.current?.met ? '亮燈' : '未亮' }}
            </UBadge>
          </div>
        </template>

        <div class="space-y-3 text-sm">
          <p v-if="view.current">
            {{ view.current.detail }}
          </p>
          <p
            v-else
            class="text-muted"
          >
            資料不足，無法判定本期
          </p>

          <div
            v-if="view.current?.met"
            class="space-y-2"
          >
            <p class="text-success font-medium">
              預期：{{ view.rule.expectation }}
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

          <USeparator />

          <div class="flex flex-wrap items-center gap-2 text-xs">
            <UBadge
              color="primary"
              variant="subtle"
            >
              命中 {{ view.backtest.hit }}/{{ view.backtest.fired }}（{{ pct(view.backtest.hitRate) }}）
            </UBadge>
            <UBadge
              color="neutral"
              variant="subtle"
            >
              基準 {{ pct(view.backtest.baselineRate) }}
            </UBadge>
            <UBadge
              v-if="view.lift != null"
              :color="view.lift >= 1.3 ? 'success' : view.lift >= 1.05 ? 'info' : 'error'"
              variant="subtle"
            >
              lift ×{{ view.lift.toFixed(2) }}
            </UBadge>
          </div>

          <div>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              :icon="expandedRules.has(view.rule.id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              @click="toggleExpanded(view.rule.id)"
            >
              最近亮燈紀錄（{{ view.backtest.recentFirings.length }}）
            </UButton>
            <ul
              v-if="expandedRules.has(view.rule.id)"
              class="mt-2 space-y-1.5 text-xs"
            >
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
                  {{ firing.hit ? '✓ 命中' : '✗ 失手' }}
                </UBadge>
                <span class="font-mono">{{ firing.issue }}</span>
                <span class="text-muted">{{ firing.date }}</span>
                <span class="text-muted">{{ firing.detail }} → 下期 {{ firing.nextIssue }}</span>
              </li>
              <li
                v-if="view.backtest.recentFirings.length === 0"
                class="text-muted"
              >
                載入視窗內無亮燈紀錄
              </li>
            </ul>
          </div>
        </div>
      </UCard>
    </div>

    <SignalsObservationCards
      v-if="rows.length > 0"
      :rows="rows"
    />

    <p class="text-xs text-muted">
      誠實註記：B1／B2／C1／C2 屬「極端值往中間帶回歸」型規則 — 數字是真的、穩定度是真的，但它們描述的是欄位行為、不直接指向特定號碼。命中率隨載入視窗即時重算，失手照登不藏。
    </p>
  </UContainer>
</template>
