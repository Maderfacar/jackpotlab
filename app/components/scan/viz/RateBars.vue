<script setup lang="ts">
/** 亮燈後成真 vs 平常：兩條橫條，一眼看出有沒有比平常多 */
const SMALL_SAMPLE = 30

const props = defineProps<{
  hit: number
  n: number
  /** 平常比例 0～1；null = 算不出來 */
  base: number | null
  /** 歷史挑：每期都猜、不是亮燈，用詞不同 */
  hist?: boolean
}>()

const rate = computed(() => (props.n ? props.hit / props.n : null))
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const diff = computed(() => (rate.value == null || props.base == null ? null : Math.round((rate.value - props.base) * 100)))
</script>

<template>
  <div class="space-y-1">
    <div class="flex items-center gap-2">
      <span class="w-16 shrink-0 text-[11px] text-muted">{{ hist ? '這樣猜' : '亮了之後' }}</span>
      <div class="viz-track">
        <div
          class="viz-bar viz-bar-main"
          :style="{ width: `${(rate ?? 0) * 100}%` }"
        />
      </div>
      <span class="w-10 shrink-0 text-right font-mono text-xs font-semibold text-highlighted">{{ pct(rate) }}</span>
    </div>
    <div class="flex items-center gap-2">
      <span class="w-16 shrink-0 text-[11px] text-muted">平常就有</span>
      <div class="viz-track">
        <div
          class="viz-bar viz-bar-base"
          :style="{ width: `${(base ?? 0) * 100}%` }"
        />
      </div>
      <span class="w-10 shrink-0 text-right font-mono text-xs text-muted">{{ pct(base) }}</span>
    </div>
    <div class="flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
      <span
        v-if="diff != null"
        class="font-semibold"
        :class="diff >= 3 ? 'viz-up' : diff <= -3 ? 'viz-down' : ''"
      >{{ diff >= 3 ? `每 100 次比平常多中 ${diff} 次` : diff <= -3 ? `每 100 次比平常少中 ${-diff} 次` : (hist ? '跟平常差不多，猜了等於沒猜' : '跟平常差不多，亮不亮都一樣') }}</span>
      <span>（{{ hist ? '猜過' : '亮過' }} {{ n.toLocaleString() }} 次，說中 {{ hit.toLocaleString() }} 次）</span>
      <UBadge
        v-if="n > 0 && n < SMALL_SAMPLE"
        color="warning"
        variant="subtle"
        size="sm"
      >
        次數少
      </UBadge>
    </div>
  </div>
</template>

<style scoped>
.viz-track {
  position: relative;
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: var(--viz-mid);
  overflow: hidden;
}
.viz-bar {
  height: 100%;
  border-radius: 4px;
}
.viz-bar-main {
  background: var(--viz-blue);
}
.viz-bar-base {
  background: var(--viz-gray);
}
.viz-up {
  color: var(--viz-good-text);
}
.viz-down {
  color: var(--viz-bad);
}
</style>
