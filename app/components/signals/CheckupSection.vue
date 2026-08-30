<script setup lang="ts">
/**
 * 「開獎後例行檢查」區塊 — 對應使用者每次開獎後固定要看的事項。
 * 每一塊都有白話標題 + 「這格回答」說明，之後要加檢查項目就加一塊。
 * 計算全部在 app/signals/checkup.ts。
 */

import type { AnalysisState } from '~/utils/analysis'
import type { SignalRow } from '~/signals/types'
import {
  buildIdentity, buildTotals, buildValueCensus,
  buildSlotAlerts, buildZeroSources, buildPositionOrigin
} from '~/signals/checkup'

const props = defineProps<{ rows: SignalRow[], state: AnalysisState }>()

const identity = computed(() => buildIdentity(props.rows))
const totals = computed(() => buildTotals(props.rows))
const valueCensus = computed(() => buildValueCensus(props.rows))
const slotAlerts = computed(() => buildSlotAlerts(props.state))
const zeroSources = computed(() => buildZeroSources(props.rows, props.state))
const positionOrigin = computed(() => buildPositionOrigin(props.rows))

const showAllAlerts = ref(false)
const ALERT_PREVIEW = 8

const visibleAlerts = computed(() => showAllAlerts.value
  ? slotAlerts.value.alerts
  : slotAlerts.value.alerts.slice(0, ALERT_PREVIEW))

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

