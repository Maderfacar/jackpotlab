<script setup lang="ts">
/**
 * 隔期篩選（2026-10-10 使用者拍板）：畫面完全照 /draws「隔期狀態」表（隔期 / 期數 / 日期 / 剩餘獎號），
 * 記錄只留現值，每顆剩餘號碼下面標位置 x-y；符合勾選條件（還出現在剩下組合裡）的號碼標橘色。
 *
 * - 條件與 /filter 共用同一份設定（useFilterConditions），平常收成右下角浮動按鈕，點開才蓋住畫面。
 * - 盤面用 shared/lotto/scan/board-states 重建（已核對與網站隔期狀態逐格一致），永遠是最新一期開完的盤面。
 */
import { numberInfo, runFilter } from '~~/shared/lotto/filter/conditions'
import { computeBoardStates } from '~~/shared/lotto/scan/board-states'

interface HistoryEntry {
  issue: string
  date: string
  prizes: string
}
interface AnalysisJson {
  history: HistoryEntry[]
}

useSeoMeta({ title: '隔期篩選 — 今彩 539' })

const SLOTS = 60

const { data, status, error } = useFetch<AnalysisJson>('/api/analysis/lotto539', {
  query: { format: 'json' },
  server: false
})

const history = computed(() => data.value?.history ?? [])
const draws = computed(() => history.value.map(h => h.prizes.split(',').map(Number).sort((a, b) => a - b)))
const state = computed(() => computeBoardStates(draws.value, SLOTS).at(-1) ?? null)

const { conds, resetConds } = useFilterConditions()
const result = computed(() => (state.value ? runFilter(conds.value, numberInfo(state.value), draws.value.at(-1) ?? [], 0) : null))
const isHit = (n: number) => (result.value?.counts[n] ?? 0) > 0
const hitCount = computed(() => result.value?.counts.filter(c => c > 0).length ?? 0)
const enabledCount = computed(() => conds.value.filter(c => c.enabled).length)

const pad = (n: number) => String(n).padStart(2, '0')

/** 隔期狀態表的每一列：隔 i 期 = 倒數第 i 期開出、到現在還沒被開走的號碼 */
const rows = computed(() => {
  const s = state.value
  if (!s) return []
  const last = history.value.length - 1
  return s.slots.map((nums, gap) => {
    const h = history.value[last - gap]
    const drawn = draws.value[last - gap] ?? []
    const day = h ? Number(h.date.slice(8, 10)) : Number.NaN
    return {
      gap,
      issue: h?.issue ?? '',
      date: h ? h.date.slice(5) : '',
      // 與 /draws 一樣：該期開出的號碼裡有自己的日期（幾號）就紅字
      dateRed: drawn.includes(day),
      value: s.values[gap] ?? 0,
      nums
    }
  })
})

const open = ref(false)
</script>

<template>
  <div class="gapfilter-root mx-auto w-full max-w-4xl space-y-4 px-4 pt-8 pb-24 sm:px-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">
        隔期篩選 · 今彩 539
      </h1>
      <p class="text-sm text-muted">
        隔期狀態表，<span class="gf-ball gf-hit inline-flex size-4 align-[-2px]" /> 橘色 = 符合勾選條件的號碼。號碼下面是位置 x-y。右下角按鈕改條件。
      </p>
    </div>

    <div
      v-if="status === 'pending'"
      class="py-16 text-center text-sm text-muted"
    >
      載入中…
    </div>
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="`載入失敗：${error.statusMessage ?? error.message}`"
    />

    <UCard
      v-else-if="rows.length"
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-sm [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
          <thead class="bg-elevated text-xs tracking-wider text-muted">
            <tr>
              <th class="px-2 py-2 text-left sm:px-3">
                隔期
              </th>
              <th class="px-2 py-2 text-left sm:px-3">
                期數
              </th>
              <th class="px-2 py-2 text-left sm:px-3">
                日期
              </th>
              <th class="px-2 py-2 text-right sm:px-3">
                值
              </th>
              <th class="px-2 py-2 text-left sm:px-3">
                剩餘獎號（位置）
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.gap"
              class="border-t border-default"
            >
              <td class="px-2 py-1.5 font-mono sm:px-3">
                {{ row.gap }}
              </td>
              <td class="px-2 py-1.5 font-mono text-xs sm:px-3">
                {{ row.issue || '—' }}
              </td>
              <td
                class="px-2 py-1.5 font-mono text-xs sm:px-3"
                :class="row.dateRed ? 'font-semibold text-rose-600' : ''"
              >
                {{ row.date || '—' }}
              </td>
              <td class="px-2 py-1.5 text-right font-mono text-xs sm:px-3">
                {{ row.value }}
              </td>
              <td class="px-2 py-1.5 sm:px-3">
                <span
                  v-if="row.nums.length === 0"
                  class="text-xs text-muted"
                >—</span>
                <div
                  v-else
                  class="flex flex-wrap gap-1 whitespace-normal sm:gap-1.5"
                >
                  <div
                    v-for="(n, i) in row.nums"
                    :key="n"
                    class="flex w-8 flex-col items-center sm:w-9"
                    :title="`${pad(n)}：隔 ${row.gap}・值 ${row.value}・位 ${row.nums.length}-${i + 1}・出現在 ${result?.counts[n] ?? 0} 組`"
                  >
                    <span
                      class="gf-ball size-7 text-xs sm:size-8"
                      :class="isHit(n) ? 'gf-hit' : ''"
                    >{{ pad(n) }}</span>
                    <span class="font-mono text-[10px] leading-4 text-muted">{{ row.nums.length }}-{{ i + 1 }}</span>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <!-- 條件：平常收成右下角按鈕，點開才蓋住畫面 -->
    <div
      v-if="result"
      class="fixed right-4 bottom-4 z-40"
    >
      <UButton
        icon="i-lucide-filter"
        size="lg"
        class="rounded-full shadow-lg"
        @click="open = true"
      >
        剩 {{ result.total.toLocaleString() }} 組 · 橘 {{ hitCount }}
      </UButton>
    </div>
    <USlideover
      v-model:open="open"
      title="勾選條件"
      :description="`已勾 ${enabledCount} 條・剩 ${result?.total.toLocaleString() ?? 0} 組・符合的號碼 ${hitCount} 個`"
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <template #body>
        <FilterConditions
          v-model="conds"
          :actual-pass="null"
          :ui="{ root: 'rounded-none ring-0 shadow-none' }"
          @reset="resetConds"
        />
      </template>
    </USlideover>
  </div>
</template>

<style scoped>
.gapfilter-root {
  --gf-orange: #eb6834;
}
:global(.dark) .gapfilter-root {
  --gf-orange: #d95926;
}
.gf-ball {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  color: var(--ui-text-toned);
  box-shadow: inset 0 0 0 1px var(--ui-border-accented);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
  line-height: 1;
}
.gf-hit {
  background: var(--gf-orange);
  color: #0b0b0b;
  box-shadow: none;
}
</style>
