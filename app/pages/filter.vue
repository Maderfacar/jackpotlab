<script setup lang="ts">
/**
 * 組合篩選（2026-10-09 使用者拍板）：用某一期開完的盤面，套使用者口述的條件篩下一期的 5 顆組合。
 *
 * - 條件可勾選、數字可直接改，存在這台裝置的瀏覽器（localStorage）；新條件由使用者口述、加在 DEFAULT_CONDITIONS。
 * - 盤面照「隔期狀態」排法：還出現在剩下組合裡的號碼照常顯示並標出現幾組，一組都沒有的灰白。
 * - 可切換期別回看：標出下一期實際開出的號碼、它過了哪幾條；並統計歷史上「下一期實際開出」通過整組條件的期數。
 * 盤面重建與 /scan 共用 shared/lotto/scan/board-states（已核對與網站隔期狀態逐格一致）。
 */
import { DEFAULT_CONDITIONS, failedConditions, numberInfo, runFilter, type Condition, type NumInfo } from '~~/shared/lotto/filter/conditions'
import { computeBoardStates } from '~~/shared/lotto/scan/board-states'
import { WARMUP } from '~~/shared/lotto/scan/scan'

interface HistoryEntry {
  issue: string
  date: string
  prizes: string
}
interface AnalysisJson {
  history: HistoryEntry[]
}

useSeoMeta({ title: '組合篩選 — 今彩 539' })

const { data, status, error } = useFetch<AnalysisJson>('/api/analysis/lotto539', {
  query: { format: 'json' },
  server: false
})

const history = computed(() => data.value?.history ?? [])
const draws = computed(() => history.value.map(h => h.prizes.split(',').map(Number).sort((a, b) => a - b)))
const states = computed(() => computeBoardStates(draws.value, 60))
const lastT = computed(() => draws.value.length - 1)

const picked = ref<number | null>(null)
const t = computed(() => Math.max(WARMUP, Math.min(picked.value ?? lastT.value, lastT.value)))
const isLatest = computed(() => t.value === lastT.value)
function step(delta: number) {
  const next = Math.max(WARMUP, Math.min(lastT.value, t.value + delta))
  picked.value = next === lastT.value ? null : next
}

// ---------- 條件（存在瀏覽器，新版預設會自動補進來） ----------
const STORAGE_KEY = 'jackpotlab-filter-conditions-v1'
const conds = ref<Condition[]>(DEFAULT_CONDITIONS.map(c => ({ ...c })))
onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Condition[] | null
    if (Array.isArray(saved)) {
      conds.value = DEFAULT_CONDITIONS.map((d) => {
        const s = saved.find(x => x.id === d.id && x.kind === d.kind)
        return s ? { ...d, enabled: !!s.enabled, p: d.p.map((v, i) => (Number.isFinite(s.p?.[i]) ? s.p[i]! : v)), nums: Array.isArray(s.nums) ? s.nums : d.nums } : { ...d }
      })
    }
  } catch {
    // 讀不到就用預設
  }
})
watch(conds, (v) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
  } catch {
    // 無痕模式等存不了，不影響使用
  }
}, { deep: true })
function resetConds() {
  conds.value = DEFAULT_CONDITIONS.map(c => ({ ...c }))
}

// ---------- 篩選 ----------
const state = computed(() => states.value[t.value] ?? null)
const info = computed(() => (state.value ? numberInfo(state.value) : new Map<number, NumInfo>()))
const prevNums = computed(() => draws.value[t.value] ?? [])
const result = computed(() => runFilter(conds.value, info.value, prevNums.value))

/** 下一期實際開出的五顆（照盤面帶出隔期 / 值 / 位置） */
const actual = computed(() => {
  if (isLatest.value) return null
  const nums = draws.value[t.value + 1]
  if (!nums) return null
  const combo = nums.map(n => info.value.get(n)).filter((x): x is NumInfo => !!x)
  return combo.length === 5 ? { issue: history.value[t.value + 1]!.issue, nums, combo } : null
})
const actualPass = computed<Record<string, boolean> | null>(() => {
  const a = actual.value
  if (!a) return null
  const failed = new Set(failedConditions(conds.value, a.combo, prevNums.value).map(c => c.id))
  return Object.fromEntries(conds.value.map(c => [c.id, !failed.has(c.id)]))
})
const actualFailedCount = computed(() => (actualPass.value ? Object.values(actualPass.value).filter(v => !v).length : 0))

