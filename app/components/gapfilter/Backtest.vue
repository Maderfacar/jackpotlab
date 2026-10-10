<script setup lang="ts">
/**
 * 歷史回測：每一期開完的盤面套目前的條件，把橘色號碼當連碰選號，用下一期實際開出的號碼結算，
 * 累計投入 / 拿回，並和「隨機選同樣顆數」比較中幾顆。分批跑（每批幾期就讓畫面喘口氣），條件或金額一改就作廢重跑。
 * 預設略過只針對某一期的條件（排除號碼、指定尾數），因為那是看著某一期盤面定的，套到每一期沒意義（2026-10-10 使用者拍板）。
 */
import { addPeriod, emptyAcc, type BacktestAcc } from '~~/shared/lotto/filter/backtest'
import { generalOnly, sortByGroup, type Condition } from '~~/shared/lotto/filter/conditions'
import { STARS, type PongSettings } from '~~/shared/lotto/filter/pong'
import type { BoardState } from '~~/shared/lotto/scan/board-states'

const props = defineProps<{
  conds: Condition[]
  settings: PongSettings
  draws: number[][]
  states: BoardState[]
  /** 從第幾期（索引）開始算，前面是暖機 */
  from: number
}>()

const STAR_LABEL = ['二星', '三星', '四星']
const BATCH = 8

const skipSpecific = ref(true)
const used = computed(() => (skipSpecific.value ? generalOnly(props.conds) : props.conds))
/** 被略過的條件（照面板上的編號） */
const skipped = computed(() => {
  if (!skipSpecific.value) return []
  const order = sortByGroup(props.conds)
  const keep = new Set(used.value.map(c => c.id))
  return order.flatMap((c, i) => (c.enabled && !keep.has(c.id) ? [i + 1] : []))
})

const acc = shallowRef<BacktestAcc | null>(null)
const done = ref(0)
const running = ref(false)
let token = 0

const totalPeriods = computed(() => Math.max(0, props.draws.length - 1 - props.from))

function stop() {
  token++
  running.value = false
}
// 條件、金額、資料一改，舊結果就不對了
watch(() => [props.conds, skipSpecific.value, props.settings.stake, props.settings.odds, props.settings.returnStake, props.draws], () => {
  stop()
  acc.value = null
  done.value = 0
}, { deep: true })
onBeforeUnmount(stop)

async function run() {
  const my = ++token
  running.value = true
  done.value = 0
  // 跑的過程中用當下的快照，不受中途改動影響（改動會直接作廢這次）
  const conds = used.value.map(c => ({ ...c, p: [...c.p], nums: c.nums ? [...c.nums] : undefined }))
  const st = { ...props.settings, stake: [...props.settings.stake], odds: [...props.settings.odds] }
  let a = emptyAcc()
  for (let s = props.from; s < props.draws.length - 1; s++) {
    a = addPeriod(a, conds, props.states[s]!, props.draws[s]!, props.draws[s + 1]!, st)
    done.value++
    if (done.value % BATCH === 0) {
      acc.value = a
      await new Promise(r => setTimeout(r, 0))
      if (my !== token) return
    }
  }
  acc.value = a
  running.value = false
}

