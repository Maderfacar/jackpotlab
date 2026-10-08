<script setup lang="ts">
/** ③ 同一球位（第幾顆，號碼小→大）的隔期：連 2～3 期 > 5（或 > 10）之後，下一期該球位回到 0～5 的次數 */
import type { ScanView } from '~~/shared/lotto/scan/view'

const props = defineProps<{ view: ScanView }>()
const st = computed(() => props.view.streak)

const POS = ['第1球', '第2球', '第3球', '第4球', '第5球']
const tint = (g: number) => (g <= 5 ? 12 : g <= 9 ? 38 : 70)
/** 第 p 球在最近第 j 欄（由舊到新）是否屬於「目前還在持續」的 > 5 連續段 */
const inStreak = (p: number, j: number) => {
  const cur = st.value.positions[p]!.cur5
  return cur >= 2 && j >= st.value.grid.length - cur
}
const nowMatches = (p: number, k: number, th: number) => {
  const pos = st.value.positions[p]!
  return (th === 5 ? pos.cur5 : pos.cur10) >= k
}
</script>

<template>
  <UCard id="p3">
    <template #header>
      <h2 class="font-semibold">
        ③ 同一球位的隔期
      </h2>
      <p class="text-xs text-muted">
        球位 = 該期號碼由小到大的第幾顆。格子是該期那顆的隔期；框起來的是「目前還在連續 > 5」的期數。
      </p>
    </template>
    <div class="space-y-5">
      <div class="overflow-x-auto">
        <table class="text-xs">
          <thead>
            <tr>
              <th class="pr-2 text-left font-normal text-muted">
                球位 \ 期別
              </th>
              <th
                v-for="c in st.grid"
                :key="c.issue"
                class="px-0.5 text-center font-mono font-normal text-dimmed"
              >
                {{ scanShortIssue(c.issue) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in 5"
              :key="p"
            >
              <th class="whitespace-nowrap pr-2 text-left font-normal">
                {{ POS[p - 1] }}
              </th>
              <td
                v-for="(c, j) in st.grid"
                :key="c.issue"
                class="p-0.5"
              >
                <div
                  class="flex h-7 w-7 items-center justify-center rounded font-mono"
                  :class="inStreak(p - 1, j) ? 'ring-2 ring-[var(--scan-orange)]' : ''"
                  :style="{ background: `color-mix(in oklab, var(--scan-blue) ${tint(c.gaps[p - 1]!)}%, var(--ui-bg))` }"
                  :title="`第 ${c.issue} 期 ${POS[p - 1]} 隔期 ${c.gaps[p - 1]}`"
                >
                  {{ c.gaps[p - 1] }}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span class="flex items-center gap-1"><span class="size-3 rounded-sm bg-[color-mix(in_oklab,var(--scan-blue)_12%,var(--ui-bg))]" />隔期 0～5</span>
        <span class="flex items-center gap-1"><span class="size-3 rounded-sm bg-[color-mix(in_oklab,var(--scan-blue)_38%,var(--ui-bg))]" />6～9</span>
        <span class="flex items-center gap-1"><span class="size-3 rounded-sm bg-[color-mix(in_oklab,var(--scan-blue)_70%,var(--ui-bg))]" />10 以上</span>
      </div>

      <div class="space-y-2">
        <h3 class="text-sm font-semibold">
          連續隔期偏大之後，下一期該球位回到 0～5
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[640px] text-sm">
            <thead class="text-xs text-muted">
              <tr class="border-b border-default">
                <th class="py-1.5 text-left font-normal">
                  條件
                </th>
                <th
                  v-for="p in 5"
                  :key="p"
                  class="py-1.5 text-left font-normal"
                >
                  {{ POS[p - 1] }}
                </th>
                <th class="py-1.5 text-left font-normal">
                  五個球位合計
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(r, i) in st.pooled"
                :key="i"
                class="border-b border-default/60 align-top"
              >
                <td class="py-2 pr-2 whitespace-nowrap">
                  連 {{ r.k }} 期 &gt; {{ r.th }}
                </td>
                <td
                  v-for="p in 5"
                  :key="p"
                  class="py-2 pr-2"
                  :class="nowMatches(p - 1, r.k, r.th) ? 'bg-primary/10' : ''"
                >
                  <ScanRate :rate="st.positions[p - 1]!.rules[i]!.rate.cond" />
                </td>
                <td class="py-2">
                  <ScanRate
                    :rate="r.rate.cond"
                    :base="r.rate.base"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-xs text-muted">
          底色 = 本期正好符合這個條件的球位。「平常」= 不加條件時，下一期隔期落在 0～5 的比例。
        </p>
      </div>
    </div>
  </UCard>
</template>
