<script setup lang="ts">
/** 目前盤面：四個位置各自 10 個數字照第幾新排；後兩碼／後三碼／四碼各層的格子；不分位置的數字 */
import type { Board } from '~~/shared/lotto/digit4d/board'
import { LEVELS, POS_LABELS, boxLabel } from '~~/shared/lotto/digit4d/state'

defineProps<{ board: Board }>()

const levelLabel = (k: number) => LEVELS[k - 1]!.label
const levelPrize = (k: number) => LEVELS[k - 1]!.prize
</script>

<template>
  <div class="space-y-5">
    <p class="text-sm text-muted">
      每個位置的 10 個數字照最近開出的先後排：第 0 新 = 上一期開出的那個。隔期 = 這個數字在這個位置幾期沒開出；名次的值 = 這個名次連續幾期沒被開到。
    </p>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <UCard
        v-for="(rows, p) in board.positions"
        :key="p"
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <template #header>
          <div class="font-semibold">
            {{ POS_LABELS[p] }}
          </div>
        </template>
        <table class="w-full text-sm">
          <thead class="text-xs text-muted">
            <tr class="border-b border-default">
              <th class="px-3 py-2 text-left font-normal">
                第幾新
              </th>
              <th class="px-3 py-2 text-center font-normal">
                數字
              </th>
              <th class="px-3 py-2 text-right font-normal">
                隔期
              </th>
              <th class="px-3 py-2 text-right font-normal">
                名次的值
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in rows"
              :key="r.rank"
              class="border-b border-default last:border-0"
            >
              <td class="px-3 py-1.5 text-muted">
                第 {{ r.rank }} 新
              </td>
              <td class="px-3 py-1.5 text-center">
                <span class="inline-flex size-7 items-center justify-center rounded-full bg-amber-400 font-mono font-semibold text-amber-950">{{ r.digit }}</span>
              </td>
              <td class="px-3 py-1.5 text-right font-mono">
                {{ r.gap }}
              </td>
              <td class="px-3 py-1.5 text-right font-mono">
                {{ r.rankValue ?? '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </UCard>
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <UCard
        v-for="l in board.levels"
        :key="l.k"
      >
        <template #header>
          <div class="flex items-baseline justify-between gap-2">
            <span class="font-semibold">{{ levelLabel(l.k) }}</span>
            <span class="text-xs text-muted">中了 {{ levelPrize(l.k) }}・{{ l.size.toLocaleString() }} 格裡開過 {{ l.seen.toLocaleString() }} 格</span>
          </div>
        </template>
        <div
          v-if="l.k === 4"
          class="text-sm text-muted"
        >
          四碼共 10,000 組，2007 年起只開過 {{ l.seen.toLocaleString() }} 組，大部分一組都還沒開過，這一層看隔期派不上用場，主要看上面三層怎麼接。
        </div>
        <div
          v-else
          class="grid grid-cols-2 gap-4 text-sm"
        >
          <div>
            <div class="mb-1 text-xs text-muted">
              最久沒開
            </div>
            <div
              v-for="b in l.longest"
              :key="b.box"
              class="flex justify-between font-mono"
            >
              <span>{{ boxLabel(b.box, l.k) }}</span>
              <span class="text-muted">{{ b.gap == null ? '2007 起沒開過' : `${b.gap} 期` }}</span>
            </div>
          </div>
          <div>
            <div class="mb-1 text-xs text-muted">
              最近開出
            </div>
            <div
              v-for="b in l.recent"
              :key="b.box"
              class="flex justify-between font-mono"
            >
              <span>{{ boxLabel(b.box, l.k) }}</span>
              <span class="text-muted">{{ b.gap }} 期前</span>
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-baseline justify-between gap-2">
          <span class="font-semibold">不分位置（參考）</span>
          <span class="text-xs text-muted">四碼裡任何一位出現過就算；對獎看位置，這裡只當參考</span>
        </div>
      </template>
      <div class="flex flex-wrap gap-3">
        <div
          v-for="x in board.anyDigit"
          :key="x.digit"
          class="flex flex-col items-center gap-0.5"
        >
          <span class="inline-flex size-8 items-center justify-center rounded-full bg-amber-400 font-mono font-semibold text-amber-950">{{ x.digit }}</span>
          <span class="text-[11px] text-muted">隔期 {{ x.gap }}</span>
        </div>
      </div>
    </UCard>
  </div>
</template>
