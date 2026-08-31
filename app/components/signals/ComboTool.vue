<script setup lang="ts">
/**
 * 組合湊數工具 — 輸入目標「隔期總和 + 數值總和」，
 * 用目前狀態枚舉下一期所有符合的五碼組合，濃縮出前 5 組。
 * 計算在 app/signals/combo.ts。
 */

import type { AnalysisState } from '~/utils/analysis'
import { numberInfosFromState, findCombos, type ComboResult } from '~/signals/combo'

const props = defineProps<{ state: AnalysisState, latestIssue: string }>()

const gapTarget = ref<number | null>(null)
const valTarget = ref<number | null>(null)
const result = shallowRef<ComboResult | null>(null)
const missing = ref<number[]>([])
const computing = ref(false)

function run() {
  if (gapTarget.value == null || valTarget.value == null) return
  computing.value = true
  try {
    const { infos, missing: miss } = numberInfosFromState(props.state)
    missing.value = miss
    result.value = findCombos(infos, gapTarget.value, valTarget.value, 5)
  } finally {
    computing.value = false
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function commitNum(target: 'gap' | 'val', rawVal: string) {
  const num = Number.parseInt(rawVal, 10)
  const v = Number.isFinite(num) && num >= 0 ? num : null
  if (target === 'gap') gapTarget.value = v
  else valTarget.value = v
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="space-y-1">
        <p class="font-semibold">
          組合湊數工具
        </p>
        <p class="text-xs text-muted">
          輸入目標「隔期總和」和「數值總和」，用目前每個號碼所在的 slot 與記錄值，枚舉下一期所有能湊出這兩個加總的五碼組合。只對下一期有效 — 每開一期，號碼的隔期與數值都會變，要重算。
        </p>
      </div>
    </template>

    <div class="space-y-4">
      <div class="flex flex-wrap items-end gap-3">
        <label class="flex items-center gap-2 text-xs">
          <span class="text-muted">目標隔期總和</span>
          <UInput
            :model-value="gapTarget == null ? '' : String(gapTarget)"
            type="number"
            size="sm"
            min="0"
            placeholder="34"
            class="w-24"
            @change="(e: Event) => commitNum('gap', (e.target as HTMLInputElement).value)"
          />
        </label>
        <label class="flex items-center gap-2 text-xs">
          <span class="text-muted">目標數值總和</span>
          <UInput
            :model-value="valTarget == null ? '' : String(valTarget)"
            type="number"
            size="sm"
            min="0"
            placeholder="55"
            class="w-24"
            @change="(e: Event) => commitNum('val', (e.target as HTMLInputElement).value)"
          />
        </label>
        <UButton
          color="primary"
          size="sm"
          icon="i-lucide-calculator"
          :loading="computing"
          :disabled="gapTarget == null || valTarget == null"
          @click="run"
        >
          算組合
        </UButton>
      </div>

      <div
        v-if="result"
        class="space-y-4"
      >
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <UBadge
            color="primary"
            variant="subtle"
            size="lg"
          >
            符合 {{ result.total.toLocaleString() }} 組（全部 {{ result.totalPossible.toLocaleString() }} 種中）
          </UBadge>
          <UBadge
            color="neutral"
            variant="subtle"
          >
            以 {{ latestIssue }} 之後的狀態計算
          </UBadge>
          <UBadge
            v-if="missing.length > 0"
            color="warning"
            variant="subtle"
          >
            60 期內沒出現、不參與的號碼：{{ missing.join('、') }}
          </UBadge>
        </div>

        <template v-if="result.total > 0">
          <div class="space-y-1">
            <p class="text-xs font-medium text-muted">
              出現次數最高的號碼（號碼下方標它的 隔期／數值）：
            </p>
            <div class="flex flex-wrap gap-2">
              <div
                v-for="f in result.freq.slice(0, 12)"
                :key="f.num"
                class="flex flex-col items-center gap-0.5"
              >
                <UBadge
                  color="warning"
                  variant="solid"
                  size="md"
                  class="min-w-8 justify-center font-mono"
                >
                  {{ pad2(f.num) }}
                </UBadge>
                <span class="text-[10px] text-muted">隔{{ f.gap }}·值{{ f.value }}</span>
                <span class="text-[10px] font-mono">{{ f.count }}次</span>
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <p class="text-xs font-medium text-muted">
              濃縮前 5 組（以五顆成員在全部符合組合中的出現次數加總排序）。注意：同「隔期／數值」的號碼可互換，同分的組合可能不只五組 — 這裡列的是代表：
            </p>
            <ul class="space-y-2">
              <li
                v-for="(t, i) in result.top"
                :key="i"
                class="flex flex-wrap items-center gap-2"
              >
                <UBadge
                  color="neutral"
                  variant="outline"
                  size="sm"
                  class="w-8 justify-center font-mono"
                >
                  {{ i + 1 }}
                </UBadge>
                <div
                  v-for="n in t.nums"
                  :key="n.num"
                  class="flex flex-col items-center gap-0.5"
                >
                  <UBadge
                    color="warning"
                    variant="solid"
                    size="md"
                    class="min-w-8 justify-center font-mono"
                  >
                    {{ pad2(n.num) }}
                  </UBadge>
                  <span class="text-[10px] text-muted">隔{{ n.gap }}·值{{ n.value }}</span>
                </div>
                <span class="text-[10px] text-muted">頻率分數 {{ t.score }}</span>
              </li>
            </ul>
          </div>
        </template>
        <p
          v-else
          class="text-xs text-muted"
        >
          目前狀態下沒有任何五碼組合能同時湊出這兩個加總。
        </p>
      </div>
    </div>
  </UCard>
</template>
