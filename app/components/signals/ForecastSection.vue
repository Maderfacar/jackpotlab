<script setup lang="ts">
/**
 * 「預期 vs 實際」帳本（2026-09-02 使用者拍板：都記、Firestore、一拍兩瞪眼）。
 *
 * 資料一律來自 GET /api/signals/forecast：server 自算自存自對帳，
 * 本元件只讀不寫。快照固定 3 期窗口（與頁面上的探索用 3/4/5 切換無關）。
 */

import type { Forecast, ForecastOutcome } from '~/signals/forecast'

interface SettledEntry {
  forecast: Forecast
  outcome: ForecastOutcome
}

interface ForecastStats {
  n: number
  dirRate: { prize: number | null, gap: number | null, val: number | null }
  dirDecided: { prize: number, gap: number, val: number }
  avgDGap: number
  avgDVal: number
  y1Rate: number | null
  yPosRate: Array<number | null>
  comboBestAvg: number | null
  comboBestDist: number[]
  comboDays: number
}

interface ForecastResponse {
  storage: 'firestore' | 'disabled'
  today: { forecast: Forecast, isNew: boolean } | null
  pending: Forecast[]
  history: SettledEntry[]
  stats: ForecastStats | null
}

const data = ref<ForecastResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    data.value = await $fetch<ForecastResponse>('/api/signals/forecast')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'unknown error'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function dirLabel(d: number | null): string {
  if (d == null) return '平手·不表態'
  return d > 0 ? '升' : d < 0 ? '降' : '平'
}

function hitBadge(h: boolean | null): { text: string, color: 'success' | 'error' | 'neutral' } {
  if (h == null) return { text: '—', color: 'neutral' }
  return h ? { text: '✓', color: 'success' } : { text: '✗', color: 'error' }
}

