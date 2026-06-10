<script setup lang="ts">
/**
 * 當下：下一期建議排名（釘頂）、亮燈訊號清單、上一期表現。
 *
 * 誠信規則：
 *   - 樣本不足（< 30 picks）的訊號卡片半透明 + 標「⚠ 樣本不足」
 *   - 上一期表現永遠顯示，包括「中 0 顆」
 *   - conditionMetButEmpty 也要 show，但半透明 + 「條件成立、無號可推」
 *   - 沒算過顯示「—」
 *
 * 顯示細節：
 *   - 標題列顯示下一期推算日期（539/賓果 = 上期+1 天；649 = 下個週二/五；威力 = 下個週一/四）
 *   - 號碼下方列出「推此號的訊號名稱」（即 supportingSignals）
 *   - interval_mean 的 pickGroup 標籤後綴顯示「當前 X / 均值 Y」
 */

import { GAMES, type GameId } from '~~/shared/lotto/games'
import type { AnalysisPeriod, AnalysisState } from '~/utils/analysis'
import type { NumberRanking } from '~/hindsight/ensemble'
import { N0, baselineHitRate } from '~/hindsight/config'
import { recentHitRate, smoothedHitRate } from '~/hindsight/scorecard'
import type {
  BrainDraw,
  BrainState,
  PickGroup
} from '~/hindsight/types'
import type { CurrentSignalFiring } from '~/composables/useHindsight'

interface Props {
  gameId: GameId
  drawsAsc: BrainDraw[]
  brainState: BrainState | null
  analysisState: AnalysisState | null
  currentFirings: CurrentSignalFiring[]
  ranking: NumberRanking[]
}

const props = defineProps<Props>()

const TOP_K = 10
const SAMPLE_FLOOR = 30

const baseline = computed(() => baselineHitRate(props.gameId))
const topRanking = computed<NumberRanking[]>(() => props.ranking.slice(0, TOP_K))
const expandedNumber = ref<number | null>(null)

function toggleNumber(n: number) {
  expandedNumber.value = expandedNumber.value === n ? null : n
}

function signalName(signalId: string): string {
  const found = props.currentFirings.find(c => c.signal.id === signalId)
  return found?.signal.nameZh ?? signalId
}

// ---- 下一期日期推算 -------------------------------------------------------

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

function fmtDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

function nextOnWeekdays(from: Date, weekdays: number[]): Date {
  for (let i = 1; i <= 7; i++) {
    const d = new Date(from.getTime())
    d.setUTCDate(from.getUTCDate() + i)
    if (weekdays.includes(d.getUTCDay())) return d
  }
  return from
}

function parseUTC(dateStr: string): Date | null {
  if (!dateStr || dateStr.length < 10) return null
  const y = Number.parseInt(dateStr.slice(0, 4), 10)
  const m = Number.parseInt(dateStr.slice(5, 7), 10)
  const d = Number.parseInt(dateStr.slice(8, 10), 10)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  return new Date(Date.UTC(y, m - 1, d))
}

// 賓果：每天 07:05 起每 5 分鐘 1 期，term 跨日遞增。
// 同日內最小 drawTerm = 該日 07:05 那期，其他用偏移量推算時分。
const BINGO_START_MIN = 7 * 60 + 5
const BINGO_INTERVAL_MIN = 5

const bingoMinTermByDate = computed<Map<string, number>>(() => {
  const m = new Map<string, number>()
  if (props.gameId !== 'bingo_bingo') return m
  for (const d of props.drawsAsc) {
    const cur = m.get(d.drawDate)
    if (cur === undefined || d.drawTerm < cur) m.set(d.drawDate, d.drawTerm)
  }
  return m
})

function bingoTime(drawDate: string, drawTerm: number): string {
  const base = bingoMinTermByDate.value.get(drawDate)
  if (base === undefined) return ''
  const offset = drawTerm - base
  if (offset < 0 || offset > 230) return ''
  const totalMin = BINGO_START_MIN + offset * BINGO_INTERVAL_MIN
  const h = Math.floor(totalMin / 60) % 24
  const mm = totalMin % 60
  return `${pad2(h)}:${pad2(mm)}`
}

const isBingo = computed(() => props.gameId === 'bingo_bingo')

const lastDraw = computed<BrainDraw | null>(() => {
  if (props.drawsAsc.length === 0) return null
  return props.drawsAsc[props.drawsAsc.length - 1] ?? null
})

