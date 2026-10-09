<script setup lang="ts">
/**
 * 碰數小工具（2026-10-10 使用者拍板）：連碰或立柱選號 → 二 / 三 / 四星碰數、投入、
 * 「開出幾顆在選號裡」的賺賠表；回看時用下一期實際開出的號碼結算中幾碰。
 */
import { returnRate, scenarios, settle, STARS, toColumns, type PongSettings } from '~~/shared/lotto/filter/pong'

const props = defineProps<{
  /** 目前條件下的橘色號碼（可一鍵帶入） */
  orange: number[]
  /** 回看時下一期實際開出 */
  actual: { issue: string, nums: number[] } | null
}>()
const settings = defineModel<PongSettings>({ required: true })
const emit = defineEmits<{ reset: [] }>()

const NUMBERS = Array.from({ length: 39 }, (_, i) => i + 1)
const STAR_LABEL = ['二星', '三星', '四星']
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const pad = (n: number) => String(n).padStart(2, '0')
const money = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v).toLocaleString()}`
const netClass = (v: number) => (v > 0 ? 'text-success' : v < 0 ? 'text-error' : 'text-muted')

const active = ref(0)
const isColumn = computed(() => settings.value.mode === 'column')
const cols = computed(() => toColumns(settings.value))
const picked = computed(() => cols.value.reduce((a, c) => a + c.length, 0))
const buying = computed(() => STARS.map((_, i) => (settings.value.stake[i] ?? 0) > 0))

const set = (patch: Partial<PongSettings>) => {
  settings.value = { ...settings.value, ...patch }
}
/** 號碼在第幾柱（立柱）；-1 = 沒選 */
const columnOf = (n: number) => settings.value.columns.findIndex(c => c.includes(n))
const isPicked = (n: number) => (isColumn.value ? columnOf(n) >= 0 : settings.value.nums.includes(n))

function toggle(n: number) {
  if (!isColumn.value) {
    const nums = settings.value.nums
    set({ nums: nums.includes(n) ? nums.filter(x => x !== n) : [...nums, n].sort((a, b) => a - b) })
    return
  }
  const inActive = settings.value.columns[active.value]?.includes(n)
  set({
    columns: settings.value.columns.map((c, i) => {
      const rest = c.filter(x => x !== n)
      return i === active.value && !inActive ? [...rest, n].sort((a, b) => a - b) : rest
    })
  })
}
function fillOrange() {
  if (!isColumn.value) {
    set({ nums: [...props.orange] })
    return
  }
  // 立柱：還沒放進任何一柱的橘色號碼，放進目前這一柱
  const free = props.orange.filter(n => columnOf(n) < 0)
  set({ columns: settings.value.columns.map((c, i) => (i === active.value ? [...c, ...free].sort((a, b) => a - b) : c)) })
}
function clearPicks() {
  set(isColumn.value ? { columns: settings.value.columns.map(() => []) } : { nums: [] })
}
function addColumn() {
  set({ columns: [...settings.value.columns, []] })
  active.value = settings.value.columns.length - 1
}
function removeColumn(i: number) {
  set({ columns: settings.value.columns.filter((_, j) => j !== i) })
  active.value = Math.max(0, Math.min(active.value, settings.value.columns.length - 1))
}
function setNumber(field: 'stake' | 'odds', i: number, raw: string) {
  const v = Number(raw)
  if (raw.trim() === '' || !Number.isFinite(v) || v < 0) return
  set({ [field]: settings.value[field].map((x, j) => (j === i ? v : x)) })
}

const summary = computed(() => settle(cols.value, [], settings.value).stars)
const table = computed(() => scenarios(cols.value, settings.value))
const result = computed(() => (props.actual ? settle(cols.value, props.actual.nums, settings.value) : null))
const range = (a: number, b: number, f: (v: number) => string) => (a === b ? f(a) : `${f(a)}～${f(b)}`)
</script>

<template>
  <div class="space-y-5 p-4 text-sm">
    <!-- 玩法 -->
    <div class="flex items-center justify-between gap-2">
      <div class="inline-flex rounded-lg bg-elevated p-0.5">
        <button
          v-for="m in (['chain', 'column'] as const)"
          :key="m"
          type="button"
          class="rounded-md px-3 py-1 text-sm"
          :class="settings.mode === m ? 'bg-default font-semibold shadow-sm' : 'text-muted'"
          @click="set({ mode: m })"
        >
          {{ m === 'chain' ? '連碰' : '立柱' }}
        </button>
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

    <!-- 選號 -->
    <section class="space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-semibold">
          選號 <span class="font-mono text-muted">{{ picked }} 顆</span>
        </h3>
        <div class="flex gap-1.5">
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            :disabled="!orange.length"
            @click="fillOrange"
          >
            帶入橘色號碼（{{ orange.length }}）
          </UButton>
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            @click="clearPicks"
          >
            清空
          </UButton>
        </div>
      </div>

      <div
        v-if="isColumn"
        class="flex flex-wrap items-center gap-1.5"
      >
        <span
          v-for="(c, i) in settings.columns"
          :key="i"
          class="inline-flex items-center rounded-md border text-xs"
          :class="i === active ? 'border-primary bg-primary/10' : 'border-default'"
        >
          <button
            type="button"
            class="px-2 py-1"
            @click="active = i"
          >
            <b>{{ LETTERS[i] }}</b> 柱 <span class="font-mono text-muted">{{ c.length }}</span>
          </button>
          <button
            v-if="settings.columns.length > 1"
            type="button"
            class="pr-1.5 text-muted hover:text-error"
            :aria-label="`刪掉 ${LETTERS[i]} 柱`"
            @click="removeColumn(i)"
          >✕</button>
        </span>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-plus"
          :disabled="settings.columns.length >= LETTERS.length"
          @click="addColumn"
        >
          新增一柱
        </UButton>
      </div>
      <p
        v-if="isColumn"
        class="text-xs text-muted"
      >
        點號碼放進 <b>{{ LETTERS[active] }}</b> 柱（再點一次拿掉）；同一柱的號碼不互碰。
      </p>

      <div class="grid grid-cols-8 gap-1 sm:grid-cols-10">
        <button
          v-for="n in NUMBERS"
          :key="n"
          type="button"
          class="pong-num"
          :class="[isPicked(n) ? 'pong-on' : '', orange.includes(n) ? 'pong-orange' : '']"
          :aria-pressed="isPicked(n)"
          @click="toggle(n)"
        >
          {{ pad(n) }}
          <span
            v-if="isColumn && columnOf(n) >= 0"
            class="pong-tag"
          >{{ LETTERS[columnOf(n)] }}</span>
        </button>
      </div>
      <p class="text-xs text-muted">
        號碼下面有橘線 = 目前條件的橘色號碼。
      </p>
    </section>

    <!-- 金額與賠率 -->
    <section class="space-y-2">
      <h3 class="font-semibold">
        每碰金額與賠率
      </h3>
      <div
        v-for="(label, i) in STAR_LABEL"
        :key="label"
        class="flex flex-wrap items-center gap-x-1 gap-y-1"
      >
        <span class="w-10">{{ label }}</span>每碰
        <input
          type="number"
          inputmode="numeric"
          min="0"
          class="pong-input"
          :value="settings.stake[i]"
          :aria-label="`${label}每碰金額`"
          @change="(e: Event) => setNumber('stake', i, (e.target as HTMLInputElement).value)"
        >元・賠
        <input
          type="number"
          inputmode="numeric"
          min="0"
          class="pong-input w-20"
          :value="settings.odds[i]"
          :aria-label="`${label}賠率`"
          @change="(e: Event) => setNumber('odds', i, (e.target as HTMLInputElement).value)"
        >倍
      </div>
      <UCheckbox
        :model-value="settings.returnStake"
        label="中獎另退本金（中一碰拿回 賠率＋1 倍）"
        @update:model-value="(v: boolean | 'indeterminate') => set({ returnStake: v === true })"
      />
      <p class="text-xs text-muted">
        每碰金額填 0 = 不買這種。
      </p>
    </section>

    <!-- 碰數與投入 -->
    <section class="space-y-2">
      <h3 class="font-semibold">
        碰數與投入
      </h3>
      <table class="w-full text-right font-mono text-xs">
        <thead class="text-muted">
          <tr>
            <th class="py-1 text-left font-sans font-normal" />
            <th class="py-1 font-sans font-normal">
              碰數
            </th>
            <th class="py-1 font-sans font-normal">
              投入
            </th>
            <th class="py-1 font-sans font-normal">
              長期拿回
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(s, i) in summary"
            :key="s.star"
            class="border-t border-default"
            :class="buying[i] ? '' : 'text-dimmed'"
          >
            <td class="py-1 text-left font-sans">
              {{ STAR_LABEL[i] }}
            </td>
            <td>{{ s.pong.toLocaleString() }}</td>
            <td>{{ s.cost.toLocaleString() }}</td>
            <td>{{ (returnRate(s.star, settings) * 100).toFixed(1) }}%</td>
          </tr>
          <tr class="border-t border-default font-semibold">
            <td class="py-1 text-left font-sans">
              合計
            </td>
            <td />
            <td>{{ summary.reduce((a, s) => a + s.cost, 0).toLocaleString() }}</td>
            <td />
          </tr>
        </tbody>
      </table>
      <p class="text-xs text-muted">
        長期拿回 = 隨機開獎時每投 1 元平均拿回多少，跟選幾顆、怎麼分柱無關。
      </p>
    </section>

    <!-- 回看：實際結算 -->
    <section
      v-if="actual && result"
      class="space-y-2 rounded-lg bg-elevated/60 p-3"
    >
      <h3 class="font-semibold">
        第 {{ actual.issue }} 期實際開出 <span class="font-mono">{{ actual.nums.map(pad).join(' ') }}</span>
      </h3>
      <p>選號裡開出 <b class="font-mono">{{ result.drawnIn }}</b> 顆</p>
      <ul class="space-y-0.5 font-mono text-xs">
        <li
          v-for="(s, i) in result.stars"
          v-show="buying[i]"
          :key="s.star"
        >
          <span class="font-sans">{{ STAR_LABEL[i] }}</span> 中 {{ s.hits }} 碰・拿回 {{ s.payout.toLocaleString() }}・<span :class="netClass(s.net)">{{ money(s.net) }}</span>
        </li>
      </ul>
      <p class="font-semibold">
        合計 <span
          class="font-mono"
          :class="netClass(result.total.net)"
        >{{ money(result.total.net) }}</span>
        <span class="font-normal text-muted">（投入 {{ result.total.cost.toLocaleString() }}、拿回 {{ result.total.payout.toLocaleString() }}）</span>
      </p>
    </section>

    <!-- 情境表 -->
    <section
      v-if="picked >= 2"
      class="space-y-2"
    >
      <h3 class="font-semibold">
        下一期開出幾顆在選號裡 → 淨賺賠
      </h3>
      <div class="overflow-x-auto">
        <table class="w-full text-right font-mono text-xs [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <thead class="text-muted">
            <tr>
              <th class="py-1 text-left font-sans font-normal">
                中幾顆
              </th>
              <th class="px-1 py-1 font-sans font-normal">
                隨機機率
              </th>
              <template
                v-for="(label, i) in STAR_LABEL"
                :key="label"
              >
                <th
                  v-if="buying[i]"
                  class="px-1 py-1 font-sans font-normal"
                >
                  {{ label }}
                </th>
              </template>
              <th class="py-1 pl-1 font-sans font-normal">
                合計
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in table"
              :key="row.k"
              class="border-t border-default"
            >
              <td class="py-1 text-left">
                {{ row.k }}
              </td>
              <td class="px-1">
                {{ (row.prob * 100).toFixed(1) }}%
              </td>
              <template
                v-for="(s, i) in row.stars"
                :key="i"
              >
                <td
                  v-if="buying[i]"
                  class="px-1"
                >
                  <div :class="netClass(s.netMax)">
                    {{ range(s.netMin, s.netMax, money) }}
                  </div>
                  <div class="text-[10px] text-muted">
                    {{ range(s.hitsMin, s.hitsMax, v => String(v)) }} 碰
                  </div>
                </td>
              </template>
              <td
                class="pl-1 font-semibold"
                :class="netClass(row.totalMax)"
              >
                {{ range(row.totalMin, row.totalMax, money) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-xs text-muted">
        隨機機率 = 隨便開 5 顆時，剛好幾顆落在你選的號碼裡。<template v-if="isColumn">
          立柱中幾碰要看落在哪幾柱，所以寫成最少～最多。
        </template>
      </p>
    </section>
  </div>
</template>

<style scoped>
.pong-num {
  position: relative;
  padding: 0.3rem 0;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--ui-text-toned);
}
.pong-orange {
  box-shadow: inset 0 -3px 0 #eb6834;
}
.pong-on {
  background: var(--ui-primary);
  border-color: var(--ui-primary);
  color: var(--ui-bg);
  font-weight: 600;
}
.pong-tag {
  position: absolute;
  top: -0.35rem;
  right: -0.2rem;
  padding: 0 0.2rem;
  border-radius: 4px;
  background: var(--ui-bg-inverted);
  color: var(--ui-bg);
  font-size: 0.6rem;
  line-height: 1.2;
}
.pong-input {
  width: 3.5rem;
  margin: 0 0.25rem;
  padding: 0.1rem 0.3rem;
  border: 1px solid var(--ui-border-accented);
  border-radius: 6px;
  background: var(--ui-bg);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-align: center;
  line-height: 1.6;
}
.pong-input.w-20 {
  width: 5rem;
}
</style>
