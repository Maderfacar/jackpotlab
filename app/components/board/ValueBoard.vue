<script setup lang="ts">
/**
 * 下一期：每種值有幾顆號碼帶著（2026-10-12 使用者：隔期和值有關係，要能獨立看值）。
 * 同一格的號碼值一定相同 → 把盤面翻過來，依值分堆；每顆號碼一個球，堆越長 = 帶這個值的號碼越多。
 */
import type { ValueGroup } from '~/utils/wave'

defineProps<{ groups: ValueGroup[] }>()

const HEAT_CAP = 30
const TOTAL = 39

/** 值的藍底：與 /board 五顆欄「值」同一個色階 */
function valueStyle(v: number) {
  if (v === 0) return {}
  return { '--mix': `${Math.round(8 + (Math.min(v, HEAT_CAP) / HEAT_CAP) * 52)}%` }
}

const pad2 = (n: number) => String(n).padStart(2, '0')
</script>

<template>
  <section>
    <h3 class="mb-1 text-sm font-semibold">
      下一期：每種值有幾顆號碼帶著
    </h3>
    <p class="mb-3 text-xs text-muted">
      同一格裡的號碼，值一定一樣。下一期開出的值只會是下面這幾種；表上沒有的值，下一期不會出現。
    </p>
    <ul class="space-y-1.5">
      <li
        v-for="g in groups"
        :key="g.value"
        class="vb-row"
        :title="`值 ${g.value}：${g.numbers.length} 顆（39 顆裡佔 ${Math.round((g.numbers.length / TOTAL) * 100)}%），來自隔期 ${g.slots.join('、')}`"
      >
        <span
          class="vb-value"
          :style="valueStyle(g.value)"
        >值 {{ g.value }}</span>
        <span class="vb-track">
          <span class="vb-bar">
            <span
              v-for="n in g.numbers"
              :key="n"
              class="vb-chip"
            >{{ pad2(n) }}</span>
          </span>
          <span class="vb-meta">
            <b class="text-highlighted">{{ g.numbers.length }} 顆</b>
            <span class="text-muted">・隔期 {{ g.slots.join('、') }}</span>
          </span>
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.vb-row {
  display: grid;
  grid-template-columns: 3.6rem minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.vb-value {
  border-radius: 4px;
  padding: 2px 6px;
  text-align: center;
  font-weight: 600;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
  background: color-mix(in oklab, var(--heat) var(--mix, 0%), var(--ui-bg-elevated));
}
/* 每顆號碼固定寬度、不折行 → 長條長度跟顆數成正比；說明接在長條後面 */
.vb-track {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 8px;
  row-gap: 2px;
  min-width: 0;
}
.vb-bar {
  display: flex;
  flex-wrap: nowrap;
  max-width: 100%;
  overflow-x: auto;
  gap: 2px;
  padding: 2px;
  border-radius: 5px;
  background: var(--ui-bg-elevated);
}
.vb-chip {
  flex: 0 0 1.45rem;
  border-radius: 9999px;
  padding: 1px 0;
  text-align: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  background: var(--ui-bg);
  color: var(--ui-text-highlighted);
}
.vb-meta {
  white-space: nowrap;
  font-size: 11px;
}
</style>