const nextDrawLabel = computed<string>(() => {
  const last = lastDraw.value
  if (!last) return ''
  // 賓果：下一場 = 同日 + 5 分鐘（跨日交給輪詢處理顯示）
  if (props.gameId === 'bingo_bingo') {
    const t = bingoTime(last.drawDate, last.drawTerm + 1)
    if (t) return `${last.drawDate.slice(5).replace('-', '/')} ${t}（推算）`
    return ''
  }
  const baseDate = parseUTC(last.drawDate)
  if (!baseDate) return ''
  let next: Date
  switch (props.gameId) {
    case 'lotto539': {
      next = new Date(baseDate.getTime())
      next.setUTCDate(baseDate.getUTCDate() + 1)
      break
    }
    case 'lotto649': {
      // 週二(2)、週五(5)
      next = nextOnWeekdays(baseDate, [2, 5])
      break
    }
    case 'super_lotto638': {
      // 週一(1)、週四(4)
      next = nextOnWeekdays(baseDate, [1, 4])
      break
    }
    default: return ''
  }
  return `${fmtDate(next).slice(5).replace('-', '/')}（推算）`
})

const nextDrawTerm = computed<number | null>(() => {
  const last = lastDraw.value
  return last ? last.drawTerm + 1 : null
})

// ---- 亮燈卡片 -------------------------------------------------------------

interface CardData {
  signalId: string
  nameZh: string
  kind: 'predict' | 'observation'
  pickGroups: PickGroup[] | null
  picks: number[]
  conditionMetButEmpty: boolean
  emptyGroupLabels: string[]
  /** 訊號 7 結構化 y 值，UI 用染色 chip 顯示。其他訊號為空。 */
  latestYs: number[]
  totalFires: number
  totalPicks: number
  recentRate: number | null
  cumulativeRate: number
  sampleLow: boolean
  recentSeries: Array<number | null>
}

// 2026-06-11 拍板：訊號 7 y 值染色 mapping（紅橙綠藍紫粉，Nuxt UI 4 text-{color}-500）
const Y_COLOR_CLASS: Record<number, string> = {
  1: 'text-red-500',
  2: 'text-orange-500',
  3: 'text-emerald-500',
  4: 'text-sky-500',
  5: 'text-violet-500',
  6: 'text-pink-500'
}
function yColorClass(y: number): string {
  return Y_COLOR_CLASS[y] ?? 'text-muted'
}

function parseRecord(record: string): number[] {
  if (!record) return []
  const out: number[] = []
  for (const part of record.split(',')) {
    if (!part) continue
    const v = Number.parseInt(part, 10)
    if (Number.isFinite(v)) out.push(v)
  }
  return out
}

function slotByLabel(label: string): AnalysisPeriod | null {
  // label 形如「隔期 N」或「隔期 N (...)」
  const m = label.match(/^隔期\s+(\d+)/)
  if (!m) return null
  const period = Number.parseInt(m[1]!, 10)
  if (!Number.isFinite(period)) return null
  const periods = props.analysisState?.periods ?? []
  return periods.find(p => p.period === period) ?? null
}

/**
 * interval_mean 專屬：對 pickGroup label 後綴顯示「當前 X / 均值 Y」。
 * 其他訊號 label 原樣回傳。
 */
function decorateGroupLabel(signalId: string, label: string): string {
  if (signalId !== 'interval_mean') return label
  const slot = slotByLabel(label)
  if (!slot) return label
  const vs = parseRecord(slot.record)
  if (vs.length === 0) return label
  const current = vs[0]!
  const mean = vs.reduce((a, b) => a + b, 0) / vs.length
  return `${label}（當前 ${current} / 均值 ${mean.toFixed(2)}）`
}

