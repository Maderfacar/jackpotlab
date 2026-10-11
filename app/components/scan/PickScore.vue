<script setup lang="ts">
/**
 * 成績單（2026-10-11 使用者：「你的猜也要有評比，像我信那樣可以比對」）
 *   1. 20 年評比：每一點「你的看法」vs「歷史挑」，各自說中幾成、比平常多多少，誰贏
 *   2. 歷史挑最近猜了什麼、對不對（像「我信」的紀錄一樣一期一期列）
 *   3. 你按的「我信」：說中幾成，和同一批期數的你的看法、歷史挑比
 */
import { POINT_KEYS, type PointKey } from '~~/shared/lotto/scan/points/evaluate'
import { parsePickKey, POINT_META, type PickKey } from '~~/shared/lotto/scan/points/meta'
import type { Row } from '~~/shared/lotto/scan/points/rows'
import type { Evals, PointSummary } from '~~/shared/lotto/scan/points/stats'

const RECENT_DRAWS = 12
/** 兩邊「比平常多幾」相差這麼多以上才算贏，以內算差不多（可能只是運氣） */
const WIN_GAP = 3

const props = defineProps<{
  picks: Record<string, PickKey[]>
  status: 'idle' | 'loading' | 'ready' | 'error'
  evals: Evals
  hEvals: Evals
  summary: Record<PointKey, PointSummary>
  hSummary: Record<PointKey, PointSummary>
  /** 目前看的第幾期（成績單只算到這期，回看時不偷看之後） */
  t: number
  indexOf: Map<string, number>
  rows: Row[]
}>()

interface Tally {
  hit: number
  n: number
}
const empty = (): Tally => ({ hit: 0, n: 0 })
const pct = (r: Tally) => (r.n ? Math.round((r.hit / r.n) * 100) : null)
const show = (r: Tally) => (r.n ? `${pct(r)}%` : '—')
const no = (k: PointKey) => POINT_META.find(m => m.key === k)!.no

// ---------- 1. 20 年評比 ----------
const board = computed(() => POINT_META.map((m) => {
  const mine = props.summary[m.key]
  const hist = props.hSummary[m.key]
  const edge = (s: PointSummary) => (s.n && s.base != null ? Math.round((s.hit / s.n - s.base) * 100) : null)
  const em = m.claim === '—' ? null : edge(mine)
  const eh = edge(hist)
  const winner = em == null || eh == null ? null : em - eh >= WIN_GAP ? 'mine' : eh - em >= WIN_GAP ? 'hist' : 'tie'
  return { meta: m, mine, hist, em, eh, winner }
}))

// ---------- 2. 歷史挑最近猜了什麼 ----------
const recentHist = computed(() => {
  const out: { issue: string, nextIssue: string, items: { key: PointKey, target: string, hit: boolean | null }[] }[] = []
  for (let s = props.t - 1; s >= 0 && out.length < RECENT_DRAWS; s--) {
    const items = POINT_KEYS.flatMap((k) => {
      const e = props.hEvals[k][s]
      return e?.lit ? [{ key: k, target: e.target, hit: e.hit }] : []
    })
    if (items.length) out.push({ issue: props.rows[s]!.issue, nextIssue: props.rows[s + 1]!.issue, items })
  }
  return out
})
const recentHits = computed(() => recentHist.value.reduce((a, d) => ({
  hit: a.hit + d.items.filter(i => i.hit).length,
  n: a.n + d.items.filter(i => i.hit != null).length
}), empty()))

