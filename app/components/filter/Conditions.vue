<script setup lang="ts">
/**
 * 條件清單：依類別分組（獎號本身 / 隔期 / 值 / 位置 y / 尾數），每條一個勾選框、句子裡的數字可以直接改。
 * 可重複的條件可以「＋ 再加一條」，自己加的可以刪；回看過去期別時，旁邊標出下一期實際開出的號碼有沒有過這條。
 */
import { GROUPS, KIND_META, KIND_SPEC, sortByGroup, type Condition, type ConditionKind } from '~~/shared/lotto/filter/conditions'

const props = defineProps<{
  /** 下一期實際開出時，各條件有沒有通過（id → true/false）；最新一期沒有下一期 = null */
  actualPass: Record<string, boolean> | null
}>()
const conds = defineModel<Condition[]>({ required: true })
const emit = defineEmits<{ reset: [] }>()

const NUMBERS = Array.from({ length: 39 }, (_, i) => i + 1)
const ADD_LABEL: Partial<Record<ConditionKind, string>> = {
  rangeCount: '號碼範圍有幾顆',
  zoneNot: '區間分佈不能是',
  posGap: '第幾顆的隔期',
  valueCount: '值 = 多少的有幾顆',
  yCount: 'y = 多少的有幾顆',
  noY: '不能有 y = 多少',
  tailCount: '尾數有幾顆'
}

const ordered = computed(() => sortByGroup(conds.value))
const numberOf = computed(() => new Map(ordered.value.map((c, i) => [c.id, i + 1])))
const groups = computed(() => GROUPS.map(g => ({
  ...g,
  items: ordered.value.filter(c => KIND_META[c.kind].group === g.key),
  addable: (Object.keys(KIND_META) as ConditionKind[]).filter(k => KIND_META[k].group === g.key && KIND_META[k].repeatable && ADD_LABEL[k])
})))

const update = (id: string, f: (c: Condition) => Condition) => {
  conds.value = conds.value.map(c => (c.id === id ? f(c) : c))
}
function setParam(id: string, pi: number, raw: string) {
  const v = Math.trunc(Number(raw))
  if (raw.trim() === '' || !Number.isFinite(v)) return
  update(id, c => ({ ...c, p: c.p.map((x, j) => (j === pi ? v : x)) }))
}
const setEnabled = (id: string, on: boolean) => update(id, c => ({ ...c, enabled: on }))
function toggleNum(id: string, n: number) {
  update(id, (c) => {
    const nums = c.nums ?? []
    return { ...c, nums: nums.includes(n) ? nums.filter(x => x !== n) : [...nums, n].sort((a, b) => a - b) }
  })
}
function addCondition(kind: ConditionKind) {
  const p = KIND_META[kind].repeatable ?? []
  conds.value = sortByGroup([...conds.value, { id: `u-${kind}-${Date.now()}`, kind, enabled: true, p: [...p] }])
}
const removeCondition = (id: string) => {
  conds.value = conds.value.filter(c => c.id !== id)
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
            勾掉就不套用；數字可以直接改。「大於 / 小於」不含本身，「介於」「有 a～b 顆」含兩端，0～0 = 一顆都不要。
          </p>
        </div>
        <UButton
          size="xs"
          color="neutral"
          variant="subtle"
          icon="i-lucide-rotate-ccw"
          class="shrink-0"
          @click="emit('reset')"
        >
          恢復預設
        </UButton>
      </div>
    </template>

    <div class="space-y-5">
      <section
        v-for="g in groups"
        :key="g.key"
        class="space-y-2"
      >
        <h3 class="border-b border-default pb-1 text-xs font-semibold tracking-wide text-muted">
          {{ g.title }}
        </h3>
        <ol class="space-y-2">
          <li
            v-for="c in g.items"
            :key="c.id"
            class="flex items-start gap-2.5"
          >
            <UCheckbox
              :model-value="c.enabled"
              class="mt-1"
              :aria-label="`啟用第 ${numberOf.get(c.id)} 條`"
              @update:model-value="(v: boolean | 'indeterminate') => setEnabled(c.id, v === true)"
            />
            <div
              class="min-w-0 flex-1 text-sm leading-8"
              :class="c.enabled ? '' : 'text-dimmed'"
            >
              <span class="mr-1 font-mono text-xs text-muted">{{ numberOf.get(c.id) }}.</span>
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
                  :aria-label="`第 ${numberOf.get(c.id)} 條的數字`"
                  @change="(e: Event) => setParam(c.id, seg.i, (e.target as HTMLInputElement).value)"
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
                  @click="toggleNum(c.id, n)"
                >
                  {{ String(n).padStart(2, '0') }}
                </button>
              </div>
            </div>
            <div class="mt-1 flex shrink-0 items-center gap-1">
              <UBadge
                v-if="props.actualPass && c.enabled"
                :color="props.actualPass[c.id] ? 'success' : 'error'"
                variant="subtle"
                size="sm"
                :title="props.actualPass[c.id] ? '下一期實際開出的號碼通過這條' : '下一期實際開出的號碼沒通過這條'"
              >
                {{ props.actualPass[c.id] ? '✓ 實際過' : '✗ 實際沒過' }}
              </UBadge>
              <UButton
                v-if="c.id.startsWith('u-')"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-x"
                :aria-label="`刪掉第 ${numberOf.get(c.id)} 條`"
                @click="removeCondition(c.id)"
              />
            </div>
          </li>
        </ol>
        <div
          v-if="g.addable.length"
          class="flex flex-wrap gap-1.5 pl-7"
        >
          <UButton
            v-for="k in g.addable"
            :key="k"
            size="xs"
            color="neutral"
            variant="soft"
            icon="i-lucide-plus"
            @click="addCondition(k)"
          >
            {{ ADD_LABEL[k] }}
          </UButton>
        </div>
      </section>
    </div>
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
