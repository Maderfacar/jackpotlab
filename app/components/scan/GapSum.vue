<script setup lang="ts">
/** ① 隔期和：一期比前期大 / 小 / 平，連續幾期同方向、之後下一期換方向的次數 */
import type { Dir } from '~~/shared/lotto/scan/scan'
import type { ScanView } from '~~/shared/lotto/scan/view'
import type { ScanBarItem } from '~/utils/scan-format'

const props = defineProps<{ view: ScanView }>()
const g = computed(() => props.view.gapSum)

const DIR_COLOR: Record<Dir, string> = { 大: 'var(--scan-orange)', 小: 'var(--scan-blue)', 平: 'var(--ui-text-dimmed)' }

const bars = computed<ScanBarItem[]>(() => g.value.recent.map(r => ({
  key: r.issue,
  label: scanShortIssue(r.issue),
  value: r.value,
  color: r.dir ? DIR_COLOR[r.dir] : 'var(--ui-text-dimmed)',
  below: r.dir ?? '',
  belowColor: r.dir ? DIR_COLOR[r.dir] : undefined,
  title: `第 ${r.issue} 期 隔期和 ${r.value}${r.dir ? `（${r.dir}）` : ''}`
})))

const lengthRows = computed(() => {
  const L = g.value.lengths
  const keys = Object.keys(L).map(Number).sort((a, b) => a - b)
  const total = keys.reduce((a, k) => a + (L[k] ?? 0), 0)
  return keys.map(k => ({ k, count: L[k] ?? 0, total }))
})
const pattern = (k: number) => (k === 1 ? '大小大小（每期換方向）' : `${'大'.repeat(k)}小 / ${'小'.repeat(k)}大`)
const currentK = computed(() => (g.value.current && g.value.current.dir !== '平' ? Math.min(g.value.current.len, 4) : null))
</script>

<template>
  <UCard id="p1">
    <template #header>
      <h2 class="font-semibold">
        ① 隔期和大小走勢
      </h2>
      <p class="text-xs text-muted">
        大 = 比上一期大、小 = 比上一期小、一樣 = 平（另外算）。
      </p>
    </template>
    <div class="space-y-5">
      <div class="space-y-1">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span>近 {{ g.recent.length }} 期隔期和（舊 → 新）</span>
          <span class="flex items-center gap-1"><span class="size-2.5 rounded-sm bg-[var(--scan-orange)]" />大</span>
          <span class="flex items-center gap-1"><span class="size-2.5 rounded-sm bg-[var(--scan-blue)]" />小</span>
          <span class="flex items-center gap-1"><span class="size-2.5 rounded-sm bg-[var(--ui-text-dimmed)]" />平</span>
        </div>
        <ScanBars :items="bars" />
      </div>

      <p class="text-sm">
        本期隔期和 <b class="font-mono">{{ g.now }}</b>
        <template v-if="g.current">
          ，目前連 <b class="font-mono">{{ g.current.len }}</b> 期「{{ g.current.dir }}」
        </template>
      </p>

      <div class="grid gap-6 lg:grid-cols-2">
        <div class="space-y-2">
          <h3 class="text-sm font-semibold">
            同方向連續幾期（已結束的段）
          </h3>
          <table class="w-full text-sm">
            <thead class="text-xs text-muted">
              <tr class="border-b border-default">
                <th class="py-1.5 text-left font-normal">
                  連續
                </th>
                <th class="py-1.5 text-left font-normal">
                  走勢
                </th>
                <th class="py-1.5 text-left font-normal">
                  次數
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in lengthRows"
                :key="r.k"
                class="border-b border-default/60"
              >
                <td class="py-1.5 font-mono">
                  {{ r.k }} 期
                </td>
                <td class="py-1.5 text-toned">
                  {{ pattern(r.k) }}
                </td>
                <td class="py-1.5">
                  <ScanRate :rate="{ hit: r.count, n: r.total }" />
                </td>
              </tr>
            </tbody>
          </table>
          <p class="text-xs text-muted">
            另有 {{ g.flat }} 次「平」（和上一期一樣），不算在任何一段裡。
          </p>
        </div>

        <div class="space-y-2">
          <h3 class="text-sm font-semibold">
            連 k 期同方向之後，下一期
          </h3>
          <table class="w-full text-sm">
            <thead class="text-xs text-muted">
              <tr class="border-b border-default">
                <th class="py-1.5 text-left font-normal">
                  已連
                </th>
                <th class="py-1.5 text-left font-normal">
                  換方向
                </th>
                <th class="py-1.5 text-left font-normal">
                  續同方向
                </th>
                <th class="py-1.5 text-left font-normal">
                  平
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in g.table"
                :key="r.k"
                class="border-b border-default/60"
                :class="r.k === currentK ? 'bg-primary/10 font-medium' : ''"
              >
                <td class="py-1.5 font-mono">
                  {{ r.k }}{{ r.k === 4 ? '+' : '' }} 期{{ r.k === currentK ? ' ← 現在' : '' }}
                </td>
                <td class="py-1.5">
                  <ScanRate :rate="{ hit: r.flip, n: r.n }" />
                </td>
                <td class="py-1.5 font-mono text-toned">
                  {{ scanPct({ hit: r.same, n: r.n }) }}
                </td>
                <td class="py-1.5 font-mono text-toned">
                  {{ r.flat }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </UCard>
</template>
