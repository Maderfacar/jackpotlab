<script setup lang="ts">
/** 其他跟七點同類型的查找現象（從已開出資料找到的），每條附「條件成立後 vs 平常」與本期是否符合 */
import type { ScanView } from '~~/shared/lotto/scan/view'

defineProps<{ view: ScanView }>()
</script>

<template>
  <UCard id="extra">
    <template #header>
      <h2 class="font-semibold">
        其他同類型的現象
      </h2>
      <p class="text-xs text-muted">
        照你七點的思路，在已開出的資料裡再找到的幾條。和七點一樣是查找次數，不是預測；差不多的也列出來，方便對照。
      </p>
    </template>
    <div class="overflow-x-auto">
      <table class="w-full min-w-[600px] text-sm">
        <thead class="text-xs text-muted">
          <tr class="border-b border-default">
            <th class="py-1.5 text-left font-normal">
              現象
            </th>
            <th class="py-1.5 text-left font-normal">
              條件成立後
            </th>
            <th class="py-1.5 text-left font-normal">
              本期
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in view.extras"
            :key="r.key"
            class="border-b border-default/60 align-top"
            :class="r.now ? 'bg-primary/10' : ''"
          >
            <td class="py-2 pr-3">
              <div>{{ r.label }}</div>
              <div
                v-if="r.note"
                class="text-xs text-muted"
              >
                {{ r.note }}
              </div>
            </td>
            <td class="py-2 pr-3">
              <ScanRate
                :rate="r.rate.cond"
                :base="r.noBase ? null : r.rate.base"
              />
            </td>
            <td class="py-2">
              <UBadge
                v-if="r.now"
                color="warning"
                variant="subtle"
              >
                符合
              </UBadge>
              <span
                v-else-if="r.now === false"
                class="text-xs text-muted"
              >不符合</span>
              <span
                v-else
                class="text-xs text-muted"
              >—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </UCard>
</template>