// ---------- 3. 你按的「我信」 ----------
const mineScore = computed(() => {
  const rowsOut = Object.fromEntries(POINT_KEYS.map(k => [k, { you: empty(), mine: empty(), hist: empty() }])) as Record<PointKey, { you: Tally, mine: Tally, hist: Tally }>
  const recent: { nextIssue: string | null, items: { label: string, hit: boolean | null }[] }[] = []
  let pending = 0
  let days = 0
  for (const [issue, keys] of Object.entries(props.picks)) {
    const s = props.indexOf.get(issue)
    if (s == null || s > props.t || keys.length === 0) continue
    days++
    const items = keys.map((pk) => {
      const { key, hist } = parsePickKey(pk)
      const e = (hist ? props.hEvals : props.evals)[key][s]
      const hit = s < props.t ? e?.hit ?? null : null
      if (hit == null) pending++
      else {
        const row = rowsOut[key]
        row.you.n++
        if (hit) row.you.hit++
        // 同一期：你的看法、歷史挑各自說中沒
        const em = props.evals[key][s]
        const eh = props.hEvals[key][s]
        if (em?.lit && em.hit != null) {
          row.mine.n++
          if (em.hit) row.mine.hit++
        }
        if (eh?.lit && eh.hit != null) {
          row.hist.n++
          if (eh.hit) row.hist.hit++
        }
      }
      return { label: `${no(key)}${hist ? '歷' : ''}`, hit }
    })
    recent.push({ nextIssue: props.rows[s + 1]?.issue ?? null, items })
  }
  recent.sort((a, b) => Number(b.nextIssue ?? Infinity) - Number(a.nextIssue ?? Infinity))
  const all = POINT_KEYS.reduce((a, k) => ({ hit: a.hit + rowsOut[k].you.hit, n: a.n + rowsOut[k].you.n }), empty())
  return { rows: rowsOut, recent: recent.slice(0, 12), pending, days, all }
})
</script>

