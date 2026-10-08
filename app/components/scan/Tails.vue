<script setup lang="ts">
/** ⑤ 和上一期同尾、⑥ 同尾（2 顆以上）下一期開出該尾、⑦ 下一期沒開時下下期（空一期） */
import type { PairNext } from '~~/shared/lotto/scan/scan'
import type { ScanView } from '~~/shared/lotto/scan/view'

const props = defineProps<{ view: ScanView }>()
const ts = computed(() => props.view.tails)
const pr = computed(() => ts.value.pairs)

const rows = computed(() => [...ts.value.recent].reverse())
const doneLengths = computed(() => ts.value.streak.lengths)
const lengthSummary = computed(() => {
  const L = doneLengths.value
  if (!L.length) return null
  return { n: L.length, max: Math.max(...L), mean: L.reduce((a, b) => a + b, 0) / L.length, last: L.slice(-10) }
})
const sharedTotal = computed(() => ts.value.sharedDist.reduce((a, b) => a + b, 0))

const NEXT_TEXT: Record<PairNext, string> = { repeat: '連莊同號', other: '不連莊（同尾別的號）', both: '連莊＋不連莊都有', none: '沒開' }
</script>

<template>
  <UCard id="p5">
    <template #header>
      <h2 class="font-semibold">
        ⑤ 和上一期同尾
      </h2>
      <p class="text-xs text-muted">
        格子是該期個位數 0～9 各開出幾顆（橘色越深越多）；框起來 = 和上一期相同的尾數；粗體 = 同一期 2 顆以上同尾。
      </p>
    </template>
    <div class="space-y-5">
      <div class="overflow-x-auto">
        <table class="text-xs">
          <thead class="text-muted">
            <tr>
              <th class="pr-2 text-left font-normal">
                期別
              </th>
              <th class="pr-3 text-left font-normal">
                號碼
              </th>
              <th
                v-for="d in 10"
                :key="d"
                class="px-0.5 text-center font-normal"
              >
                尾{{ d - 1 }}
              </th>
              <th class="pl-2 text-left font-normal">
                同尾
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in rows"
              :key="r.issue"
            >
              <td class="pr-2 font-mono text-dimmed">
                {{ scanShortIssue(r.issue) }}
              </td>
              <td class="whitespace-nowrap pr-3 font-mono">
                {{ r.nums.map(scanPad2).join(' ') }}
              </td>
              <td
                v-for="d in 10"
                :key="d"
                class="p-0.5"
              >
                <div
                  class="flex h-6 w-6 items-center justify-center rounded font-mono"
                  :class="[
                    r.shared.includes(d - 1) ? 'ring-2 ring-[var(--ui-text)]' : '',
                    (r.counts[d - 1] ?? 0) >= 2 ? 'font-bold' : ''
                  ]"
                  :style="{ background: (r.counts[d - 1] ?? 0) > 0 ? `color-mix(in oklab, var(--scan-orange) ${Math.min(70, 22 + ((r.counts[d - 1] ?? 1) - 1) * 24)}%, var(--ui-bg))` : 'transparent' }"
                >
                  {{ r.counts[d - 1] || '' }}
                </div>
              </td>
              <td class="pl-2 font-mono text-toned">
                {{ r.shared.length }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <div class="space-y-1.5 text-sm">
          <h3 class="font-semibold">
            連續幾期都和上一期同尾
          </h3>
          <p>
            目前已連續 <b class="font-mono">{{ ts.streak.current }}</b> 期都有同尾。
          </p>
          <p
            v-if="lengthSummary"
            class="text-toned"
          >
            統計範圍內已結束的 {{ lengthSummary.n }} 段：最長 {{ lengthSummary.max }} 期、平均 {{ lengthSummary.mean.toFixed(1) }} 期；
            最近 {{ lengthSummary.last.length }} 段依序：<span class="font-mono">{{ lengthSummary.last.join('、') }}</span>
          </p>
        </div>
        <div class="space-y-1.5">
          <h3 class="text-sm font-semibold">
            和上一期相同的尾數有幾個
          </h3>
          <table class="w-full text-sm">
            <tbody>
              <tr
                v-for="(c, k) in ts.sharedDist"
                :key="k"
                class="border-b border-default/60"
                :class="k === ts.sharedNow.length ? 'bg-primary/10 font-medium' : ''"
              >
                <td class="py-1 font-mono">
                  {{ k }} 個{{ k === ts.sharedNow.length ? ' ← 本期' : '' }}
                </td>
                <td class="py-1">
                  <ScanRate :rate="{ hit: c, n: sharedTotal }" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </UCard>

  <UCard id="p6">
    <template #header>
      <h2 class="font-semibold">
        ⑥⑦ 同尾：下一期、下下期有沒有開出該尾
      </h2>
      <p class="text-xs text-muted">
        同尾 = 同一期 2 顆以上個位數相同（3 顆也算）。連莊 = 同一個號碼再開（例：01、11 之一）；不連莊 = 同尾的別的號碼（例：21、31）。
      </p>
    </template>
    <div class="space-y-5">
      <div
        v-if="pr.watchNow.length || pr.watchSkip.length"
        class="space-y-3"
      >
        <div
          v-for="w in pr.watchNow"
          :key="`n${w.tail}`"
          class="flex flex-wrap items-center gap-2 text-sm"
        >
          <UBadge
            color="warning"
            variant="subtle"
          >
            本期尾 {{ w.tail }}
          </UBadge>
          <ScanBall
            v-for="n in w.nums"
            :key="n"
            :n="n"
            size="sm"
          />
          <span class="text-muted">→ 下期看連莊</span>
          <ScanBall
            v-for="n in w.nums"
            :key="`r${n}`"
            :n="n"
            size="sm"
            tone="ghost"
          />
          <span class="text-muted">或不連莊</span>
          <ScanBall
            v-for="n in w.others"
            :key="`o${n}`"
            :n="n"
            size="sm"
            tone="ghost"
          />
        </div>
        <div
          v-for="w in pr.watchSkip"
          :key="`s${w.tail}`"
          class="flex flex-wrap items-center gap-2 text-sm"
        >
          <UBadge
            color="warning"
            variant="subtle"
          >
            上期尾 {{ w.tail }}・本期沒開
          </UBadge>
          <ScanBall
            v-for="n in w.nums"
            :key="n"
            :n="n"
            size="sm"
          />
          <span class="text-muted">→ 空一期，下期看</span>
          <ScanBall
            v-for="n in [...w.nums, ...w.others].sort((a, b) => a - b)"
            :key="`k${n}`"
            :n="n"
            size="sm"
            tone="ghost"
          />
        </div>
      </div>
      <p
        v-else
        class="text-sm text-muted"
      >
        本期沒有同尾，上一期的同尾也沒有在等下下期。
      </p>

      <table class="w-full text-sm">
        <tbody>
          <tr class="border-b border-default/60">
            <td class="py-2 pr-3">
              同尾 → 下一期開出該尾
            </td>
            <td class="py-2">
              <ScanRate :rate="pr.next" />
              <span
                v-if="pr.expectedNext != null"
                class="ml-2 text-xs text-muted"
              >平常任一期開出某個尾數約 {{ Math.round(pr.expectedNext * 100) }}%</span>
            </td>
          </tr>
          <tr class="border-b border-default/60">
            <td class="py-2 pr-3">
              其中連莊同號 / 不連莊
            </td>
            <td class="py-2 font-mono text-toned">
              {{ pr.repeat }} 次 / {{ pr.other }} 次
            </td>
          </tr>
          <tr class="border-b border-default/60">
            <td class="py-2 pr-3">
              下一期沒開 → 下下期開出該尾（空一期）
            </td>
            <td class="py-2">
              <ScanRate :rate="pr.skip" />
            </td>
          </tr>
          <tr>
            <td class="py-2 pr-3">
              3 期內開出該尾
            </td>
            <td class="py-2">
              <ScanRate :rate="pr.within3" />
            </td>
          </tr>
        </tbody>
      </table>

      <div class="space-y-2">
        <h3 class="text-sm font-semibold">
          最近的同尾
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[520px] text-sm">
            <thead class="text-xs text-muted">
              <tr class="border-b border-default">
                <th class="py-1.5 text-left font-normal">
                  期別
                </th>
                <th class="py-1.5 text-left font-normal">
                  尾數
                </th>
                <th class="py-1.5 text-left font-normal">
                  號碼
                </th>
                <th class="py-1.5 text-left font-normal">
                  下一期
                </th>
                <th class="py-1.5 text-left font-normal">
                  下下期
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="e in pr.recent"
                :key="`${e.s}-${e.tail}`"
                class="border-b border-default/60"
              >
                <td class="py-1.5 font-mono">
                  {{ e.issue }}<span class="ml-1 text-xs text-muted">{{ e.s === view.t ? '本期' : `${view.t - e.s} 期前` }}</span>
                </td>
                <td class="py-1.5 font-mono">
                  尾 {{ e.tail }}
                </td>
                <td class="py-1.5 font-mono">
                  {{ e.nums.map(scanPad2).join('、') }}
                </td>
                <td class="py-1.5">
                  {{ e.next ? NEXT_TEXT[e.next] : '還沒開' }}
                </td>
                <td class="py-1.5">
                  {{ e.next === 'none' ? (e.skipHit == null ? '還沒開' : e.skipHit ? '開出' : '沒開') : '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </UCard>
</template>
