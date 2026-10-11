<script setup lang="ts">
/** 「連 k 期之後 → 下一期怎樣」：每列一條比例，細線 = 平常；目前在哪一列加粗 */
const SMALL_SAMPLE = 30

defineProps<{
  rows: { label: string, hit: number, n: number, highlight?: boolean }[]
  /** 平常比例 0～1 */
  base: number | null
  /** 條代表什麼，例「下一期反轉」 */
  what: string
  /** 平常指誰（例：第 2 顆），不給就只寫「平常」 */
  baseLabel?: string
}>()
const pct = (h: number, n: number) => (n ? `${Math.round((h / n) * 100)}%` : '—')
</script>

<template>
  <div class="space-y-1">
    <div class="flex justify-between text-[10px] text-muted">
      <span>{{ what }}的比例（細線 = {{ baseLabel ?? '' }}平常{{ base == null ? '' : ` ${Math.round(base * 100)}%` }}）</span>
      <span>次數</span>
    </div>
    <div
      v-for="r in rows"
      :key="r.label"
      class="grid grid-cols-[4.5rem_minmax(0,1fr)_2.5rem_3rem] items-center gap-x-2"
      :class="r.n > 0 && r.n < SMALL_SAMPLE ? 'opacity-60' : ''"
      :title="`${r.label}：${what} ${r.hit}/${r.n}${r.n < SMALL_SAMPLE ? '（樣本少）' : ''}`"
    >
      <span
        class="text-xs"
        :class="r.highlight ? 'font-semibold text-highlighted' : 'text-muted'"
      >{{ r.label }}</span>
      <span class="ru-track">
        <span
          class="ru-bar"
          :class="r.highlight ? 'ru-on' : ''"
          :style="{ width: `${r.n ? (r.hit / r.n) * 100 : 0}%` }"
        />
        <span
          v-if="base != null"
          class="ru-base"
          :style="{ left: `${base * 100}%` }"
        />
      </span>
      <span class="text-right font-mono text-xs font-semibold">{{ pct(r.hit, r.n) }}</span>
      <span class="text-right font-mono text-[11px] text-muted">{{ r.n }}</span>
    </div>
  </div>
</template>

<style scoped>
.ru-track {
  position: relative;
  height: 10px;
  border-radius: 4px;
  background: var(--viz-mid);
}
.ru-bar {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 4px;
  background: color-mix(in oklab, var(--viz-blue) 55%, var(--viz-mid));
}
.ru-on {
  background: var(--viz-orange);
}
.ru-base {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background: var(--ui-text);
}
</style>