<template>
  <section class="space-y-4">
    <h2 class="text-lg font-semibold">
      成績單
    </h2>

    <!-- 1. 20 年評比 -->
    <UCard>
      <div class="mb-3 space-y-0.5">
        <div class="text-sm font-medium">
          20 年評比：你的看法 vs 歷史挑
        </div>
        <div class="text-xs text-muted">
          比的是「比盤面該有的多說中幾次（每 100 次）」，越多越好；只比說中率不公平，因為兩邊猜的東西不一樣，有的本來就容易中。
        </div>
      </div>
      <div class="space-y-2">
        <div class="grid grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)_3rem] items-center gap-x-3 text-[11px] text-muted">
          <span />
          <span>你的看法：說中／盤面該有</span>
          <span>歷史挑：說中／盤面該有</span>
          <span class="text-right">誰贏</span>
        </div>
        <div
          v-for="b in board"
          :key="b.meta.key"
          class="grid grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)_3rem] items-center gap-x-3"
        >
          <span class="truncate text-xs">{{ b.meta.no }} {{ b.meta.name }}</span>
          <span
            class="ps-cell"
            :class="b.winner === 'mine' ? 'ps-win' : ''"
          >
            <template v-if="b.em != null">
              <b class="font-mono">{{ show(b.mine) }}</b><span class="text-muted">／{{ Math.round((b.mine.base ?? 0) * 100) }}%</span>
              <span
                class="ml-1 font-semibold"
                :class="b.em >= 3 ? 'ps-up' : b.em <= -3 ? 'ps-down' : 'text-muted'"
              >{{ b.em > 0 ? '+' : '' }}{{ b.em }}</span>
            </template>
            <span
              v-else
              class="text-muted"
            >還沒定</span>
          </span>
          <span
            class="ps-cell"
            :class="b.winner === 'hist' ? 'ps-win' : ''"
          >
            <b class="font-mono">{{ show(b.hist) }}</b><span class="text-muted">／{{ Math.round((b.hist.base ?? 0) * 100) }}%</span>
            <span
              v-if="b.eh != null"
              class="ml-1 font-semibold"
              :class="b.eh >= 3 ? 'ps-up' : b.eh <= -3 ? 'ps-down' : 'text-muted'"
            >{{ b.eh > 0 ? '+' : '' }}{{ b.eh }}</span>
          </span>
          <span class="text-right text-xs font-semibold">{{ b.winner === 'mine' ? '你的看法' : b.winner === 'hist' ? '歷史挑' : b.winner === 'tie' ? '差不多' : '—' }}</span>
        </div>
      </div>
      <p class="mt-3 text-[11px] text-muted">
        +8 ＝每 100 次比盤面該有的多中 8 次。兩邊相差不到 3 算「差不多」，可能只是運氣。
      </p>
    </UCard>

    <!-- 2. 歷史挑最近猜了什麼 -->
    <UCard>
      <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span class="text-sm font-medium">歷史挑最近 {{ recentHist.length }} 期猜了什麼、對不對</span>
        <span class="text-xs text-muted">這 {{ recentHist.length }} 期一共猜 {{ recentHits.n }} 個，說中 <b class="font-mono text-highlighted">{{ show(recentHits) }}</b></span>
      </div>
      <div class="space-y-1.5">
        <div
          v-for="d in recentHist"
          :key="d.issue"
          class="flex flex-wrap items-center gap-1.5"
        >
          <span class="w-24 shrink-0 font-mono text-[11px] text-muted">猜第 {{ d.nextIssue.slice(-3) }} 期</span>
          <span
            v-for="it in d.items"
            :key="it.key"
            class="ps-pick"
            :class="it.hit == null ? '' : it.hit ? 'ps-ok' : 'ps-no'"
            :title="`${no(it.key)} 猜：${it.target}（${it.hit == null ? '還沒開' : it.hit ? '說中' : '沒說中'}）`"
          >{{ no(it.key) }}{{ it.hit == null ? '…' : it.hit ? '✓' : '✗' }}</span>
        </div>
      </div>
      <p class="mt-2 text-[11px] text-muted">
        滑過去可以看到每一點當時猜的是什麼。
      </p>
    </UCard>

    <!-- 3. 你按的「我信」 -->
    <UCard>
      <div class="mb-2 text-sm font-medium">
        你按的「我信」
      </div>
      <div
        v-if="status === 'loading' || status === 'idle'"
        class="text-sm text-muted"
      >
        讀取中…
      </div>
      <div
        v-else-if="status === 'error'"
        class="text-sm text-error"
      >
        這個瀏覽器讀不到你按過的紀錄
      </div>
      <div
        v-else-if="mineScore.days === 0"
        class="text-sm text-muted"
      >
        還沒按過。最新一期開完後，在上面「八點燈號」你相信哪個（你的看法或歷史挑）就按「我信」，下一期開出後這裡會自動對答案，並和同一批期數的你的看法、歷史挑比。
      </div>
      <div
        v-else
        class="space-y-3"
      >
        <div class="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          <span>按過 <b>{{ mineScore.days }}</b> 期</span>
          <span>已對答案 <b>{{ mineScore.all.n }}</b> 個，說中 <b class="font-mono text-highlighted">{{ show(mineScore.all) }}</b></span>
          <span
            v-if="mineScore.pending"
            class="text-xs text-muted"
          >還有 {{ mineScore.pending }} 個等開獎</span>
        </div>
        <div class="space-y-1">
          <div class="grid grid-cols-[6.5rem_repeat(3,minmax(0,1fr))] gap-x-3 text-[11px] text-muted">
            <span />
            <span>你信的</span>
            <span>同幾期你的看法</span>
            <span>同幾期歷史挑</span>
          </div>
          <div
            v-for="m in POINT_META"
            :key="m.key"
            class="grid grid-cols-[6.5rem_repeat(3,minmax(0,1fr))] gap-x-3 font-mono text-xs"
          >
            <span class="truncate font-sans">{{ m.no }} {{ m.name }}</span>
            <span><b>{{ show(mineScore.rows[m.key].you) }}</b> <span class="text-muted">({{ mineScore.rows[m.key].you.n }})</span></span>
            <span>{{ show(mineScore.rows[m.key].mine) }} <span class="text-muted">({{ mineScore.rows[m.key].mine.n }})</span></span>
            <span>{{ show(mineScore.rows[m.key].hist) }} <span class="text-muted">({{ mineScore.rows[m.key].hist.n }})</span></span>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <div
            v-for="r in mineScore.recent"
            :key="r.nextIssue ?? 'next'"
            class="ps-day"
          >
            <span class="font-mono text-[11px] text-muted">{{ r.nextIssue ? `第 ${r.nextIssue.slice(-3)} 期` : '等開獎' }}</span>
            <span
              v-for="it in r.items"
              :key="it.label"
              class="ps-pick"
              :class="it.hit == null ? '' : it.hit ? 'ps-ok' : 'ps-no'"
            >{{ it.label }}{{ it.hit == null ? '' : it.hit ? '✓' : '✗' }}</span>
          </div>
        </div>
        <p class="text-[11px] text-muted">
          括號是次數。「歷」＝你信的是歷史挑那一邊。你信的明顯比同幾期的兩邊都準，才代表你挑得出來。
        </p>
      </div>
    </UCard>
  </section>
</template>

<style scoped>
.ps-cell {
  display: block;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 12px;
  background: var(--ui-bg-elevated);
}
.ps-win {
  box-shadow: inset 0 0 0 1.5px var(--viz-orange);
}
.ps-up {
  color: var(--viz-good-text);
}
.ps-down {
  color: var(--viz-bad);
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
