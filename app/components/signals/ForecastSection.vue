<script setup lang="ts">
/**
 * 「預期 vs 實際」帳本（2026-09-02 拍板：都記、Firestore、一拍兩瞪眼）。
 * 2026-09-02 改版：使用者反映看不懂 → 全面改成「項目｜預期｜實際｜對了嗎」對照表，
 * 術語降到最低（不再出現多數決／中位／逐位等字眼）。
 *
 * 資料一律來自 GET /api/signals/forecast：server 自算自存自對帳，本元件只讀不寫。
 * 快照固定 3 期窗口（與頁面上探索用的 3/4/5 切換無關）。
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
const expandedHistory = ref<Set<string>>(new Set())

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<ForecastResponse>('/api/signals/forecast')
    data.value = res
    // 最新一筆歷史帳預設展開
    const first = res.history[0]?.forecast.baseIssue
    expandedHistory.value = new Set(first ? [first] : [])
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'unknown error'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function toggleHistory(key: string): void {
  const next = new Set(expandedHistory.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedHistory.value = next
}

function dirWord(d: number | null): string {
  if (d == null) return '沒共識'
  return d > 0 ? '會變大' : d < 0 ? '會變小' : '持平'
}

/** 已對帳的實際走向（舊快照可能沒存，顯示 —） */
function pastDirWord(d: number | undefined): string {
  if (d == null) return '—'
  return d > 0 ? '變大了' : d < 0 ? '變小了' : '持平'
}

/** 5 段參考的走向票整理成白話，例：「3 段變大、2 段變小」 */
function dirVotesText(votes: number[]): string {
  let up = 0
  let down = 0
  let flat = 0
  for (const v of votes) {
    if (v > 0) up++
    else if (v < 0) down++
    else flat++
  }
  const parts: string[] = []
  if (up) parts.push(`${up} 段變大`)
  if (down) parts.push(`${down} 段變小`)
  if (flat) parts.push(`${flat} 段持平`)
  return parts.join('、')
}

