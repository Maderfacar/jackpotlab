<script setup lang="ts">
import type { DependenceResult, PairItem, StatCell, StatGroup } from '~~/shared/lotto/patterns/dependence'

const GAME_ID = 'lotto539'
const apiPath = `/api/patterns/${GAME_ID}/dependence`

const { data, status, error } = useFetch<{ result: DependenceResult, generatedAt: string }>(apiPath, {
  query: { format: 'json' },
  server: false
})

const result = computed(() => data.value?.result ?? null)
const onlyFlagged = ref(false)

const groups = computed(() => (result.value?.groups ?? []).map(g => ({
  ...g,
  shown: onlyFlagged.value ? g.cells.filter(c => c.verdict !== 'normal') : g.cells,
  flagged: g.cells.filter(c => c.verdict !== 'normal').length,
  replicated: g.cells.filter(c => c.verdict === 'replicated').length
})))

const replicatedCells = computed(() => (result.value?.groups ?? [])
  .flatMap(g => g.cells.filter(c => c.verdict === 'replicated').map(c => ({ group: g.title, cell: c }))))

const conclusion = computed(() => {
  const r = result.value
  if (!r) return ''
  const c = r.calibration
  const p = r.pairs
  const cellsOk = c.realReplicated <= c.shuffleReplicatedP95
  const pairsOk = p.realMore <= p.shuffleMore.p95 && p.realLess <= p.shuffleLess.p95
  if (cellsOk && pairsOk) {
    return '真實開出順序的結果，和同一批號碼打亂順序後的結果沒有可分辨的差異：沒有找到前後段都持續存在的偏差，也沒有找到前後期之間的關聯。'
  }
  return '有項目超出「打亂順序」的誤判水準，請看下方標示「重現」的項目與號碼接續。'
})

function fmt(kind: StatGroup['kind'], v: number | null): string {
  if (v == null || Number.isNaN(v)) return '—'
  return kind === 'p' ? `${(v * 100).toFixed(1)}%` : v.toFixed(3)
}

function partClass(cell: StatCell, part: 'all' | 'front' | 'back'): string {
  const v = cell.real[part]
  const lo = cell.low[part]
  const hi = cell.high[part]
  if (v == null || lo == null || hi == null) return ''
  if (v < lo || v > hi) return cell.verdict === 'replicated' ? 'font-semibold text-error' : 'font-semibold text-warning'
  return ''
}

