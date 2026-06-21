# 柯比頁 — 7 個分頁實作規格

> /kobe 是賓果賓果的「獎號來源觀察 + 多面向分析」頁。
> 路由：`app/pages/kobe.vue`；共用計算層：`app/utils/kobe-stats.ts`；
> 各分頁元件：`app/components/kobe/*Tab.vue`。
>
> **任何 phase 開工前先讀完本檔。**

## 共同守則

### 用語

UI 上**絕對不要**出現的字眼（即使在 tooltip 或 hover 也不行）：

- 英文代數變數：`K`、`X`、`J`、`V`、`Y`、`N`、`T`
- 統計術語：`MAE`、`holdout`、`baseline`、`chi-square`、`autocorrelation`、`regime`、`dispatcher`、`mean reversion`、`HMM`、`mixture`
- 模型行話：`lookup table`、`split`、`p-value`

UI 上**改用**：

| 不要寫 | 改寫成 |
| --- | --- |
| K, hits | 開出顆數 |
| X, remaining | 剩餘顆數 |
| J, interval | 隔期 |
| V, record value | 數值 / 累計沒命中次數 |
| Y, position | 位置 |
| N, hydration depth | 隔期深度 |
| holdout, baseline | 「用前 ___ 期當訓練、後 ___ 期當考試」、「對照基準」 |
| MAE | 平均誤差顆數 |
| chi-square uniform | 「位置是否平均分布的檢定」 |
| autocorrelation | 「相鄰期之間的相似度」 |
| mean reversion | 「冷了之後是否會反彈」 |
| regime | 波段 |
| dispatcher | 切換開關 |
| mixture model | 多套規則 |
| predictive lift | 預測提升 |

英文代數變數在 `.ts` / `.vue` script 區可以保留（給工程師看），UI 模板區一律換成中文。

### 「分析輸出不能造假」原則

依照使用者長期偏好（memory: `feedback-no-fake-analysis-output`）：

- 樣本不足 → 標明、不取捨樣本去湊好看的結論。
- 預測誤差 ≥ 對照基準 → 寫「無顯著預測力」、不要包裝。
- 任何 lookup table cell 樣本 < 20 → UI 半透明 + 標小字 `n=__`。

### 資料源

所有 phase 共用 `kobe-stats.ts` 的 `PerDrawSnapshot[]`（由 `buildSnapshots` 一次性算出）：

```ts
interface PerDrawSnapshot {
  drawTerm: number
  drawDate: string
  actualNumbers: number[]
  slots: SlotSnapshot[]     // 每隔期一筆，含 K=0 的隔期
  newcomerCount: number     // 不在任一 slot 內的號（新號）
}
interface SlotSnapshot {
  interval: number          // 0..N-1，pre-T-shift 索引
  remainingBefore: number   // pre-T 該隔期剩餘顆數
  recordValueBefore: number // pre-T 該隔期 record CSV 首碼
  hitsThisDraw: number      // T 期該隔期開出顆數（可為 0）
  hitNumbers: number[]      // T 期該隔期開出的實際號碼
}
```

第一期（index = 0）一律跳過（slots 為初始空狀態、不可信）。

`N=60`、`fetchLimit=2000`。

### 檔案結構

```
app/
  pages/kobe.vue                                  # 7-tab orchestrator
  components/kobe/
    ObservationTab.vue                            # ✅ Phase 1（觀察紀錄）
    IntervalRemainingTab.vue                      # ✅ Phase 0+1（資料一致性 + 隔期剩餘 → 開出）
    PendingTab.vue                                # placeholder（給未實作 tab 共用）
    ColdHotCycleTab.vue                           # ⏳ Phase 2（冷熱波段）
    PositionPatternTab.vue                        # ⏳ Phase 3（位置規律）
    NumberJourneyTab.vue                          # ⏳ Phase 4（號碼軌跡）
    SignalCompareTab.vue                          # ⏳ Phase 5（訊號比拚）
    RegimeDashboardTab.vue                        # ⏳ Phase 6+7（波段儀表板）
  utils/kobe-stats.ts                             # 共用純函式
docs/KOBE-PHASES.md                               # 本檔
```