const litCards = computed<CardData[]>(() => {
  const out: CardData[] = []
  for (const cf of props.currentFirings) {
    // 不亮也不是 conditionMetButEmpty 的就跳過
    if (!cf.evaluation.fires && !cf.evaluation.conditionMetButEmpty) continue

    const sc = props.brainState?.scorecards[cf.signal.id]
    const totalPicks = sc?.totalPicks ?? 0
    const sampleLow = totalPicks < SAMPLE_FLOOR
    const cumulative = sc
      ? smoothedHitRate(sc, baseline.value, N0)
      : baseline.value
    const recent = sc ? recentHitRate(sc, 20) : null
    const recentSeries = sc
      ? sc.recentFirings.slice(-20).map((f) => {
          const picks = f.picks.length
          if (picks === 0) return null
          return (f.hits ?? 0) / picks
        })
      : []

    // 對 pickGroups 做 label decoration（interval_mean）
    const decoratedGroups = cf.evaluation.pickGroups
      ? cf.evaluation.pickGroups.map(g => ({
          label: decorateGroupLabel(cf.signal.id, g.label),
          numbers: g.numbers
        }))
      : null

    // 訊號 7 latestYs：UI 用染色 chip 顯示。若有 latestYs，移除 emptyGroupLabels
    // 中以「本期 y 組成」開頭那條（已被結構化資料取代），避免重複顯示。
    const latestYs = cf.evaluation.observationData?.latestYs ?? []
    const rawLabels = cf.evaluation.emptyGroupLabels ?? []
    const filteredLabels = latestYs.length > 0
      ? rawLabels.filter(l => !l.startsWith('本期 y 組成'))
      : rawLabels

    out.push({
      signalId: cf.signal.id,
      nameZh: cf.signal.nameZh,
      kind: cf.signal.kind === 'observation' ? 'observation' : 'predict',
      pickGroups: decoratedGroups,
      picks: cf.evaluation.picks,
      conditionMetButEmpty: !!cf.evaluation.conditionMetButEmpty,
      emptyGroupLabels: filteredLabels,
      latestYs,
      totalFires: sc?.totalFires ?? 0,
      totalPicks,
      recentRate: recent,
      cumulativeRate: cumulative,
      sampleLow,
      recentSeries
    })
  }
  return out
})

// ---- 上一期表現 -----------------------------------------------------------

interface LastFiring {
  signalId: string
  nameZh: string
  picks: number[]
  hits: number
  hitNumbers: number[]
}

const lastFirings = computed<LastFiring[]>(() => {
  const out: LastFiring[] = []
  const last = lastDraw.value
  if (!last || !props.brainState) return out
  for (const sc of Object.values(props.brainState.scorecards)) {
    const rec = sc.recentFirings.find(r => r.drawTerm === last.drawTerm)
    if (!rec) continue
    out.push({
      signalId: sc.signalId,
      nameZh: signalName(sc.signalId),
      picks: rec.picks,
      hits: rec.hits ?? 0,
      hitNumbers: rec.hitNumbers ?? []
    })
  }
  return out
})

function rateText(v: number | null): string {
  if (v == null) return '—'
  return `${(v * 100).toFixed(1)}%`
}

function isHit(num: number, hits: number[]): boolean {
  return hits.includes(num)
}

function supportingFor(num: number): string[] {
  const found = props.ranking.find(r => r.number === num)
  return found?.supportingSignals ?? []
}

function supportingNamesText(num: number): string {
  const ids = supportingFor(num)
  if (ids.length === 0) return ''
  return [...new Set(ids.map(signalName))].join(' · ')
}

// 中文短名（避免 chip 太長）
const SHORT_NAME_MAP: Record<string, string> = {
  interval_mean: '均',
  date_number: '日',
  consecutive_chain: '鏈',
  interval_sum: '和',
  tail_pair: '尾',
  cold_number: '冷',
  position_distribution: '位',
  streak_alert: '連',
  first_position: '位1'
}

function supportingShortChips(num: number): Array<{ id: string, short: string, full: string }> {
  const ids = [...new Set(supportingFor(num))]
  return ids.map(id => ({
    id,
    short: SHORT_NAME_MAP[id] ?? signalName(id).slice(0, 1),
    full: signalName(id)
  }))
}

const gameName = computed(() => GAMES[props.gameId].name)
</script>

