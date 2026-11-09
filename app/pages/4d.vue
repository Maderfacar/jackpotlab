<script setup lang="ts">
/**
 * 四星彩（2026-11-09 使用者：開一個獨立頁面）。
 *   - 四個位置各自獨立算隔期；中獎看成個位／後兩碼／後三碼／四碼四層。
 *   - 目前盤面、少見狀況通報（附歷史後續）、時間分段（換機台／改程式／換營運商的可疑線索）、歷史分佈、近 20 期走勢。
 * 算法在 shared/lotto/digit4d；資料是歷史檔 + 檔案之後的新期數（useDigit4d），全部在瀏覽器算。
 */
import { POS_LABELS } from '~~/shared/lotto/digit4d/state'

useSeoMeta({ title: '四星彩 — 四層盤面' })

const route = useRoute()
const router = useRouter()
const TABS = [
  { label: '盤面', value: 'board' },
  { label: '少見', value: 'rare' },
  { label: '分段', value: 'segments' },
  { label: '分佈', value: 'dist' },
  { label: '近20期', value: 'recent' }
]
const tab = computed<string>({
  get: () => (TABS.some(t => t.value === route.query.tab) ? String(route.query.tab) : 'board'),
  set: v => router.replace({ query: { ...route.query, tab: v } })
})

const { data, status, error, steps, board, rare, segments, bounds, latest3 } = useDigit4d()
const latest = computed(() => steps.value.at(-1) ?? null)
const nextIssue = computed(() => (latest.value ? String(Number(latest.value.issue) + 1) : ''))
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] space-y-5 px-4 py-8 sm:px-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">
        四星彩 · 四層盤面
      </h1>
      <p class="text-sm text-muted">
        四個位置各自算隔期；中獎從後面對，看成個位、後兩碼、後三碼、四碼四層
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
      <UAlert
        v-for="w in data?.warnings ?? []"
        :key="w"
        color="warning"
        variant="subtle"
        icon="i-lucide-info"
        :title="w"
      />

      <UCard>
        <div class="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div>
            <div class="text-xs text-muted">
              最新一期
            </div>
            <div class="font-mono text-lg font-semibold">
              {{ latest.issue }}
            </div>
            <div class="text-xs text-muted">
              {{ latest.date }}
            </div>
          </div>
          <div class="grid grid-cols-4 gap-2 sm:gap-4">
            <div
              v-for="(h, p) in latest.pos"
              :key="p"
              class="flex flex-col items-center gap-0.5"
            >
              <span class="text-[11px] text-muted">{{ POS_LABELS[p] }}</span>
              <span class="flex size-10 items-center justify-center rounded-full bg-amber-400 font-mono text-lg font-semibold text-amber-950">{{ h.digit }}</span>
              <span class="text-center text-[10px] leading-tight text-muted">第 {{ h.rank }} 新<br>隔期 {{ h.gap ?? '—' }}</span>
            </div>
          </div>
          <div
            v-if="latest3"
            class="text-sm"
          >
            <div class="text-xs text-muted">
              同期三星彩
            </div>
            <div class="font-mono text-lg font-semibold tracking-widest">
              {{ latest3.digits.join('') }}
            </div>
            <div class="text-xs text-muted">
              {{ latest3.issue === latest.issue ? '同一期' : `第 ${latest3.issue} 期` }}
            </div>
          </div>
        </div>
      </UCard>

      <UTabs
        v-model="tab"
        :items="TABS"
        :content="false"
        class="w-full"
      />

      <Digit4dBoardSection
        v-if="tab === 'board'"
        :board="board"
      />
      <Digit4dRareSection
        v-else-if="tab === 'rare'"
        :items="rare"
        :next-issue="nextIssue"
      />
      <Digit4dSegmentSection
        v-else-if="tab === 'segments'"
        :result="segments"
        :steps="steps"
      />
      <Digit4dDistSection
        v-else-if="tab === 'dist'"
        :steps="steps"
        :bounds="bounds"
      />
      <Digit4dRecentSection
        v-else
        :steps="steps"
      />
    </template>
  </div>
</template>