/** 歷史上：每一期開完的盤面套這組條件，下一期實際開出的號碼有沒有全部通過 */
const infos = computed(() => states.value.map(s => numberInfo(s)))
const historyPass = computed(() => {
  let n = 0
  let hit = 0
  const issues: string[] = []
  for (let s = WARMUP; s < lastT.value; s++) {
    const combo = draws.value[s + 1]!.map(x => infos.value[s]!.get(x)).filter((x): x is NumInfo => !!x)
    if (combo.length !== 5) continue
    n++
    if (failedConditions(conds.value, combo, draws.value[s]!).length === 0) {
      hit++
      issues.push(history.value[s + 1]!.issue)
    }
  }
  return { n, hit, issues }
})
const pad = (n: number) => String(n).padStart(2, '0')
const greyNums = computed(() => Array.from({ length: 39 }, (_, i) => i + 1).filter(n => !(result.value.counts[n]! > 0)))
</script>

<template>
  <div class="filter-root mx-auto w-full max-w-7xl space-y-5 px-4 py-8 sm:px-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">
        組合篩選 · 今彩 539
      </h1>
      <p class="text-sm text-muted">
        用某一期開完的盤面，照你的條件篩下一期的 5 顆組合。勾選或改數字，盤面上用不到的號碼會變灰。
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

    <template v-else-if="state && draws.length > WARMUP + 1">
      <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div class="flex items-center gap-1">
          <UButton
            icon="i-lucide-chevrons-left"
            size="sm"
            color="neutral"
            variant="subtle"
            aria-label="往前 10 期"
            :disabled="t <= WARMUP"
            @click="step(-10)"
          />
          <UButton
            icon="i-lucide-chevron-left"
            size="sm"
            color="neutral"
            variant="subtle"
            aria-label="上一期"
            :disabled="t <= WARMUP"
            @click="step(-1)"
          />
          <span class="px-2 text-sm">用第 <b class="font-mono">{{ history[t]?.issue }}</b> 期開完的盤面</span>
          <UButton
            icon="i-lucide-chevron-right"
            size="sm"
            color="neutral"
            variant="subtle"
            aria-label="下一期"
            :disabled="isLatest"
            @click="step(1)"
          />
          <UButton
            icon="i-lucide-chevrons-right"
            size="sm"
            color="neutral"
            variant="subtle"
            aria-label="往後 10 期"
            :disabled="isLatest"
            @click="step(10)"
          />
          <UButton
            v-if="!isLatest"
            size="sm"
            color="primary"
            variant="soft"
            class="ml-1"
            @click="picked = null"
          >
            回到最新
          </UButton>
        </div>
        <span class="text-xs text-muted">上一期（{{ history[t]?.issue }}）開出 <span class="font-mono">{{ prevNums.map(pad).join(' ') }}</span></span>
      </div>

      <div class="sticky top-[var(--ui-header-height,4rem)] z-10 -mx-4 border-y border-default bg-default/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <div class="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span class="text-sm">剩 <b class="font-mono text-2xl text-highlighted">{{ result.total.toLocaleString() }}</b> 組</span>
          <span class="text-sm text-muted">號碼：還能用 <b class="font-mono text-toned">{{ result.counts.filter(c => c > 0).length }}</b>、灰掉 <b class="font-mono text-toned">{{ 39 - result.counts.filter(c => c > 0).length }}</b></span>
          <span class="text-sm text-muted">歷史上下一期實際開出的號碼全部通過：<b class="font-mono text-toned">{{ historyPass.hit }}</b> / {{ historyPass.n }} 期</span>
        </div>
        <div
          v-if="greyNums.length"
          class="mt-0.5 text-xs text-muted"
        >
          灰掉的號碼：<span class="font-mono">{{ greyNums.map(pad).join(' ') }}</span>
        </div>
        <div
          v-if="actual"
          class="mt-1 text-sm"
        >
          下一期（{{ actual.issue }}）實際開出 <b class="font-mono">{{ actual.nums.map(pad).join(' ') }}</b>：
          <span
            v-if="actualFailedCount === 0"
            class="font-medium text-success"
          >全部條件都通過</span>
          <span
            v-else
            class="font-medium text-error"
          >有 {{ actualFailedCount }} 條沒通過（條件旁標 ✗）</span>
        </div>
      </div>

      <div class="grid gap-5 lg:grid-cols-12">
        <div class="lg:col-span-5">
          <FilterConditions
            v-model="conds"
            :actual-pass="actualPass"
            @reset="resetConds"
          />
        </div>
        <div class="lg:col-span-7">
          <FilterBoard
            :state="state"
            :counts="result.counts"
            :actual="actual?.nums ?? null"
          />
        </div>
      </div>

      <FilterComboList :result="result" />

      <p class="text-xs text-muted">
        <template v-if="historyPass.issues.length">
          歷史上全部通過的期別：{{ historyPass.issues.join('、') }}。
        </template>
        條件存在這台裝置的瀏覽器裡，下次打開還在；換手機或電腦要重新勾。統計剔除最前面 {{ WARMUP }} 期暖機。
      </p>
    </template>
  </div>
</template>

<style scoped>
.filter-root {
  --filter-orange: #eb6834;
}
:global(.dark) .filter-root {
  --filter-orange: #d95926;
}
</style>
