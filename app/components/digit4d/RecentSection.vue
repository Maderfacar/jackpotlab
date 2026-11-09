<script setup lang="ts">
/** 近 20 期逐期走勢：每個位置開出的數字／開出前是第幾新／隔期，後兩碼、後三碼隔期，樣子、和值 */
import { POS_LABELS, SHAPE_LABELS, type DrawStep } from '~~/shared/lotto/digit4d/state'

const props = defineProps<{ steps: DrawStep[] }>()
const SIZE = 20
const rows = computed(() => props.steps.slice(-SIZE).reverse())
const gapText = (g: number | null) => (g == null ? '首次' : String(g))
</script>

<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <div class="overflow-x-auto">
      <table class="w-full min-w-[860px] text-sm">
        <thead class="text-xs text-muted">
          <tr class="border-b border-default">
            <th class="px-3 py-2 text-left font-normal">
              期
            </th>
            <th class="px-3 py-2 text-left font-normal">
              開出
            </th>
            <th
              v-for="p in POS_LABELS"
              :key="p"
              class="px-3 py-2 text-center font-normal"
            >
              {{ p }}<br><span class="text-[10px]">數字／第幾新／隔期</span>
            </th>
            <th class="px-3 py-2 text-right font-normal">
              後兩碼隔期
            </th>
            <th class="px-3 py-2 text-right font-normal">
              後三碼隔期
            </th>
            <th class="px-3 py-2 text-left font-normal">
              樣子
            </th>
            <th class="px-3 py-2 text-right font-normal">
              和值
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in rows"
            :key="s.issue"
            class="border-b border-default last:border-0"
          >
            <td class="px-3 py-1.5">
              <div class="font-mono">
                {{ Number(s.issue) % 1000 }}
              </div>
              <div class="text-[11px] text-muted">
                {{ s.date.slice(5) }}
              </div>
            </td>
            <td class="px-3 py-1.5 font-mono text-base font-semibold tracking-widest">
              {{ s.digits.join('') }}
            </td>
            <td
              v-for="(h, p) in s.pos"
              :key="p"
              class="px-3 py-1.5 text-center font-mono"
            >
              {{ h.digit }}<span class="text-muted">／{{ h.rank }}／{{ gapText(h.gap) }}</span>
            </td>
            <td class="px-3 py-1.5 text-right font-mono">
              {{ gapText(s.levelGap[1]!) }}
            </td>
            <td class="px-3 py-1.5 text-right font-mono">
              {{ gapText(s.levelGap[2]!) }}
            </td>
            <td class="px-3 py-1.5">
              {{ SHAPE_LABELS[s.shape] }}
            </td>
            <td class="px-3 py-1.5 text-right font-mono">
              {{ s.sum }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </UCard>
</template>
