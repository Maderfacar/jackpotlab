<script setup lang="ts">
/**
 * 近期波段一張卡（一個 y 或一個值）。文字全部來自 recentWaveText，和對話中的回答同一套。
 * 上方小格 = 最近 W 期每期幾顆（虛線框那期在下一期開完會移出 W 期範圍）。
 * 「下一期開完」是依目前盤面推估的部分，用琥珀色底標示。
 */
import type { RecentWave, Zone } from '~/utils/recent-wave'
import { recentWaveText, shortIssue, unitName } from '~/utils/recent-wave-text'

const props = defineProps<{ wave: RecentWave }>()

const sections = computed(() => recentWaveText(props.wave))
const ZONE_BADGE: Record<Zone, { label: string, color: 'warning' | 'neutral' | 'info' }> = {
  高: { label: '高波段', color: 'warning' },
  中: { label: '中間', color: 'neutral' },
  低: { label: '低波段', color: 'info' }
}
const zone = computed(() => ZONE_BADGE[props.wave.zone])
/** 小格只畫最近 W 期 */
const cells = computed(() => props.wave.recent.slice(-props.wave.w))
const maxCount = computed(() => Math.max(1, ...cells.value.map(c => c.count)))

/** 「**字**」→ 粗體 */
function parts(line: string): { text: string, bold: boolean }[] {
  return line.split('**').map((text, i) => ({ text, bold: i % 2 === 1 })).filter(p => p.text !== '')
}
</script>

<template>
  <UCard :ui="{ body: 'space-y-4' }">
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <div>
          <h3 class="text-base font-semibold">
            {{ unitName(wave) }}
          </h3>
          <p class="text-xs text-muted">
            今年平均每期 {{ wave.mean.toFixed(2) }} 顆・看 {{ wave.w }} 期合計（高 ≥{{ wave.hi }}、低 ≤{{ wave.lo }}）
          </p>
        </div>
        <UBadge
          :color="zone.color"
          variant="subtle"
          size="lg"
        >
          {{ zone.label }}・{{ wave.window.sum }} 顆
        </UBadge>
      </div>
    </template>

    <div>
      <div class="flex flex-wrap gap-1">
        <div
          v-for="(c, i) in cells"
          :key="c.issue"
          class="wc-cell"
          :class="{ 'wc-drop': i === 0 }"
          :style="{ '--fill': c.count / maxCount }"
          :title="`${shortIssue(c.issue)} 期：${c.count} 顆${i === 0 ? '（下一期開完會移出）' : ''}`"
        >
          <span>{{ c.count || '' }}</span>
        </div>
        <div
          class="wc-cell wc-next"
          :title="`${shortIssue(wave.next.issue)} 期還沒開`"
        >
          ?
        </div>
      </div>
      <p class="mt-1 text-[11px] text-muted">
        {{ shortIssue(wave.window.from) }}～{{ shortIssue(wave.window.to) }} 期每期幾顆；虛線框那期下一期開完會移出，「?」是 {{ shortIssue(wave.next.issue) }} 期
      </p>
    </div>

    <section
      v-for="s in sections"
      :key="s.title"
      :class="s.forecast ? 'wc-forecast' : ''"
    >
      <h4
        class="mb-1 text-xs font-semibold tracking-wide"
        :class="s.forecast ? 'text-amber-700 dark:text-amber-300' : 'text-muted'"
      >
        {{ s.title }}<span v-if="s.forecast">・依目前盤面推估</span>
      </h4>
      <p
        v-for="(line, li) in s.lines"
        :key="`l${li}`"
        class="text-sm leading-relaxed"
      >
        <template
          v-for="(p, pi) in parts(line)"
          :key="pi"
        >
          <strong v-if="p.bold">{{ p.text }}</strong>
          <template v-else>
            {{ p.text }}
          </template>
        </template>
      </p>
      <ul
        v-if="s.bullets.length"
        class="mt-1 list-disc space-y-0.5 pl-5 text-sm leading-relaxed"
      >
        <li
          v-for="(b, bi) in s.bullets"
          :key="`b${bi}`"
        >
          {{ b }}
        </li>
      </ul>
      <p
        v-for="(line, ai) in s.after"
        :key="`a${ai}`"
        class="mt-1 text-sm font-semibold leading-relaxed"
      >
        {{ line }}
      </p>
    </section>
  </UCard>
</template>

<style scoped>
.wc-cell {
  --fill: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.375rem;
  height: 1.375rem;
  border-radius: 0.25rem;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  background: color-mix(in oklab, var(--ui-primary) calc(var(--fill) * 85%), var(--ui-bg-elevated));
  color: var(--ui-text-highlighted);
}
.wc-drop {
  outline: 2px dashed var(--ui-text-muted);
  outline-offset: 1px;
}
.wc-next {
  border: 1px dashed var(--ui-color-warning-500);
  background: transparent;
  color: var(--ui-color-warning-500);
}
.wc-forecast {
  border-left: 4px solid var(--ui-color-warning-400);
  background: color-mix(in oklab, var(--ui-color-warning-500) 10%, transparent);
  color: var(--ui-color-warning-800);
  padding: 0.625rem 0.75rem;
  border-radius: 0 0.375rem 0.375rem 0;
}
:root.dark .wc-forecast,
.dark .wc-forecast {
  color: var(--ui-color-warning-200);
}
</style>
