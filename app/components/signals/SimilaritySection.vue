<script setup lang="ts">
/**
 * 「歷史相似片段」區塊 — 形狀比對（app/signals/similarity.ts）。
 * 拿最新 5 期窗口對載入歷史找形狀最像的段落，附下一期/下二期供回頭驗證。
 */

import type { SignalRow } from '~/signals/types'
import { buildSimilarity, type SimilarMatch, type WindowPeriod } from '~/signals/similarity'
import { translateToCurrentLevel } from '~/signals/combo'

const props = defineProps<{ rows: SignalRow[] }>()

export interface ComboRequest {
  gap: number
  val: number
  tolerance: number
  label: string
}

const emit = defineEmits<{ useTargets: [req: ComboRequest] }>()

const result = computed(() => buildSimilarity(props.rows, 5, 5))

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

function periodLine(p: WindowPeriod): string {
  return `獎號總和 ${p.prizeSum} · 隔期總和 ${p.gapSum} · 數值總和 ${p.valueSum} · 遠近 ${p.bucket}`
}

/** 歷史下一期的隔期/數值總和 → 換算到當前窗口水位的目標值 */
function scaledTargets(m: SimilarMatch): { gap: number, val: number } | null {
  if (!m.next1 || !result.value) return null
  const histGaps = m.window.map(p => p.gapSum)
  const histVals = m.window.map(p => p.valueSum)
  const curGaps = result.value.current.map(p => p.gapSum)
  const curVals = result.value.current.map(p => p.valueSum)
  return {
    gap: translateToCurrentLevel(m.next1.gapSum, histGaps, curGaps),
    val: translateToCurrentLevel(m.next1.valueSum, histVals, curVals)
  }
}

function useRaw(m: SimilarMatch): void {
  if (!m.next1) return
  emit('useTargets', {
    gap: m.next1.gapSum,
    val: m.next1.valueSum,
    tolerance: 0,
    label: `照 ${m.next1.issue} 原值（隔期總和 ${m.next1.gapSum}·數值總和 ${m.next1.valueSum}）`
  })
}

function useScaled(m: SimilarMatch): void {
  const t = scaledTargets(m)
  if (!t || !m.next1) return
  emit('useTargets', {
    gap: t.gap,
    val: t.val,
    tolerance: 3,
    label: `${m.next1.issue} 換算到現在水位（≈隔期總和 ${t.gap}·數值總和 ${t.val}，容差 ±3）`
  })
}
</script>

<template>
  <UCard v-if="result">
    <template #header>
      <div class="space-y-1">
        <p class="font-semibold">
          歷史相似片段（形狀比對）
        </p>
        <p class="text-xs text-muted">
          拿最新 {{ result.windowLen }} 期的「形狀」（比例與漲跌節奏，不比絕對數字、不含尾數）在載入歷史的 {{ result.candidates }} 段窗口裡找最像的。分數 = 10 項檢查平均像幾成；隨便抓一段平均 {{ pct(result.mean) }}、前 5% 門檻 {{ pct(result.p95) }} — 高於門檻才算真的突出。每段附「下一期／下二期」實際開出的結果，供回頭驗證參考（樣本少，是參考不是預測）。
        </p>
      </div>
    </template>

    <div class="space-y-4">
      <!-- 當前窗口 -->
      <div class="space-y-1">
        <p class="text-xs font-medium text-muted">
          當前窗口（最新 {{ result.windowLen }} 期）：
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

      <!-- Top 相似段 -->
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
              第 {{ i + 1 }} 名：{{ m.window[0]?.date }} ～ {{ m.window.at(-1)?.date }}
            </span>
            <span class="text-xs text-muted">（{{ m.window[0]?.issue }} ～ {{ m.window.at(-1)?.issue }}）</span>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              class="ml-auto"
              :icon="expanded.has(i) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              :aria-label="expanded.has(i) ? '收合' : '展開'"
            />
          </div>
          <div
            v-if="m.next1"
            class="mt-1 flex flex-wrap items-center gap-2 pl-1 text-xs text-muted"
          >
            <span>它的下一期：隔期總和 {{ m.next1.gapSum }} · 數值總和 {{ m.next1.valueSum }} · 遠近 {{ m.next1.bucket }}</span>
            <UButton
              color="primary"
              variant="soft"
              size="xs"
              icon="i-lucide-calculator"
              @click.stop="useRaw(m)"
            >
              照原值算組合
            </UButton>
            <UButton
              color="info"
              variant="soft"
              size="xs"
              icon="i-lucide-scale"
              @click.stop="useScaled(m)"
            >
              換算現在水位算組合{{ scaledTargets(m) ? `（≈${scaledTargets(m)!.gap}·${scaledTargets(m)!.val}）` : '' }}
            </UButton>
          </div>

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
                <span class="text-muted">{{ p.date }}</span>
                <span>{{ periodLine(p) }}</span>
              </li>
            </ul>

            <div class="space-y-1 border-t border-default pt-2 text-xs">
              <p class="font-medium text-muted">
                之後實際開出（回頭驗證用）：
              </p>
              <div
                v-if="m.next1"
                class="flex flex-wrap items-center gap-x-2 gap-y-1"
              >
                <span class="text-muted">下一期 {{ m.next1.issue }}（{{ m.next1.date }}）</span>
                <span>{{ periodLine(m.next1) }}</span>
                <UBadge
                  v-for="n in m.next1.prizes"
                  :key="n"
                  color="warning"
                  variant="soft"
                  size="sm"
                  class="min-w-7 justify-center font-mono"
                >
                  {{ pad2(n) }}
                </UBadge>
              </div>
              <div
                v-if="m.next2"
                class="flex flex-wrap items-center gap-x-2 gap-y-1"
              >
                <span class="text-muted">下二期 {{ m.next2.issue }}（{{ m.next2.date }}）</span>
                <span>{{ periodLine(m.next2) }}</span>
                <UBadge
                  v-for="n in m.next2.prizes"
                  :key="n"
                  color="warning"
                  variant="soft"
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
  </UCard>
</template>
