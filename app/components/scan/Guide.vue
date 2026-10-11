<script setup lang="ts">
/**
 * 「怎麼看這一頁」：用第 ① 點的真實數字，白話說明燈、說中、百分比、盤面該有（2026-10-11 使用者看不懂 % 與燈號；
 * 2026-10-12 平常改成照該期盤面算）。
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
const lowDiff = computed(() => lowRate.value - lowBase.value)
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
          2．亮了在猜什麼
        </div>
        每一點亮了，都會照這個看法<b>猜</b>一件下一期的事。① 猜的是「下一期 0~5 只開 0～2 顆」。這只是猜，準不準要看下面的百分比。
        卡片上那行大字，是這次亮燈指的對象：例如 ④ 寫「尾4」，就是這期有兩顆號碼尾數都是 4（像 14 和 34 這樣），它猜下一期會再開出尾數是 4 的號碼。
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
          4．「盤面該有」是什麼，怎麼看有沒有用
        </div>
        每一期開獎前，盤面就決定了每顆號碼開出來會帶什麼隔期、值、y。照那一期的盤面，號碼隨機開出時，
        ① 亮的那 {{ low.n }} 期，「0~5 只開 0～2 顆」本來就該有 <b>{{ lowBase }}%</b>。
        ① 實際說中 {{ lowRate }}%，<template v-if="lowDiff >= 3">
          比盤面該有多 {{ lowDiff }}，<b>代表亮燈時確實比較常說中</b>。
        </template><template v-else-if="lowDiff <= -3">
          比盤面該有少 {{ -lowDiff }}，<b>反而比較少說中</b>。
        </template><template v-else>
          <b>跟盤面該有的差不多，代表亮不亮都一樣</b>，說中只是因為那幾期的盤面本來就容易這樣。
        </template>
        ④ 也一樣：亮了說中 {{ pairRate }}%、盤面該有 {{ pairBase }}%。
        上面明顯比下面多，那一點才真的有用。
      </div>
      <div class="guide-step md:col-span-2">
        <div class="guide-no">
          5．「你的看法」和「歷史挑」
        </div>
        每一點都有兩種猜法並排：<b>你的看法</b>是照你講的規則（例如連 5 期就猜只開 0～2 顆）；
        <b>歷史挑</b>是每一期回頭查 20 年「同樣情況下一期最常比平常多發生什麼」就猜那個，只用那一期以前的資料。
        兩邊都在最下面「成績單」打分數，比的是「每 100 次比盤面該有的多中幾次」，看哪一邊比較準。
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
