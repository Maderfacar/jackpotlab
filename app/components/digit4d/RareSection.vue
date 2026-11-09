<script setup lang="ts">
/** 少見狀況通報：目前盤面上歷史不到一成的狀況，附歷史上同樣狀況之後怎麼開 */
import { FEW, RARE_SHARE, type Outcome, type RareItem } from '~~/shared/lotto/digit4d/rare'

const props = defineProps<{ items: RareItem[], nextIssue: string }>()

const rows = (i: RareItem): Outcome[] => [i.next, ...(i.within ? [i.within] : [])]
const groups = computed(() => {
  const m = new Map<string, RareItem[]>()
  for (const i of props.items) m.set(i.group, [...(m.get(i.group) ?? []), i])
  return [...m]
})
</script>

<template>
  <div class="space-y-5">
    <p class="text-sm text-muted">
      第 {{ nextIssue }} 期開獎前的盤面。列出歷史上像現在這樣（或更極端）的期數不到 {{ digitPct(RARE_SHARE, 0) }} 的狀況（一成這個標準是我補的）。
      「歷史上同樣狀況之後」只用 2007 年起到現在的期數；「平常」是不管有沒有這個狀況，所有期數發生同一件事的比例。
    </p>

    <div
      v-if="!items.length"
      class="py-10 text-center text-sm text-muted"
    >
      目前盤面沒有歷史上不到一成的狀況
    </div>

    <section
      v-for="[group, list] in groups"
      :key="group"
      class="space-y-3"
    >
      <h3 class="text-sm font-semibold">
        {{ group }}
      </h3>
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <UCard
          v-for="i in list"
          :key="i.key"
        >
          <div class="space-y-2">
            <div class="font-medium">
              {{ i.title }}
            </div>
            <div class="text-xs text-muted">
              歷史上只有 {{ digitPct(i.share) }} 的期數像現在這樣（或更極端）
            </div>
            <table class="w-full text-sm">
              <thead class="text-xs text-muted">
                <tr class="border-b border-default">
                  <th class="py-1 text-left font-normal">
                    歷史上同樣狀況之後
                  </th>
                  <th class="py-1 text-right font-normal">
                    發生
                  </th>
                  <th class="py-1 text-right font-normal">
                    平常
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="o in rows(i)"
                  :key="o.label"
                  class="border-b border-default last:border-0"
                >
                  <td class="py-1.5">
                    {{ o.label }}
                  </td>
                  <td class="py-1.5 text-right font-mono whitespace-nowrap">
                    <template v-if="o.n">
                      {{ o.hit }}／{{ o.n }} 次（{{ digitPct(o.hit / o.n) }}）
                    </template>
                    <template v-else>
                      歷史上沒有過
                    </template>
                    <UBadge
                      v-if="o.n && o.n < FEW"
                      color="neutral"
                      variant="subtle"
                      size="sm"
                      class="ml-1"
                    >
                      次數少
                    </UBadge>
                  </td>
                  <td class="py-1.5 text-right font-mono text-muted">
                    {{ digitPct(o.base) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
      </div>
    </section>
  </div>
</template>
