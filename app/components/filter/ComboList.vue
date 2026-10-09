<script setup lang="ts">
/** 剩下的組合清單（隔期和小 → 大），每組列出隔期 / 值 / 位置；一次顯示一段，可以再展開 */
import type { FilterResult } from '~~/shared/lotto/filter/conditions'

const props = defineProps<{ result: FilterResult }>()
const STEP = 100
const shown = ref(STEP)
watch(() => props.result, () => {
  shown.value = STEP
})
const rows = computed(() => props.result.combos.slice(0, shown.value))
const pad = (n: number) => String(n).padStart(2, '0')
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">
        剩下的組合
        <span class="ml-1 text-sm font-normal text-muted">共 {{ result.total.toLocaleString() }} 組</span>
      </h2>
      <p
        v-if="result.truncated"
        class="text-xs text-warning"
      >
        超過 {{ result.combos.length.toLocaleString() }} 組，清單只列前 {{ result.combos.length.toLocaleString() }} 組（照號碼順序，沒有依隔期和排）；多勾幾條條件就會完整列出。
      </p>
      <p
        v-else
        class="text-xs text-muted"
      >
        照隔期和由小到大排。隔期、值、位置各欄的五個數字，依序對應左邊五顆號碼。
      </p>
    </template>
    <div
      v-if="result.total === 0"
      class="py-6 text-center text-sm text-muted"
    >
      沒有任何組合符合全部條件。
    </div>
    <div
      v-else
      class="space-y-3"
    >
      <div class="overflow-x-auto">
        <table class="w-full min-w-[620px] text-sm">
          <thead class="text-xs text-muted">
            <tr class="border-b border-default">
              <th class="py-1.5 pr-2 text-left font-normal">
                #
              </th>
              <th class="py-1.5 pr-3 text-left font-normal">
                號碼
              </th>
              <th class="py-1.5 pr-3 text-left font-normal">
                隔期
              </th>
              <th class="py-1.5 pr-3 text-left font-normal">
                值
              </th>
              <th class="py-1.5 pr-3 text-left font-normal">
                位置
              </th>
              <th class="py-1.5 pr-3 text-right font-normal">
                隔期和
              </th>
              <th class="py-1.5 text-right font-normal">
                值和
              </th>
            </tr>
          </thead>
          <tbody class="font-mono">
            <tr
              v-for="(c, i) in rows"
              :key="c.map(x => x.n).join('-')"
              class="border-b border-default/50"
            >
              <td class="py-1 pr-2 text-xs text-dimmed">
                {{ i + 1 }}
              </td>
              <td class="whitespace-nowrap py-1 pr-3 font-semibold text-highlighted">
                {{ c.map(x => pad(x.n)).join(' ') }}
              </td>
              <td class="whitespace-nowrap py-1 pr-3 text-toned">
                {{ c.map(x => x.gap).join(' ') }}
              </td>
              <td class="whitespace-nowrap py-1 pr-3 text-toned">
                {{ c.map(x => x.value).join(' ') }}
              </td>
              <td class="whitespace-nowrap py-1 pr-3 text-toned">
                {{ c.map(x => `${x.x}-${x.y}`).join(' ') }}
              </td>
              <td class="py-1 pr-3 text-right">
                {{ c.reduce((s, x) => s + x.gap, 0) }}
              </td>
              <td class="py-1 text-right">
                {{ c.reduce((s, x) => s + x.value, 0) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div
        v-if="shown < result.combos.length"
        class="text-center"
      >
        <UButton
          size="sm"
          color="neutral"
          variant="subtle"
          @click="shown += STEP"
        >
          再顯示 {{ Math.min(STEP, result.combos.length - shown) }} 組（已顯示 {{ shown }} / {{ result.combos.length.toLocaleString() }}）
        </UButton>
      </div>
    </div>
  </UCard>
</template>
