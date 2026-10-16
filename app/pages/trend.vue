<script setup lang="ts">
/**
 * 近期波段（2026-10-16 使用者：把對話中 y／值的分析做成頁面，不用每次問）。
 * 算法 app/utils/recent-wave.ts、文字 app/utils/recent-wave-text.ts；scripts/y-wave.ts 印的是同一套。
 * 資料：歷史檔 + 檔案之後的新期數（同 /board），全部在瀏覽器算。
 */
import { HISTORY_FILE_PATH, mergeDraws, parseHistoryFile } from '~~/shared/lotto/history-file'
import type { DrawQueryResponse } from '~~/shared/lotto/types'
import { analyzeRecentWave, LOW_VALUE_SUM, RECENT_WAVE_KEYS, recentWaveDraws, type RecentWave, type RecentWaveKind } from '~/utils/recent-wave'

useSeoMeta({ title: '近期波段 — 今彩 539' })

const route = useRoute()
const router = useRouter()
const kind = computed<RecentWaveKind>({
  get: () => (route.query.tab === 'value' ? 'value' : 'y'),
  set: v => router.replace({ query: { ...route.query, tab: v } })
})
const tabs = [
  { label: '位置 y=1～5', value: 'y' },
  { label: '值 0～5', value: 'value' }
]

const { data: draws, status, error } = useAsyncData('trend-draws', async () => {
  const history = parseHistoryFile(await $fetch(HISTORY_FILE_PATH))
  const res = await $fetch<DrawQueryResponse>('/api/draws/lotto539/since', { query: { after: history.at(-1)?.issue ?? '0' } })
  const newer = res.results.map(r => ({ issue: String(r.drawTerm), date: r.drawDate, nums: [...r.numbers].sort((a, b) => a - b) }))
  return mergeDraws(history, newer)
}, { server: false })

const inputs = computed(() => (draws.value ?? []).map(d => ({ drawTerm: Number(d.issue), drawDate: d.date, prizes: d.nums })))
const waveDraws = computed(() => recentWaveDraws(inputs.value))
const latest = computed(() => {
  const d = inputs.value.at(-1)
  const w = waveDraws.value.at(-1)
  return d && w ? { ...d, values: w.values, ys: w.ys, valueSum: w.valueSum } : null
})
const waves = computed<RecentWave[]>(() => RECENT_WAVE_KEYS[kind.value]
  .map(key => analyzeRecentWave(waveDraws.value, kind.value, key))
  .filter((r): r is RecentWave => r !== null))

const pad2 = (n: number) => String(n).padStart(2, '0')
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] space-y-5 px-4 py-8 sm:px-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">
        近期波段 · 今彩 539
      </h1>
      <p class="text-sm text-muted">
        以最新一期開完的盤面，看位置 y 與值各自在今年的波段，以及下一期可能怎麼變
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

    <template v-else-if="latest">
      <UCard>
        <div class="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <div class="text-xs text-muted">
              最新一期
            </div>
            <div class="font-mono text-lg font-semibold">
              {{ latest.drawTerm }}
            </div>
            <div class="text-xs text-muted">
              {{ latest.drawDate }}
            </div>
          </div>
          <div class="flex flex-wrap gap-3">
            <div
              v-for="(x, i) in latest.prizes"
              :key="x"
              class="flex flex-col items-center gap-0.5"
            >
              <span class="flex size-10 items-center justify-center rounded-full bg-amber-400 font-mono font-semibold text-amber-950">{{ pad2(x) }}</span>
              <span class="text-[11px] text-muted">值 {{ latest.values[i] ?? '—' }}・y={{ latest.ys[i] ?? '—' }}</span>
            </div>
          </div>
          <div>
            <div class="text-xs text-muted">
              值總和
            </div>
            <div class="text-lg font-semibold">
              {{ latest.valueSum }}
              <span class="text-xs font-normal text-muted">（{{ latest.valueSum < LOW_VALUE_SUM ? '小於 10' : '10 以上' }}）</span>
            </div>
          </div>
        </div>
      </UCard>

      <UTabs
        v-model="kind"
        :items="tabs"
        :content="false"
        class="w-full sm:w-auto"
      />

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <TrendWaveCard
          v-for="w in waves"
          :key="`${w.kind}-${w.key}`"
          :wave="w"
        />
      </div>

      <details class="rounded-lg border border-default p-4 text-sm text-muted">
        <summary class="cursor-pointer font-medium text-default">
          怎麼算的
        </summary>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li>每期數這期 5 顆裡有幾顆位置是 y=k（或值是 v）。位置 y、值和 /draws「獎號關聯」的位置、數值欄同一套算法。</li>
          <li>範圍是最新一期所在的年份（今年以來）。</li>
          <li>出現越少的 y／值看越多期：看幾期 = 7.1 ÷ 今年每期平均（至少 3 期），讓每種的合計平均都在 7 顆左右。</li>
          <li>高波段 = 今年這個合計最高的 20%，低波段 = 最低的 20%，其他是中間。</li>
          <li>同盤面 = 上一期同樣幾顆，而且同樣在高／中／低波段；「全史」是 2007 年起（去掉最前面 100 期），次數多，當主要依據。</li>
          <li>值另外比「上一期值總和小於 10 / 10 以上」：兩邊平均差 25% 以上算有影響，推估就改用跟現在同一邊的那組。</li>
          <li>下一期開完：最舊那期移出合計範圍、補上下一期，列出開幾顆 → 合計幾顆 → 落在哪個波段，機率用同盤面的次數算。</li>
        </ul>
      </details>
    </template>
  </div>
</template>
