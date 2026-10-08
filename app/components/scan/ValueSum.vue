<script setup lang="ts">
/** ② 值和：通常比隔期和小；值和 < 10 之後，下一期會不會出現單顆值 > 10 */
import type { ScanView } from '~~/shared/lotto/scan/view'
import type { ScanBarItem } from '~/utils/scan-format'

const props = defineProps<{ view: ScanView }>()
const vs = computed(() => props.view.valueSum)

const bars = computed<ScanBarItem[]>(() => vs.value.recent.map(r => ({
  key: r.issue,
  label: scanShortIssue(r.issue),
  value: r.value,
  mark: r.gap,
  dot: r.big,
  color: r.value < 10 ? 'var(--scan-orange)' : 'var(--scan-blue)',
  below: r.value < 10 ? '<10' : '',
  belowColor: 'var(--scan-orange)',
  title: `第 ${r.issue} 期 值和 ${r.value}、隔期和 ${r.gap}${r.big ? '、有單顆值 > 10' : ''}`
})))
</script>

<template>
  <UCard id="p2">
    <template #header>
      <h2 class="font-semibold">
        ② 值和
      </h2>
      <p class="text-xs text-muted">
        值和 = 五顆的值加總。「往上衝」= 下一期五顆裡有單顆值 > 10。
      </p>
    </template>
    <div class="space-y-5">
      <div class="space-y-1">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span>近 {{ vs.recent.length }} 期（舊 → 新）</span>
          <span class="flex items-center gap-1"><span class="size-2.5 rounded-sm bg-[var(--scan-blue)]" />值和</span>
          <span class="flex items-center gap-1"><span class="size-2.5 rounded-sm bg-[var(--scan-orange)]" />值和 &lt; 10</span>
          <span class="flex items-center gap-1"><span class="h-0.5 w-3 bg-[var(--ui-text)]" />隔期和</span>
          <span class="flex items-center gap-1"><span class="size-2 rounded-full bg-[var(--scan-orange)]" />該期有單顆值 &gt; 10</span>
        </div>
        <ScanBars
          :items="bars"
          :height="150"
        />
      </div>

      <p class="text-sm">
        本期值和 <b class="font-mono">{{ vs.now }}</b>、隔期和 <b class="font-mono">{{ vs.gapNow }}</b>；
        已連 <b class="font-mono">{{ vs.noBigNow }}</b> 期沒有單顆值 &gt; 10。
      </p>

      <table class="w-full text-sm">
        <tbody>
          <tr class="border-b border-default/60">
            <td class="py-2 pr-3">
              值和比隔期和小
            </td>
            <td class="py-2">
              <ScanRate :rate="vs.lessThanGap" />
            </td>
          </tr>
          <tr
            class="border-b border-default/60"
            :class="vs.now < 10 ? 'bg-primary/10' : ''"
          >
            <td class="py-2 pr-3">
              值和 &lt; 10 → 下一期出現單顆值 &gt; 10{{ vs.now < 10 ? ' ← 本期符合' : '' }}
            </td>
            <td class="py-2">
              <ScanRate
                :rate="vs.under10.cond"
                :base="vs.under10.base"
              />
            </td>
          </tr>
          <tr
            class="border-b border-default/60"
            :class="vs.noBigNow >= 2 ? 'bg-primary/10' : ''"
          >
            <td class="py-2 pr-3">
              連 2 期沒有單顆值 &gt; 10 → 下一期出現
            </td>
            <td class="py-2">
              <ScanRate
                :rate="vs.noBig2.cond"
                :base="vs.noBig2.base"
              />
            </td>
          </tr>
          <tr :class="vs.noBigNow >= 3 ? 'bg-primary/10' : ''">
            <td class="py-2 pr-3">
              連 3 期沒有單顆值 &gt; 10 → 下一期出現
            </td>
            <td class="py-2">
              <ScanRate
                :rate="vs.noBig3.cond"
                :base="vs.noBig3.base"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </UCard>
</template>
