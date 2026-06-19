# 艾佛森頁面工作原則

> 寫給自己（Claude）看的。每次在艾佛森頁／統計類任務開工前先讀過一次。
> 使用者明確說過：「你忘記，犯錯我會很生氣」。

---

## 核心原則

### 1. 數據一律以「網頁產生的客觀數據」為依歸
- 統計、衍生資料 **必須** 由 page-level `analysisState` 推導
- 特別注意以下兩個資料源：
  - **隔期狀態** = `analysisState.periods`（每隔期的剩餘獎號 + 位置）
  - **獎號關聯** = `analysisState.history[].positions`（CSV X-Y 字串）
- 不可自己另算、不可瞎猜、不可造假
- 如果頁面上沒有的數字，就不要寫到統計裡

### 2. 遇事不決就問
- 任何不確定的需求、邏輯、參數，**先用 AskUserQuestion 問清楚再動手**
- 不要擅自決定 default 值、不要替使用者腦補意圖
- 一次把所有疑問批次問完，**不要連環問**

### 3. handoff 原則 — 最小化 Allow 中斷
- 不要試錯式 retry（先想清楚再下手）
- 不要中途停下來確認瑣事
- 任務內 tool call 盡量平行 / 一氣呵成

### 4. 不需要跑本地
- **直接 commit + push 結束任務**
- 不要 `preview_start`、不要自己 curl 驗
- 若真的需要瀏覽器驗證 → 請使用者在他端看，不要在工作流程裡擋住

### 5. 艾佛森頁分析參數（不可亂動）
| Tab | N | 深度 / D | 來源 |
|---|---|---|---|
| 隔期剩餘號碼 | 50 | 過去 1 小時（最新 12 期） | 內建定義 |
| 獎號關聯位置 | 60 | 500 期 | 對齊 `/draws` bingo 預設（`defaultN()` / `defaultD('bingo_bingo')`） |
| 符合規則的 20 顆 | 60 | 500 期 | 同上、用漸進式 hydration 在每步快照 slot[0..5] |

三個 tab 用 **同一份 `allDraws` fetch**。Tab1 / Tab2 各自 hydrate analysisState；Tab3 用自家漸進式 hydration 保留每期 slot[0..5] 快照。

> ⚠️ **語意正名（2026-06-19 使用者拍板）**：Tab3 名稱是「**符合規則的 20 顆**」、**不是預測**。是依規則從分析數據裡篩選號碼，使用者強調這是統計篩選、不是預測下一期。UI 文案禁用「預測」一詞；內部變數名可以保留 `prediction*` 以減少 diff 雜訊，但 PR 描述與註解要明確標「篩選」。

### 6. Tab3「符合規則的 N 顆」規則（2026-06-19 拍板、參數可調）

預設參數（`DEFAULT_CONFIG`，存在 `localStorage['iverson-prediction-rules-v1']`、UI 可即時調整）：
- `fetchLimit = 500`（比對期數深度、範圍 50~5000；改值會 debounce 500ms 後重抓 allDraws）
- `predictTarget = 20`（目標顆數）
- `sourceMaxInterval = 3`（隔期 0~3）
- `posCapHigh = 10`（位置 ≥ 10 走 per-interval Y 排除）
- `pos12Cap = 2`（位置 1、2 各 ≤ 2）
- `pos39Cap = 1`（位置 3~9 各 ≤ 1）
- `pos10PlusPercent = 30`（位 10+ 強制保留 30% 配額；2026-06-19 拍板）
- `le40Cap = 12`、`gt40Cap = 12`、`oddCap = 12`、`evenCap = 12`、`tailCap = 5`、`consecutiveCap = 4`

熱/冷池（hardcoded、`HOT_PICK_RATIO = 0.85`）：
- 熱 = `record` CSV 首碼 `'0'`（最新一期該 slot 有命中）→ 佔 85%（20 顆=17 顆）
- 冷 = `record` CSV 首碼 `'1'`（差 1 期沒命中）→ 佔 15%（20 顆=3 顆）
- 其餘首碼（`'2'` 以上）不入池
- 嚴格配額、不互補：若熱池候選不足、剩下的不會由冷池補（會反映在 shortBy）

聚合命中率（`predictionAggregateStats`、Tab3 頂部卡）即時隨任何參數變化重算：
- 整體命中率 = totalHits / totalPicks（加權平均、不受 picks=0 期影響）
- 平均命中 = totalHits / periods（含 picks=0 期）
- 不足 N 期數 + 0 推期數

snapshots 一律切 `slot[0..SLOT_SNAPSHOT_DEPTH-1]`（SLOT_SNAPSHOT_DEPTH=10），UI 控制 sourceMaxInterval 在 [0..9] 內調整、snapshots 不重算。

