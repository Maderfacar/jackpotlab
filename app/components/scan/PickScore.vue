<script setup lang="ts">
/**
 * 我的成績單：你勾「我信」的點，下一期成真幾成；和「同樣亮燈但你沒勾」的比，看你挑得準不準。
 */
import { POINT_KEYS, type PointKey } from '~~/shared/lotto/scan/points/evaluate'
import { POINT_META } from '~~/shared/lotto/scan/points/meta'
import type { Row } from '~~/shared/lotto/scan/points/rows'
import type { Evals } from '~~/shared/lotto/scan/points/stats'

const props = defineProps<{
  picks: Record<string, PointKey[]>
  status: 'idle' | 'loading' | 'ready' | 'error'
  evals: Evals
  indexOf: Map<string, number>
  rows: Row[]
}>()

interface Tally {
  hit: number
  n: number
}
const empty = (): Tally => ({ hit: 0, n: 0 })

const score = computed(() => {
  const mine = Object.fromEntries(POINT_KEYS.map(k => [k, empty()])) as Record<PointKey, Tally>
  const skipped = Object.fromEntries(POINT_KEYS.map(k => [k, empty()])) as Record<PointKey, Tally>
  const recent: { issue: string, nextIssue: string | null, items: { key: PointKey, hit: boolean | null }[] }[] = []
  let pending = 0
  for (const [issue, keys] of Object.entries(props.picks)) {
    const s = props.indexOf.get(issue)
    if (s == null || keys.length === 0) continue
    const items = keys.map(key => ({ key, hit: props.evals[key][s]?.hit ?? null }))
    recent.push({ issue, nextIssue: props.rows[s + 1]?.issue ?? null, items })
    for (const k of POINT_KEYS) {
      const e = props.evals[k][s]
      if (!e?.lit) continue
      if (e.hit == null) {
        if (keys.includes(k)) pending++
        continue
      }
      const bucket = keys.includes(k) ? mine[k] : skipped[k]
      bucket.n++
      if (e.hit) bucket.hit++
    }
  }
  recent.sort((a, b) => Number(b.issue) - Number(a.issue))
  const all = POINT_KEYS.reduce((a, k) => ({ hit: a.hit + mine[k].hit, n: a.n + mine[k].n }), empty())
  return { mine, skipped, recent: recent.slice(0, 12), pending, all, days: recent.length }
})
const pct = (r: Tally) => (r.n ? `${Math.round((r.hit / r.n) * 100)}%` : '—')
const short = (k: PointKey) => POINT_META.find(m => m.key === k)!.no
</script>

<template>
  <section class="space-y-3">
    <h2 class="text-lg font-semibold">
      我的成績單
    </h2>
    <UCard>
      <div
        v-if="status === 'loading' || status === 'idle'"
        class="text-sm text-muted"
      >
        讀取勾選中…
      </div>
      <div
        v-else-if="status === 'error'"
        class="text-sm text-error"
      >
        勾選紀錄讀不到
      </div>
      <div
        v-else-if="score.days === 0"
        class="text-sm text-muted"
      >
        還沒勾過。最新一期開完後，在「八點燈號」把你相信的亮燈點勾「我信」，下一期開出後這裡會自動對答案。
      </div>
      <div
        v-else
        class="space-y-4"
      >
        <div class="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span class="text-sm">勾了 <b>{{ score.days }}</b> 期</span>
          <span class="text-sm">已對答案 <b>{{ score.all.n }}</b> 個，成真 <b class="font-mono text-highlighted">{{ pct(score.all) }}</b></span>
          <span
            v-if="score.pending"
            class="text-xs text-muted"
          >還有 {{ score.pending }} 個等開獎</span>
        </div>
        <div class="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div
            v-for="m in POINT_META"
            :key="m.key"
            class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2"
          >
            <span class="truncate text-xs">{{ m.no }} {{ m.name }}</span>
            <div class="space-y-0.5">
              <div class="flex items-center gap-2">
                <span class="ps-track"><span
                  class="ps-bar ps-mine"
                  :style="{ width: `${score.mine[m.key].n ? score.mine[m.key].hit / score.mine[m.key].n * 100 : 0}%` }"
                /></span>
                <span class="w-24 shrink-0 font-mono text-[11px]">你勾 {{ pct(score.mine[m.key]) }}<span class="text-muted">（{{ score.mine[m.key].n }}）</span></span>
              </div>
              <div class="flex items-center gap-2">
                <span class="ps-track"><span
                  class="ps-bar ps-skip"
                  :style="{ width: `${score.skipped[m.key].n ? score.skipped[m.key].hit / score.skipped[m.key].n * 100 : 0}%` }"
                /></span>
                <span class="w-24 shrink-0 font-mono text-[11px] text-muted">沒勾 {{ pct(score.skipped[m.key]) }}（{{ score.skipped[m.key].n }}）</span>
              </div>
            </div>
          </div>
        </div>
        <div class="space-y-1">
          <div class="text-xs text-muted">
            最近勾的
          </div>
          <div class="flex flex-wrap gap-2">
            <div
              v-for="r in score.recent"
              :key="r.issue"
              class="ps-day"
            >
              <span class="font-mono text-[11px] text-muted">{{ r.nextIssue ?? '等開獎' }}</span>
              <span
                v-for="it in r.items"
                :key="it.key"
                class="ps-pick"
                :class="it.hit == null ? '' : it.hit ? 'ps-ok' : 'ps-no'"
                :title="`${POINT_META.find(m => m.key === it.key)!.name}：${it.hit == null ? '等開獎' : it.hit ? '成真' : '沒成真'}`"
              >{{ short(it.key) }}{{ it.hit == null ? '' : it.hit ? '✓' : '✗' }}</span>
            </div>
          </div>
        </div>
        <p class="text-[11px] text-muted">
          「沒勾」= 同一期同樣亮燈、你沒勾的。你勾的明顯比沒勾的準，才代表你挑得出來。
        </p>
      </div>
    </UCard>
  </section>
</template>

<style scoped>
.ps-track {
  position: relative;
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: var(--viz-mid);
  overflow: hidden;
}
.ps-bar {
  display: block;
  height: 100%;
  border-radius: 4px;
}
.ps-mine {
  background: var(--viz-orange);
}
.ps-skip {
  background: var(--viz-gray);
}
.ps-day {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 8px;
  padding: 3px 8px;
  background: var(--ui-bg-elevated);
}
.ps-pick {
  font-size: 12px;
  font-weight: 600;
}
.ps-ok {
  color: var(--viz-good-text);
}
.ps-no {
  color: var(--viz-bad);
}
</style>