function pct(v: number | null): string {
  return v == null ? '—' : `${(v * 100).toFixed(0)}%`
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function bestHit(o: ForecastOutcome): number {
  return o.comboHits.length > 0 ? Math.max(...o.comboHits) : 0
}

/** 歷史帳一行摘要，收合時看這個就夠 */
function entrySummary(e: SettledEntry): string {
  const hits = [e.outcome.dirHit.gap, e.outcome.dirHit.val, e.outcome.dirHit.prize]
  const decided = hits.filter(h => h != null)
  const ok = decided.filter(h => h === true).length
  return `走向對 ${ok}/${decided.length} · 隔期總和差 ${e.outcome.dGap} · 數值總和差 ${e.outcome.dVal} · 號碼最多中 ${bestHit(e.outcome)} 顆`
}

const HIT_YES = { text: '✓ 對', color: 'success' as const }
const HIT_NO = { text: '✗ 錯', color: 'error' as const }
const HIT_NA = { text: '不算', color: 'neutral' as const }

function hitOf(h: boolean | null): { text: string, color: 'success' | 'error' | 'neutral' } {
  return h == null ? HIT_NA : h ? HIT_YES : HIT_NO
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
            今天的預期已存檔
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
          每天開這頁，系統自動把「相似比對前 5 段合議出的預期」記下來；開獎後再開頁，自動對答案、累積成績。存了就不能改，對錯照登。
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
      title="此環境未設定 Firestore：只顯示當下預期、不會存檔"
    />

    <div
      v-if="data"
      class="space-y-6"
    >
      <!-- 本期預期（未開獎） -->
      <div
        v-if="data.today"
        class="space-y-2"
      >
        <p class="text-sm font-medium">
          下一期的預期（{{ data.today.forecast.baseIssue }}・{{ data.today.forecast.baseDate }} 開完後存檔）
        </p>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[28rem] text-xs">
            <thead>
              <tr class="border-b border-default text-left text-muted">
                <th class="py-1.5 pr-2 font-medium">
                  項目
                </th>
                <th class="py-1.5 pr-2 font-medium">
                  預期
                </th>
                <th class="py-1.5 font-medium">
                  怎麼來的
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr>
                <td class="py-1.5 pr-2">
                  隔期總和
                </td>
                <td class="py-1.5 pr-2 font-mono font-semibold">
                  {{ data.today.forecast.tGapMedian }}
                </td>
                <td class="py-1.5 text-muted">
                  5 段參考值 {{ [...data.today.forecast.tGapList].sort((a, b) => a - b).join('、') }}，取中間
                </td>
              </tr>
              <tr>
                <td class="py-1.5 pr-2">
                  數值總和
                </td>
                <td class="py-1.5 pr-2 font-mono font-semibold">
                  {{ data.today.forecast.tValMedian }}
                </td>
                <td class="py-1.5 text-muted">
                  5 段參考值 {{ [...data.today.forecast.tValList].sort((a, b) => a - b).join('、') }}，取中間
                </td>
              </tr>
              <tr>
                <td class="py-1.5 pr-2">
                  隔期總和走向
                </td>
                <td class="py-1.5 pr-2 font-semibold">
                  {{ dirWord(data.today.forecast.majority.gap) }}
                </td>
                <td class="py-1.5 text-muted">
                  {{ dirVotesText(data.today.forecast.refs.map(r => r.dirGap)) }}
                </td>
              </tr>
              <tr>
                <td class="py-1.5 pr-2">
                  數值總和走向
                </td>
                <td class="py-1.5 pr-2 font-semibold">
                  {{ dirWord(data.today.forecast.majority.val) }}
                </td>
                <td class="py-1.5 text-muted">
                  {{ dirVotesText(data.today.forecast.refs.map(r => r.dirVal)) }}
                </td>
              </tr>
              <tr>
                <td class="py-1.5 pr-2">
                  獎號總和走向
                </td>
                <td class="py-1.5 pr-2 font-semibold">
                  {{ dirWord(data.today.forecast.majority.prize) }}
                </td>
                <td class="py-1.5 text-muted">
                  {{ dirVotesText(data.today.forecast.refs.map(r => r.dirPrize)) }}（這條過去命中偏低，參考就好）
                </td>
              </tr>
              <tr>
                <td class="py-1.5 pr-2">
                  y=1 的顆數
                </td>
                <td class="py-1.5 pr-2 font-mono font-semibold">
                  {{ data.today.forecast.y1Median }} 顆
                </td>
                <td class="py-1.5 text-muted">
                  5 段的票 {{ [...data.today.forecast.y1Votes].sort((a, b) => a - b).join('、') }}
                </td>
              </tr>
              <tr>
                <td class="py-1.5 pr-2">
                  五顆的位置 y
                </td>
                <td class="py-1.5 pr-2 font-mono font-semibold">
                  {{ data.today.forecast.yPosMedian.join('、') }}
                </td>
                <td class="py-1.5 text-muted">
                  第 1～5 顆（小→大）各自 5 段投票取中間
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="space-y-1 text-xs">
          <p class="font-medium">
            號碼組合（拿上面「隔期總和 {{ data.today.forecast.comboTargets.gap }}＋數值總和 {{ data.today.forecast.comboTargets.val }}＋y=1 共 {{ data.today.forecast.comboTargets.y1 }} 顆、容差 ±{{ data.today.forecast.comboTargets.tolerance }}」去湊，共 {{ data.today.forecast.comboTotal }} 組裡的前 5 組）
          </p>
          <p
            v-if="data.today.forecast.combos.length === 0"
            class="text-muted"
          >
            這組條件湊不出任何組合（照登不藏）
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
          <p class="text-muted">
            開獎後這整張表會自動補上「實際」和「對╱錯」。
          </p>
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
        class="space-y-2 border-t border-default pt-3"
      >
        <p class="text-sm font-medium">
          累積成績（已對過 {{ data.stats.n }} 期的答案）
        </p>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[24rem] text-xs">
            <thead>
              <tr class="border-b border-default text-left text-muted">
                <th class="py-1.5 pr-2 font-medium">
                  項目
                </th>
                <th class="py-1.5 pr-2 font-medium">
                  成績
                </th>
                <th class="py-1.5 font-medium">
                  說明
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr>
                <td class="py-1.5 pr-2">
                  隔期總和走向
                </td>
                <td class="py-1.5 pr-2 font-semibold">
                  對 {{ pct(data.stats.dirRate.gap) }}
                </td>
                <td class="py-1.5 text-muted">
                  {{ data.stats.dirDecided.gap }} 期有表態
                </td>
              </tr>
              <tr>
                <td class="py-1.5 pr-2">
                  數值總和走向
                </td>
                <td class="py-1.5 pr-2 font-semibold">
                  對 {{ pct(data.stats.dirRate.val) }}
                </td>
                <td class="py-1.5 text-muted">
                  {{ data.stats.dirDecided.val }} 期有表態
                </td>
              </tr>
              <tr>
                <td class="py-1.5 pr-2">
                  獎號總和走向
                </td>
                <td class="py-1.5 pr-2 font-semibold">
                  對 {{ pct(data.stats.dirRate.prize) }}
                </td>
                <td class="py-1.5 text-muted">
                  {{ data.stats.dirDecided.prize }} 期有表態
                </td>
              </tr>
              <tr>
                <td class="py-1.5 pr-2">
                  隔期總和數字
                </td>
                <td class="py-1.5 pr-2 font-semibold">
                  平均差 {{ data.stats.avgDGap.toFixed(1) }}
                </td>
                <td class="py-1.5 text-muted">
                  預期值和實際差多少
                </td>
              </tr>
              <tr>
                <td class="py-1.5 pr-2">
                  數值總和數字
                </td>
                <td class="py-1.5 pr-2 font-semibold">
                  平均差 {{ data.stats.avgDVal.toFixed(1) }}
                </td>
                <td class="py-1.5 text-muted">
                  預期值和實際差多少
                </td>
              </tr>
              <tr>
                <td class="py-1.5 pr-2">
                  y=1 顆數
                </td>
                <td class="py-1.5 pr-2 font-semibold">
                  全中 {{ pct(data.stats.y1Rate) }}
                </td>
                <td class="py-1.5 text-muted">
                  猜的顆數 = 實際顆數才算對
                </td>
              </tr>
              <tr>
                <td class="py-1.5 pr-2">
                  五顆的位置 y
                </td>
                <td class="py-1.5 pr-2 font-semibold">
                  {{ data.stats.yPosRate.map(pct).join(' / ') }}
                </td>
                <td class="py-1.5 text-muted">
                  第 1～5 顆各自的全中率
                </td>
              </tr>
              <tr v-if="data.stats.comboDays > 0">
                <td class="py-1.5 pr-2">
                  號碼組合
                </td>
                <td class="py-1.5 pr-2 font-semibold">
                  最好那組平均中 {{ data.stats.comboBestAvg?.toFixed(2) }} 顆
                </td>
                <td class="py-1.5 text-muted">
                  中 0～5 顆的次數：{{ data.stats.comboBestDist.join(' / ') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 歷史帳 -->
      <div
        v-if="data.history.length > 0"
        class="space-y-2 border-t border-default pt-3"
      >
        <p class="text-sm font-medium">
          歷史帳（新 → 舊）
        </p>
        <ul class="space-y-2">
          <li
            v-for="entry in data.history"
            :key="entry.forecast.baseIssue"
            class="rounded-lg bg-elevated/50"
          >
            <div
              class="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 p-2 text-xs"
              @click="toggleHistory(entry.forecast.baseIssue)"
            >
              <span class="font-mono font-medium">{{ entry.outcome.actualIssue }}</span>
              <span class="text-muted">{{ entry.outcome.actualDate }}</span>
              <span class="text-muted">{{ entrySummary(entry) }}</span>
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                class="ml-auto"
                :icon="expandedHistory.has(entry.forecast.baseIssue) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                :aria-label="expandedHistory.has(entry.forecast.baseIssue) ? '收合' : '展開'"
              />
            </div>

            <div
              v-if="expandedHistory.has(entry.forecast.baseIssue)"
              class="space-y-3 px-2 pb-3 text-xs"
            >
              <div class="flex flex-wrap items-center gap-1">
                <span class="text-muted">實際開出：</span>
                <UBadge
                  v-for="n in entry.outcome.actualPrizes"
                  :key="n"
                  color="warning"
                  variant="solid"
                  size="sm"
                  class="min-w-7 justify-center font-mono"
                >
                  {{ pad2(n) }}
                </UBadge>
              </div>

              <div class="overflow-x-auto">
                <table class="w-full min-w-[26rem]">
                  <thead>
                    <tr class="border-b border-default text-left text-muted">
                      <th class="py-1 pr-2 font-medium">
                        項目
                      </th>
                      <th class="py-1 pr-2 font-medium">
                        預期
                      </th>
                      <th class="py-1 pr-2 font-medium">
                        實際
                      </th>
                      <th class="py-1 font-medium">
                        對了嗎
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-default">
                    <tr>
                      <td class="py-1 pr-2">
                        隔期總和
                      </td>
                      <td class="py-1 pr-2 font-mono">
                        {{ entry.forecast.tGapMedian }}
                      </td>
                      <td class="py-1 pr-2 font-mono">
                        {{ entry.outcome.actualGapSum }}
                      </td>
                      <td class="py-1">
                        差 {{ entry.outcome.dGap }}
                      </td>
                    </tr>
                    <tr>
                      <td class="py-1 pr-2">
                        數值總和
                      </td>
                      <td class="py-1 pr-2 font-mono">
                        {{ entry.forecast.tValMedian }}
                      </td>
                      <td class="py-1 pr-2 font-mono">
                        {{ entry.outcome.actualValSum }}
                      </td>
                      <td class="py-1">
                        差 {{ entry.outcome.dVal }}
                      </td>
                    </tr>
                    <tr
                      v-for="line in (['gap', 'val', 'prize'] as const)"
                      :key="line"
                    >
                      <td class="py-1 pr-2">
                        {{ line === 'gap' ? '隔期總和走向' : line === 'val' ? '數值總和走向' : '獎號總和走向' }}
                      </td>
                      <td class="py-1 pr-2">
                        {{ dirWord(entry.forecast.majority[line]) }}
                      </td>
                      <td class="py-1 pr-2">
                        {{ pastDirWord(entry.outcome.actualDir?.[line]) }}
                      </td>
                      <td class="py-1">
                        <UBadge
                          :color="hitOf(entry.outcome.dirHit[line]).color"
                          variant="subtle"
                          size="sm"
                        >
                          {{ hitOf(entry.outcome.dirHit[line]).text }}
                        </UBadge>
                      </td>
                    </tr>
                    <tr>
                      <td class="py-1 pr-2">
                        y=1 的顆數
                      </td>
                      <td class="py-1 pr-2 font-mono">
                        {{ entry.forecast.y1Median }}
                      </td>
                      <td class="py-1 pr-2 font-mono">
                        {{ entry.outcome.actualY1 }}
                      </td>
                      <td class="py-1">
                        <UBadge
                          :color="hitOf(entry.outcome.y1Hit).color"
                          variant="subtle"
                          size="sm"
                        >
                          {{ hitOf(entry.outcome.y1Hit).text }}
                        </UBadge>
                      </td>
                    </tr>
                    <tr>
                      <td class="py-1 pr-2">
                        五顆的位置 y
                      </td>
                      <td class="py-1 pr-2 font-mono">
                        {{ entry.forecast.yPosMedian.join('、') }}
                      </td>
                      <td class="py-1 pr-2 font-mono">
                        {{ entry.outcome.actualYs.join('、') }}
                      </td>
                      <td class="py-1">
                        {{ entry.outcome.yPosHit.filter(h => h === true).length }}／{{ entry.outcome.yPosHit.filter(h => h != null).length }} 顆對
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div
                v-if="entry.forecast.combos.length > 0"
                class="space-y-1"
              >
                <p class="text-muted">
                  號碼組合對答案（亮黃色 = 有開出）：
                </p>
                <div
                  v-for="(c, i) in entry.forecast.combos"
                  :key="i"
                  class="flex flex-wrap items-center gap-1"
                >
                  <span class="w-16 text-muted">第{{ i + 1 }}組 中{{ entry.outcome.comboHits[i] ?? 0 }}顆</span>
                  <UBadge
                    v-for="n in c.nums"
                    :key="n"
                    :color="entry.outcome.actualPrizes.includes(n) ? 'warning' : 'neutral'"
                    :variant="entry.outcome.actualPrizes.includes(n) ? 'solid' : 'soft'"
                    size="sm"
                    class="min-w-7 justify-center font-mono"
                  >
                    {{ pad2(n) }}
                  </UBadge>
                </div>
              </div>
            </div>
          </li>
        </ul>
      </div>

      <p
        v-if="data.pending.length > 0"
        class="text-xs text-muted"
      >
        另有 {{ data.pending.length }} 筆較早的預期還沒開獎、等對答案。
      </p>
    </div>
  </UCard>
</template>
