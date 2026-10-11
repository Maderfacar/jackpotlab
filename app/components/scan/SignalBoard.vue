<script setup lang="ts">
/**
 * 八點燈號板：每一點並排「你的看法」（亮了沒、猜什麼）和「歷史挑」（照 20 年同樣情況挑的猜法），
 * 各自附 20 年說中幾成 vs 平常；最新一期兩邊都可以按「我信」。
 */
import type { PointEval, PointKey } from '~~/shared/lotto/scan/points/evaluate'
import { pickKey, type PickKey, type PointMeta } from '~~/shared/lotto/scan/points/meta'
import type { PointSummary } from '~~/shared/lotto/scan/points/stats'

defineProps<{
  tiles: { meta: PointMeta, now: PointEval, summary: PointSummary, picked: boolean, hNow: PointEval, hSummary: PointSummary, hPicked: boolean }[]
  canPick: boolean
  hasNext: boolean
  pickError: string
}>()
const emit = defineEmits<{ toggle: [key: PickKey], jump: [key: PointKey] }>()
</script>

<template>
  <section class="space-y-3">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="text-lg font-semibold">
        八點燈號
      </h2>
      <span class="text-xs text-muted">
        {{ canPick ? '你的看法、歷史挑，你相信哪個就按「我信」（記在這台裝置），下一期開出後自動對答案' : hasNext ? '下一期已經開出：✓ 說中、✗ 沒說中' : '' }}
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
        :class="tile.now.lit ? 'sb-lit' : ''"
      >
        <button
          type="button"
          class="w-full text-left text-sm font-semibold hover:underline"
          @click="emit('jump', tile.meta.key)"
        >
          {{ tile.meta.no }} {{ tile.meta.name }}
        </button>

        <!-- 你的看法 -->
        <div class="sb-part">
          <div class="flex items-center justify-between gap-2">
            <span class="flex items-center gap-1.5 text-xs font-semibold">
              <span
                class="sb-lamp"
                :class="tile.now.lit ? (tile.now.strong ? 'sb-lamp-strong' : 'sb-lamp-on') : ''"
              />你的看法
            </span>
            <span
              v-if="tile.now.lit && tile.now.hit != null"
              class="sb-result"
              :class="tile.now.hit ? 'sb-ok' : 'sb-no'"
            ><UIcon :name="tile.now.hit ? 'i-lucide-check' : 'i-lucide-x'" />{{ tile.now.hit ? '說中' : '沒說中' }}</span>
          </div>
          <template v-if="tile.meta.claim === '—'">
            <div class="text-xs text-muted">
              {{ tile.meta.when }}
            </div>
          </template>
          <template v-else>
            <div
              v-if="tile.now.lit"
              class="text-sm"
            >
              <b class="text-highlighted">{{ tile.now.target }}</b><span
                v-if="tile.now.strong"
                class="ml-1 text-xs"
              >（強）</span>
              <span class="text-xs text-muted"> → 猜：{{ tile.meta.claim }}</span>
            </div>
            <div
              v-else
              class="text-xs text-muted"
            >
              沒亮：這期沒有出現「{{ tile.meta.when }}」
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
              @click="emit('toggle', pickKey(tile.meta.key, false))"
            >
              {{ tile.picked ? '我信（再按取消）' : '我信' }}
            </UButton>
            <div
              v-else-if="tile.picked"
              class="text-xs font-medium text-primary"
            >
              你按了「我信」
            </div>
          </template>
        </div>

        <!-- 歷史挑 -->
        <div class="sb-part sb-hist">
          <div class="flex items-center justify-between gap-2">
            <span class="flex items-center gap-1.5 text-xs font-semibold">
              <UIcon
                name="i-lucide-history"
                class="sb-hist-icon"
              />歷史挑
            </span>
            <span
              v-if="tile.hNow.lit && tile.hNow.hit != null"
              class="sb-result"
              :class="tile.hNow.hit ? 'sb-ok' : 'sb-no'"
            ><UIcon :name="tile.hNow.hit ? 'i-lucide-check' : 'i-lucide-x'" />{{ tile.hNow.hit ? '說中' : '沒說中' }}</span>
          </div>
          <div
            v-if="tile.hNow.lit"
            class="text-sm"
          >
            <span class="text-xs text-muted">猜：</span><b class="text-highlighted">{{ tile.hNow.target }}</b>
          </div>
          <div
            v-else
            class="text-xs text-muted"
          >
            這期挑不出來
          </div>
          <ScanVizRateBars
            :hit="tile.hSummary.hit"
            :n="tile.hSummary.n"
            :base="tile.hSummary.base"
            hist
          />
          <UButton
            v-if="canPick && tile.hNow.lit"
            size="xs"
            :color="tile.hPicked ? 'primary' : 'neutral'"
            :variant="tile.hPicked ? 'solid' : 'outline'"
            :icon="tile.hPicked ? 'i-lucide-check' : 'i-lucide-plus'"
            block
            @click="emit('toggle', pickKey(tile.meta.key, true))"
          >
            {{ tile.hPicked ? '我信（再按取消）' : '我信' }}
          </UButton>
          <div
            v-else-if="tile.hPicked"
            class="text-xs font-medium text-primary"
          >
            你按了「我信」
          </div>
        </div>
      </div>
    </div>
    <div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
      <span class="flex items-center gap-1"><span class="sb-lamp sb-lamp-on" />亮燈</span>
      <span class="flex items-center gap-1"><span class="sb-lamp sb-lamp-strong" />亮得強</span>
      <span class="flex items-center gap-1"><span class="sb-lamp" />沒亮</span>
      <span class="flex items-center gap-1"><UIcon
        name="i-lucide-history"
        class="sb-hist-icon"
      />歷史挑＝照 20 年同樣情況挑的猜法</span>
      <span>兩條線：上＝20 年來每亮 100 次說中幾次，下＝不管亮不亮、每 100 期本來就有幾次。上面明顯比下面長，這一點才有用</span>
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
.sb-part {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.sb-hist {
  border-top: 1px dashed var(--ui-border-accented);
  padding-top: 0.6rem;
}
.sb-hist-icon {
  color: var(--viz-blue);
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
