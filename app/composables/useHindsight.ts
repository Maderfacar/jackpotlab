/**
 * 鑑古 composable —— 把一個 gameId 對應的開獎史、analysisState、BrainState、
 * 當期 firings、排名與當期警示打包給 UI。
 *
 * 流程（每次 gameId 切換 / refresh）：
 *   1. 抓 D 期開獎（/api/draws/{gameId}/recent?limit=D），由小到大排序
 *   2. 用 defaultN() 重 hydrate analysisState（用 draws.vue 同一個 utils；獨立計算）
 *   3. localStorage 讀 cache 的 BrainState：
 *      - 命中且 lastProcessedTerm 等於最新一期 → 直接用
 *      - 否則 replayHistory 全部重跑
 *   4. 對「全部 history」做一次當下 evaluation → currentFirings、ranking
 *   5. detectAlerts(brainState, currentFirings) → 當期警示
 *      合併進 brainState.alerts（去重 by id），存 localStorage
 *
 * 全部運算客戶端跑、不寫 Firebase（[[project-brain-design-decisions]] 記憶層級）。
 */

import { GAMES, type GameId } from '~~/shared/lotto/games'
import type { DrawQueryResponse, DrawResult } from '~~/shared/lotto/types'
import {
  type AnalysisDrawInput,
  type AnalysisState,
  defaultN,
  hydrateFromDraws
} from '~/utils/analysis'
import { detectAlerts } from '~/hindsight/alerts'
import { clampHindsightD, defaultHindsightD } from '~/hindsight/config'
import { rankNumbersForNextDraw, type NumberRanking } from '~/hindsight/ensemble'
import { replayHistory } from '~/hindsight/replay'
import { getSignalsForGame, signalRegistry } from '~/hindsight/registry'
import { registerAllSignals } from '~/hindsight/signals'
import {
  loadBrainState,
  saveBrainState,
  sweepStaleHindsightStorage
} from '~/hindsight/storage'
import type {
  BrainAlert,
  BrainDraw,
  BrainState,
  SignalDef,
  SignalEvaluation,
  SignalFiringRecord
} from '~/hindsight/types'

// Module-level guard：避免在 SSR + Client hydrate + HMR 重 setup 時重複 registerSignal throw。
// W2 的 registerAllSignals 對重複呼叫不容忍，所以這層擋。
let signalsBooted = false
function bootSignalsOnce() {
  if (signalsBooted) return
  if (signalRegistry.size > 0) {
    signalsBooted = true
    return
  }
  registerAllSignals()
  signalsBooted = true
}

export interface CurrentSignalFiring {
  signal: SignalDef
  evaluation: SignalEvaluation
  /** 為 null 代表條件成立但無號可推（UI 半透明顯示）。 */
  firing: SignalFiringRecord | null
}

export interface UseHindsightState {
  loading: Ref<boolean>
  error: Ref<string | null>
  drawsAsc: ComputedRef<BrainDraw[]>
  brainState: ComputedRef<BrainState | null>
  analysisState: ComputedRef<AnalysisState | null>
  /** 當下亮燈訊號（含 conditionMetButEmpty）。 */
  currentFirings: ComputedRef<CurrentSignalFiring[]>
  /** 排名：按集成分數高→低。樣本不足訊號權重已被 shrinkage 拉回 baseline。 */
  ranking: ComputedRef<NumberRanking[]>
  /** 當期警示（不含歷史 brainState.alerts）。 */
  currentAlerts: ComputedRef<BrainAlert[]>
  refresh: () => Promise<void>
}

function drawResultToBrainDraw(r: DrawResult, gameId: GameId): BrainDraw {
  // 威力彩第二區 (1-8) 與主號完全獨立計分，不該混進 BrainDraw.numbers，
  // 否則所有訊號（interval_mean / consecutive_chain / cold_number…）會把第二區
  // 當主號評估，導致命中率被低值號（1-8）汙染。
  // 其他彩種沿用既有合併規則：bingo 中央彩球本就在 20 顆內、lotto649 特別號維持。
  const merged = r.special != null && gameId !== 'super_lotto638'
    ? [...r.numbers, r.special]
    : r.numbers
  return {
    drawTerm: r.drawTerm,
    drawDate: r.drawDate,
    numbers: [...new Set(merged)].sort((a, b) => a - b)
  }
}

function toAnalysisInput(d: BrainDraw): AnalysisDrawInput {
  return {
    drawTerm: d.drawTerm,
    drawDate: d.drawDate,
    prizes: d.numbers
  }
}

function mergeAlerts(historical: BrainAlert[], fresh: BrainAlert[]): BrainAlert[] {
  const seen = new Set(historical.map(a => a.id))
  const out = [...historical]
  for (const a of fresh) {
    if (!seen.has(a.id)) {
      out.push(a)
      seen.add(a.id)
    }
  }
  return out
}

/**
 * 評估「下一期」：history 是已知所有期，analysisState 是把全部期灌完的狀態。
 * todayDate 用最後一筆的 drawDate（最接近真實）。
 */
