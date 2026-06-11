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
/** 訊號 10 結構化資料：每隔期一筆「命中數 + 該期當時剩餘 + 剩餘號碼集合」+ 連莊紅框 */
export interface OriginIntervalEntry {
  interval: number
  hits: number
  remaining: number
  remainingNumbers: number[]
  /**
   * T 期從此 pre-T 隔期擷取的號碼，在 sorted pre-T periods[interval] 中的位置 y 值
   * （1-indexed、升序）。對應 draws「獎號關聯」位置 x-y 的 y。
   */
  positionYs: number[]
}

export interface OriginDistributionData {
  perInterval: OriginIntervalEntry[]
  /** 0-3 隔期彙總 */
  totalHits: number
  totalRemaining: number
  /** 隔期 0 上的連莊紅框號（= 該期當時隔期 0 ∩ 隔期 1 對應期 numbers） */
  carryoverInPeriod0: number[]
}

export interface SignalEvaluation {
  fires: boolean
  picks: number[]
  pickGroups?: PickGroup[]
  conditionMetButEmpty?: boolean
  emptyGroupLabels?: string[]
  /** 觀察型訊號的結構化資料，供 UI 染色等渲染。訊號 7 使用 latestYs；訊號 10 使用 originDistribution。 */
  observationData?: {
    latestYs?: number[]
    originDistribution?: OriginDistributionData
  }
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
  /**
   * 觀察文字（即 evaluate() 回傳的 emptyGroupLabels）。
   * 觀察型訊號用這個保留「第 X 期當下實際觀察了什麼」，讓 SignalDetail 的
   * 「觀察紀錄」表格可以印出每期真實內容（鏈、同尾號清單、y 分佈 …）。
   * 預測型訊號通常為空。
   */
  observationLabels?: string[]
  /**
   * 觀察型訊號的結構化資料（與 SignalEvaluation.observationData 對齊）。
   * 訊號 7 用 latestYs 在歷次紀錄中保留每期 y 值列表，UI 可逐期染色重現。
   * 訊號 10 用 originDistribution 保留 4 個隔期的「命中/剩餘/剩餘號碼集合」+ 連莊紅框集合。
   */
  observationData?: {
    latestYs?: number[]
    originDistribution?: OriginDistributionData
  }
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
  /**
   * 當期 draw（在 replay 路徑會提供；evaluateCurrent 路徑為 undefined）。
   *
   * **預測型訊號禁止讀此欄**（會偷看未來、違反鑑古鐵律）。
   * 只有觀察型訊號可以用此欄模擬 applyNewDraws(currentDraw)、把視角推到 post-T。
   * 訊號 10（bingo_origin_distribution）就是這樣對齊 draws 隔期狀態 row 0..3 的。
   */
  currentDraw?: BrainDraw
}

/**
 * 訊號類型：
 *   - 'predict'：會推號、算命中率、進排名加權。預設值。
 *   - 'observation'：只記錄「條件成立」的次數與當下觀察文字，不推號、不算命中率、不進排名。
 *     UI 用 totalFires 顯示「已觀察 N 次」、用 recentFirings 顯示近期觀察記錄。
 */
export type SignalKind = 'predict' | 'observation'

export interface SignalDef {
  id: string
  nameZh: string
  description: string
  kind?: SignalKind
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
  v: 7
  gameId: GameId
  lastProcessedTerm: number | null
  scorecards: Record<string, SignalScorecard>
  alerts: BrainAlert[]
  updatedAt: string
}
