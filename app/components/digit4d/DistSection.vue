<script setup lang="ts">
/** 歷史分佈：照時間分段並排看第幾新、開出數字的比例；每個位置開出時的隔期；後兩碼／後三碼開出時隔期的百分位 */
import { gapTable, levelGaps, percentiles, posGaps, segmentLabel, shareBySegment, type Segment } from '~~/shared/lotto/digit4d/dist'
import { POS_LABELS, type DrawStep } from '~~/shared/lotto/digit4d/state'

const props = defineProps<{ steps: DrawStep[], bounds: Segment[] }>()

const kind = ref<'rank' | 'digit'>('rank')
const kindTabs = [{ label: '開到第幾新', value: 'rank' }, { label: '開出的數字', value: 'digit' }]
const pos = ref('3')
const posTabs = POS_LABELS.map((label, i) => ({ label, value: String(i) }))

const segs = computed<Segment[]>(() => (props.bounds.length > 1
  ? [...props.bounds, { from: props.bounds[0]!.from, to: props.bounds.at(-1)!.to }]
  : props.bounds))
const segNames = computed(() => segs.value.map((s, i) => (props.bounds.length > 1 && i === segs.value.length - 1 ? `全部（${segmentLabel(props.steps, s)}）` : segmentLabel(props.steps, s))))
const shares = computed(() => shareBySegment(props.steps, segs.value, kind.value))
const gaps = computed(() => gapTable(posGaps(props.steps, Number(pos.value))))
const levels = computed(() => [
  { label: '後兩碼（100 組）', rows: percentiles(levelGaps(props.steps, 1)) },
  { label: '後三碼（1,000 組）', rows: percentiles(levelGaps(props.steps, 2)) }
])
</script>

<template>
  <div class="space-y-5">
    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span class="font-semibold">每個位置的比例（照時間分段並排）</span>
          <UTabs
            v-model="kind"
            :items="kindTabs"
            :content="false"
            variant="pill"
            color="neutral"
            size="sm"
          />
        </div>
      </template>
      <p class="mb-3 text-xs text-muted">
        分段來自「時間分段」分頁找到的可疑日期；沒有可疑日期時就是一整段。2007 年最前面 100 期只拿來起算，不列入。
      </p>
      <div class="space-y-4">
        <div
          v-for="(rowsBySeg, p) in shares"
          :key="p"
          class="overflow-x-auto"
        >
          <div class="mb-1 text-sm font-medium">
            {{ POS_LABELS[p] }}
          </div>
          <table class="w-full min-w-[720px] text-xs">
            <thead class="text-muted">
              <tr class="border-b border-default">
                <th class="py-1 text-left font-normal">
                  時段（期數）
                </th>
                <th
                  v-for="k in 10"
                  :key="k"
                  class="py-1 text-right font-normal"
                >
                  {{ kind === 'rank' ? `第${k - 1}新` : k - 1 }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(r, i) in rowsBySeg"
                :key="i"
                class="border-b border-default last:border-0"
              >
                <td class="py-1 pr-2 whitespace-nowrap">
                  {{ segNames[i] }}（{{ r.n }}）
                </td>
                <td
                  v-for="(s, k) in r.shares"
                  :key="k"
                  class="py-1 text-right font-mono"
                >
                  {{ digitPct(s) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span class="font-semibold">開出時的隔期（給你定分組用）</span>
          <UTabs
            v-model="pos"
            :items="posTabs"
            :content="false"
            variant="pill"
            color="neutral"
            size="sm"
          />
        </div>
      </template>
      <p class="mb-3 text-xs text-muted">
        每個隔期數值各列一行、不先分組；累積到 99% 之後併成一行（我補的）。
      </p>
      <div class="max-h-[480px] overflow-y-auto">
        <table class="w-full text-sm">
          <thead class="sticky top-0 bg-default text-xs text-muted">
            <tr class="border-b border-default">
              <th class="py-1 text-left font-normal">
                隔期
              </th>
              <th class="py-1 text-right font-normal">
                次數
              </th>
              <th class="py-1 text-right font-normal">
                比例
              </th>
              <th class="py-1 text-right font-normal">
                累積
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in gaps"
              :key="r.gap"
              class="border-b border-default last:border-0"
            >
              <td class="py-1 font-mono">
                {{ r.gap }}
              </td>
              <td class="py-1 text-right font-mono">
                {{ r.count }}
              </td>
              <td class="py-1 text-right font-mono">
                {{ digitPct(r.share) }}
              </td>
              <td class="py-1 text-right font-mono text-muted">
                {{ digitPct(r.cum) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <UCard
        v-for="l in levels"
        :key="l.label"
      >
        <template #header>
          <div class="font-semibold">
            {{ l.label }}開出時的隔期
          </div>
        </template>
        <p class="mb-2 text-xs text-muted">
          格子多、每組開過的次數少，用「幾成的期數，開出時隔期在多少以內」看
        </p>
        <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <div
            v-for="r in l.rows"
            :key="r.q"
            class="flex justify-between"
          >
            <span class="text-muted">{{ digitPct(r.q, 0) }} 在</span>
            <span class="font-mono">{{ r.gap }} 期以內</span>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
