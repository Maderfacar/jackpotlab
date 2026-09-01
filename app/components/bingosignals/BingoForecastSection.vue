<script setup lang="ts">
/**
 * 賓果「預期 vs 實際」帳本 — 對照表版（沿用 539 帳本改版後的白話格式）。
 * 資料來自 GET /api/bingo-signals/forecast；本元件只讀不寫。
 * 10 顆候選的隨機基準 = 2.5 顆，成績表直接對照。
 */

import type { BingoForecast, BingoForecastOutcome } from '~/bingosignals/forecast'

interface SettledEntry {
  forecast: BingoForecast
  outcome: BingoForecastOutcome
}

interface BingoStats {
  n: number
  dirRate: { prize: number | null, gap: number | null, val: number | null }
  dirDecided: { prize: number, gap: number, val: number }
  avgDGap: number
  avgDVal: number
  avgGapCompDiff: number
  avgValCompDiff: number
  avgYCompDiff: number
  avgPickHits: number
  pickHitDist: number[]
  pickBaseline: number
}

interface BingoForecastResponse {
  storage: 'firestore' | 'disabled'
  today: { forecast: BingoForecast, isNew: boolean } | null
  pending: number
  history: SettledEntry[]
  stats: BingoStats | null
}

const data = ref<BingoForecastResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const expandedHistory = ref<Set<string>>(new Set())

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<BingoForecastResponse>('/api/bingo-signals/forecast')
    data.value = res
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

function pastDirWord(d: number | undefined): string {
  if (d == null) return '—'
  return d > 0 ? '變大了' : d < 0 ? '變小了' : '持平'
}

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

function hitOf(h: boolean | null): { text: string, color: 'success' | 'error' | 'neutral' } {
  if (h == null) return { text: '不算', color: 'neutral' }
  return h ? { text: '✓ 對', color: 'success' } : { text: '✗ 錯', color: 'error' }
}