<template>
  <div class="space-y-4">
    <!-- 釘頂：下一期建議 -->
    <div class="sticky top-0 z-10 -mx-2 sm:-mx-4 px-2 sm:px-4 pt-2 pb-3 bg-default/95 backdrop-blur supports-[backdrop-filter]:bg-default/70">
      <UCard :ui="{ body: 'p-4 sm:p-5' }">
        <div class="space-y-3">
          <div class="flex items-baseline justify-between gap-2">
            <div class="flex items-baseline gap-2 flex-wrap">
              <h3 class="text-sm font-semibold">
                下一期建議排名
              </h3>
              <span
                v-if="nextDrawTerm !== null"
                class="text-xs text-muted tabular-nums"
              >
                第 {{ nextDrawTerm }} 期 · {{ nextDrawLabel || '—' }} · {{ gameName }}
              </span>
            </div>
            <span class="text-xs text-muted">
              {{ topRanking.length === 0 ? '尚無亮燈訊號' : `共 ${ranking.length} 個候選 · 顯示前 ${topRanking.length}` }}
            </span>
          </div>
          <div
            v-if="topRanking.length === 0"
            class="rounded-md border border-dashed border-default p-4 text-center text-xs text-muted"
          >
            目前沒有訊號亮燈、無號可推
          </div>
          <div
            v-else
            class="flex flex-wrap items-start gap-2"
          >
            <button
              v-for="(r, idx) in topRanking"
              :key="r.number"
              type="button"
              class="group inline-flex flex-col items-center gap-1 rounded-md p-1.5 transition hover:bg-elevated"
              :class="expandedNumber === r.number ? 'bg-elevated ring-1 ring-primary' : ''"
              @click="toggleNumber(r.number)"
            >
              <span class="text-[10px] text-muted tabular-nums">
                #{{ idx + 1 }}
              </span>
              <UBadge
                color="warning"
                variant="solid"
                size="lg"
                class="min-w-9 justify-center font-mono"
              >
                {{ pad2(r.number) }}
              </UBadge>
              <span class="text-[10px] text-muted tabular-nums">
                {{ r.score.toFixed(2) }} 票
              </span>
              <!-- 訊號來源 chips -->
              <div
                v-if="supportingShortChips(r.number).length > 0"
                class="flex flex-wrap justify-center gap-0.5 max-w-[60px]"
              >
                <span
                  v-for="chip in supportingShortChips(r.number)"
                  :key="`${r.number}-${chip.id}`"
                  class="inline-flex items-center justify-center rounded bg-elevated px-1 py-0.5 text-[9px] leading-none text-muted"
                  :title="chip.full"
                >
                  {{ chip.short }}
                </span>
              </div>
            </button>
          </div>
          <!-- 為什麼是這個 -->
          <div
            v-if="expandedNumber !== null"
            class="rounded-md border border-default bg-elevated p-3 text-xs"
          >
            <div class="mb-1 font-medium">
              為什麼是 {{ pad2(expandedNumber) }}？
              <span
                v-if="supportingNamesText(expandedNumber)"
                class="ml-1 text-muted"
              >
                — {{ supportingNamesText(expandedNumber) }}
              </span>
            </div>
            <ul class="space-y-1">
              <li
                v-for="sigId in supportingFor(expandedNumber)"
                :key="sigId"
                class="text-muted"
              >
                · {{ signalName(sigId) }}
              </li>
              <li
                v-if="supportingFor(expandedNumber).length === 0"
                class="text-muted"
              >
                —
              </li>
            </ul>
          </div>
        </div>
      </UCard>
    </div>

    <!-- 正在亮燈的訊號 -->
    <section class="space-y-2">
      <h3 class="text-sm font-semibold">
        正在亮燈的訊號
      </h3>
      <div
        v-if="litCards.length === 0"
        class="rounded-md border border-dashed border-default p-4 text-center text-xs text-muted"
      >
        目前沒有訊號亮燈
      </div>
      <UCard
        v-for="card in litCards"
        :key="card.signalId"
        :ui="{ body: 'p-4' }"
        :class="card.kind === 'observation' ? '' : (card.conditionMetButEmpty && card.picks.length === 0 ? 'opacity-50' : (card.sampleLow ? 'opacity-70' : ''))"
      >
        <div class="space-y-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <div class="flex items-baseline gap-2">
              <span class="text-sm font-semibold">
                {{ card.nameZh }}
              </span>
              <UBadge
                v-if="card.kind === 'observation'"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                觀察型
              </UBadge>
              <UBadge
                v-else-if="card.conditionMetButEmpty && card.picks.length === 0"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                條件成立、無號可推
              </UBadge>
              <UBadge
                v-if="card.kind === 'predict' && card.sampleLow"
                color="warning"
                variant="subtle"
                size="sm"
                icon="i-lucide-triangle-alert"
              >
                ⚠ 樣本不足 {{ card.totalPicks }}/{{ SAMPLE_FLOOR }}
              </UBadge>
            </div>
            <div
              v-if="card.kind === 'predict'"
              class="flex items-center gap-3 text-xs text-muted tabular-nums"
            >
              <span>近期 {{ rateText(card.recentRate) }}</span>
              <span>累積 {{ rateText(card.cumulativeRate) }}</span>
              <HindsightSparkLine
                :data="card.recentSeries"
                :width="60"
                :height="18"
                color="rgb(217 119 6)"
              />
            </div>
            <div
              v-else
              class="text-xs text-muted tabular-nums"
            >
              已觀察 {{ card.totalFires }} 次
            </div>
          </div>

          <!-- pickGroups 分組顯示（不壓平） -->
          <div
            v-if="card.pickGroups && card.pickGroups.length > 0"
            class="space-y-2"
          >
            <div
              v-for="g in card.pickGroups"
              :key="g.label"
              class="flex flex-wrap items-center gap-1.5"
            >
              <span class="min-w-24 text-xs text-muted">{{ g.label }}</span>
              <UBadge
                v-for="n in g.numbers"
                :key="`${card.signalId}-${g.label}-${n}`"
                color="warning"
                variant="soft"
                size="md"
                class="min-w-8 justify-center font-mono"
              >
                {{ pad2(n) }}
              </UBadge>
            </div>
          </div>
          <div
            v-else-if="card.picks.length > 0"
            class="flex flex-wrap items-center gap-1.5"
          >
            <UBadge
              v-for="n in card.picks"
              :key="`${card.signalId}-${n}`"
              color="warning"
              variant="soft"
              size="md"
              class="min-w-8 justify-center font-mono"
            >
              {{ pad2(n) }}
            </UBadge>
          </div>

          <!-- 訊號 7：本期 y 組成染色 chip（紅橙綠藍紫粉，2026-06-11 拍板） -->
          <div
            v-if="card.latestYs.length > 0"
            class="space-y-1"
          >
            <div class="text-xs text-muted">
              本期 y 組成
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              <span
                v-for="(y, i) in card.latestYs"
                :key="`y-${card.signalId}-${i}`"
                :class="['inline-flex min-w-6 justify-center rounded border border-default px-2 py-0.5 text-xs font-mono font-semibold', yColorClass(y)]"
              >
                {{ y }}
              </span>
            </div>
          </div>

          <!-- 觀察訊息 / 條件成立但無號可推 -->
          <div
            v-if="card.emptyGroupLabels.length > 0"
            class="flex flex-col gap-1 text-xs text-muted"
          >
            <span
              v-for="lbl in card.emptyGroupLabels"
              :key="lbl"
              class="rounded border border-default px-2 py-1"
            >
              {{ lbl }}
            </span>
          </div>
        </div>
      </UCard>
    </section>

    <!-- 上一期表現 -->
    <section class="space-y-2">
      <h3 class="text-sm font-semibold">
        上一期表現
      </h3>
      <UCard
        v-if="lastDraw"
        :ui="{ body: 'p-4' }"
      >
        <div class="space-y-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <div class="text-xs text-muted">
              第 <span class="font-mono">{{ lastDraw.drawTerm }}</span> 期 · {{ lastDraw.drawDate }}<span
                v-if="isBingo && bingoTime(lastDraw.drawDate, lastDraw.drawTerm)"
                class="font-mono"
              > {{ bingoTime(lastDraw.drawDate, lastDraw.drawTerm) }}</span>
            </div>
          </div>
          <div>
            <div class="text-xs text-muted mb-1">
              實際開出
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              <UBadge
                v-for="n in lastDraw.numbers"
                :key="`actual-${n}`"
                color="warning"
                variant="solid"
                size="md"
                class="min-w-8 justify-center font-mono"
              >
                {{ pad2(n) }}
              </UBadge>
            </div>
          </div>
          <div
            v-if="lastFirings.length === 0"
            class="rounded-md border border-dashed border-default p-3 text-center text-xs text-muted"
          >
            上一期沒有訊號亮燈
          </div>
          <div
            v-else
            class="space-y-2"
          >
            <div
              v-for="f in lastFirings"
              :key="`last-${f.signalId}`"
              class="rounded border border-default p-2"
            >
              <div class="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <span class="font-medium">{{ f.nameZh }}</span>
                <span
                  class="tabular-nums"
                  :class="f.hits > 0 ? 'text-emerald-500' : 'text-muted'"
                >
                  中 {{ f.hits }} / 推 {{ f.picks.length }}
                </span>
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-1">
                <UBadge
                  v-for="n in f.picks"
                  :key="`last-${f.signalId}-${n}`"
                  :color="isHit(n, f.hitNumbers) ? 'success' : 'neutral'"
                  :variant="isHit(n, f.hitNumbers) ? 'solid' : 'subtle'"
                  size="sm"
                  class="min-w-7 justify-center font-mono"
                >
                  {{ pad2(n) }}
                </UBadge>
              </div>
            </div>
          </div>
        </div>
      </UCard>
      <div
        v-else
        class="rounded-md border border-dashed border-default p-4 text-center text-xs text-muted"
      >
        —
      </div>
    </section>
  </div>
</template>
