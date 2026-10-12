<script setup lang="ts">
/**
 * 位置 y：第 1～5 顆，最近 5／10／15 期與歷史裡 y=1、2、3、4 以上各幾次
 * （2026-10-12 使用者：y 用平均看不出是 1、2 還是 3）。
 * 每列一條 100% 長條，分 4 段；這幾期比例比歷史高的段加橘框。
 * 色階：單一藍色由淺到深（dataviz validator --ordinal 亮 / 暗模式皆通過）。
 */
import { Y_BINS, type YCountRow, type YWindow } from '~/utils/wave'

defineProps<{ rows: YCountRow[] }>()

/** 段太窄放不下數字時只留滑過提示 */
const LABEL_MIN_PCT = 12

const pct = (w: YWindow, k: number) => (w.total ? (w.counts[k]! / w.total) * 100 : 0)
const rangeLabel = (w: YWindow) => (w.label === '歷史' ? '歷史' : `最近 ${w.label} 期`)

function tip(row: YCountRow, w: YWindow, hist: YWindow, k: number): string {
  const head = `${row.key}・${rangeLabel(w)}・y=${Y_BINS[k]}：${w.counts[k]} 次（${Math.round(pct(w, k))}%）`
  return w === hist ? head : `${head}；歷史 ${Math.round(pct(hist, k))}%${w.above[k] ? '，比歷史高' : ''}`
}
</script>

<template>
  <section>
    <h3 class="mb-1 text-sm font-semibold">
      位置 y：每顆最近出現哪個 y
    </h3>
    <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <span>最近 5／10／15 期都含最新一期；歷史 = 第 101 期之後全部。</span>
      <span
        v-for="(b, k) in Y_BINS"
        :key="b"
        class="flex items-center gap-1"
      >
        <span
          class="yc-swatch"
          :class="`y${k + 1}`"
        />y={{ b }}
      </span>
      <span class="flex items-center gap-1">
        <span class="yc-swatch yc-legend-above" />橘框 = 這幾期比例比歷史高
      </span>
    </div>
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <div
        v-for="row in rows"
        :key="row.key"
      >
        <div class="mb-1.5 flex items-baseline justify-between text-xs">
          <span class="font-semibold">{{ row.key }}</span>
          <span class="text-muted">最新一期 <b class="text-highlighted">y={{ row.latest }}</b></span>
        </div>
        <div class="space-y-1">
          <div
            v-for="w in row.windows"
            :key="w.label"
            class="yc-line"
          >
            <span class="yc-range">{{ rangeLabel(w) }}</span>
            <span class="yc-bar">
              <template
                v-for="(c, k) in w.counts"
                :key="k"
              >
                <span
                  v-if="c > 0"
                  class="yc-seg"
                  :class="[`y${k + 1}`, w.above[k] ? 'is-above' : '']"
                  :style="{ flexGrow: c }"
                  :title="tip(row, w, row.windows.at(-1)!, k)"
                >{{ pct(w, k) >= LABEL_MIN_PCT ? (w.label === '歷史' ? `${Math.round(pct(w, k))}%` : c) : '' }}</span>
              </template>
            </span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
section {
  --y1: #86b6ef;
  --y2: #3987e5;
  --y3: #1c5cab;
  --y4: #0d366b;
  --y1-ink: #0b0b0b;
  --y2-ink: #0b0b0b;
  --y3-ink: #ffffff;
  --y4-ink: #ffffff;
}
:global(.dark) section {
  --y1: #184f95;
  --y2: #2a78d6;
  --y3: #6da7ec;
  --y4: #b7d3f6;
  --y1-ink: #ffffff;
  --y2-ink: #0b0b0b;
  --y3-ink: #0b0b0b;
  --y4-ink: #0b0b0b;
}
.yc-line {
  display: grid;
  grid-template-columns: 4.6rem minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  font-size: 11px;
}
.yc-range {
  color: var(--ui-text-muted);
  white-space: nowrap;
}
.yc-bar {
  display: flex;
  gap: 2px;
  height: 20px;
}
.yc-seg {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 4px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  cursor: default;
}
.yc-seg:hover { outline: 2px solid var(--ui-text); outline-offset: -2px; }
.y1 { background: var(--y1); color: var(--y1-ink); }
.y2 { background: var(--y2); color: var(--y2-ink); }
.y3 { background: var(--y3); color: var(--y3-ink); }
.y4 { background: var(--y4); color: var(--y4-ink); }
.yc-seg.is-above { box-shadow: inset 0 0 0 2px var(--drawn); }
.yc-swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
}
.yc-legend-above { box-shadow: inset 0 0 0 2px var(--drawn); }
</style>
