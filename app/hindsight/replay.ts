/**
 * 鑑古 replay 引擎——按時間順序重跑歷史。
 *
 * **鐵律：嚴禁偷看未來。** 評估 T 期時，signal 只能看到 T **之前**（不含 T）的開獎史。
 * 詳見 [[project-brain-design-decisions]]「驗證（鑑古）必須避免『偷看未來』」。
 *
 * 流程（每期 T）：
 *   1. 用「T 之前」的 history + analysisState 評估每支訊號
 *   2. eval.fires === true 的，建一筆 SignalFiringRecord（drawTerm = T）
 *   3. T 真正進來：把 firing 與 nextDraw=T 餵 updateScorecard
 *   4. 共燈互記
 *   5. 把 T 推入 history、analysisState applyNewDraws
 *
 * analysisState 採增量維護（applyNewDraws），避免 O(N²) 從頭重算。
 */

import type { GameId } from '../../shared/lotto/games'
import {
  applyNewDraws,
  createInitialState,
  defaultN
} from '../utils/analysis'
import type { AnalysisDrawInput, AnalysisState } from '../utils/analysis'
import { bumpCoFirings, createEmptyScorecard, updateScorecard } from './scorecard'
import type {
  BrainDraw,
  BrainState,
  SignalDef,
  SignalFiringRecord,
  SignalScorecard
} from './types'

function toAnalysisInput(draw: BrainDraw): AnalysisDrawInput {
  return {
    drawTerm: draw.drawTerm,
    drawDate: draw.drawDate,
    prizes: draw.numbers
  }
}

function ensureScorecard(
  scorecards: Record<string, SignalScorecard>,
  signalId: string
): SignalScorecard {
  return scorecards[signalId] ?? createEmptyScorecard(signalId)
}

/**
 * 跑完歷史後回傳最終 BrainState。
 *
 * drawsAsc 必須按 drawTerm 由小到大排好。signals 可以是空陣列（W1 沒訊號時測試骨架）。
 */
export function replayHistory(
  gameId: GameId,
  drawsAsc: BrainDraw[],
  signals: SignalDef[]
): BrainState {
  const applicable = signals.filter(s =>
    s.appliesTo.includes('all') || s.appliesTo.includes(gameId)
  )

  let scorecards: Record<string, SignalScorecard> = {}
  for (const s of applicable) {
    scorecards[s.id] = createEmptyScorecard(s.id)
  }

  const historyBefore: BrainDraw[] = []
  let analysisState: AnalysisState = createInitialState(gameId, defaultN())
  let lastProcessedTerm: number | null = null

  for (const draw of drawsAsc) {
    // 1. 用「T 之前」評估
    const firings: Record<string, SignalFiringRecord> = {}
    for (const sig of applicable) {
      const evalResult = sig.evaluate({
        gameId,
        history: historyBefore,
        analysisState,
        todayDate: draw.drawDate
      })
      // observation 型訊號可以 fires=true 但 picks=[]；仍須記入 scorecard 累積 totalFires。
      // predict 型如果 picks=[] 視為「條件成立但無號可推」，舊規維持「不亮燈」。
      const isObservation = sig.kind === 'observation'
      if (evalResult.fires && (isObservation || evalResult.picks.length > 0)) {
        firings[sig.id] = {
          drawTerm: draw.drawTerm,
          drawDate: draw.drawDate,
          picks: [...evalResult.picks],
          pickGroups: evalResult.pickGroups
        }
      }
    }

    // 2-3. 打分 + 4. 共燈
    const firedIds = Object.keys(firings)
    const nextScorecards: Record<string, SignalScorecard> = { ...scorecards }
    for (const sigId of firedIds) {
      const firing = firings[sigId]!
      const sc = ensureScorecard(nextScorecards, sigId)
      const scored = updateScorecard(sc, firing, draw)
      const others = firedIds.filter(o => o !== sigId)
      nextScorecards[sigId] = bumpCoFirings(scored, others)
    }
    scorecards = nextScorecards

    // 5. 推進
    historyBefore.push(draw)
    analysisState = applyNewDraws(analysisState, [toAnalysisInput(draw)])
    lastProcessedTerm = draw.drawTerm
  }

  return {
    v: 3,
    gameId,
    lastProcessedTerm,
    scorecards,
    alerts: [],
    updatedAt: new Date().toISOString()
  }
}