### 驗證流程

每個 phase 完成後：

1. 不在本地跑（使用者偏好 — memory: `feedback-iverson-stats-principles`）。
2. `git commit + git push` 直接觸發 Vercel auto-deploy。
3. 使用者上線到 `https://jackpotlab-nine.vercel.app/kobe` 線上驗證。
4. 如果有可線上驗證的後端 API change、要 curl prod 驗證後再 commit。

---

## Phase 0：資料一致性檢查

**目的：** 給其他 phase 的地基 —— 驗證每期「Σ(各隔期開出顆數) + 新號數 = 實際開出顆數」。失敗就先 fix、其他 phase 無意義。

**狀態：** ✅ 已實作。位於 `kobe-stats.ts:checkIdentity()`，顯示在 IntervalRemainingTab 上方。

---

## Phase 1：隔期剩餘 → 下期開出

**目的：** 給定 (隔期, 剩餘顆數)、統計下一期該隔期平均開出多少顆。

**狀態：** ✅ 已實作。

- 計算：`kobe-stats.ts:buildIntervalRemainingTable()`
- 驗證：`kobe-stats.ts:holdoutValidate()` — 前 80% 訓練、後 20% 考試。
- UI：`IntervalRemainingTab.vue` — 主對照表 + 驗證可信度卡。

---

## Phase 2：冷熱波段

**狀態：** ⏳ 待實作。

**白話命題：**

- 每個隔期有一個「累計沒命中次數」（= record 首碼）。值越大、代表越冷。
- 命題 1：冷了一段時間後、是否會反彈？把所有「值 ≥ 閾值」的時點抓出來、看後續 1-5 期該隔期實際開出顆數，跟整體平均比。
- 命題 2：把所有隔期的數值加總、當作「整盤冷度」。看一天當中是否有時段性（時段切片 = 24 小時，賓果每 5 分鐘一期）。

**檔案：** `app/components/kobe/ColdHotCycleTab.vue`、計算放 `kobe-stats.ts`。

**新加 kobe-stats.ts 函式：**

```ts
// 對某個 record value 閾值、收集所有觸發時點、計算後續 1..5 期實際開出顆數平均
buildColdReboundTable(snapshots, thresholdMin = 1, thresholdMax = 10):
  Array<{ interval: number, threshold: number, sampleCount: number,
          actualMeanAt: [number, number, number, number, number],  // 後 1, 2, 3, 4, 5 期
          baselineMean: number }>

// 每期所有隔期數值加總 = 整盤冷度時間序
buildGlobalColdnessSeries(snapshots):
  Array<{ drawTerm: number, drawDate: string, hour: number, coldness: number, hitsThisDraw: number }>
```

**UI 要呈現：**

1. **冷後反彈表**：上方輸入「冷度閾值（預設 1-5）」可拖；表格列 = 隔期 0..19；欄 = 「後 1 期 / 後 2 期 / 後 3 期 / 後 5 期」實際平均開出。
   - 比對該隔期整體平均、改善幅度同 Phase 1 用「比基準少猜錯 ___ 顆」呈現。
   - 用簡單條形圖 + 數字顯示。
2. **整盤冷度時段圖**：x 軸 = 一天 24 小時、y 軸 = 該小時平均冷度。線圖即可。
   - 旁邊小卡：該小時平均開出顆數（看冷度高時是否真的命中變少／變多）。

**驗證守則：** 命題 1 如果反彈訊號 < 基準的 5% 改善 → 標「無顯著反彈規律」。命題 2 樣本：2000 期 / 24 小時 ≈ 每小時 80 期、夠用。

**用語禁區提醒：** 不要寫「mean reversion」、不要寫「閾值 threshold」、改寫「冷度標準」。

---

## Phase 3：位置規律

**狀態：** ⏳ 待實作。

**白話命題：**

- 命題 1：每個隔期內部，位置 1, 2, 3, ... 被開出的比例。理論完全隨機應均勻。檢定：跟均勻分布差多少（chi-square 但 UI 改稱「偏離平均的程度」）。
- 命題 2：上一期該隔期開了第幾位、下一期同隔期開的位置會傾向附近嗎（位置黏性）。

