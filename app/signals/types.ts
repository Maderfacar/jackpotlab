/**
 * 驗證訊號頁（/signals）核心型別。
 *
 * 定位：與鑑古（app/hindsight）完全獨立。這裡的規則預測的是 /draws
 * 「獎號關聯」表欄位（數值／總和）的下一期行為，不推薦號碼。
 * 資料來源 = utils/analysis.ts 的 AnalysisState.history（與 /draws 同一份算法）。
 *
 * 規則分兩種卡型：
 *   - LightRule（條件燈）：本期條件成立 → 亮燈 → 下期開出後判定命中與否
 *   - 觀察卡（走勢／頻率型，後續加入）：無亮燈、只呈現分布與走勢
 */

export interface SignalRow {
  issue: string
  date: string
  /** 該期五顆獎號（升序） */
  prizes: number[]
  /** 「數值」欄：每顆獎號來源 slot 的記錄首位數 */
  values: number[]
  /** 「隔期」欄：每顆獎號回溯到的 slot index */
  gaps: number[]
  /** 「位置」欄 x：該獎號來源 slot 當時的剩餘號碼數 */
  xs: number[]
  /** 「位置」欄 y：該獎號在來源 slot 剩餘號碼（小→大）中的排位 */
  ys: number[]
  /** 「總和」欄（= 該期隔期值加總；欄位為空時為 0） */
  sum: number
  /** 隔期／數值五欄皆齊全（無空值）才可進回測 */
  valid: boolean
}

/** 條件成立時，把湊成條件的獎號攤出來看（num = 獎號、note = 它的數值或隔期） */
export interface RelatedNumber {
  num: number
  note: string
}

export interface ConditionResult {
  met: boolean
  /** 白話描述本期條件判定，例：「本期數值加總 7 ≤ 10」 */
  detail: string
  related: RelatedNumber[]
}

export interface LightRule {
  id: string
  /** 短代號（B0/B1/C1…），對話引用用，UI 上是小標籤 */
  code: string
  name: string
  /** 規則白話說明 */
  description: string
  /** 亮燈時的下一期預期 */
  expectation: string
  /** condition／outcome 需要回看的最少期數（例：交替性要看前一期總和） */
  lookback: number
  condition(rows: SignalRow[], i: number): ConditionResult
  /** 條件期 i 亮燈後，於 i+1 開出時判定是否命中 */
  outcome(rows: SignalRow[], i: number): boolean
}

export interface FiringRecord {
  issue: string
  date: string
  detail: string
  nextIssue: string
  nextDate: string
  hit: boolean
}

export interface RuleBacktest {
  fired: number
  hit: number
  hitRate: number | null
  /** 基準率：不看條件、對所有期直接判定 outcome 的成立比例 */
  baselineN: number
  baselineHit: number
  baselineRate: number | null
  /** 最近亮燈紀錄（新 → 舊，最多 10 筆） */
  recentFirings: FiringRecord[]
}