function dirWord(dir: 1 | -1 | 0 | null): string {
  if (dir === 1) return '↑ 比上期高'
  if (dir === -1) return '↓ 比上期低'
  if (dir === 0) return '= 跟上期一樣'
  return ''
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="space-y-1">
        <p class="font-semibold">
          開獎後例行檢查
        </p>
        <p class="text-xs text-muted">
          你每期固定要看的東西，照檢查順序排。所有數字都是最新一期 + 載入的歷史即時算出來的。
        </p>
      </div>
    </template>

    <div class="divide-y divide-default">
      <!-- ① 本期身世表 -->
      <section
        v-if="identity"
        class="space-y-2 py-4 first:pt-0 last:pb-0"
      >
        <h3 class="text-sm font-semibold">
          ① 這五顆從哪來（slot／位置／數值／尾數）
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full min-w-md text-sm">
            <thead>
              <tr class="border-b border-default text-left text-xs text-muted">
                <th class="py-1.5 pr-3 font-medium">
                  獎號
                </th>
                <th class="py-1.5 pr-3 font-medium">
                  來自 slot（隔幾期）
                </th>
                <th class="py-1.5 pr-3 font-medium">
                  位置 x-y
                </th>
                <th class="py-1.5 pr-3 font-medium">
                  數值
                </th>
                <th class="py-1.5 font-medium">
                  尾數
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in identity.rows"
                :key="row.num"
                class="border-b border-default/50"
              >
                <td class="py-1.5 pr-3">
                  <UBadge
                    color="warning"
                    variant="solid"
                    size="md"
                    class="min-w-8 justify-center font-mono"
                  >
                    {{ pad2(row.num) }}
                  </UBadge>
                </td>
                <td class="py-1.5 pr-3 font-mono">
                  隔 {{ row.gap }} 期
                </td>
                <td class="py-1.5 pr-3 font-mono">
                  {{ row.pos }}
                </td>
                <td class="py-1.5 pr-3 font-mono">
                  {{ row.value }}
                </td>
                <td class="py-1.5">
                  <UBadge
                    :color="row.tailRepeated ? 'error' : 'neutral'"
                    :variant="row.tailRepeated ? 'solid' : 'subtle'"
                    size="sm"
                    class="font-mono"
                  >
                    {{ row.tail }} 尾{{ row.tailRepeated ? '（上期也有）' : '' }}
                  </UBadge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ② 尾數比對 -->
      <section
        v-if="identity"
        class="space-y-2 py-4 first:pt-0 last:pb-0"
      >
        <h3 class="text-sm font-semibold">
          ② 尾數跟上一期比
        </h3>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-xs text-muted">本期尾數：</span>
          <UBadge
            v-for="t in identity.tails"
            :key="t"
            :color="identity.repeatedTails.includes(t) ? 'error' : 'neutral'"
            :variant="identity.repeatedTails.includes(t) ? 'solid' : 'subtle'"
            size="sm"
            class="font-mono"
          >
            {{ t }}
          </UBadge>
          <span class="text-xs text-muted">上期尾數：</span>
          <UBadge
            v-for="t in identity.prevTails"
            :key="`p${t}`"
            color="neutral"
            variant="outline"
            size="sm"
            class="font-mono"
          >
            {{ t }}
          </UBadge>
          <UBadge
            :color="identity.repeatedTails.length > 0 ? 'error' : 'success'"
            variant="subtle"
          >
            相同尾數 {{ identity.repeatedTails.length }} 個{{ identity.repeatedTails.length > 0 ? `（${identity.repeatedTails.join('、')} 尾）` : '' }}
          </UBadge>
        </div>
      </section>

      <!-- ③ 三個加總 -->
      <section class="space-y-2 py-4 first:pt-0 last:pb-0">
        <h3 class="text-sm font-semibold">
          ③ 三個加總（跟上期比高低）
        </h3>
        <div class="grid gap-3 sm:grid-cols-3">
          <div
            v-for="t in totals"
            :key="t.label"
            class="rounded-lg bg-elevated/50 p-3"
          >
            <p class="text-xs text-muted">
              {{ t.label }}
            </p>
            <p class="text-2xl font-semibold font-mono">
              {{ t.current }}
            </p>
            <p
              class="text-xs"
              :class="t.dir === 1 ? 'text-success' : t.dir === -1 ? 'text-error' : 'text-muted'"
            >
              {{ dirWord(t.dir) }}<template v-if="t.prev != null">
                （上期 {{ t.prev }}）
              </template>
            </p>
          </div>
        </div>
      </section>

      <!-- ④ 數值盤點 -->
      <section class="space-y-2 py-4 first:pt-0 last:pb-0">
        <h3 class="text-sm font-semibold">
          ④ 數值 0～5 盤點（本期幾顆、多久沒出）
        </h3>
        <div class="flex flex-wrap gap-2">
          <UBadge
            v-for="e in valueCensus"
            :key="e.value"
            :color="e.count > 0 ? 'primary' : 'neutral'"
            :variant="e.count > 0 ? 'subtle' : 'outline'"
            size="lg"
          >
            <template v-if="e.count > 0">
              {{ e.value }} × {{ e.count }} 顆
            </template>
            <template v-else-if="e.neverInWindow">
              {{ e.value }}：載入範圍內沒出過
            </template>
            <template v-else>
              {{ e.value }}：已 {{ e.absentFor }} 期沒出
            </template>
          </UBadge>
        </div>
      </section>

      <!-- ⑤ slot 記錄警示 -->
      <section class="space-y-2 py-4 first:pt-0 last:pb-0">
        <h3 class="text-sm font-semibold">
          ⑤ 哪些 slot 太久沒開（記錄值超過均值）
        </h3>
        <p class="text-xs text-muted">
          「記錄值」= 這個 slot 位置距上次開出獎號幾期（跟 /draws 表的「記錄」第一個數字同一個東西）。全部 slot 的平均是 {{ slotAlerts.avg.toFixed(1) }}，下面列出超過平均的、值大的排前面。注意：越深的 slot 本來就越難開（號碼多半早被撈走），所以深處的值天生偏大 — 比較有感的是「歷史新高」標記：這個位置現在的值比它自己過去每一輪都大。
        </p>
        <div class="overflow-x-auto">
          <table class="w-full min-w-md text-sm">
            <thead>
              <tr class="border-b border-default text-left text-xs text-muted">
                <th class="py-1.5 pr-3 font-medium">
                  slot
                </th>
                <th class="py-1.5 pr-3 font-medium">
                  期別（日期）
                </th>
                <th class="py-1.5 pr-3 font-medium">
                  已 N 期沒開
                </th>
                <th class="py-1.5 pr-3 font-medium">
                  自己過去最高
                </th>
                <th class="py-1.5 font-medium">
                  剩餘號碼
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="a in visibleAlerts"
                :key="a.slot"
                class="border-b border-default/50"
              >
                <td class="py-1.5 pr-3 font-mono">
                  {{ a.slot }}
                </td>
                <td class="py-1.5 pr-3 text-xs">
                  {{ a.issue }}（{{ a.date }}）
                </td>
                <td class="py-1.5 pr-3">
                  <span class="font-mono font-semibold">{{ a.current }}</span>
                  <UBadge
                    v-if="a.isNewHigh"
                    color="error"
                    variant="solid"
                    size="sm"
                    class="ml-2"
                  >
                    歷史新高
                  </UBadge>
                </td>
                <td class="py-1.5 pr-3 font-mono text-xs">
                  <template v-if="a.pastMax != null">
                    {{ a.pastMax }}
                  </template>
                  <span
                    v-else
                    class="text-muted"
                  >載入範圍內從沒開過</span>
                </td>
                <td class="py-1.5">
                  <div
                    v-if="a.remaining.length > 0"
                    class="flex flex-wrap gap-1"
                  >
                    <UBadge
                      v-for="n in a.remaining"
                      :key="n"
                      color="warning"
                      variant="soft"
                      size="sm"
                      class="min-w-7 justify-center font-mono"
                    >
                      {{ pad2(n) }}
                    </UBadge>
                  </div>
                  <span
                    v-else
                    class="text-xs text-muted"
                  >目前輪到這格的號碼已被撈完</span>
                </td>
              </tr>
              <tr v-if="slotAlerts.alerts.length === 0">
                <td
                  colspan="5"
                  class="py-2 text-xs text-muted"
                >
                  目前沒有任何 slot 超過均值
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <UButton
          v-if="slotAlerts.alerts.length > ALERT_PREVIEW"
          color="neutral"
          variant="ghost"
          size="xs"
          :icon="showAllAlerts ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          @click="showAllAlerts = !showAllAlerts"
        >
          {{ showAllAlerts ? '收合' : `還有 ${slotAlerts.alerts.length - ALERT_PREVIEW} 個，展開全部` }}
        </UButton>
      </section>

      <!-- ⑥ 數值0 來源與下期候選 -->
      <section class="space-y-2 py-4 first:pt-0 last:pb-0">
        <h3 class="text-sm font-semibold">
          ⑥ 數值 0 從哪來、下一期會從哪來
        </h3>
        <div class="space-y-2 text-sm">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-muted">本期數值 0 的獎號：</span>
            <template v-if="zeroSources.thisPeriod.length > 0">
              <span
                v-for="z in zeroSources.thisPeriod"
                :key="z.num"
                class="flex items-center gap-1"
              >
                <UBadge
                  color="warning"
                  variant="solid"
                  size="sm"
                  class="min-w-7 justify-center font-mono"
                >
                  {{ pad2(z.num) }}
                </UBadge>
                <span class="text-xs text-muted">來自 slot {{ z.slot }}</span>
              </span>
            </template>
            <span
              v-else
              class="text-xs text-muted"
            >本期沒有數值 0</span>
          </div>
          <div class="space-y-1.5">
            <p class="text-xs text-muted">
              下一期如果再出數值 0，只可能來自這些 slot（＝這期剛被開中、還有剩餘號碼的格子）：
            </p>
            <ul class="space-y-1">
              <li
                v-for="c in zeroSources.candidates"
                :key="c.slot"
                class="flex flex-wrap items-center gap-2 text-xs"
              >
                <span class="font-mono">slot {{ c.slot }}</span>
                <span class="text-muted">{{ c.issue }}（{{ c.date }}）剩</span>
                <UBadge
                  v-for="n in c.numbers"
                  :key="n"
                  color="warning"
                  variant="soft"
                  size="sm"
                  class="min-w-7 justify-center font-mono"
                >
                  {{ pad2(n) }}
                </UBadge>
              </li>
              <li
                v-if="zeroSources.candidates.length === 0"
                class="text-xs text-muted"
              >
                沒有候選 — 這期開中的格子都被撈空了，下一期不可能出現數值 0
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- ⑦ 位置與來源分布 -->
      <section class="space-y-2 py-4 first:pt-0 last:pb-0">
        <h3 class="text-sm font-semibold">
          ⑦ 第 1～5 顆的位置 y 與來源遠近分布
        </h3>
        <p class="text-xs text-muted">
          每顆獎號（由小到大）歷史上的 y 值分布、來源 slot 遠近分布（近 = 隔 0-5 期、中 = 6-10、遠 = 11 期以上），加上本期實際落點。
        </p>
        <div class="overflow-x-auto">
          <table class="w-full min-w-lg text-sm">
            <thead>
              <tr class="border-b border-default text-left text-xs text-muted">
                <th class="py-1.5 pr-3 font-medium">
                  位置
                </th>
                <th class="py-1.5 pr-3 font-medium">
                  本期
                </th>
                <th class="py-1.5 pr-3 font-medium">
                  y 分布（y=1 / 2 / 3 / 4 / 5）
                </th>
                <th class="py-1.5 font-medium">
                  來源遠近（近 / 中 / 遠）
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in positionOrigin"
                :key="p.pos"
                class="border-b border-default/50"
              >
                <td class="py-1.5 pr-3">
                  第 {{ p.pos }} 顆
                </td>
                <td class="py-1.5 pr-3 font-mono text-xs">
                  y={{ p.currentY ?? '—' }} · 隔 {{ p.currentGap ?? '—' }} 期
                </td>
                <td class="py-1.5 pr-3 font-mono text-xs">
                  {{ p.yDist.map(v => pct(v)).join(' / ') }}
                </td>
                <td class="py-1.5 font-mono text-xs">
                  {{ pct(p.bucketDist.low) }} / {{ pct(p.bucketDist.mid) }} / {{ pct(p.bucketDist.high) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </UCard>
</template>
