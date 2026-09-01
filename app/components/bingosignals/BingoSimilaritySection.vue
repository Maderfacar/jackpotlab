<script setup lang="ts">
/**
 * 賓果「歷史相似片段」區塊（第一版試水溫，窗口固定 3 期 = 15 分鐘）。
 * 引擎：app/bingosignals/similarity.ts（賓果尺 + 窮舉計分）。
 */

import type { SignalRow } from '~/signals/types'
import {
  buildBingoSimilarity, GAP_BUCKET_LABEL, VAL_BUCKET_LABEL, Y_BUCKET_LABEL,
  type BingoWindowPeriod
} from '~/bingosignals/similarity'

const props = defineProps<{ rows: SignalRow[] }>()

const result = computed(() => buildBingoSimilarity(props.rows, 3, 5))

const expanded = ref<Set<number>>(new Set([0]))

function toggle(i: number): void {
  const next = new Set(expanded.value)
  if (next.has(i)) next.delete(i)
  else next.add(i)
  expanded.value = next
}

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function periodLine(p: BingoWindowPeriod): string {
  return `獎和 ${p.prizeSum} · 隔和 ${p.gapSum} · 值和 ${p.valueSum} · 遠近 ${p.gapComp.join('-')} · 數值 ${p.valComp.join('-')} · y ${p.yComp.join('-')}`
}
</script>

<template>
  <UCard v-if="rows.length">
    <template #header>
      <div class="space-y-1">
        <p class="font-semibold">
          歷史相似片段（賓果 · 形狀比對）
        </p>
        <p
          v-if="result"
          class="text-xs text-muted"
        >
          拿最新 3 期（15 分鐘）的形狀找最像的歷史段落。硬性門檻：三條總和線（獎和／隔和／值和）收尾那步的方向必須跟現在一致 — {{ result.candidatesAll }} 段裡 {{ result.candidates }} 段通過。8 項檢查等權平均：三線曲線形狀、漲跌方向，加上遠近（{{ GAP_BUCKET_LABEL }}）、數值（{{ VAL_BUCKET_LABEL }}）、位置 y（{{ Y_BUCKET_LABEL }}）三種組成與逐位 y — 這四項用「窮舉計分」：分數 = 這一對贏過幾 % 的隨機配對，刻度由載入資料全配對窮舉而來、每天自動重算。通過段平均 {{ pct(result.mean) }}、前 5% 門檻 {{ pct(result.p95) }}。每段附「下一期／下二期」實際開出，供回頭驗證（參考不是預測）。
        </p>
        <p
          v-else
          class="text-xs text-muted"
        >
          沒有歷史段落通過收尾方向硬過濾（或資料不足），無法比對。
        </p>
      </div>
    </template>

    <div
      v-if="result"
      class="space-y-4"
    >
      <div class="space-y-1">
        <p class="text-xs font-medium text-muted">
          當前窗口（最新 3 期）：
        </p>
        <ul class="space-y-0.5 text-xs">
          <li
            v-for="p in result.current"
            :key="p.issue"
            class="flex flex-wrap gap-x-2"
          >
            <span class="font-mono">{{ p.issue }}</span>
            <span class="text-muted">{{ p.date }}</span>
            <span>{{ periodLine(p) }}</span>
          </li>
        </ul>
      </div>

      <USeparator />

      <ul class="divide-y divide-default">
        <li
          v-for="(m, i) in result.top"
          :key="m.window[0]?.issue ?? i"
          class="py-3"
        >
          <div
            class="flex cursor-pointer flex-wrap items-center gap-2"
            @click="toggle(i)"
          >
            <UBadge
              :color="m.score >= result.p95 ? 'success' : 'neutral'"
              variant="solid"
              size="sm"
              class="w-12 justify-center font-mono"
            >
              {{ pct(m.score) }}
            </UBadge>
            <span class="text-sm font-medium">
              第 {{ i + 1 }} 名：{{ m.window[0]?.issue }} ～ {{ m.window.at(-1)?.issue }}
            </span>
            <span class="text-xs text-muted">（{{ m.window.at(-1)?.date }}）</span>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              class="ml-auto"
              :icon="expanded.has(i) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              :aria-label="expanded.has(i) ? '收合' : '展開'"
            />
          </div>
          <p
            v-if="m.next1"
            class="mt-1 pl-1 text-xs text-muted"
          >
            它的下一期：{{ periodLine(m.next1) }}
          </p>

          <div
            v-if="expanded.has(i)"
            class="mt-3 space-y-3 rounded-lg bg-elevated/50 p-3 text-sm"
          >
            <div class="flex flex-wrap gap-2">
              <UBadge
                v-for="d in m.dims"
                :key="d.key"
                :color="d.score >= 0.7 ? 'success' : d.score >= 0.4 ? 'info' : 'neutral'"
                variant="subtle"
                size="sm"
              >
                {{ d.label }} {{ pct(d.score) }}
              </UBadge>
            </div>

            <ul class="space-y-0.5 text-xs">
              <li
                v-for="p in m.window"
                :key="p.issue"
                class="flex flex-wrap gap-x-2"
              >
                <span class="font-mono">{{ p.issue }}</span>
                <span>{{ periodLine(p) }}</span>
              </li>
            </ul>

            <div class="space-y-1 border-t border-default pt-2 text-xs">
              <p class="font-medium text-muted">
                之後實際開出（回頭驗證用）：
              </p>
              <div
                v-for="nx in [m.next1, m.next2].filter((x): x is BingoWindowPeriod => !!x)"
                :key="nx.issue"
                class="space-y-1"
              >
                <p class="text-muted">
                  {{ nx.issue }}（{{ nx.date }}）{{ periodLine(nx) }}
                </p>
                <!-- 方格樣式沿用賓果海尼根（size md + min-w-8 + gap-1.5、warning solid） -->
                <div class="flex flex-wrap items-center gap-1.5">
                  <UBadge
                    v-for="num in nx.prizes"
                    :key="num"
                    color="warning"
                    variant="solid"
                    size="md"
                    class="min-w-8 justify-center font-mono"
                  >
                    {{ pad2(num) }}
                  </UBadge>
                </div>
              </div>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </UCard>
</template>