**檔案：** `PositionPatternTab.vue` + `kobe-stats.ts`。

**新加 kobe-stats.ts 函式：**

```ts
// 注意：當前 SlotSnapshot 沒記 position。要回填 position 必須改 buildSnapshots
// 加上 hitPositions: number[]（與 hitNumbers 對齊的 1-indexed 位置陣列）。
//
// 改完後：
buildPositionDistribution(snapshots): Array<{
  interval: number,
  positionCounts: number[]  // index 0 不用、1..maxPosition
  totalSamples: number
  expectedUniformPct: number  // 1/maxPosition
  deviationScore: number      // chi-square 改名「偏離平均度」
}>

buildPositionAutoCorrelation(snapshots): Array<{
  interval: number,
  lag1JointProbability: number  // P(本期某位置、下期同位置)
  independentExpected: number   // P(本期位置) × P(下期位置)、各自獨立期望
  liftPct: number               // joint / expected - 1
  sampleCount: number
}>
```

**UI 要呈現：**

1. **位置分布條形圖**：每隔期一個小條形圖、x 軸位置 1..20、y 軸佔比。在均勻線上畫一條虛線當參考。偏離大的隔期排前面。
2. **位置黏性表**：列 = 隔期、欄 = 「本期到下期同位置機率」/「獨立期望」/「提升幅度」。提升 > 10% 標亮。

**用語禁區：** chi-square → 「偏離平均的程度」；joint probability → 「同位置接續出現的機率」。

---

## Phase 4：號碼軌跡

**狀態：** ⏳ 待實作。

**白話命題：**

- 對每個號 (1..80)，列出它在 2000 期內被開的所有期數、計算間隔分布。
- 看哪些號偏熱（間隔短）、哪些偏冷（長尾）、是否有號特別容易連續期出現。

**檔案：** `NumberJourneyTab.vue` + `kobe-stats.ts`。

**新加 kobe-stats.ts 函式：**

```ts
buildNumberHistory(snapshots): Array<{
  number: number             // 1..80
  appearances: number        // 總出現期數
  expectedAppearances: number // 2000 × 20 / 80 = 500
  avgGap: number             // 平均期間間隔
  medianGap: number
  maxGap: number             // 最長沒出現
  consecutiveCount: number   // 連續兩期都出現的次數
  sourceIntervalCounts: number[]  // index 0..N-1，每個隔期作為來源的次數
}>
```

**UI 要呈現：**

1. **號碼總覽表**：80 個號的速覽。可排序：總出現次數 / 平均間隔 / 最長乾期 / 連續期數。
   - 顯著偏離期望（總出現次數 vs 500）的號用顏色標。
2. **號碼明細**（點某個號展開）：時間序圖、x 軸期、y 軸來源隔期、點點圖。
3. **來源隔期分布**：每個號目前的命中來源是哪幾個隔期（直方圖）。

**用語禁區：** inter-arrival time → 「間隔期數」；fat tail → 不寫，改寫「最長乾期 ___ 期」。

---

## Phase 5：訊號比拚

**狀態：** ⏳ 待實作。

**白話命題：**

- Phase 1 用「剩餘顆數」當條件；Phase 2/3 提出「數值（冷度）」和「位置」當條件。
- 比較這三個訊號獨立對「下期該隔期開出顆數」的預測力（後段保留期平均誤差）。
- 進階：兩兩組合（剩餘 + 數值、剩餘 + 位置）是否互補。

**檔案：** `SignalCompareTab.vue` + `kobe-stats.ts`。

**新加 kobe-stats.ts 函式：**

```ts
// 通用 holdout，支援以 (interval, anyConditionKey) 為條件
holdoutByCondition(
  snapshots,
  keyFn: (snap, slot) => string | null,  // null = 該樣本不入訓練
  trainRatio = 0.8
): HoldoutResult

// 用 buildIntervalRemainingTab 已有的 holdoutValidate 作為「剩餘顆數」基準；
// 另外傳 keyFn = (s, slot) => `${slot.interval}|${slot.recordValueBefore}` 算數值版本；
// 傳 keyFn 用上期 lastDraw 該隔期最後位置 → 位置版本。
```

