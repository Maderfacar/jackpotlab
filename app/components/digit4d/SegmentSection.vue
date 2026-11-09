<script setup lang="ts">
/** 時間分段：比例突然改變、改了以後一直維持的可疑日期；資料本身看得到的營運變化 */
import { drawsPerYear, weekdayChanges } from '~~/shared/lotto/digit4d/dist'
import { GROUP_GAP, SHUFFLES, WINDOW, type SegmentResult } from '~~/shared/lotto/digit4d/segments'
import type { DrawStep } from '~~/shared/lotto/digit4d/state'

const props = defineProps<{ result: SegmentResult, steps: DrawStep[] }>()

const weekdays = computed(() => weekdayChanges(props.steps))
const perYear = computed(() => drawsPerYear(props.steps))
</script>

<template>
  <div class="space-y-5">
    <UCard>
      <template #header>
        <div class="font-semibold">
          可疑的轉折日期
        </div>
      </template>
      <div
        v-if="!result.suspects.length"
        class="text-sm text-muted"
      >
        {{ result.indicators.length }} 項指標都沒有找到比打亂順序還明顯的轉折。
      </div>
      <div
        v-for="s in result.suspects"
        :key="s.t"
        class="space-y-2 border-b border-default pb-4 last:border-0 last:pb-0"
      >
        <div class="flex flex-wrap items-baseline gap-x-3">
          <span class="font-mono text-lg font-semibold">{{ s.date }}</span>
          <span class="text-xs text-muted">{{ s.flags.length }} 項指標在這附近改變・外部事件尚未查證</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[520px] text-sm">
            <thead class="text-xs text-muted">
              <tr class="border-b border-default">
                <th class="py-1 text-left font-normal">
                  哪一項
                </th>
                <th class="py-1 text-left font-normal">
                  變最多的
                </th>
                <th class="py-1 text-right font-normal">
                  前 {{ WINDOW }} 期 → 後 {{ WINDOW }} 期
                </th>
                <th class="py-1 text-right font-normal">
                  強度
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="f in s.flags"
                :key="f.key"
                class="border-b border-default last:border-0"
              >
                <td class="py-1.5">
                  {{ f.label }}<span class="ml-1 text-xs text-muted">{{ f.date }}</span>
                </td>
                <td class="py-1.5">
                  {{ f.cat }}
                </td>
                <td class="py-1.5 text-right font-mono">
                  {{ digitPct(f.before) }} → {{ digitPct(f.after) }}
                </td>
                <td class="py-1.5 text-right font-mono">
                  {{ f.strength.toFixed(2) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="font-semibold">
          資料本身看得到的營運變化
        </div>
      </template>
      <div class="space-y-3 text-sm">
        <div
          v-for="w in weekdays"
          :key="w.date"
        >
          <span class="mr-2 font-mono font-semibold">{{ w.date }}</span>{{ w.text }}
        </div>
        <div
          v-if="!weekdays.length"
          class="text-muted"
        >
          開獎星期沒有變過
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span
            v-for="y in perYear"
            :key="y.year"
          >{{ y.year }}：{{ y.n }} 期</span>
        </div>
      </div>
    </UCard>

    <details class="rounded-lg border border-default p-4 text-sm text-muted">
      <summary class="cursor-pointer font-medium text-default">
        怎麼找的（設定都是我補的）
      </summary>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        <li>指標共 {{ result.indicators.length }} 項：{{ result.indicators.map(i => i.label).join('、') }}。</li>
        <li>每個月第一期當候選切點，比較切點前 {{ WINDOW }} 期和後 {{ WINDOW }} 期（約各兩年）每一類的比例差多少。前後各比這麼多期，只變一下又回來的不會被算進去。</li>
        <li>同一項指標把歷史順序打亂 {{ SHUFFLES }} 次，每次都算一遍最大的差異。實際的差異比打亂後的每一次都大才列出；強度 = 實際差異 ÷ 打亂後最大的差異。</li>
        <li>指標很多項一起看，強度只比 1 大一點的，有可能只是剛好；好幾項在同一時間一起變、強度又高的，嫌疑才大。</li>
        <li>不同指標在 {{ GROUP_GAP }} 期以內的轉折併成同一個可疑日期。</li>
        <li>換機台、改開獎方式、換發行機構這些外部事件的日期還沒查證，查到才會填上，不憑印象寫。</li>
      </ul>
    </details>
  </div>
</template>
