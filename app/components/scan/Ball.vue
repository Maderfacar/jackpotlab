<script setup lang="ts">
/** 號碼球：橘色實心；repeat = 外框（上一期也開過，隔期 0）；tone=ghost 用在候選號碼 */
const props = withDefaults(defineProps<{
  n: number
  size?: 'sm' | 'md' | 'lg'
  repeat?: boolean
  tone?: 'drawn' | 'ghost'
}>(), { size: 'md', repeat: false, tone: 'drawn' })

const sizeClass = computed(() => ({ sm: 'size-6 text-[11px]', md: 'size-8 text-xs', lg: 'size-11 text-base' }[props.size]))
</script>

<template>
  <span
    class="scan-ball"
    :class="[sizeClass, repeat ? 'scan-ball-repeat' : '', tone === 'ghost' ? 'scan-ball-ghost' : '']"
  >{{ scanPad2(n) }}</span>
</template>

<style scoped>
.scan-ball {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: var(--scan-orange);
  color: var(--scan-ball-ink);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
  line-height: 1;
}
.scan-ball-repeat {
  box-shadow: 0 0 0 2px var(--ui-bg), 0 0 0 4px var(--ui-text);
}
.scan-ball-ghost {
  background: transparent;
  color: var(--ui-text);
  box-shadow: inset 0 0 0 1.5px var(--scan-orange);
}
</style>