function evaluateCurrent(
  gameId: GameId,
  history: BrainDraw[],
  analysisState: AnalysisState,
  signals: SignalDef[]
): CurrentSignalFiring[] {
  if (history.length === 0) return []
  const todayDate = history[history.length - 1]!.drawDate
  const out: CurrentSignalFiring[] = []
  for (const sig of signals) {
    const evaluation = sig.evaluate({
      gameId,
      history,
      analysisState,
      todayDate
    })
    // 「下一期」尚未開獎 → drawTerm 用最後一期 +1 作為佔位
    const nextTerm = (history[history.length - 1]!.drawTerm) + 1
    const firing: SignalFiringRecord | null = evaluation.fires
      ? {
          drawTerm: nextTerm,
          drawDate: '',
          picks: [...evaluation.picks],
          pickGroups: evaluation.pickGroups
        }
      : null
    out.push({ signal: sig, evaluation, firing })
  }
  return out
}

export function useHindsight(gameId: Ref<GameId> | ComputedRef<GameId>): UseHindsightState {
  // 確保訊號註冊（W2 三支）。SSR + Client + HMR 多次 setup 都安全。
  bootSignalsOnce()

  const loading = ref(false)
  const error = ref<string | null>(null)
  const drawsRef = shallowRef<BrainDraw[]>([])
  const analysisRef = shallowRef<AnalysisState | null>(null)
  const brainRef = shallowRef<BrainState | null>(null)
  const currentFiringsRef = shallowRef<CurrentSignalFiring[]>([])
  const currentAlertsRef = shallowRef<BrainAlert[]>([])
  const rankingRef = shallowRef<NumberRanking[]>([])

  async function load(g: GameId) {
    loading.value = true
    error.value = null
    try {
      const d = clampHindsightD(defaultHindsightD(g))
      const res = await $fetch<DrawQueryResponse>(`/api/draws/${g}/recent`, {
        params: { limit: d }
      })
      const drawsAsc = [...res.results]
        .sort((a, b) => a.drawTerm - b.drawTerm)
        .map(r => drawResultToBrainDraw(r, g))

      if (drawsAsc.length === 0) {
        drawsRef.value = []
        analysisRef.value = null
        brainRef.value = null
        currentFiringsRef.value = []
        currentAlertsRef.value = []
        rankingRef.value = []
        return
      }

      // 1. analysisState（自己 hydrate；不共用 draws.vue 的 cache，因為 D 不同）
      const analysisInputs = drawsAsc.map(toAnalysisInput)
      const analysis = hydrateFromDraws(g, defaultN(), analysisInputs)

      // 2. BrainState：cache 命中且 lastProcessedTerm 跟最新一致 → 用 cache，否則 replay
      const signals = getSignalsForGame(g)
      const latestTerm = drawsAsc[drawsAsc.length - 1]!.drawTerm
      const cached = loadBrainState(g)
      const brain = cached && cached.lastProcessedTerm === latestTerm
        ? cached
        : replayHistory(g, drawsAsc, signals)

      // 3. 當下評估 → currentFirings
      const evaluations = evaluateCurrent(g, drawsAsc, analysis, signals)

      // 4. ranking
      const firingsMap: Record<string, SignalFiringRecord> = {}
      for (const ev of evaluations) {
        if (ev.firing) firingsMap[ev.signal.id] = ev.firing
      }
      const ranking = rankNumbersForNextDraw(firingsMap, brain.scorecards, g)

      // 5. detect 當期警示，merge 進歷史
      const fresh = detectAlerts(brain, firingsMap, drawsAsc)
      const merged: BrainState = {
        ...brain,
        alerts: mergeAlerts(brain.alerts, fresh),
        updatedAt: new Date().toISOString()
      }
      saveBrainState(merged)

      drawsRef.value = drawsAsc
      analysisRef.value = analysis
      brainRef.value = merged
      currentFiringsRef.value = evaluations
      currentAlertsRef.value = fresh
      rankingRef.value = ranking
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'unknown error'
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    sweepStaleHindsightStorage()
    load(toValue(gameId))
  })

  watch(() => toValue(gameId), (g) => {
    load(g)
  })

  async function refresh() {
    await load(toValue(gameId))
  }

  // 用 computed 把 shallowRef 包成 ComputedRef 以對齊 UseHindsightState 簽名。
  // 客戶端讀路徑簡化：UI 直接 .value 即可。
  return {
    loading,
    error,
    drawsAsc: computed(() => drawsRef.value),
    brainState: computed(() => brainRef.value),
    analysisState: computed(() => analysisRef.value),
    currentFirings: computed(() => currentFiringsRef.value),
    ranking: computed(() => rankingRef.value),
    currentAlerts: computed(() => currentAlertsRef.value),
    refresh
  }
}

/** GameMeta 對 UI 用。 */
export function hindsightGameMeta(gameId: GameId) {
  return GAMES[gameId]
}