function pct(v: number | null): string {
  return v == null ? '—' : `${(v * 100).toFixed(0)}%`
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function bestHit(o: ForecastOutcome): number | null {
  return o.comboHits.length > 0 ? Math.max(...o.comboHits) : null
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="space-y-1">
        <div class="flex flex-wrap items-center gap-2">
          <p class="font-semibold">
            預期 vs 實際帳本
          </p>
          <UBadge
            v-if="data?.today?.isNew"
            color="success"
            variant="subtle"
            size="sm"
          >
            本次已存今日快照
          </UBadge>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-refresh-cw"
            class="ml-auto"
            :loading="loading"
            aria-label="重新整理帳本"
            @click="load"
          />
        </div>
        <p class="text-xs text-muted">
          每天第一次開這頁，自動把當日預期存檔（開獎前已定、同一期不覆蓋）；開獎後下次開頁自動對帳，一拍兩瞪眼、無容差。快照固定用 3 期窗口。兩層都記：參考值（方向／隔和／值和／逐位 y）與濃縮號碼組合。
        </p>
      </div>
    </template>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="`帳本載入失敗：${error}`"
    />
    <UAlert
      v-else-if="data?.storage === 'disabled'"
      color="warning"
      variant="subtle"
      icon="i-lucide-database-zap"
      title="此環境未設定 Firestore 憑證：只顯示當下預期、不會存檔"
    />

    <div
      v-if="data"
      class="space-y-5"
    >
      <!-- 今日預期 -->
      <div
        v-if="data.today"
        class="space-y-2"
      >
        <p class="text-sm font-medium">
          本期預期（基準 {{ data.today.forecast.baseIssue }}・{{ data.today.forecast.baseDate }} 的下一期）
        </p>
        <div class="grid gap-2 text-xs sm:grid-cols-3">
          <div class="rounded-lg bg-elevated/50 p-2">
            <p class="font-medium">
              方向（前 5 段多數決）
            </p>
            <p>獎和 {{ dirLabel(data.today.forecast.majority.prize) }} · 隔和 {{ dirLabel(data.today.forecast.majority.gap) }} · 值和 {{ dirLabel(data.today.forecast.majority.val) }}</p>
          </div>
          <div class="rounded-lg bg-elevated/50 p-2">
            <p class="font-medium">
              目標值（換算水位取中位）
            </p>
            <p>隔和 {{ data.today.forecast.tGapMedian }}（票 {{ data.today.forecast.tGapList.join('、') }}）</p>
            <p>值和 {{ data.today.forecast.tValMedian }}（票 {{ data.today.forecast.tValList.join('、') }}）</p>
          </div>
          <div class="rounded-lg bg-elevated/50 p-2">
            <p class="font-medium">
              位置 y
            </p>
            <p>y=1 顆數 {{ data.today.forecast.y1Median }}（票 {{ data.today.forecast.y1Votes.join('、') }}）</p>
            <p>逐位中位（第1~5顆）：{{ data.today.forecast.yPosMedian.join('、') }}</p>
          </div>
        </div>
        <div class="space-y-1 text-xs">
          <p class="font-medium">
            濃縮組合（目標 隔和 {{ data.today.forecast.comboTargets.gap }}·值和 {{ data.today.forecast.comboTargets.val }}·y=1 {{ data.today.forecast.comboTargets.y1 }} 顆·容差 ±{{ data.today.forecast.comboTargets.tolerance }}，符合 {{ data.today.forecast.comboTotal }} 組）
          </p>
          <p
            v-if="data.today.forecast.combos.length === 0"
            class="text-muted"
          >
            無符合組合（照登不藏）
          </p>
          <div
            v-for="(c, i) in data.today.forecast.combos"
            :key="i"
            class="flex flex-wrap items-center gap-1"
          >
            <span class="w-10 text-muted">第{{ i + 1 }}組</span>
            <UBadge
              v-for="n in c.nums"
              :key="n"
              color="primary"
              variant="soft"
              size="sm"
              class="min-w-7 justify-center font-mono"
            >
              {{ pad2(n) }}
            </UBadge>
          </div>
        </div>
      </div>
      <p
        v-else-if="!loading"
        class="text-xs text-muted"
      >
        目前資料不足以產生預期（相似段不足）。
      </p>

      <!-- 累積成績 -->
      <div
        v-if="data.stats"
        class="space-y-1 border-t border-default pt-3 text-xs"
      >
        <p class="text-sm font-medium">
          累積成績（{{ data.stats.n }} 期已對帳）
        </p>
        <p>
          方向命中：獎和 {{ pct(data.stats.dirRate.prize) }}（{{ data.stats.dirDecided.prize }} 期表態）· 隔和 {{ pct(data.stats.dirRate.gap) }}（{{ data.stats.dirDecided.gap }} 期）· 值和 {{ pct(data.stats.dirRate.val) }}（{{ data.stats.dirDecided.val }} 期）
        </p>
        <p>目標值平均差：隔和 {{ data.stats.avgDGap.toFixed(1) }} · 值和 {{ data.stats.avgDVal.toFixed(1) }}</p>
        <p>y=1 顆數全中率 {{ pct(data.stats.y1Rate) }} · 逐位 y 全中率（第1~5顆）{{ data.stats.yPosRate.map(pct).join(' / ') }}</p>
        <p v-if="data.stats.comboDays > 0">
          組合最好成績平均 {{ data.stats.comboBestAvg?.toFixed(2) }} 顆（分布 0~5 顆：{{ data.stats.comboBestDist.join('/') }}）
        </p>
      </div>

      <!-- 歷史帳 -->
      <div
        v-if="data.history.length > 0"
        class="space-y-2 border-t border-default pt-3"
      >
        <p class="text-sm font-medium">
          歷史帳（新 → 舊，最多 30 筆）
        </p>
        <ul class="space-y-2 text-xs">
          <li
            v-for="entry in data.history"
            :key="entry.forecast.baseIssue"
            class="space-y-1 rounded-lg bg-elevated/50 p-2"
          >
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span class="font-mono">{{ entry.outcome.actualIssue }}</span>
              <span class="text-muted">{{ entry.outcome.actualDate }}</span>
              <span>開出</span>
              <UBadge
                v-for="n in entry.outcome.actualPrizes"
                :key="n"
                color="warning"
                variant="soft"
                size="sm"
                class="min-w-6 justify-center font-mono"
              >
                {{ pad2(n) }}
              </UBadge>
              <span
                v-if="bestHit(entry.outcome) != null"
                class="ml-auto"
              >組合最好對中 {{ bestHit(entry.outcome) }} 顆</span>
            </div>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span
                v-for="line in (['prize', 'gap', 'val'] as const)"
                :key="line"
                class="flex items-center gap-1"
              >
                {{ line === 'prize' ? '獎和' : line === 'gap' ? '隔和' : '值和' }}{{ dirLabel(entry.forecast.majority[line]) }}
                <UBadge
                  :color="hitBadge(entry.outcome.dirHit[line]).color"
                  variant="subtle"
                  size="sm"
                >
                  {{ hitBadge(entry.outcome.dirHit[line]).text }}
                </UBadge>
              </span>
              <span>隔和差 {{ entry.outcome.dGap }}（{{ entry.forecast.tGapMedian }}→{{ entry.outcome.actualGapSum }}）</span>
              <span>值和差 {{ entry.outcome.dVal }}（{{ entry.forecast.tValMedian }}→{{ entry.outcome.actualValSum }}）</span>
            </div>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span class="flex items-center gap-1">
                y=1 猜 {{ entry.forecast.y1Median }} 實 {{ entry.outcome.actualY1 }}
                <UBadge
                  :color="hitBadge(entry.outcome.y1Hit).color"
                  variant="subtle"
                  size="sm"
                >
                  {{ hitBadge(entry.outcome.y1Hit).text }}
                </UBadge>
              </span>
              <span>
                逐位 y 猜 {{ entry.forecast.yPosMedian.join(',') }} 實 {{ entry.outcome.actualYs.join(',') }}
                （{{ entry.outcome.yPosHit.map(h => hitBadge(h).text).join(' ') }}）
              </span>
            </div>
          </li>
        </ul>
      </div>

      <p
        v-if="data.pending.length > 0"
        class="text-xs text-muted"
      >
        另有 {{ data.pending.length }} 筆較早的快照待開獎對帳。
      </p>
    </div>
  </UCard>
</template>