候選來源（2026-06-19 重做：分熱/冷池 + 位10+ 配額）：
- 來源期 T 處理完後、`slot[0..config.sourceMaxInterval]`
- **熱池** = `record` CSV 首碼 `'0'`（最新一期該 slot 有命中）
- **冷池** = `record` CSV 首碼 `'1'`（差 1 期沒命中）；其餘首碼不入池
- **位10+ 配額**：先按 `pos10PlusPercent%` 切出位 10+ 配額 / 位 1-9 配額；再各自切 85% 熱 / 15% 冷
- 4 phase greedy（嚴格不互補）：
  1. 熱池位 10+（target = `round(round(predictTarget * pos10PlusPercent%) * 0.85)`）
  2. 冷池位 10+
  3. 熱池位 1-9
  4. 冷池位 1-9
- 位 10+ 先選確保配額；某 phase 不足時、缺額不由其他 phase 補

排除（**per-interval**、2026-06-19 修正）：
- 把 T 的 `periods` CSV（每顆 T 獎號的 foundIdx）+ `positions` CSV（X-Y）zip
- 按 foundIdx 分組、每組內 Y >= `config.posCapHigh` 去重 → 該隔期的排除集
- 候選來自隔期 J 時、僅查 `excludedYByInterval[J]`；其他隔期的 Y 不波及
- 早期實作版本是「全域排除」（所有 Y 攏在一起套全部 interval）→ 已修正

caps（2026-06-19 重做位置 cap、2026-06-20 加每隔期 cap、一旦會超就跳過該候選）：
- 位置 1 ≤ `config.pos12Cap`、位置 2 ≤ `config.pos12Cap`
- 位置 3~9 各 ≤ `config.pos39Cap`（每個位置獨立 cap）
- 位置 ≥ `config.posCapHigh`：走 per-interval Y 排除、不在 cap 機制裡
- **每隔期 ≤ `ceil(predictTarget / (sourceMaxInterval+1))`** — 強制分散到 0..sourceMaxInterval 全部隔期、避免 slot 0 獨吞（2026-06-20 新增）
- `<=40` ≤ `config.le40Cap`、`>40` ≤ `config.gt40Cap`
- 奇 ≤ `config.oddCap`、偶 ≤ `config.evenCap`
- 任一相同尾數 ≤ `config.tailCap`
- 連續號碼最大連跑 ≤ `config.consecutiveCap`

候選排序（2026-06-20 改）：
- 各 phase 內按 `(位置 asc, 隔期 asc)` 排序 — 位置外、隔期內
- 同一位置先跨所有隔期試一輪、再進下一位置
- 配合每隔期 cap、強制分散

候選排序優先序：**3 (避免 cap 抵達) > 1 (小隔期優先) > 2 (低位置優先)**
- 實作法：先依 (隔期 asc, 位置 asc) 排序，再 greedy 跳過會 violate cap 的候選

不足 20：顯示實際數、標「不足 20」，**不破 cap、不補位**。

### 7. Tab3 UI 規範（2026-06-19 補充）

- 卡片排版：**待開獎期釘頂（sticky top = 量得的 UHeader 高度，避免被頂列蓋住）**、其下歷史最新在上
  - 用 `ResizeObserver` 監看 `document.querySelector('header')` 的 offsetHeight；onMounted 量初值、SSR 階段 0、hydrate 後立即校正
- 描述文字旁邊放 **UPopover「本頁規則」按鈕**，內列全部規則
- 每張卡片底下顯示 **caps 使用量**（≤40、>40、奇、偶、尾 max、連跑、位5-9 max）+ **排除位置 Y 集合**；數值觸 cap 時染橘
  - 這是給使用者驗證 picks 確實照規則跑、不是裝飾
- 實際開出（黃色 badge）**右下小黑字 = 該獎號於 T+1 positions CSV 的 Y**（找不到則不標）
  - 與「推」badge 右下標位置同邏輯、雙邊可直接視覺對齊命中號碼的位置軌跡

---

## 紅線（碰到立刻停下來問）
- 不要動 [`utils/analysis.ts`](../app/utils/analysis.ts) 的核心邏輯（539.htm port、X-Y 計算）
- 不要改 `defaultN()` / `defaultD()` 的回傳值
- 不要把艾佛森的 N=50 / 過去 1 小時改成別的值
- 不要對 positions CSV 做「補空」「補 0」這類預處理（空字串本身就是 signal）

---

## 自我檢查清單（commit 前過一遍）
- [ ] 統計數字是不是真的來自 `analysisState`？
- [ ] 有沒有自己「估算」「假設」「推測」過任何數字？
- [ ] 使用者已經拍板的參數有沒有被動到？
- [ ] commit message 有交代清楚這次改了什麼 + 哪個分析參數沒動？
