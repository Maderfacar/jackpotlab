<script setup lang="ts">
/** ④ 位置 y：y=2～5 多久出現一次（整組任一顆 / 各球位），平均間隔、最長間隔、目前已隔幾期 */
import type { ScanView } from '~~/shared/lotto/scan/view'

const props = defineProps<{ view: ScanView }>()
const yv = computed(() => props.view.yInt)

const COLS = ['整組', '第1球', '第2球', '第3球', '第4球', '第5球']

interface Cell { count: number, mean: number | null, max: number | null, current: number | null }
const cellsOf = (row: { whole: Cell, per: Cell[] }) => [row.whole, ...row.per]
const tone = (c: Cell) => {
  if (c.current == null || c.mean == null) return 'text-muted'
  if (c.max != null && c.current >= c.max) return 'text-error font-bold'
  if (c.current > c.mean) return 'text-warning font-semibold'
  return 'text-highlighted'
}
</script>

<template>
  <UCard id="p4">
    <template #header>
      <h2 class="font-semibold">
        ④ 位置 y 的間隔
      </h2>
      <p class="text-xs text-muted">
        y = 這顆在來源那期剩餘號碼裡排第幾小。間隔 = 兩次出現相隔幾期（下一期就再出現 = 1）。
        本期五顆的 y：<span class="font-mono">{{ yv.ys.map(y => y ?? '—').join(' ') }}</span>
      </p>
    </template>
    <div class="space-y-2">
      <div class="overflow-x-auto">
        <table class="w-full min-w-[680px] text-sm">
          <thead class="text-xs text-muted">
            <tr class="border-b border-default">
              <th class="py-1.5 text-left font-normal" />
              <th
                v-for="c in COLS"
                :key="c"
                class="py-1.5 text-left font-normal"
              >
                {{ c }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in yv.rows"
              :key="row.y"
              class="border-b border-default/60 align-top"
            >
              <th class="py-2 pr-2 text-left font-mono font-semibold">
                y={{ row.y }}
              </th>
              <td
                v-for="(c, i) in cellsOf(row)"
                :key="i"
                class="py-2 pr-2"
              >
                <template v-if="c.count > 0">
                  <div
                    class="font-mono text-base"
                    :class="tone(c)"
                  >
                    已隔 {{ c.current }}
                  </div>
                  <div class="font-mono text-[11px] leading-snug text-muted">
                    平均 {{ c.mean != null ? c.mean.toFixed(1) : '—' }}・最長 {{ c.max ?? '—' }}
                  </div>
                  <div class="font-mono text-[11px] leading-snug text-dimmed">
                    出現 {{ c.count }} 次
                    <UBadge
                      v-if="c.count < 10"
                      color="warning"
                      variant="subtle"
                      size="sm"
                    >
                      樣本少
                    </UBadge>
                  </div>
                </template>
                <span
                  v-else
                  class="text-xs text-muted"
                >還沒出現過</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-xs text-muted">
        <span class="text-warning">橘字</span> = 目前已隔期數超過平均間隔；<span class="text-error">紅字</span> = 已達到或超過統計範圍內的最長間隔。
      </p>
    </div>
  </UCard>
</template>
