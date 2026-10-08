<script setup lang="ts">
import type { UniformResult } from '~~/shared/lotto/patterns/uniform'

const GAME_ID = 'lotto539'
const apiPath = `/api/patterns/${GAME_ID}/uniform`

const { data, status, error } = useFetch<{ result: UniformResult, generatedAt: string }>(apiPath, {
  query: { format: 'json' },
  server: false
})

const result = computed(() => data.value?.result ?? null)
const selectedSize = ref<number | null>(null)
const selected = computed(() => {
  const r = result.value
  if (!r) return null
  return r.sizes.find(s => s.size === selectedSize.value) ?? r.sizes.find(s => s.size === 8) ?? r.sizes[0] ?? null
})

const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—')
const range = (x: { startTerm: number, startDate: string, endTerm: number, endDate: string }) =>
  `${x.startTerm} ～ ${x.endTerm}`
const dates = (x: { startDate: string, endDate: string }) => `${x.startDate} ～ ${x.endDate}`
</script>

<template>
  <div class="space-y-6">
    <div
      v-if="result"
      class="flex flex-wrap items-center gap-2 text-xs"
    >
      <UBadge
        color="neutral"
        variant="subtle"
      >
        第 {{ result.firstTerm }} 期（{{ result.firstDate }}）～ 第 {{ result.lastTerm }} 期（{{ result.lastDate }}）
      </UBadge>
      <UBadge
        color="neutral"
        variant="subtle"
      >
        共 {{ result.drawCount }} 期
      </UBadge>
      <UButton
        :to="apiPath"
        target="_blank"
        size="xs"
        color="neutral"
        variant="link"
        icon="i-lucide-file-text"
      >
        純文字版（給 LLM 讀）
      </UButton>
    </div>

    <UCard>
      <div class="space-y-1.5 text-sm">
        <p><span class="font-semibold">視窗</span>：連續 W 期，從第一期逐期往後滑，統計每個視窗內 1～39 號各出現幾次。</p>
        <p><span class="font-semibold">差距</span>：視窗內出現最多的號碼次數 − 出現最少的號碼次數。差距越小越均勻。</p>
        <p><span class="font-semibold">理想均勻</span>：總球數平均分給 39 個號碼，每號只差 0 或 1 次（純算術）。</p>
        <p><span class="font-semibold">段</span>：實際資料中最均勻的視窗，重疊的合併成一段；<span class="font-semibold">段間隔</span>看它是否以固定間隔反覆出現。</p>
      </div>
    </UCard>

    <div
      v-if="status === 'pending'"
      class="py-10 text-center text-sm text-muted"
    >
      計算中…
    </div>
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="`載入失敗：${error.statusMessage ?? error.message}`"
    />

    <template v-else-if="result">
      <UCard>
        <template #header>
          <h2 class="font-semibold">
            ① 各視窗長度總表
          </h2>
          <p class="text-xs text-muted">
            點一列看該長度的詳細內容
          </p>
        </template>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[36rem] text-sm">
            <thead>
              <tr class="border-b border-default text-left text-xs text-muted">
                <th class="py-1.5 pr-3 font-medium">
                  視窗期數
                </th>
                <th class="py-1.5 pr-3 font-medium">
                  總球數
                </th>
                <th class="py-1.5 pr-3 font-medium">
                  理想（每號次數）
                </th>
                <th class="py-1.5 pr-3 font-medium">
                  達到理想
                </th>
                <th class="py-1.5 pr-3 font-medium">
                  實際最小差距
                </th>
                <th class="py-1.5 pr-3 font-medium">
                  最小差距視窗
                </th>
                <th class="py-1.5 font-medium">
                  段數
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in result.sizes"
                :key="s.size"
                class="cursor-pointer border-b border-default/50 hover:bg-elevated"
                :class="selected?.size === s.size ? 'bg-elevated' : ''"
                @click="selectedSize = s.size"
              >
                <td class="py-1.5 pr-3 font-mono">
                  {{ s.size }}
                </td>
                <td class="py-1.5 pr-3 font-mono">
                  {{ s.balls }}
                </td>
                <td class="py-1.5 pr-3 font-mono">
                  {{ s.idealLow === s.idealHigh ? s.idealLow : `${s.idealLow}～${s.idealHigh}` }}（差距 {{ s.idealSpread }}）
                </td>
                <td
                  class="py-1.5 pr-3 font-mono"
                  :class="s.idealCount > 0 ? 'font-semibold text-warning' : 'text-muted'"
                >
                  {{ s.idealCount }}
                </td>
                <td class="py-1.5 pr-3 font-mono">
                  {{ s.bestSpread }}
                </td>
                <td class="py-1.5 pr-3 font-mono">
                  {{ s.bestCount }} / {{ s.windowCount }}
                  <span class="text-xs text-muted">（{{ pct(s.bestCount, s.windowCount) }}）</span>
                </td>
                <td class="py-1.5 font-mono">
                  {{ s.episodes.length }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <UCard v-if="selected">
        <template #header>
          <h2 class="font-semibold">
            ② 視窗 {{ selected.size }} 期的詳細內容
          </h2>
          <p class="text-xs text-muted">
            {{ selected.balls }} 顆球；理想每號 {{ selected.idealLow === selected.idealHigh ? selected.idealLow : `${selected.idealLow}～${selected.idealHigh}` }} 次；實際最小差距 {{ selected.bestSpread }}
          </p>
        </template>

        <div class="grid gap-6 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <section class="space-y-2">
            <h3 class="text-sm font-semibold">
              差距分布
            </h3>
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-default text-left text-xs text-muted">
                  <th class="py-1 pr-3 font-medium">
                    差距
                  </th>
                  <th class="py-1 pr-3 font-medium">
                    視窗數
                  </th>
                  <th class="py-1 font-medium">
                    佔比
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="h in selected.spreadHistogram"
                  :key="h.spread"
                  class="border-b border-default/50"
                >
                  <td class="py-1 pr-3 font-mono">
                    {{ h.spread }}
                  </td>
                  <td class="py-1 pr-3 font-mono">
                    {{ h.count }}
                  </td>
                  <td class="py-1 font-mono text-muted">
                    {{ pct(h.count, selected.windowCount) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section class="min-w-0 space-y-2">
            <h3 class="text-sm font-semibold">
              最均勻的段（差距 {{ selected.bestSpread }}）共 {{ selected.episodes.length }} 段
            </h3>
            <p class="text-xs text-muted">
              段間隔（期）：<span class="font-mono">{{ selected.episodeGaps.join('、') || '—' }}</span>
            </p>
            <div class="max-h-96 overflow-auto">
              <table class="w-full min-w-[28rem] text-sm">
                <thead class="sticky top-0 bg-default">
                  <tr class="border-b border-default text-left text-xs text-muted">
                    <th class="py-1 pr-3 font-medium">
                      #
                    </th>
                    <th class="py-1 pr-3 font-medium">
                      期數範圍
                    </th>
                    <th class="py-1 pr-3 font-medium">
                      日期
                    </th>
                    <th class="py-1 font-medium">
                      跨幾期
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(e, i) in selected.episodes"
                    :key="e.startTerm"
                    class="border-b border-default/50"
                  >
                    <td class="py-1 pr-3 font-mono text-muted">
                      {{ i + 1 }}
                    </td>
                    <td class="py-1 pr-3 font-mono">
                      {{ range(e) }}
                    </td>
                    <td class="py-1 pr-3 font-mono text-xs text-muted">
                      {{ dates(e) }}
                    </td>
                    <td class="py-1 font-mono">
                      {{ e.draws }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            ③ 全號覆蓋：從某期開始，要幾期才讓 1～39 號全部出現
          </h2>
        </template>
        <div class="space-y-4 text-sm">
          <div class="flex flex-wrap gap-2">
            <UBadge
              color="neutral"
              variant="subtle"
              size="lg"
            >
              最快 {{ result.coverage.min }} 期
            </UBadge>
            <UBadge
              color="neutral"
              variant="subtle"
              size="lg"
            >
              中位數 {{ result.coverage.median }} 期
            </UBadge>
            <UBadge
              color="neutral"
              variant="subtle"
              size="lg"
            >
              最慢 {{ result.coverage.max }} 期
            </UBadge>
            <UBadge
              color="neutral"
              variant="outline"
              size="lg"
            >
              {{ result.coverage.starts }} 個起始期
            </UBadge>
          </div>

          <div>
            <h3 class="mb-1 font-semibold">
              最快（{{ result.coverage.min }} 期）的區段
            </h3>
            <ul class="space-y-0.5 font-mono">
              <li
                v-for="f in result.coverage.fastest"
                :key="f.startTerm"
              >
                {{ range(f) }} <span class="text-xs text-muted">{{ dates(f) }}</span>
              </li>
            </ul>
            <p class="mt-1 text-xs text-muted">
              區段之間相隔（期）：<span class="font-mono">{{ result.coverage.fastestGaps.join('、') || '—' }}</span>
            </p>
          </div>

          <div>
            <h3 class="mb-1 font-semibold">
              需要期數的分布（期數：次數）
            </h3>
            <div class="flex flex-wrap gap-1.5 font-mono text-xs">
              <span
                v-for="h in result.coverage.histogram"
                :key="h.draws"
                class="rounded bg-elevated px-1.5 py-0.5"
              >{{ h.draws }}：{{ h.count }}</span>
            </div>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>
