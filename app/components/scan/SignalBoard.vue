<script setup lang="ts">
/** 八點燈號板：一眼看這期哪幾點亮、亮了說什麼、歷史上亮燈後成真幾成；最新一期可勾「我信」 */
import type { PointEval, PointKey } from '~~/shared/lotto/scan/points/evaluate'
import type { PointMeta } from '~~/shared/lotto/scan/points/meta'
import type { PointSummary } from '~~/shared/lotto/scan/points/stats'

defineProps<{
  tiles: { meta: PointMeta, now: PointEval, summary: PointSummary, picked: boolean }[]
  canPick: boolean
  hasNext: boolean
  pickError: string
}>()
const emit = defineEmits<{ toggle: [key: PointKey], jump: [key: PointKey] }>()
</script>

<template>
  <section class="space-y-3">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="text-lg font-semibold">
        八點燈號
      </h2>
      <span class="text-xs text-muted">
        {{ canPick ? '亮了的點，你相信就按「我信」（記在這台裝置），下一期開出後自動對答案' : hasNext ? '下一期已經開出：✓ 說中、✗ 沒說中' : '' }}
      </span>
    </div>
    <UAlert
      v-if="pickError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="pickError"
    />
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div
        v-for="tile in tiles"
        :key="tile.meta.key"
        class="sb-tile"
        :class="tile.now.lit ? 'sb-lit' : 'sb-dark'"
      >
        <button
          type="button"
          class="flex w-full items-start justify-between gap-2 text-left"
          @click="emit('jump', tile.meta.key)"
        >
          <span class="flex items-center gap-2">
            <span
              class="sb-lamp"
              :class="tile.now.lit ? (tile.now.strong ? 'sb-lamp-strong' : 'sb-lamp-on') : ''"
            />
            <span class="text-sm font-semibold">{{ tile.meta.no }} {{ tile.meta.name }}</span>
          </span>
          <span
            v-if="tile.now.lit && tile.now.hit != null"
            class="sb-result"
            :class="tile.now.hit ? 'sb-ok' : 'sb-no'"
          >
            <UIcon :name="tile.now.hit ? 'i-lucide-check' : 'i-lucide-x'" />{{ tile.now.hit ? '說中' : '沒說中' }}
          </span>
        </button>

        <div
          v-if="tile.now.lit"
          class="space-y-0.5"
        >
          <div class="text-sm font-medium text-highlighted">
            {{ tile.now.target }}<span
              v-if="tile.now.strong"
              class="ml-1 text-xs"
            >（強）</span>
          </div>
          <div class="text-xs text-muted">
            → {{ tile.meta.claim }}
          </div>
        </div>
        <div
          v-else
          class="text-xs text-muted"
        >
          沒亮
        </div>

        <ScanVizRateBars
          :hit="tile.summary.hit"
          :n="tile.summary.n"
          :base="tile.summary.base"
        />

        <UButton
          v-if="canPick && tile.now.lit"
          size="xs"
          :color="tile.picked ? 'primary' : 'neutral'"
          :variant="tile.picked ? 'solid' : 'outline'"
          :icon="tile.picked ? 'i-lucide-check' : 'i-lucide-plus'"
          block
          @click="emit('toggle', tile.meta.key)"
        >
          {{ tile.picked ? '我信（再按取消）' : '我信' }}
        </UButton>
        <div
          v-else-if="tile.picked"
          class="text-xs font-medium text-primary"
        >
          你按了「我信」
        </div>
      </div>
    </div>
    <div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
      <span class="flex items-center gap-1"><span class="sb-lamp sb-lamp-on" />亮燈</span>
      <span class="flex items-center gap-1"><span class="sb-lamp sb-lamp-strong" />亮得強</span>
      <span class="flex items-center gap-1"><span class="sb-lamp" />沒亮</span>
      <span>兩條線：上＝20 年來亮了之後真的說中幾成，下＝不管亮不亮本來就有幾成。上面明顯比下面長，這一點才有用</span>
    </div>
  </section>
</template>

<style scoped>
.sb-tile {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  border-radius: 0.75rem;
  padding: 0.85rem;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
  transition: border-color 150ms, box-shadow 150ms;
}
.sb-lit {
  border-color: color-mix(in oklab, var(--viz-orange) 55%, var(--ui-border));
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--viz-orange) 25%, transparent), 0 6px 18px -10px color-mix(in oklab, var(--viz-orange) 60%, transparent);
}
.sb-dark {
  opacity: 0.72;
}
.sb-tile:hover {
  opacity: 1;
}
.sb-lamp {
  display: inline-block;
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 9999px;
  background: var(--viz-mid);
  box-shadow: inset 0 0 0 1px var(--ui-border-accented);
}
.sb-lamp-on {
  background: var(--viz-orange);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--viz-orange) 25%, transparent);
}
.sb-lamp-strong {
  background: var(--viz-red);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--viz-red) 30%, transparent), 0 0 10px var(--viz-red);
}
.sb-result {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  border-radius: 9999px;
  padding: 1px 8px 1px 6px;
  font-size: 11px;
  font-weight: 600;
}
.sb-ok {
  color: var(--viz-good-text);
  background: color-mix(in oklab, var(--viz-good) 15%, transparent);
}
.sb-no {
  color: var(--viz-bad);
  background: color-mix(in oklab, var(--viz-bad) 12%, transparent);
}
</style>
