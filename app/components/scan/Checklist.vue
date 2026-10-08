<script setup lang="ts">
/** 本期查找清單：隔期狀態＋七點，每條一行寫「現在的狀態」和「歷史查到的次數」，點右邊跳到細節 */
import type { Rate } from '~~/shared/lotto/scan/scan'
import type { ScanView } from '~~/shared/lotto/scan/view'

const props = defineProps<{ view: ScanView }>()

interface Row {
  tag: string
  title: string
  now: string
  lookup?: { text: string, rate: Rate, base?: Rate | null } | null
  extra?: string[]
  anchor: string
  flag?: boolean
}

const POS = ['第1球', '第2球', '第3球', '第4球', '第5球']

const rows = computed<Row[]>(() => {
  const v = props.view
  const b = v.board
  const out: Row[] = []

  const farRow = b.farTable.find(r => r.count === Math.min(6, b.farNow))
  out.push({
    tag: '隔期狀態',
    title: '四段各剩幾顆（整段加總）',
    now: b.buckets.map(x => `${x.label}：${x.count}`).join(' · '),
    lookup: farRow ? { text: `20 以上剩 ${b.farNow} 顆的盤面，下一期開出 20 以上`, rate: { hit: farRow.hit, n: farRow.n }, base: b.far2.base } : null,
    anchor: '#board',
    flag: b.farNow >= 2
  })

  out.push({
    tag: '隔期狀態',
    title: `20 以上的值 vs 近 ${b.recentN} 期開過的值`,
    now: b.farNums.length ? '' : '目前 20 以上沒有號碼',
    extra: b.farNums.map(f => `${scanPad2(f.num)}（隔 ${f.gap}・值 ${f.value}）：近 ${b.recentN} 期開出值 ≥ ${f.value} 有 ${f.atLeast} 次${f.latest ? `，最近一次第 ${f.latest.issue} 期 ${scanPad2(f.latest.num)}（值 ${f.latest.value}）` : ''}`),
    anchor: '#board'
  })

  const c = b.config
  const ck = b.checks
  out.push({
    tag: '配置',
    title: '本期五顆的隔期配置',
    now: `0～5：${c.low} ${ck.low ? '✓' : '✗'} · 6～9：${c.mid} ${ck.mid ? '✓' : '✗'} · 10 以上：${c.high} ${ck.high ? '✓' : '✗'}`,
    lookup: { text: '三項同時符合（2～3 / 1～2 / 0～1）', rate: b.normRates.all },
    anchor: '#board'
  })

  const g = v.gapSum
  const cur = g.current
  const row = cur && cur.dir !== '平' ? g.table[Math.min(cur.len, 4) - 1] : null
  out.push({
    tag: '①',
    title: '隔期和大小',
    now: `隔期和 ${g.now}${g.prevValue != null ? `（上期 ${g.prevValue}）` : ''}${cur ? `，目前連 ${cur.len} 期「${cur.dir}」` : ''}`,
    lookup: row && cur ? { text: `連 ${Math.min(cur.len, 4)}${cur.len >= 4 ? ' 期以上' : ' 期'}同方向後，下一期換方向`, rate: { hit: row.flip, n: row.n } } : null,
    anchor: '#p1'
  })

  const vs = v.valueSum
  out.push({
    tag: '②',
    title: '值和',
    now: `值和 ${vs.now}（隔期和 ${vs.gapNow}）${vs.now < 10 ? '，小於 10' : ''}；已連 ${vs.noBigNow} 期沒有單顆值 > 10`,
    lookup: vs.now < 10 ? { text: '值和 < 10 之後，下一期出現單顆值 > 10', rate: vs.under10.cond, base: vs.under10.base } : null,
    anchor: '#p2',
    flag: vs.now < 10
  })

  const hot = v.streak.positions.filter(p => p.cur5 >= 2)
  out.push({
    tag: '③',
    title: '同球位連續隔期 > 5',
    now: hot.length ? '' : '沒有球位連 2 期以上隔期 > 5',
    extra: hot.map((p) => {
      const th = p.cur10 >= 2 ? 10 : 5
      const k = Math.min(th === 10 ? p.cur10 : p.cur5, 3)
      const r = p.rules.find(x => x.k === k && x.th === th)!
      return `${POS[p.p]} 連 ${th === 10 ? p.cur10 : p.cur5} 期 > ${th} → 歷史上連 ${k} 期 > ${th} 後，下一期回到 0～5：${scanPct(r.rate.cond)}（${r.rate.cond.hit}/${r.rate.cond.n}），平常 ${scanPct(r.rate.base)}`
    }),
    anchor: '#p3',
    flag: hot.length > 0
  })

  const overdue = v.yInt.rows.flatMap(r => [
    { name: `整組 y=${r.y}`, ...r.whole },
    ...r.per.map((x, p) => ({ name: `${POS[p]} y=${r.y}`, ...x }))
  ]).filter(x => x.current != null && x.mean != null && x.count >= 5 && x.current > x.mean)
    .sort((a, b) => b.current! / b.mean! - a.current! / a.mean!)
    .slice(0, 3)
  out.push({
    tag: '④',
    title: 'y 已隔幾期（超過平均間隔的前 3 個）',
    now: overdue.length ? '' : '都沒超過平均間隔',
    extra: overdue.map(x => `${x.name} 已隔 ${x.current} 期（平均 ${x.mean!.toFixed(1)}、最長 ${x.max}）`),
    anchor: '#p4'
  })

  const ts = v.tails
  out.push({
    tag: '⑤',
    title: '和上一期同尾',
    now: `${ts.sharedNow.length ? `同尾：尾 ${ts.sharedNow.join('、')}` : '本期和上一期沒有同尾'}；已連續 ${ts.streak.current} 期都有同尾${ts.streak.lengths.length ? `（已結束的最長 ${Math.max(...ts.streak.lengths)} 期）` : ''}`,
    anchor: '#p5'
  })

  const pr = ts.pairs
  out.push({
    tag: '⑥⑦',
    title: '同尾（2 顆以上同個位數）',
    now: pr.watchNow.length || pr.watchSkip.length ? '' : '本期沒有同尾，上期的同尾也沒有在等',
    extra: [
      ...pr.watchNow.map(w => `本期尾 ${w.tail}：${w.nums.map(scanPad2).join('、')} → 下期看連莊 ${w.nums.map(scanPad2).join('/')}，或不連莊 ${w.others.map(scanPad2).join('/')}`),
      ...pr.watchSkip.map(w => `上期尾 ${w.tail}：${w.nums.map(scanPad2).join('、')}，本期沒開 → 空一期，下期看 ${[...w.nums, ...w.others].sort((a, b) => a - b).map(scanPad2).join('/')}`)
    ],
    lookup: pr.watchSkip.length
      ? { text: '同尾後下一期沒開，下下期開出該尾', rate: pr.skip }
      : { text: '同尾後下一期開出該尾', rate: pr.next },
    anchor: '#p6',
    flag: pr.watchNow.length + pr.watchSkip.length > 0
  })
  return out
})
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">
        本期查找清單
      </h2>
      <p class="text-xs text-muted">
        照你每期開獎後的查找順序排好。左邊是現在的狀態，「歷史」是用已開出的期數查到的次數，不是預測。
      </p>
    </template>
    <ul class="divide-y divide-default">
      <li
        v-for="(r, i) in rows"
        :key="i"
        class="flex gap-3 py-2.5 first:pt-0 last:pb-0"
      >
        <UBadge
          :color="r.flag ? 'warning' : 'neutral'"
          variant="subtle"
          class="h-fit shrink-0 justify-center font-mono"
          :class="r.tag.length > 3 ? 'min-w-16' : 'min-w-9'"
        >
          {{ r.tag }}
        </UBadge>
        <div class="min-w-0 flex-1 space-y-0.5 text-sm">
          <div class="font-medium">
            {{ r.title }}
          </div>
          <div
            v-if="r.now"
            class="font-mono text-[13px] text-toned"
          >
            {{ r.now }}
          </div>
          <div
            v-for="(e, k) in r.extra ?? []"
            :key="k"
            class="text-[13px] text-toned"
          >
            {{ e }}
          </div>
          <div
            v-if="r.lookup"
            class="flex flex-wrap items-baseline gap-x-2 text-[13px]"
          >
            <span class="text-muted">歷史：{{ r.lookup.text }}</span>
            <ScanRate
              :rate="r.lookup.rate"
              :base="r.lookup.base"
            />
          </div>
        </div>
        <UButton
          :to="r.anchor"
          size="xs"
          color="neutral"
          variant="ghost"
          trailing-icon="i-lucide-chevron-down"
          class="h-fit shrink-0"
        >
          細節
        </UButton>
      </li>
    </ul>
  </UCard>
</template>
