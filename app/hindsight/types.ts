/**
 * 鑑古（Hindsight）核心型別。
 *
 * 系統角色：每彩種一顆腦，全域共用（不分使用者）。腦讀「訊號定義 + 開獎史」
 * 推算出排名、亮燈、警示與成績單。所有 state 皆 immutable。
 *
 * 詳細設計依據見 memory:
 *   - project-brain-design-decisions
 *   - project-brain-global-not-per-user
 *   - feedback-no-fake-analysis-output
 */

import type { GameId } from '../../shared/lotto/games'
import type { AnalysisState } from '../utils/analysis'

/** 鑑古吃的開獎簡化版。numbers 含特別號（若該彩種有）。 */
export interface BrainDraw {
  drawTerm: number
  drawDate: string
  numbers: number[]
}

/** 訊號分組推薦（例：訊號 1 一次推 5 組，每組對應一個 slot）。 */
export interface PickGroup {
  label: string
  numbers: number[]
}

/**
 * 訊號 evaluate() 的回傳。
 *
 * `fires` 嚴格定義為「條件成立 **AND** 有實際 picks」。
 * 條件成立但 picks 為空（無號可推）的狀況改用 `conditionMetButEmpty` + `emptyGroupLabels`
 * 給 UI 提示用，**不** 計入 scorecard。
 */
export interface SignalEvaluation {
  fires: boolean
  picks: number[]
  pickGroups?: PickGroup[]
  conditionMetButEmpty?: boolean
  emptyGroupLabels?: string[]
}

/**
 * 一次「亮燈」紀錄。drawTerm/drawDate 指這次預測對應的「下一期」。
 * 打完分後會附上 hits / hitNumbers。
 */
export interface SignalFiringRecord {
  drawTerm: number
  drawDate: string
  picks: number[]
  pickGroups?: PickGroup[]
  hits?: number
  hitNumbers?: number[]
}

/**
 * 訊號成績單。
 * - totalFires / totalHits / totalPicks 為累積值
 * - recentFirings 保留近期 50 筆紀錄（給 UI 與漂移偵測用）
 * - firingTerms 記錄每次亮燈對應的「預測期」
 * - coFiringCounts 記錄共燈次數（key 為另一支訊號的 id）
 */
export interface SignalScorecard {
  signalId: string
  totalFires: number
  totalHits: number
  totalPicks: number
  recentFirings: SignalFiringRecord[]
  firingTerms: number[]
  coFiringCounts: Record<string, number>
}

export type AppliesTo = GameId | 'all'

export interface SignalEvalParams {
  gameId: GameId
  /** 嚴格定義為 evaluate 時刻「之前」的開獎史（不含當期）。 */
  history: BrainDraw[]
  analysisState: AnalysisState
  todayDate: string
}

export interface SignalDef {
  id: string
  nameZh: string
  description: string
  appliesTo: AppliesTo[]
  evaluate: (params: SignalEvalParams) => SignalEvaluation
}

export type AlertType = 'multi_signal' | 'rare_combination' | 'signal_drift' | 'overall_drift'

export interface BrainAlert {
  id: string
  type: AlertType
  drawTerm: number
  drawDate: string
  detail: string
  signals: string[]
  createdAt: string
}

/**
 * 每彩種一份 BrainState。scorecards 以 signalId 為 key。
 * lastProcessedTerm 表示這顆腦最近一次「打分完成」的期數。
 */
export interface BrainState {
  v: 2
  gameId: GameId
  lastProcessedTerm: number | null
  scorecards: Record<string, SignalScorecard>
  alerts: BrainAlert[]
  updatedAt: string
}
