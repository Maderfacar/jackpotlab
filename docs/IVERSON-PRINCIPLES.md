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

兩個 tab 用 **同一份 `allDraws` fetch**，分別 hydrate 兩個不同參數的 `analysisState`。

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
