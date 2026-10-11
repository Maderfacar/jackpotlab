<script setup lang="ts">
/**
 * 點陣條：每列一件事、每欄一期（左舊右新）。
 *   off  = 沒發生（淡點）       on   = 發生了（實心）
 *   hit  = 亮燈且下一期成真（實心＋綠圈）  miss = 亮燈但沒成真（空心）
 */
type Cell = 'off' | 'on' | 'hit' | 'miss'

const props = defineProps<{
  rows: { key: string, label: string, cells: Cell[], titles?: string[], active?: boolean }[]
  /** 欄名（期號），滑過時顯示 */
  issues: string[]
  /** 列名可點（例：點了跳到細節） */
  clickable?: boolean
  /** 最小寬度（px），窄欄用 0 */
  minWidth?: number
  /** 列名欄寬（rem） */
  labelWidth?: number
}>()
const emit = defineEmits<{ pick: [key: string] }>()
</script>

<template>
  <div class="overflow-x-auto">
    <div
      class="space-y-1"
      :style="{ minWidth: `${props.minWidth ?? 560}px` }"
    >
      <div
        v-for="r in rows"
        :key="r.key"
        class="flex items-center gap-2"
      >
        <button
          v-if="clickable"
          type="button"
          class="shrink-0 truncate text-left text-[11px] hover:underline"
          :style="{ width: `${props.labelWidth ?? 6}rem` }"
          :class="r.active ? 'font-semibold text-highlighted' : 'text-muted'"
          @click="emit('pick', r.key)"
        >
          {{ r.label }}
        </button>
        <span
          v-else
          class="shrink-0 truncate text-[11px]"
          :style="{ width: `${props.labelWidth ?? 6}rem` }"
          :class="r.active ? 'font-semibold text-highlighted' : 'text-muted'"
        >{{ r.label }}</span>
        <div
          class="grid flex-1 gap-px"
          :style="{ gridTemplateColumns: `repeat(${r.cells.length}, minmax(0, 1fr))` }"
        >
          <span
            v-for="(c, i) in r.cells"
            :key="i"
            class="viz-slot"
            :title="r.titles?.[i] ?? `第 ${issues[i]} 期`"
          ><span
            class="viz-dot"
            :class="`viz-${c}`"
          /></span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.viz-slot {
  display: flex;
  height: 16px;
  align-items: center;
  justify-content: center;
}
.viz-dot {
  display: block;
  border-radius: 9999px;
}
.viz-off {
  width: 4px;
  height: 4px;
  background: var(--viz-gray);
  opacity: 0.5;
}
.viz-on {
  width: 10px;
  height: 10px;
  background: var(--viz-blue);
}
.viz-hit {
  width: 10px;
  height: 10px;
  background: var(--viz-blue);
  box-shadow: 0 0 0 2px var(--ui-bg), 0 0 0 3.5px var(--viz-good);
}
.viz-miss {
  width: 10px;
  height: 10px;
  box-shadow: inset 0 0 0 2px var(--viz-blue);
}
</style>
