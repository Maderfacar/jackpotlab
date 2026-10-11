<script setup lang="ts">
/**
 * 「怎麼看這一頁」：用第 ① 點的真實數字，白話說明燈、說中、百分比、平常（2026-10-11 使用者看不懂 % 與燈號）。
 * 數字全部來自 summary，不寫死。
 */
import type { PointSummary } from '~~/shared/lotto/scan/points/stats'

const props = defineProps<{
  low: PointSummary
  pair: PointSummary
}>()
const pct = (h: number, n: number) => (n ? Math.round((h / n) * 100) : 0)
const lowRate = computed(() => pct(props.low.hit, props.low.n))
const lowBase = computed(() => Math.round((props.low.base ?? 0) * 100))
const pairRate = computed(() => pct(props.pair.hit, props.pair.n))
const pairBase = computed(() => Math.round((props.pair.base ?? 0) * 100))
</script>

<template>
  <details
    class="guide"
    open
  >
    <summary class="cursor-pointer text-sm font-semibold">
      怎麼看這一頁？（點這行可以收起來）
    </summary>
    <div class="mt-3 grid gap-3 text-sm leading-relaxed md:grid-cols-2">
      <div class="guide-step">
        <div class="guide-no">
          1．燈是什麼
        </div>
        每一點都有一個條件。拿 ① 來說，條件是「連續 5 期，每期都有 3～4 顆從隔期 0~5 開出來」。
        這期<b>真的發生了，燈就亮</b>（橘色）；沒發生，燈就暗（灰色）。
        燈亮只代表「這個情況出現了」，<b>不代表一定會中</b>。紅色的燈是「亮得很強」，例如 ② 連 3 次以上。
      </div>
      <div class="guide-step">
        <div class="guide-no">
          2．亮了在說什麼
        </div>
        每一點亮了，都在說「下一期會怎樣」。① 說的是「下一期 0~5 只會開 0～2 顆」。
        卡片上那行大字，是這次亮燈指的對象：例如 ④ 寫「尾4」，就是這期有兩顆號碼尾數都是 4（像 14 和 34 這樣），它說下一期會再開出尾數是 4 的號碼。
      </div>
      <div class="guide-step">
        <div class="guide-no">
          3．百分比是什麼
        </div>
        我們回頭查 20 年。① 一共亮過 <b>{{ low.n }}</b> 次，亮完之後下一期真的說中的有 <b>{{ low.hit }}</b> 次。
        {{ low.hit }} ÷ {{ low.n }} ≈ <b>{{ lowRate }}%</b>，意思是<b>每亮 100 次，大約有 {{ lowRate }} 次說中</b>。
      </div>
      <div class="guide-step">
        <div class="guide-no">
          4．「平常」是什麼，怎麼看有沒有用
        </div>
        不管燈有沒有亮、隨便挑一期，下一期 0~5 只開 0～2 顆本來就有 <b>{{ lowBase }}%</b>（每 100 期約 {{ lowBase }} 期）。
        ① 亮的時候是 {{ lowRate }}%，比平常多 {{ lowRate - lowBase }}，<b>代表亮燈時確實比較常說中</b>。
        反過來，④ 亮了說中 {{ pairRate }}%、平常也是 {{ pairBase }}%，<b>差不多就代表亮不亮都一樣</b>，這一點幫不上忙。
      </div>
    </div>
  </details>
</template>

<style scoped>
.guide {
  border-radius: 0.75rem;
  padding: 0.85rem 1rem;
  border: 1px dashed var(--ui-border-accented);
  background: var(--ui-bg-elevated);
}
.guide-step {
  border-radius: 0.5rem;
  padding: 0.6rem 0.75rem;
  background: var(--ui-bg);
}
.guide-no {
  margin-bottom: 0.25rem;
  font-weight: 700;
  color: var(--viz-orange-text);
}
</style>
