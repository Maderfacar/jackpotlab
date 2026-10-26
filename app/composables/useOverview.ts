/**
 * 一頁總覽的資料：歷史檔 + 檔案之後的新期數（同 /trend），全部在瀏覽器算。
 * 每個座標先算好「目前連幾期」「等多久」，畫面各區塊共用。
 */
import { computeFeatures, type DrawFeatures } from '~~/shared/lotto/patterns/features'
import { HISTORY_FILE_PATH, mergeDraws, parseHistoryFile, type PlainDraw } from '~~/shared/lotto/history-file'
import { buildCoords, orderStates, type CoordSeries } from '~~/shared/lotto/overview/coords'
import { currentRun, runStats, waits, type Run, type RunStats, type Wait } from '~~/shared/lotto/overview/streak'
import type { DrawQueryResponse } from '~~/shared/lotto/types'

/** 「正處於歷史高位」：以前連到（或等到）這麼久的段數 ≤ 全部的 10%，而且至少有 20 段可比 */
const HIGH_SHARE = 0.1
const MIN_SAMPLE = 20
/** 等待表只列常見狀態（出現 ≥ 全部期數的 1%），少見的收起來 */
const COMMON_SHARE = 0.01

export interface CoordSummary {
  series: CoordSeries
  run: Run | null
  stats: RunStats | null
  runHigh: boolean
  /** 常見狀態的等待 */
  waits: Wait[]
  /** 少見狀態的等待（收起來） */
  rareWaits: Wait[]
}

export const isWaitHigh = (w: Wait) => !!w.waited && w.gaps >= MIN_SAMPLE && w.reachedNow / w.gaps <= HIGH_SHARE

function summarize(series: CoordSeries): CoordSummary {
  const run = currentRun(series.seq)
  const stats = run ? runStats(series.seq, run) : null
  const runHigh = !!run && !!stats && run.length >= 2 && stats.runs >= MIN_SAMPLE && stats.reached / stats.runs <= HIGH_SHARE
  const known = series.seq.filter((s): s is string => s != null)
  const all = waits(series.seq, orderStates(series.def, known))
  const common = (w: Wait) => w.count >= known.length * COMMON_SHARE || series.def.states.includes(w.state)
  return { series, run, stats, runHigh, waits: all.filter(common), rareWaits: all.filter(w => !common(w)) }
}

export function useOverview() {
  const { data: draws, status, error } = useAsyncData('overview-draws', async (): Promise<PlainDraw[]> => {
    const history = parseHistoryFile(await $fetch(HISTORY_FILE_PATH))
    const res = await $fetch<DrawQueryResponse>('/api/draws/lotto539/since', { query: { after: history.at(-1)?.issue ?? '0' } })
    const newer = res.results.map(r => ({ issue: String(r.drawTerm), date: r.drawDate, nums: [...r.numbers].sort((a, b) => a - b) }))
    return mergeDraws(history, newer)
  }, { server: false })

  const list = computed(() => draws.value ?? [])
  const feats = computed<DrawFeatures[]>(() => computeFeatures(list.value.map(d => d.nums)))
  const summaries = computed<CoordSummary[]>(() => (list.value.length ? buildCoords(list.value, feats.value).map(summarize) : []))

  return { draws: list, feats, summaries, status, error }
}