**UI 要呈現：**

1. **三訊號比拚表**：列 = 訊號（剩餘顆數 / 數值 / 位置）、欄 = 整體平均誤差 / 改善幅度 / 樣本覆蓋率 / 結論（有預測力 / 微弱 / 無）。
2. **每個隔期下哪個訊號最強**：列 = 隔期 0..19、欄 = 三訊號的改善幅度、最佳一欄高亮。
3. **訊號組合測試**：兩兩組合的改善幅度（剩餘 + 數值 / 剩餘 + 位置 / 數值 + 位置 / 三個合一）。

**用語禁區：** logistic regression → 不寫，改「組合預測」；feature importance → 「哪個訊號比較有用」。

---

## Phase 6+7：波段儀表板

**狀態：** ⏳ 待實作。**這是壓軸、最複雜。**

**白話命題：**

使用者直覺：規則不是同時全用、而是分波段切換。

- Phase 6：用 2-3 個切換開關（時段、整盤冷度、上一期形態）把全部期切成 N 堆，看堆與堆之間 Phase 1 的對照表是否不同。如果顯著不同 → 切換開關真的在管事。
- Phase 7：把當下這期歸到一個波段、列出該波段下的條件預測。

**切換開關限制：** 只挑「跳過大於整體週期的因素」—— 時段（小時 of day）、整盤冷度、上期形態。**不做星期幾、不做節日、不做月初月底**（樣本 < 2000 期不夠）。

**檔案：** `RegimeDashboardTab.vue` + `kobe-stats.ts`。

**新加 kobe-stats.ts 函式：**

```ts
// 把每期歸到一個波段。
// 時段切換：用 drawDate 對應每天最早期數的時間（buildBingoMinTermByDate）+ drawTerm 算出每期 hour、
//   切 4 段（凌晨、上午、下午、晚上）。
// 整盤冷度切換：用每期 sum(slot.recordValueBefore)、切 3 段（低 / 中 / 高、按百分位）。
// 上期形態切換：用上一期 hits at J=0,1,2,3 的分布 — 集中（高隔期 0）vs 散開。

type RegimeKey = 'timeSlot' | 'globalColdness' | 'prevShape'

assignRegime(snapshots, regime: RegimeKey): Array<{
  drawTerm: number, regimeBucket: string  // e.g. '凌晨' / '上午' / '下午' / '晚上'
}>

// 在每個 regime bucket 內單獨跑 buildIntervalRemainingTable + holdoutValidate
buildPerRegimeAnalysis(snapshots, regime): {
  buckets: Array<{
    bucket: string,
    cells: IntervalRemainingCell[],
    holdout: HoldoutResult,
    drawCount: number
  }>
  // 比較不同 bucket 的 cell 差異：對 (interval, remaining) 計算
  // max bucket mean - min bucket mean，越大代表波段分得越乾淨。
  topDifferences: Array<{
    interval: number, remaining: number,
    bucketMeans: Record<string, number>,
    spread: number
  }>
}
```

**UI 要呈現：**

1. **切換開關選擇器**：使用者選 1 個（時段 / 冷度 / 上期形態）。
2. **「目前這期屬於哪個波段」卡**：顯示當下、明顯標出。
3. **每波段的對照表小卡**：3-4 張小卡並排、各自顯示該波段的 Phase 1 對照表（簡化版）+ 改善幅度。
4. **波段顯著差異 Top 10**：(隔期, 剩餘顆數) 在不同波段下平均開出差距最大的 Top 10，列出來方便人眼看。
5. **波段切換可信度**：跨波段 holdout 平均誤差 vs 全期合算 holdout、若波段化反而更差 → 標「波段化無實質改善、可能是雜訊」。

**重要驗證：** Phase 6+7 最容易自我催眠 —— 切片切得夠細任何噪音都會「顯著」。要嚴格用 holdout：把 80/20 切法在每個 bucket 內各自跑、總和比較。如果跨波段預測誤差 > 全期單一規則的預測誤差 → 不要硬說波段存在。

**用語禁區：** regime → 「波段」；conditional independence → 不寫；mixture model → 「多套規則」；HMM → 不寫，改「隱形切換」。