const VERDICT: Record<StatCell['verdict'], { label: string, color: 'error' | 'warning' | 'neutral' }> = {
  replicated: { label: '重現', color: 'error' },
  partial: { label: '單段超出', color: 'warning' },
  normal: { label: '範圍內', color: 'neutral' }
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const ratio = (x: PairItem) => `${x.front}（${x.frontExpected.toFixed(1)}）`
const ratioBack = (x: PairItem) => `${x.back}（${x.backExpected.toFixed(1)}）`
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
        前段 {{ result.meta.front.startTerm }}～{{ result.meta.front.endTerm }}（{{ result.meta.front.draws }} 期）
      </UBadge>
      <UBadge
        color="neutral"
        variant="subtle"
      >
        後段 {{ result.meta.back.startTerm }}～{{ result.meta.back.endTerm }}（{{ result.meta.back.draws }} 期）
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

    <div
      v-if="status === 'pending'"
      class="py-10 text-center text-sm text-muted"
    >
      計算中（打亂順序對照約需 1–2 秒）…
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
            總結
          </h2>
        </template>
        <div class="space-y-4">
          <p class="text-sm">
            {{ conclusion }}
          </p>
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-md bg-elevated p-3">
              <div class="text-xs text-muted">
                前後段都重現的項目
              </div>
              <div class="font-mono text-2xl font-semibold">
                {{ result.calibration.realReplicated }}
                <span class="text-sm font-normal text-muted">/ {{ result.calibration.cells }} 項</span>
              </div>
              <div class="text-xs text-muted">
                打亂順序也會誤判：平均 {{ result.calibration.shuffleReplicatedMean.toFixed(2) }}、最多約 {{ result.calibration.shuffleReplicatedP95 }} 項
              </div>
            </div>
            <div class="rounded-md bg-elevated p-3">
              <div class="text-xs text-muted">
                號碼接續・前後段都偏多
              </div>
              <div class="font-mono text-2xl font-semibold">
                {{ result.pairs.realMore }}
                <span class="text-sm font-normal text-muted">對</span>
              </div>
              <div class="text-xs text-muted">
                打亂順序：平均 {{ result.pairs.shuffleMore.mean.toFixed(1) }}、最多約 {{ result.pairs.shuffleMore.p95 }} 對
              </div>
            </div>
            <div class="rounded-md bg-elevated p-3">
              <div class="text-xs text-muted">
                號碼接續・前後段都偏少
              </div>
              <div class="font-mono text-2xl font-semibold">
                {{ result.pairs.realLess }}
                <span class="text-sm font-normal text-muted">對</span>
              </div>
              <div class="text-xs text-muted">
                打亂順序：平均 {{ result.pairs.shuffleLess.mean.toFixed(1) }}、最多約 {{ result.pairs.shuffleLess.p95 }} 對
              </div>
            </div>
          </div>
          <div
            v-if="replicatedCells.length > 0"
            class="text-sm"
          >
            <span class="font-semibold">重現項目：</span>
            <span
              v-for="(x, i) in replicatedCells"
              :key="x.cell.id"
            >{{ i > 0 ? '、' : '' }}{{ x.cell.label }}（{{ x.cell.direction === 'high' ? '偏高' : '偏低' }}）</span>
          </div>
        </div>
      </UCard>

      <UCard>
        <details class="text-sm">
          <summary class="cursor-pointer font-semibold select-none">
            方法說明（只用這份真實開獎號碼）
          </summary>
          <div class="mt-3 space-y-1.5">
            <p>・每項指標用真實開出順序算「全部／前段／後段」三個值（第四組：前後段重現）。</p>
            <p>・<span class="font-semibold">對照範圍</span>：把同一批真實獎號的開出順序打亂，隔期等欄位照原算法重算，重複 {{ result.meta.shuffles }} 次，取 2.5%～97.5% 範圍。號碼本身完全不變，只有前後順序不同；若真實順序有持續性或前後關聯，真實值會落在範圍外。</p>
            <p>・不用「相隔很遠的期數」當對照：隔期／現值／位置是從前面各期推出來的，本身就有前後關聯（例：一期開出很多冷號，下一期隔期和自然偏小），遠距對照會把算法造成的關聯誤判成規律。</p>
            <p>・<span class="font-semibold">判定</span>：前段與後段都超出範圍且方向相同 =「重現」；只有全部或單一段超出 =「單段超出」，不算持續存在。</p>
            <p>・固定種子 {{ result.meta.seed }}，每次結果相同；前 {{ result.meta.warmup }} 期為暖機不列入。</p>
          </div>
        </details>
      </UCard>

      <div class="flex items-center gap-2">
        <USwitch v-model="onlyFlagged" />
        <span class="text-sm">只顯示超出範圍的項目</span>
      </div>

      <UCard
        v-for="g in groups"
        :key="g.id"
      >
        <template #header>
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="font-semibold">
              {{ g.title }}
            </h2>
            <span class="text-xs text-muted">{{ g.cells.length }} 項 · 超出 {{ g.flagged }} · 重現 {{ g.replicated }}</span>
          </div>
          <p class="mt-1 text-xs text-muted">
            {{ g.description }}
          </p>
        </template>
        <p
          v-if="g.shown.length === 0"
          class="text-sm text-muted"
        >
          沒有超出範圍的項目。
        </p>
        <div
          v-else
          class="overflow-x-auto"
        >
          <table class="w-full min-w-[40rem] text-sm">
            <thead>
              <tr class="border-b border-default text-left text-xs text-muted">
                <th class="py-1.5 pr-3 font-medium">
                  項目
                </th>
                <th class="py-1.5 pr-3 font-medium">
                  全部
                </th>
                <th class="py-1.5 pr-3 font-medium">
                  前段
                </th>
                <th class="py-1.5 pr-3 font-medium">
                  後段
                </th>
                <th class="py-1.5 font-medium">
                  判定
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="c in g.shown"
                :key="c.id"
                class="border-b border-default/50 align-top"
              >
                <td class="py-1.5 pr-3">
                  {{ c.label }}
                </td>
                <td
                  v-for="part in (['all', 'front', 'back'] as const)"
                  :key="part"
                  class="py-1.5 pr-3"
                >
                  <div
                    class="font-mono"
                    :class="partClass(c, part)"
                  >
                    {{ fmt(g.kind, c.real[part]) }}
                  </div>
                  <div class="font-mono text-[11px] text-muted">
                    {{ fmt(g.kind, c.low[part]) }}～{{ fmt(g.kind, c.high[part]) }}
                  </div>
                </td>
                <td class="py-1.5">
                  <UBadge
                    :color="VERDICT[c.verdict].color"
                    :variant="c.verdict === 'normal' ? 'outline' : 'subtle'"
                    size="sm"
                  >
                    {{ VERDICT[c.verdict].label }}{{ c.direction === 'high' ? '・偏高' : c.direction === 'low' ? '・偏低' : '' }}
                  </UBadge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            第三組 ④ 號碼接續（本期開出 i → 下期開出 j）
          </h2>
          <p class="mt-1 text-xs text-muted">
            共 {{ result.pairs.pairsChecked }} 種組合。推算次數 = 本段 i 開出次數 × 下期 j 開出次數 ÷ 本段接續期數（只用本段資料）。
            前後段都 ≥ {{ result.pairs.ratio }} 倍算偏多、都 ≤ 1/{{ result.pairs.ratio }} 算偏少。
            這類組合很多，打亂順序後也會有差不多數量「看起來偏多／偏少」的組合，所以重點是和打亂順序的數量比較。
          </p>
        </template>
        <div class="grid gap-6 lg:grid-cols-2">
          <section
            v-for="side in ([
              { key: 'more', title: '前後段都偏多', items: result.pairs.more, real: result.pairs.realMore, ref: result.pairs.shuffleMore },
              { key: 'less', title: '前後段都偏少', items: result.pairs.less, real: result.pairs.realLess, ref: result.pairs.shuffleLess }
            ])"
            :key="side.key"
            class="min-w-0 space-y-2"
          >
            <h3 class="text-sm font-semibold">
              {{ side.title }}：{{ side.real }} 對
              <span class="font-normal text-muted">（打亂順序平均 {{ side.ref.mean.toFixed(1) }}、最多約 {{ side.ref.p95 }}）</span>
            </h3>
            <div class="max-h-80 overflow-auto">
              <table class="w-full text-sm">
                <thead class="sticky top-0 bg-default">
                  <tr class="border-b border-default text-left text-xs text-muted">
                    <th class="py-1 pr-3 font-medium">
                      i → j
                    </th>
                    <th class="py-1 pr-3 font-medium">
                      前段次數（推算）
                    </th>
                    <th class="py-1 font-medium">
                      後段次數（推算）
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="x in side.items"
                    :key="`${x.from}-${x.to}`"
                    class="border-b border-default/50"
                  >
                    <td class="py-1 pr-3 font-mono">
                      {{ pad2(x.from) }} → {{ pad2(x.to) }}
                    </td>
                    <td class="py-1 pr-3 font-mono">
                      {{ ratio(x) }}
                    </td>
                    <td class="py-1 font-mono">
                      {{ ratioBack(x) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </UCard>
    </template>
  </div>
</template>
