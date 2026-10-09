<script setup lang="ts">
/** 條件清單：每條一個勾選框，句子裡的數字可以直接改；回看過去期別時，旁邊標出下一期實際開出的號碼有沒有過這條 */
import { KIND_SPEC, type Condition } from '~~/shared/lotto/filter/conditions'

const props = defineProps<{
  /** 下一期實際開出時，各條件有沒有通過（id → true/false）；最新一期沒有下一期 = null */
  actualPass: Record<string, boolean> | null
}>()
const conds = defineModel<Condition[]>({ required: true })
const emit = defineEmits<{ reset: [] }>()

const NUMBERS = Array.from({ length: 39 }, (_, i) => i + 1)

function setParam(ci: number, pi: number, raw: string | number) {
  const v = Math.trunc(Number(raw))
  if (!Number.isFinite(v)) return
  conds.value = conds.value.map((c, i) => (i === ci ? { ...c, p: c.p.map((x, j) => (j === pi ? v : x)) } : c))
}
function setEnabled(ci: number, on: boolean) {
  conds.value = conds.value.map((c, i) => (i === ci ? { ...c, enabled: on } : c))
}
function toggleNum(ci: number, n: number) {
  conds.value = conds.value.map((c, i) => {
    if (i !== ci) return c
    const nums = c.nums ?? []
    return { ...c, nums: nums.includes(n) ? nums.filter(x => x !== n) : [...nums, n].sort((a, b) => a - b) }
  })
}
const enabledCount = computed(() => conds.value.filter(c => c.enabled).length)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <div>
          <h2 class="font-semibold">
            條件（已勾 {{ enabledCount }} / {{ conds.length }}）
          </h2>
          <p class="text-xs text-muted">
            勾掉就不套用；數字可以直接改。「大於 / 小於」不含本身，「介於」含兩端。
          </p>
        </div>
        <UButton
          size="xs"
          color="neutral"
          variant="subtle"
          icon="i-lucide-rotate-ccw"
          @click="emit('reset')"
        >
          恢復預設
        </UButton>
      </div>
    </template>

    <ol class="space-y-2.5">
      <li
        v-for="(c, ci) in conds"
        :key="c.id"
        class="flex items-start gap-2.5"
      >
        <UCheckbox
          :model-value="c.enabled"
          class="mt-1"
          :aria-label="`啟用第 ${ci + 1} 條`"
          @update:model-value="(v: boolean | 'indeterminate') => setEnabled(ci, v === true)"
        />
        <div
          class="min-w-0 flex-1 text-sm leading-8"
          :class="c.enabled ? '' : 'text-dimmed'"
        >
          <span class="mr-1 font-mono text-xs text-muted">{{ ci + 1 }}.</span>
          <template
            v-for="(seg, si) in KIND_SPEC[c.kind]"
            :key="si"
          >
            <span v-if="typeof seg === 'string'">{{ seg }}</span>
            <input
              v-else
              type="number"
              inputmode="numeric"
              class="filter-num"
              :min="seg.min"
              :max="seg.max"
              :value="c.p[seg.i]"
              :disabled="!c.enabled"
              :aria-label="`第 ${ci + 1} 條的數字`"
              @change="(e: Event) => setParam(ci, seg.i, (e.target as HTMLInputElement).value)"
            >
          </template>
          <div
            v-if="c.kind === 'exclude'"
            class="mt-1 flex flex-wrap gap-1"
          >
            <button
              v-for="n in NUMBERS"
              :key="n"
              type="button"
              class="filter-ex"
              :class="(c.nums ?? []).includes(n) ? 'filter-ex-on' : ''"
              :disabled="!c.enabled"
              :aria-pressed="(c.nums ?? []).includes(n)"
              @click="toggleNum(ci, n)"
            >
              {{ String(n).padStart(2, '0') }}
            </button>
          </div>
        </div>
        <UBadge
          v-if="props.actualPass && c.enabled"
          :color="props.actualPass[c.id] ? 'success' : 'error'"
          variant="subtle"
          size="sm"
          class="mt-1.5 shrink-0"
          :title="props.actualPass[c.id] ? '下一期實際開出的號碼通過這條' : '下一期實際開出的號碼沒通過這條'"
        >
          {{ props.actualPass[c.id] ? '✓ 實際過' : '✗ 實際沒過' }}
        </UBadge>
      </li>
    </ol>
  </UCard>
</template>

<style scoped>
.filter-num {
  width: 3.25rem;
  margin: 0 0.25rem;
  padding: 0.1rem 0.3rem;
  border: 1px solid var(--ui-border-accented);
  border-radius: 6px;
  background: var(--ui-bg);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85rem;
  text-align: center;
  line-height: 1.6;
}
.filter-num:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 1px;
}
.filter-num:disabled {
  opacity: 0.5;
}
.filter-ex {
  min-width: 2rem;
  padding: 0.1rem 0.25rem;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--ui-text-toned);
}
.filter-ex-on {
  background: var(--ui-error);
  border-color: var(--ui-error);
  color: var(--ui-bg);
  text-decoration: line-through;
}
.filter-ex:disabled {
  opacity: 0.5;
}
</style>