const money = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v).toLocaleString()}`
const netClass = (v: number) => (v > 0 ? 'text-success' : v < 0 ? 'text-error' : 'text-muted')
const rows = computed(() => {
  const a = acc.value
  if (!a) return []
  return STARS.map((_, i) => ({ label: STAR_LABEL[i]!, cost: a.cost[i]!, payout: a.payout[i]!, net: a.payout[i]! - a.cost[i]! }))
    .filter((_, i) => (props.settings.stake[i] ?? 0) > 0)
})
const total = computed(() => rows.value.reduce((t, r) => ({ cost: t.cost + r.cost, payout: t.payout + r.payout }), { cost: 0, payout: 0 }))
const atLeast = (arr: number[], k: number) => arr.slice(k).reduce((x, y) => x + y, 0)
</script>

<template>
  <section class="space-y-3 border-t border-default p-4 text-sm">
    <div class="flex items-center justify-between gap-2">
      <h3 class="font-semibold">
        歷史回測
      </h3>
      <UButton
        size="xs"
        :color="running ? 'neutral' : 'primary'"
        :variant="running ? 'subtle' : 'solid'"
        :icon="running ? 'i-lucide-square' : 'i-lucide-play'"
        :disabled="!totalPeriods"
        @click="running ? stop() : run()"
      >
        {{ running ? '停止' : (acc ? '重新回測' : '開始回測') }}
      </UButton>
    </div>
    <p class="text-xs text-muted">
      過去 {{ totalPeriods }} 期，每期照<b>目前的條件</b>把當期的橘色號碼拿來<b>連碰</b>，用上面的每碰金額與賠率、下一期實際開出的號碼結算。
    </p>
    <UCheckbox
      v-model="skipSpecific"
      :disabled="running"
      label="略過只針對單期的條件（排除號碼、指定尾數）"
    />
    <p
      v-if="skipSpecific"
      class="text-xs text-muted"
    >
      <template v-if="skipped.length">
        這次回測不套用第 {{ skipped.join('、') }} 條。
      </template>
      <template v-else>
        目前勾選的條件裡沒有這類設定。
      </template>
    </p>

    <UProgress
      v-if="running || (acc && done < totalPeriods)"
      :model-value="done"
      :max="totalPeriods || 1"
      size="sm"
    />

    <template v-if="acc && acc.periods">
      <p class="text-xs text-muted">
        已算 {{ acc.periods }} 期・平均每期橘色號碼 {{ (acc.poolSum / acc.periods).toFixed(1) }} 顆
      </p>

      <table class="w-full text-right font-mono text-xs">
        <thead class="text-muted">
          <tr>
            <th class="py-1 text-left font-sans font-normal" />
            <th class="py-1 font-sans font-normal">
              投入
            </th>
            <th class="py-1 font-sans font-normal">
              拿回
            </th>
            <th class="py-1 font-sans font-normal">
              淨賺賠
            </th>
            <th class="py-1 font-sans font-normal">
              拿回率
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="r.label"
            class="border-t border-default"
          >
            <td class="py-1 text-left font-sans">
              {{ r.label }}
            </td>
            <td>{{ r.cost.toLocaleString() }}</td>
            <td>{{ r.payout.toLocaleString() }}</td>
            <td :class="netClass(r.net)">
              {{ money(r.net) }}
            </td>
            <td>{{ r.cost ? ((r.payout / r.cost) * 100).toFixed(1) + '%' : '—' }}</td>
          </tr>
          <tr class="border-t border-default font-semibold">
            <td class="py-1 text-left font-sans">
              合計
            </td>
            <td>{{ total.cost.toLocaleString() }}</td>
            <td>{{ total.payout.toLocaleString() }}</td>
            <td :class="netClass(total.payout - total.cost)">
              {{ money(total.payout - total.cost) }}
            </td>
            <td>{{ total.cost ? ((total.payout / total.cost) * 100).toFixed(1) + '%' : '—' }}</td>
          </tr>
        </tbody>
      </table>

      <div class="space-y-1">
        <p class="text-xs font-medium">
          下一期有幾顆在橘色號碼裡（實際 vs 隨機選同樣顆數的期望）
        </p>
        <table class="w-full text-right font-mono text-xs">
          <thead class="text-muted">
            <tr>
              <th class="py-1 text-left font-sans font-normal">
                中幾顆
              </th>
              <th
                v-for="k in 6"
                :key="k"
                class="py-1 font-sans font-normal"
              >
                {{ k - 1 }}
              </th>
              <th class="py-1 font-sans font-normal">
                3 顆以上
              </th>
            </tr>
          </thead>
          <tbody>
            <tr class="border-t border-default">
              <td class="py-1 text-left font-sans">
                實際
              </td>
              <td
                v-for="(v, k) in acc.kDist"
                :key="k"
              >
                {{ v }}
              </td>
              <td class="font-semibold">
                {{ atLeast(acc.kDist, 3) }}
              </td>
            </tr>
            <tr class="border-t border-default text-muted">
              <td class="py-1 text-left font-sans">
                隨機
              </td>
              <td
                v-for="(v, k) in acc.kExpected"
                :key="k"
              >
                {{ v.toFixed(1) }}
              </td>
              <td>{{ atLeast(acc.kExpected, 3).toFixed(1) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="text-xs text-muted">
          「實際」比「隨機」多，代表這組條件挑出的號碼比亂選準。
        </p>
      </div>
    </template>
  </section>
</template>