function entrySummary(e: SettledEntry): string {
  const hits = [e.outcome.dirHit.gap, e.outcome.dirHit.val, e.outcome.dirHit.prize]
  const decided = hits.filter(h => h != null)
  const ok = decided.filter(h => h === true).length
  return `走向對 ${ok}/${decided.length} · 隔和差 ${e.outcome.dGap} · 值和差 ${e.outcome.dVal} · 10 顆中 ${e.outcome.pickHits}`
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="space-y-1">
        <div class="flex flex-wrap items-center gap-2">
          <p class="font-semibold">
            預期 vs 實際帳本（賓果）
          </p>
          <UBadge
            v-if="data?.today?.isNew"
            color="success"
            variant="subtle"
            size="sm"
          >
            本期預期已存檔
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
          每次開頁自動記下「下一期的預期」，5 分鐘後開獎、再整理一次就自動對答案。10 顆候選是給 80 顆各自打分取前 10（不是窮舉組合），隨機亂挑的基準是中 2.5 顆——贏不贏得過隨機，累積成績直接見底。
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
      <!-- 本期預期 -->
      <div
        v-if="data.today"
        class="space-y-2"
      >
        <p class="text-sm font-medium">
          預期對象：第 {{ Number.parseInt(data.today.forecast.baseIssue, 10) + 1 }} 期（約 5 分鐘後開獎）
        </p>
        <p class="text-xs text-muted">
          依據 {{ data.today.forecast.baseIssue }}（{{ data.today.forecast.baseDate }}）開完為止的資料算出、已存檔
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
              <tr
                v-for="line in (['gap', 'val', 'prize'] as const)"
                :key="line"
              >
                <td class="py-1.5 pr-2">
                  {{ line === 'gap' ? '隔期總和走向' : line === 'val' ? '數值總和走向' : '獎號總和走向' }}
                </td>
                <td class="py-1.5 pr-2 font-semibold">
                  {{ dirWord(data.today.forecast.majority[line]) }}
                </td>
                <td class="py-1.5 text-muted">
                  {{ dirVotesText(data.today.forecast.refs.map(r => line === 'gap' ? r.dirGap : line === 'val' ? r.dirVal : r.dirPrize)) }}
                </td>
              </tr>
              <tr>
                <td class="py-1.5 pr-2">
                  遠近組成（0-1／2-4／5+）
                </td>
                <td class="py-1.5 pr-2 font-mono font-semibold">
                  {{ data.today.forecast.predGapComp.join('-') }}
                </td>
                <td class="py-1.5 text-muted">
                  20 顆裡各桶幾顆，5 段各桶取中間
                </td>
              </tr>
              <tr>
                <td class="py-1.5 pr-2">
                  數值結構（0／1／2+）
                </td>
                <td class="py-1.5 pr-2 font-mono font-semibold">
                  {{ data.today.forecast.predValComp.join('-') }}
                </td>
                <td class="py-1.5 text-muted">
                  同上
                </td>
              </tr>
              <tr>
                <td class="py-1.5 pr-2">
                  y 結構（1／2-3／4-7／8+）
                </td>
                <td class="py-1.5 pr-2 font-mono font-semibold">
                  {{ data.today.forecast.predYComp.join('-') }}
                </td>
                <td class="py-1.5 text-muted">
                  同上
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="space-y-1 text-xs">
          <p class="font-medium">
            10 顆候選（按預期遠近組成配額、結構吻合度排名；隨機基準中 2.5 顆）
          </p>
          <!-- 方格樣式沿用賓果海尼根：size md + min-w-8 + gap-1.5，右下角標 = 該號已定的隔期 -->
          <div class="flex flex-wrap items-center gap-1.5">
            <UBadge
              v-for="p in data.today.forecast.picks"
              :key="p.num"
              color="primary"
              variant="soft"
              size="md"
              class="relative min-w-8 justify-center font-mono"
            >
              {{ pad2(p.num) }}
              <span class="absolute bottom-0 right-0.5 text-[9px] leading-none font-normal opacity-70">{{ p.gap }}</span>
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
            <tbody class="divide-y divide-default">
              <tr>
                <td class="py-1.5 pr-2">
                  10 顆候選
                </td>
                <td class="py-1.5 pr-2 font-semibold">
                  平均中 {{ data.stats.avgPickHits.toFixed(2) }} 顆
                </td>
                <td class="py-1.5 text-muted">
                  隨機基準 {{ data.stats.pickBaseline }} 顆 · 中 0~10 顆的次數 {{ data.stats.pickHitDist.join('/') }}
                </td>
              </tr>
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
                  三種組成
                </td>
                <td class="py-1.5 pr-2 font-semibold">
                  差 {{ data.stats.avgGapCompDiff.toFixed(1) }}／{{ data.stats.avgValCompDiff.toFixed(1) }}／{{ data.stats.avgYCompDiff.toFixed(1) }} 顆
                </td>
                <td class="py-1.5 text-muted">
                  遠近／數值／y 預期組成與實際的平均差
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
          歷史帳（新 → 舊，最多 30 筆）
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
              <div class="space-y-1">
                <p class="text-muted">
                  實際開出 20 顆：
                </p>
                <div class="flex flex-wrap items-center gap-1.5">
                  <UBadge
                    v-for="n in entry.outcome.actualPrizes"
                    :key="n"
                    color="warning"
                    variant="solid"
                    size="md"
                    class="min-w-8 justify-center font-mono"
                  >
                    {{ pad2(n) }}
                  </UBadge>
                </div>
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
                        遠近組成
                      </td>
                      <td class="py-1 pr-2 font-mono">
                        {{ entry.forecast.predGapComp.join('-') }}
                      </td>
                      <td class="py-1 pr-2 font-mono">
                        {{ entry.outcome.actualGapComp.join('-') }}
                      </td>
                      <td class="py-1">
                        差 {{ entry.outcome.gapCompDiff }} 顆
                      </td>
                    </tr>
                    <tr>
                      <td class="py-1 pr-2">
                        數值結構
                      </td>
                      <td class="py-1 pr-2 font-mono">
                        {{ entry.forecast.predValComp.join('-') }}
                      </td>
                      <td class="py-1 pr-2 font-mono">
                        {{ entry.outcome.actualValComp.join('-') }}
                      </td>
                      <td class="py-1">
                        差 {{ entry.outcome.valCompDiff }} 顆
                      </td>
                    </tr>
                    <tr>
                      <td class="py-1 pr-2">
                        y 結構
                      </td>
                      <td class="py-1 pr-2 font-mono">
                        {{ entry.forecast.predYComp.join('-') }}
                      </td>
                      <td class="py-1 pr-2 font-mono">
                        {{ entry.outcome.actualYComp.join('-') }}
                      </td>
                      <td class="py-1">
                        差 {{ entry.outcome.yCompDiff }} 顆
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="space-y-1">
                <p class="text-muted">
                  10 顆候選對答案（亮黃色 = 有開出，中 {{ entry.outcome.pickHits }} 顆，隨機基準 2.5）：
                </p>
                <div class="flex flex-wrap items-center gap-1.5">
                  <UBadge
                    v-for="p in entry.forecast.picks"
                    :key="p.num"
                    :color="entry.outcome.hitNums.includes(p.num) ? 'warning' : 'neutral'"
                    :variant="entry.outcome.hitNums.includes(p.num) ? 'solid' : 'soft'"
                    size="md"
                    class="relative min-w-8 justify-center font-mono"
                  >
                    {{ pad2(p.num) }}
                    <span class="absolute bottom-0 right-0.5 text-[9px] leading-none font-normal opacity-70">{{ p.gap }}</span>
                  </UBadge>
                </div>
              </div>
            </div>
          </li>
        </ul>
      </div>

      <p
        v-if="data.pending > 0"
        class="text-xs text-muted"
      >
        另有 {{ data.pending }} 筆較早的預期還沒開獎、等對答案。
      </p>
    </div>
  </UCard>
</template>
