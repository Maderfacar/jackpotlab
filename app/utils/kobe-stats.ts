/**
 * 柯比頁分析統計工具（純函式 / immutable）
 *
 * 設計原則：
 *   - 計算與顯示分離：本檔只負責純計算、回傳 plain object，UI 自由呈現。
 *   - 不可變：所有 function 不 mutate 輸入；輸入是 createInitialState/processDraw 產生的 history。
 *   - 共用：給 /kobe 的 7 個 tab + 未來 phase 共用，避免 drift。
 *
 * 主資料源：buildSnapshots() — 對每期、每隔期保留 pre-T snapshot（剩餘顆數、record 數值、命中數），
 *   涵蓋 K=0 的隔期（history 自己只保留 K>0 的隔期、不夠用於 P(K|J,X) 全分布）。
 *
 * Phase 對應：
 *   Phase 0：checkIdentity — 每期 ΣK over all J + 新號 = 20（一致性驗證、其他 phase 的地基）。
 *   Phase 1：buildIntervalRemainingTable — 給定 (隔期, 剩餘顆數) 的下期平均開出顆數。
 *   Phase 1b：holdoutValidate — 後段保留期驗證 Phase 1 的預測力。
 *   Phase 2-5：日後 phase 共用 snapshots 即可。
 */

import {
  createInitialState,
  processDraw,
  type AnalysisDrawInput,
  type AnalysisState
} from '~/utils/analysis'

export interface KobeDraw {
  drawTerm: number
  drawDate: string
  numbers: number[]
}

/**
 * 每期、每隔期一筆 snapshot。涵蓋 K=0 的隔期。
 *
 * 「pre-T」= 處理 T 期之前的狀態，亦即「上一期 T-1 處理完、shift 完」之後、T 期到達前。
 */
export interface SlotSnapshot {
  /** 隔期 J（0..N-1，pre-T-shift 索引） */
  interval: number
  /** pre-T 該隔期剩餘號碼數 X */
  remainingBefore: number
  /** pre-T 該隔期 record CSV 首碼（= 上一期該隔期沒命中時的累計數） */
  recordValueBefore: number
  /** T 期該隔期被命中顆數 K（可能 = 0） */
  hitsThisDraw: number
  /** T 期該隔期被命中的具體號碼（已 sorted asc） */
  hitNumbers: number[]
  /**
   * T 期該隔期每顆命中號碼在 pre-T sorted 序列中的 1-indexed 位置 Y，
   * 索引與 hitNumbers 對齊。歷史資料解析不到 → 退而填 0。
   */
  hitPositions: number[]
  /**
   * pre-T 該隔期剩餘號碼完整陣列（sorted ascending）；
   * 給候選分頁歷史回顧用、可直接套用「位置 → 號」對應。
   * remainingBefore = prizesBefore.length。
   */
  prizesBefore: number[]
}

export interface PerDrawSnapshot {
  drawTerm: number
  drawDate: string
  /** T 期實際開出獎號（sorted-unique） */
  actualNumbers: number[]
  /** 該期所有隔期的 snapshot（含 K=0） */
  slots: SlotSnapshot[]
  /** 新號數量（actualNumbers 中、不在任一 pre-T slot 內的顆數） */
  newcomerCount: number
}

function parseFirstRecord(record: string): number {
  if (!record) return 0
  const first = record.split(',')[0]
  if (first === undefined || first === '') return 0
  const v = Number.parseInt(first, 10)
  return Number.isFinite(v) ? v : 0
}

export interface KobeBuildResult {
  snapshots: PerDrawSnapshot[]
  /** 處理完最新一期 (drawsAsc.at(-1)) 後的 state — 對應下一期 (尚未開出) 的 pre-T。 */
  finalState: AnalysisState
  /** 處理完倒數第二期後的 state — 對應最新一期 (latestDraw) 的 pre-T；只有 1 期時為 null。 */
  preLatestState: AnalysisState | null
}

/**
 * 漸進式 hydration、每期保留 pre-T slot snapshot、同時記錄最後兩個 state。
 *
 * 為何要 pre-T 而非 post-T：
 *   要回答「(J, X) → 下一期 K 多少」必須以 pre-T 的 X 當條件、再看 T 期的 K。
 *   post-T 的 X 已扣掉 T 期命中、不能當條件。
 *
 * 為何同時暴露 finalState / preLatestState：
 *   候選分頁要拿「最新一期 post-T」（下一期候選）與「上一期 post-T」（最新一期回顧），
 *   不必為了拿這兩個 state 額外跑兩次 hydrate（2000 期 hydrate 一次約 1-2s）。
 */
export function buildSnapshotsAndState(drawsAsc: KobeDraw[], n: number): KobeBuildResult {
  const out: PerDrawSnapshot[] = []
  let state = createInitialState('bingo_bingo', n)
  let preLatestState: AnalysisState | null = null

  for (let i = 0; i < drawsAsc.length; i++) {
    if (i === drawsAsc.length - 1) preLatestState = state
    const d = drawsAsc[i]!
    const preSlots = state.periods.map(p => ({
      interval: p.period,
      remainingBefore: p.prizes.length,
      recordValueBefore: parseFirstRecord(p.record),
      preParesPrizes: p.prizes
    }))
    const input: AnalysisDrawInput = {
      drawTerm: d.drawTerm,
      drawDate: d.drawDate,
      prizes: d.numbers
    }
    state = processDraw(state, input)
    const hist = state.history[state.history.length - 1]!

    // 第一期：history 沒有 periods/positions/values → snapshot 不含命中資訊。
    if (!hist.periods) {
      out.push({
        drawTerm: d.drawTerm,
        drawDate: d.drawDate,
        actualNumbers: [...d.numbers],
        slots: preSlots.map(s => ({
          interval: s.interval,
          remainingBefore: s.remainingBefore,
          recordValueBefore: s.recordValueBefore,
          hitsThisDraw: 0,
          hitNumbers: [],
          hitPositions: [],
          prizesBefore: [...s.preParesPrizes].sort((a, b) => a - b)
        })),
        newcomerCount: 0
      })
      continue
    }

    const periodsParts = hist.periods.split(',')
    const positionsParts = hist.positions ? hist.positions.split(',') : []
    const prizeNums = hist.prizes ? hist.prizes.split(',').map(s => Number.parseInt(s, 10)) : []
    const hitsByInterval = new Map<number, Array<{ num: number, pos: number }>>()
    let newcomers = 0

    for (let k = 0; k < prizeNums.length; k++) {
      const num = prizeNums[k]
      if (!Number.isFinite(num)) continue
      const pStr = periodsParts[k]
      const pNum = pStr ? Number.parseInt(pStr, 10) : Number.NaN
      if (!Number.isFinite(pNum)) {
        newcomers++
        continue
      }
      // positions[k] = "X-Y"：X = pre-T 剩餘顆數、Y = 號碼在 sorted 序列中的 1-indexed 位置
      let posY = 0
      const posStr = positionsParts[k]
      if (posStr) {
        const dash = posStr.indexOf('-')
        if (dash > 0) {
          const yStr = posStr.slice(dash + 1)
          const yNum = Number.parseInt(yStr, 10)
          if (Number.isFinite(yNum)) posY = yNum
        }
      }
      const arr = hitsByInterval.get(pNum) ?? []
      arr.push({ num, pos: posY })
      hitsByInterval.set(pNum, arr)
    }

    const slots: SlotSnapshot[] = preSlots.map((s) => {
      const hits = hitsByInterval.get(s.interval) ?? []
      // 按號碼升序排（保持 hitNumbers 升序），hitPositions 與其同步
      const sorted = [...hits].sort((a, b) => a.num - b.num)
      return {
        interval: s.interval,
        remainingBefore: s.remainingBefore,
        recordValueBefore: s.recordValueBefore,
        hitsThisDraw: sorted.length,
        hitNumbers: sorted.map(h => h.num),
        hitPositions: sorted.map(h => h.pos),
        prizesBefore: [...s.preParesPrizes].sort((a, b) => a - b)
      }
    })

    out.push({
      drawTerm: d.drawTerm,
      drawDate: d.drawDate,
      actualNumbers: [...d.numbers],
      slots,
      newcomerCount: newcomers
    })
  }
  return {
    snapshots: out,
    finalState: state,
    preLatestState
  }
}

/**
 * 舊版 API 包一層；繼續服務不需要 finalState 的調用點（Phase 1-7 既有 tab）。
 */
export function buildSnapshots(drawsAsc: KobeDraw[], n: number): PerDrawSnapshot[] {
  return buildSnapshotsAndState(drawsAsc, n).snapshots
}

// ---------------- Phase 0: 一致性檢查 ----------------

export interface IdentityIssue {
  drawTerm: number
  drawDate: string
  actualTotal: number
  hitsSum: number
  newcomerCount: number
  combined: number
}

export interface IdentityReport {
  totalDraws: number
  passedDraws: number
  failedDraws: number
  issues: IdentityIssue[]
}

/**
 * Phase 0：對每期驗證 Σ(K over all J) + 新號 = actualNumbers.length。
 * 出現失敗 → 表示 hydrate 或資料有問題、後續所有 phase 不可信。
 *
 * 注意：第一期 hist.periods 為空、所有 K=0、新號也 = 0，
 *   但 actualNumbers.length 是 20 → 必然 fail。第一期跳過、不算數。
 */
export function checkIdentity(snapshots: PerDrawSnapshot[]): IdentityReport {
  let passed = 0
  let failed = 0
  const issues: IdentityIssue[] = []
  for (let i = 0; i < snapshots.length; i++) {
    if (i === 0) continue
    const snap = snapshots[i]!
    const hitsSum = snap.slots.reduce((a, s) => a + s.hitsThisDraw, 0)
    const combined = hitsSum + snap.newcomerCount
    const actualTotal = snap.actualNumbers.length
    if (combined === actualTotal) {
      passed++
    } else {
      failed++
      issues.push({
        drawTerm: snap.drawTerm,
        drawDate: snap.drawDate,
        actualTotal,
        hitsSum,
        newcomerCount: snap.newcomerCount,
        combined
      })
    }
  }
  return {
    totalDraws: snapshots.length - 1,
    passedDraws: passed,
    failedDraws: failed,
    issues
  }
}

// ---------------- Phase 1: 隔期剩餘 → 開出 ----------------

export interface IntervalRemainingCell {
  interval: number
  remaining: number
  sampleCount: number
  meanHits: number
  stdHits: number
  /** 命中率 = P(該 (J,X) 上次 K > 0 的比例) — 含 K=0 樣本當分母 */
  hitProbability: number
}

/**
 * Phase 1：對每個 (隔期 J, pre-T 剩餘 X) 統計 T 期該隔期開出顆數 K 的分布。
 *
 * 第一期跳過（snapshot.slots 為初始狀態、X 通常 = 0 或無意義）。
 * X = 0（隔期已空）視為無觀察、不計入。
 */
export function buildIntervalRemainingTable(snapshots: PerDrawSnapshot[]): IntervalRemainingCell[] {
  interface Acc {
    interval: number
    remaining: number
    samples: number[]
    hitCount: number
  }
  const map = new Map<string, Acc>()
  const startIdx = 1
  for (let i = startIdx; i < snapshots.length; i++) {
    const snap = snapshots[i]!
    for (const s of snap.slots) {
      if (s.remainingBefore <= 0) continue
      const key = `${s.interval}|${s.remainingBefore}`
      let acc = map.get(key)
      if (!acc) {
        acc = { interval: s.interval, remaining: s.remainingBefore, samples: [], hitCount: 0 }
        map.set(key, acc)
      }
      acc.samples.push(s.hitsThisDraw)
      if (s.hitsThisDraw > 0) acc.hitCount++
    }
  }
  const cells: IntervalRemainingCell[] = []
  for (const acc of map.values()) {
    const n = acc.samples.length
    if (n === 0) continue
    let sum = 0
    for (const v of acc.samples) sum += v
    const mean = sum / n
    let varSum = 0
    for (const v of acc.samples) varSum += (v - mean) ** 2
    const std = n > 1 ? Math.sqrt(varSum / (n - 1)) : 0
    cells.push({
      interval: acc.interval,
      remaining: acc.remaining,
      sampleCount: n,
      meanHits: mean,
      stdHits: std,
      hitProbability: acc.hitCount / n
    })
  }
  cells.sort((a, b) => {
    if (a.interval !== b.interval) return a.interval - b.interval
    return a.remaining - b.remaining
  })
  return cells
}

// ---------------- Phase 1b: 後段保留期驗證 ----------------

export interface HoldoutResult {
  trainingCount: number
  testCount: number
  testObservations: number
  /** 條件預測 = lookup mean K | (J, X) — 後段保留期的平均誤差顆數 */
  conditionalMeanError: number
  /** 對照基準 = lookup mean K | J（忽略 X）— 後段保留期的平均誤差顆數 */
  baselineMeanError: number
  /** 提升 = baseline - conditional（正值 = 條件預測比基準好） */
  improvement: number
  /** 提升率 = improvement / baseline */
  improvementRatio: number
  /** 條件預測 cover 率 = lookup 有命中的測試樣本 / 總測試樣本（lookup miss 用 baseline 補） */
  coverageRatio: number
}

/**
 * Phase 1b：把 snapshots 切前 trainRatio% 當訓練、剩下當測試。
 *   訓練：算 mean K | (J, X) 與 mean K | J 兩張 lookup 表。
 *   測試：對每個 (J, X) cell 預測 K、跟實際 K 比平均誤差。
 *
 * 若條件預測平均誤差 < 對照基準 → 剩餘顆數對下期開出有預測力。
 *
 * 第一期一律不算（與 buildIntervalRemainingTable 對齊）。
 * X=0 樣本不計（無意義）。
 *
 * 實作上委派給 Phase 5 的通用 holdoutByCondition + 剩餘顆數 keyFn，
 * 與 Phase 5 其他訊號 (數值 / 位置) 共用一致的訓練/測試切片邏輯。
 */
export function holdoutValidate(snapshots: PerDrawSnapshot[], trainRatio = 0.8): HoldoutResult {
  return holdoutByCondition(snapshots, ({ slot }) => {
    if (slot.remainingBefore <= 0) return null
    return `${slot.interval}|R${slot.remainingBefore}`
  }, trainRatio)
}

// ---------------- Phase 2: 冷熱波段 ----------------

export interface ColdReboundCell {
  interval: number
  threshold: number
  /** 觸發後 1 期可用樣本數（後 2..5 期樣本通常更少、用於信心評估） */
  sampleCount: number
  /** 觸發後 1, 2, 3, 4, 5 期該隔期實際平均開出顆數 */
  actualMeanAt: [number, number, number, number, number]
  /** 該隔期不分閾值的整體平均開出顆數（對照基準） */
  baselineMean: number
}

/**
 * Phase 2 命題 1：對 (J, threshold) 蒐集所有「該隔期 pre-T recordValue ≥ threshold」的時點、
 * 看後 1..5 期該隔期實際平均開出顆數。直接 vs baselineMean 看「冷了之後是否反彈」。
 *
 * 回傳 thresholdMin..thresholdMax × N 個 cell（UI 可依當下選擇的 threshold 過濾）。
 * 第一期跳過（snapshot.slots 為初始狀態）。
 */
export function buildColdReboundTable(
  snapshots: PerDrawSnapshot[],
  thresholdMin = 1,
  thresholdMax = 10
): ColdReboundCell[] {
  if (snapshots.length < 2) return []
  const intervalCount = snapshots[1]!.slots.length

  // baseline：每隔期的整體平均 K（跳過第一期、不限 V）
  const baseSum = new Array<number>(intervalCount).fill(0)
  const baseCnt = new Array<number>(intervalCount).fill(0)
  for (let i = 1; i < snapshots.length; i++) {
    const slots = snapshots[i]!.slots
    for (let j = 0; j < intervalCount; j++) {
      const s = slots[j]
      if (!s) continue
      baseSum[j]! += s.hitsThisDraw
      baseCnt[j]! += 1
    }
  }

  const cells: ColdReboundCell[] = []
  for (let t = thresholdMin; t <= thresholdMax; t++) {
    const meanSum: number[][] = []
    const meanCnt: number[][] = []
    for (let j = 0; j < intervalCount; j++) {
      meanSum.push([0, 0, 0, 0, 0])
      meanCnt.push([0, 0, 0, 0, 0])
    }

    for (let i = 1; i < snapshots.length; i++) {
      const slots = snapshots[i]!.slots
      for (let j = 0; j < intervalCount; j++) {
        const s = slots[j]
        if (!s) continue
        if (s.recordValueBefore < t) continue
        for (let k = 1; k <= 5; k++) {
          const future = snapshots[i + k]
          if (!future) continue
          const fSlot = future.slots[j]
          if (!fSlot) continue
          meanSum[j]![k - 1]! += fSlot.hitsThisDraw
          meanCnt[j]![k - 1]! += 1
        }
      }
    }

    for (let j = 0; j < intervalCount; j++) {
      const counts = meanCnt[j]!
      const sums = meanSum[j]!
      const sampleCount = counts[0]!
      const actualMeanAt: [number, number, number, number, number] = [0, 0, 0, 0, 0]
      for (let k = 0; k < 5; k++) {
        const n = counts[k]!
        actualMeanAt[k] = n > 0 ? sums[k]! / n : 0
      }
      const baseN = baseCnt[j]!
      const baselineMean = baseN > 0 ? baseSum[j]! / baseN : 0
      cells.push({
        interval: j,
        threshold: t,
        sampleCount,
        actualMeanAt,
        baselineMean
      })
    }
  }
  return cells
}

export interface GlobalColdnessPoint {
  drawTerm: number
  drawDate: string
  /** 由 drawDate + drawTerm 推得的小時（0-23）；無法推算 → -1 */
  hour: number
  /** 該期所有 slot.recordValueBefore 加總 = 整盤冷度 */
  coldness: number
  /** 該期所有 slot.hitsThisDraw 加總（從追蹤隔期內開出的顆數、不含新號） */
  hitsThisDraw: number
}

/**
 * Phase 2 命題 2：每期把所有 slot.recordValueBefore 加總當「整盤冷度」、
 * 並推算該期屬於一天哪個小時（用每日最早期數 = 07:05 為基準、每 5 分鐘一期）。
 *
 * 第一期跳過（snapshot.slots 為初始狀態、值無意義）。
 */
export function buildGlobalColdnessSeries(snapshots: PerDrawSnapshot[]): GlobalColdnessPoint[] {
  const minTermByDate = new Map<string, number>()
  for (const snap of snapshots) {
    const cur = minTermByDate.get(snap.drawDate)
    if (cur === undefined || snap.drawTerm < cur) {
      minTermByDate.set(snap.drawDate, snap.drawTerm)
    }
  }

  const out: GlobalColdnessPoint[] = []
  const BINGO_START_MIN = 7 * 60 + 5
  const BINGO_INTERVAL_MIN = 5
  for (let i = 1; i < snapshots.length; i++) {
    const snap = snapshots[i]!
    let coldness = 0
    let hits = 0
    for (const s of snap.slots) {
      coldness += s.recordValueBefore
      hits += s.hitsThisDraw
    }
    let hour = -1
    const base = minTermByDate.get(snap.drawDate)
    if (base !== undefined) {
      const offset = snap.drawTerm - base
      if (offset >= 0 && offset <= 230) {
        const totalMin = BINGO_START_MIN + offset * BINGO_INTERVAL_MIN
        hour = Math.floor(totalMin / 60) % 24
      }
    }
    out.push({
      drawTerm: snap.drawTerm,
      drawDate: snap.drawDate,
      hour,
      coldness,
      hitsThisDraw: hits
    })
  }
  return out
}

// ---------------- Phase 3: 位置規律 ----------------

export interface PositionDistributionRow {
  interval: number
  /** 1-indexed；索引 0 永遠 = 0、不使用。長度 = maxPosition + 1 */
  positionCounts: number[]
  /** 1-indexed；該位置「曾經是有效位置」的期數計數（即 pre-T 該隔期 remaining ≥ Y 的期數） */
  positionExposure: number[]
  /** 該隔期所有有命中的期、命中顆數總和（= sum of positionCounts） */
  totalSamples: number
  /** 最大可能位置（= 該隔期歷史上 pre-T remaining 最大值） */
  maxPosition: number
  /** 1 / maxPosition；UI 顯示「位置完全平均下、每個位置應佔的命中比例」參考線 */
  expectedUniformPct: number
  /**
   * 「偏離平均的程度」（chi-square 改名）：
   *   = sum over y of (observed_y − expected_y)^2 / expected_y、再除以 (maxPosition − 1) 標準化、
   *   其中 expected_y = positionExposure[y] × (totalSamples / sum(positionExposure))；
   *   值 ≈ 0 代表分布均勻、值越大代表越偏離平均。
   */
  deviationScore: number
}

/**
 * Phase 3 命題 1：每個隔期內、被開出號碼在 sorted 序列中的位置 Y 的分布。
 *
 * 用「曝光次數」當分母（位置 Y 在 pre-T 該隔期 remaining ≥ Y 的期數），
 * 避免「位置 1 永遠存在、位置 20 只有 R=20 時存在」造成的計數偏差。
 */
export function buildPositionDistribution(snapshots: PerDrawSnapshot[]): PositionDistributionRow[] {
  if (snapshots.length < 2) return []
  const intervalCount = snapshots[1]!.slots.length

  // 先掃一遍找出每個隔期的 maxPosition
  const maxPos = new Array<number>(intervalCount).fill(0)
  for (let i = 1; i < snapshots.length; i++) {
    const slots = snapshots[i]!.slots
    for (let j = 0; j < intervalCount; j++) {
      const r = slots[j]?.remainingBefore ?? 0
      if (r > maxPos[j]!) maxPos[j] = r
    }
  }

  const out: PositionDistributionRow[] = []
  for (let j = 0; j < intervalCount; j++) {
    const M = maxPos[j]!
    if (M <= 0) continue
    const positionCounts = new Array<number>(M + 1).fill(0)
    const positionExposure = new Array<number>(M + 1).fill(0)
    let total = 0

    for (let i = 1; i < snapshots.length; i++) {
      const slot = snapshots[i]!.slots[j]
      if (!slot) continue
      const R = Math.min(slot.remainingBefore, M)
      for (let y = 1; y <= R; y++) positionExposure[y]! += 1
      for (const y of slot.hitPositions) {
        if (y >= 1 && y <= M) {
          positionCounts[y]! += 1
          total += 1
        }
      }
    }

    let totalExposure = 0
    for (let y = 1; y <= M; y++) totalExposure += positionExposure[y]!
    let chi2 = 0
    if (totalExposure > 0 && total > 0) {
      for (let y = 1; y <= M; y++) {
        const exp = positionExposure[y]! * (total / totalExposure)
        if (exp <= 0) continue
        const obs = positionCounts[y]!
        const diff = obs - exp
        chi2 += (diff * diff) / exp
      }
    }
    const dof = Math.max(1, M - 1)
    out.push({
      interval: j,
      positionCounts,
      positionExposure,
      totalSamples: total,
      maxPosition: M,
      expectedUniformPct: M > 0 ? 1 / M : 0,
      deviationScore: chi2 / dof
    })
  }
  return out
}

export interface PositionAutoCorrelationRow {
  interval: number
  /** 上下兩期同隔期、同位置都被開出的合計次數 */
  jointCount: number
  /** 假設兩期獨立時的期望合計次數（基於各自邊際機率） */
  independentExpected: number
  /** 提升幅度 = (jointCount − independentExpected) / independentExpected */
  liftPct: number
  /** 配對樣本數（兩期都在該隔期有命中的配對） */
  sampleCount: number
}

/**
 * Phase 3 命題 2：上下兩期同隔期、是否傾向開到同一個位置（位置黏性 / autocorrelation）。
 *
 * 對每個隔期 J、掃所有 (i, i+1) 配對，雙方都有命中時：
 *   joint = ΣY 1{Y ∈ T 命中位置 ∩ T+1 命中位置}
 *   expected = ΣY marginal_T[Y] × marginal_T+1[Y] / pairs
 * 比值 lift > 0 代表有黏性、< 0 代表斥性。
 */
// ---------------- Phase 4: 號碼軌跡 ----------------

export interface NumberAppearance {
  drawTerm: number
  drawDate: string
  /** 來源隔期 J；-1 = 新號（不在任一 pre-T slot 內） */
  sourceInterval: number
  /** 在 snapshots 陣列中的索引（給時間序圖 x 軸用） */
  snapshotIndex: number
}

export interface NumberHistoryRow {
  /** 號碼 1..80 */
  number: number
  /** 過去 N 期內被開出的總次數 */
  appearances: number
  /** 理論平均次數 = effectiveDraws × 20 / 80 */
  expectedAppearances: number
  /** 平均間隔期數 */
  avgGap: number
  /** 中位數間隔期數 */
  medianGap: number
  /** 最長乾期（最久沒被開出） */
  maxGap: number
  /** 連續兩期都被開出的次數（gap = 1） */
  consecutiveCount: number
  /** 來源隔期次數陣列、index = 隔期 0..N-1 */
  sourceIntervalCounts: number[]
  /** 每次出現的紀錄、依時序 — 給「號碼明細」時間序圖用 */
  timeline: NumberAppearance[]
}

const BINGO_POOL_SIZE = 80
const BINGO_PRIZES_PER_DRAW = 20

/**
 * Phase 4：對每個號 (1..80) 算 N 期內的出場史 —
 *   appearances / 期望次數 / 平均/中位/最長間隔 / 連兩期次數 / 來源隔期分布 / 完整時間序。
 *
 * 第一期跳過（snapshot.slots 為初始狀態、命中資訊不完整）。
 */
export function buildNumberHistory(snapshots: PerDrawSnapshot[]): NumberHistoryRow[] {
  if (snapshots.length < 2) return []
  const intervalCount = snapshots[1]!.slots.length
  const effectiveDraws = snapshots.length - 1

  interface Acc {
    appearances: number
    lastIdx: number
    gaps: number[]
    consecutiveCount: number
    sourceIntervalCounts: number[]
    timeline: NumberAppearance[]
  }
  const acc = new Map<number, Acc>()
  for (let n = 1; n <= BINGO_POOL_SIZE; n++) {
    acc.set(n, {
      appearances: 0,
      lastIdx: -1,
      gaps: [],
      consecutiveCount: 0,
      sourceIntervalCounts: new Array<number>(intervalCount).fill(0),
      timeline: []
    })
  }

  for (let i = 1; i < snapshots.length; i++) {
    const snap = snapshots[i]!
    const sourceMap = new Map<number, number>()
    for (const slot of snap.slots) {
      for (const num of slot.hitNumbers) {
        sourceMap.set(num, slot.interval)
      }
    }
    for (const num of snap.actualNumbers) {
      const a = acc.get(num)
      if (!a) continue
      a.appearances += 1
      if (a.lastIdx >= 0) {
        const gap = i - a.lastIdx
        a.gaps.push(gap)
        if (gap === 1) a.consecutiveCount += 1
      }
      a.lastIdx = i
      const src = sourceMap.get(num) ?? -1
      if (src >= 0 && src < intervalCount) {
        a.sourceIntervalCounts[src]! += 1
      }
      a.timeline.push({
        drawTerm: snap.drawTerm,
        drawDate: snap.drawDate,
        sourceInterval: src,
        snapshotIndex: i
      })
    }
  }

  const expectedAppearances = (effectiveDraws * BINGO_PRIZES_PER_DRAW) / BINGO_POOL_SIZE
  const out: NumberHistoryRow[] = []
  for (let n = 1; n <= BINGO_POOL_SIZE; n++) {
    const a = acc.get(n)!
    const sortedGaps = [...a.gaps].sort((x, y) => x - y)
    let avgGap = 0
    let medianGap = 0
    let maxGap = 0
    if (sortedGaps.length > 0) {
      let sum = 0
      for (const g of sortedGaps) sum += g
      avgGap = sum / sortedGaps.length
      const midIdx = Math.floor(sortedGaps.length / 2)
      medianGap = sortedGaps.length % 2 === 1
        ? sortedGaps[midIdx]!
        : (sortedGaps[midIdx - 1]! + sortedGaps[midIdx]!) / 2
      maxGap = sortedGaps[sortedGaps.length - 1]!
    }
    out.push({
      number: n,
      appearances: a.appearances,
      expectedAppearances,
      avgGap,
      medianGap,
      maxGap,
      consecutiveCount: a.consecutiveCount,
      sourceIntervalCounts: a.sourceIntervalCounts,
      timeline: a.timeline
    })
  }
  return out
}

export function buildPositionAutoCorrelation(snapshots: PerDrawSnapshot[]): PositionAutoCorrelationRow[] {
  if (snapshots.length < 3) return []
  const intervalCount = snapshots[1]!.slots.length

  const maxPos = new Array<number>(intervalCount).fill(0)
  for (let i = 1; i < snapshots.length; i++) {
    const slots = snapshots[i]!.slots
    for (let j = 0; j < intervalCount; j++) {
      const r = slots[j]?.remainingBefore ?? 0
      if (r > maxPos[j]!) maxPos[j] = r
    }
  }

  const out: PositionAutoCorrelationRow[] = []
  for (let j = 0; j < intervalCount; j++) {
    const M = maxPos[j]!
    if (M <= 0) continue
    const marginalCurr = new Array<number>(M + 1).fill(0)
    const marginalNext = new Array<number>(M + 1).fill(0)
    const joint = new Array<number>(M + 1).fill(0)
    let pairs = 0

    for (let i = 1; i < snapshots.length - 1; i++) {
      const cur = snapshots[i]!.slots[j]
      const nxt = snapshots[i + 1]!.slots[j]
      if (!cur || !nxt) continue
      if (cur.hitsThisDraw === 0 || nxt.hitsThisDraw === 0) continue
      const curSet = new Set<number>()
      for (const y of cur.hitPositions) {
        if (y >= 1 && y <= M) {
          if (!curSet.has(y)) {
            curSet.add(y)
            marginalCurr[y]! += 1
          }
        }
      }
      const nxtSet = new Set<number>()
      for (const y of nxt.hitPositions) {
        if (y >= 1 && y <= M) {
          if (!nxtSet.has(y)) {
            nxtSet.add(y)
            marginalNext[y]! += 1
          }
        }
      }
      for (const y of curSet) {
        if (nxtSet.has(y)) joint[y]! += 1
      }
      pairs += 1
    }

    let jointSum = 0
    let expectedSum = 0
    for (let y = 1; y <= M; y++) {
      jointSum += joint[y]!
      if (pairs > 0) {
        expectedSum += (marginalCurr[y]! * marginalNext[y]!) / pairs
      }
    }
    const liftPct = expectedSum > 0 ? (jointSum - expectedSum) / expectedSum : 0
    out.push({
      interval: j,
      jointCount: jointSum,
      independentExpected: expectedSum,
      liftPct,
      sampleCount: pairs
    })
  }
  return out
}

// ---------------- Phase 5: 訊號比拚 ----------------

export interface HoldoutKeyContext {
  snapshots: PerDrawSnapshot[]
  snapshotIndex: number
  slot: SlotSnapshot
}

/**
 * 條件鍵函式：回傳該樣本的條件分組字串。null = 跳過該樣本（不入訓練 / 不入測試）。
 *
 * 注意：實作可使用 snapshots[snapshotIndex - 1] 取上一期狀態（例如「位置」訊號），
 *   但必須自行處理 snapshotIndex <= 1 的邊界情況、回 null 即可。
 */
export type HoldoutKeyFn = (ctx: HoldoutKeyContext) => string | null

/**
 * Phase 5：通用後段保留期驗證 — 任意條件鍵都可代入。
 *
 * 與 holdoutValidate 一致的切片邏輯：第一期 (snapshots[0]) 跳過、剩下前 trainRatio 當訓練、
 * 後段當測試。訓練用 keyFn 累計條件均值、baseline 用「同隔期」均值；測試比較兩者的平均誤差。
 *
 * 樣本被 keyFn 回 null → 同時跳過 baseline 累計、確保訊號之間在相同樣本集上比較。
 */
export function holdoutByCondition(
  snapshots: PerDrawSnapshot[],
  keyFn: HoldoutKeyFn,
  trainRatio = 0.8
): HoldoutResult {
  const startIdx = 1
  const totalEffective = Math.max(0, snapshots.length - startIdx)
  const trainEnd = startIdx + Math.floor(totalEffective * trainRatio)

  interface MeanAcc { sum: number, n: number }
  const condAcc = new Map<string, MeanAcc>()
  const baseAcc = new Map<number, MeanAcc>()

  for (let i = startIdx; i < trainEnd; i++) {
    const snap = snapshots[i]!
    for (const s of snap.slots) {
      const key = keyFn({ snapshots, snapshotIndex: i, slot: s })
      if (key === null) continue
      const c = condAcc.get(key) ?? { sum: 0, n: 0 }
      c.sum += s.hitsThisDraw
      c.n += 1
      condAcc.set(key, c)

      const b = baseAcc.get(s.interval) ?? { sum: 0, n: 0 }
      b.sum += s.hitsThisDraw
      b.n += 1
      baseAcc.set(s.interval, b)
    }
  }

  let condErrSum = 0
  let baseErrSum = 0
  let obs = 0
  let condCovered = 0

  for (let i = trainEnd; i < snapshots.length; i++) {
    const snap = snapshots[i]!
    for (const s of snap.slots) {
      const key = keyFn({ snapshots, snapshotIndex: i, slot: s })
      if (key === null) continue
      const c = condAcc.get(key)
      const b = baseAcc.get(s.interval)
      const basePred = b && b.n > 0 ? b.sum / b.n : 0
      let condPred: number
      if (c && c.n > 0) {
        condPred = c.sum / c.n
        condCovered++
      } else {
        condPred = basePred
      }
      condErrSum += Math.abs(s.hitsThisDraw - condPred)
      baseErrSum += Math.abs(s.hitsThisDraw - basePred)
      obs += 1
    }
  }

  const condMAE = obs > 0 ? condErrSum / obs : 0
  const baseMAE = obs > 0 ? baseErrSum / obs : 0
  const improvement = baseMAE - condMAE
  const improvementRatio = baseMAE > 0 ? improvement / baseMAE : 0

  return {
    trainingCount: trainEnd - startIdx,
    testCount: snapshots.length - trainEnd,
    testObservations: obs,
    conditionalMeanError: condMAE,
    baselineMeanError: baseMAE,
    improvement,
    improvementRatio,
    coverageRatio: obs > 0 ? condCovered / obs : 0
  }
}

/**
 * Phase 5 per-interval：在每個隔期 J 上獨立跑 holdoutByCondition、回傳 Map<J, HoldoutResult>。
 *
 * 與「對每個 J 各跑一次 holdoutByCondition 並限定 keyFn 只放行 J」等價、但只需一次掃描。
 * baseline 仍是該隔期的整體均值（不分條件）、確保條件預測與基準是同一個樣本集上比較。
 */
export function holdoutByConditionPerInterval(
  snapshots: PerDrawSnapshot[],
  keyFn: HoldoutKeyFn,
  trainRatio = 0.8
): Map<number, HoldoutResult> {
  const result = new Map<number, HoldoutResult>()
  if (snapshots.length < 2) return result
  const intervalCount = snapshots[1]!.slots.length

  const startIdx = 1
  const totalEffective = Math.max(0, snapshots.length - startIdx)
  const trainEnd = startIdx + Math.floor(totalEffective * trainRatio)
  const trainingCount = trainEnd - startIdx
  const testCount = snapshots.length - trainEnd

  interface MeanAcc { sum: number, n: number }
  const condAcc: Array<Map<string, MeanAcc>> = []
  const baseAcc: MeanAcc[] = []
  for (let j = 0; j < intervalCount; j++) {
    condAcc.push(new Map())
    baseAcc.push({ sum: 0, n: 0 })
  }

  for (let i = startIdx; i < trainEnd; i++) {
    const snap = snapshots[i]!
    for (const s of snap.slots) {
      const key = keyFn({ snapshots, snapshotIndex: i, slot: s })
      if (key === null) continue
      const j = s.interval
      if (j < 0 || j >= intervalCount) continue
      const cMap = condAcc[j]!
      const c = cMap.get(key) ?? { sum: 0, n: 0 }
      c.sum += s.hitsThisDraw
      c.n += 1
      cMap.set(key, c)
      const b = baseAcc[j]!
      b.sum += s.hitsThisDraw
      b.n += 1
    }
  }

  interface ErrAcc { cond: number, base: number, obs: number, covered: number }
  const err: ErrAcc[] = []
  for (let j = 0; j < intervalCount; j++) err.push({ cond: 0, base: 0, obs: 0, covered: 0 })

  for (let i = trainEnd; i < snapshots.length; i++) {
    const snap = snapshots[i]!
    for (const s of snap.slots) {
      const key = keyFn({ snapshots, snapshotIndex: i, slot: s })
      if (key === null) continue
      const j = s.interval
      if (j < 0 || j >= intervalCount) continue
      const c = condAcc[j]!.get(key)
      const b = baseAcc[j]!
      const basePred = b.n > 0 ? b.sum / b.n : 0
      let condPred: number
      if (c && c.n > 0) {
        condPred = c.sum / c.n
        err[j]!.covered += 1
      } else {
        condPred = basePred
      }
      err[j]!.cond += Math.abs(s.hitsThisDraw - condPred)
      err[j]!.base += Math.abs(s.hitsThisDraw - basePred)
      err[j]!.obs += 1
    }
  }

  for (let j = 0; j < intervalCount; j++) {
    const e = err[j]!
    const condMAE = e.obs > 0 ? e.cond / e.obs : 0
    const baseMAE = e.obs > 0 ? e.base / e.obs : 0
    const improvement = baseMAE - condMAE
    const improvementRatio = baseMAE > 0 ? improvement / baseMAE : 0
    result.set(j, {
      trainingCount,
      testCount,
      testObservations: e.obs,
      conditionalMeanError: condMAE,
      baselineMeanError: baseMAE,
      improvement,
      improvementRatio,
      coverageRatio: e.obs > 0 ? e.covered / e.obs : 0
    })
  }
  return result
}

/**
 * 把多個 keyFn 串連起來、任一回 null 整個樣本就被略過、否則用 '||' 連接成複合條件鍵。
 * 給「兩兩組合 / 三合一」訊號組合測試用。
 */
export function combineKeyFns(...fns: HoldoutKeyFn[]): HoldoutKeyFn {
  return (ctx) => {
    const parts: string[] = []
    for (const fn of fns) {
      const k = fn(ctx)
      if (k === null) return null
      parts.push(k)
    }
    return parts.join('||')
  }
}

// ---------------- Phase 6+7: 波段儀表板 ----------------

export type RegimeKey = 'timeSlot' | 'globalColdness' | 'prevShape'

export interface RegimeAssignment {
  snapshotIndex: number
  drawTerm: number
  drawDate: string
  /** 波段桶名稱（UI 直接顯示用） */
  bucket: string
}

/** 各切換開關回傳的 bucket 名稱集合（用於 UI 固定列順序） */
const TIME_SLOT_BUCKETS: readonly string[] = ['凌晨 (0-6)', '上午 (6-12)', '下午 (12-18)', '晚上 (18-24)']
const COLDNESS_BUCKETS: readonly string[] = ['低（最熱 33%）', '中', '高（最冷 33%）']
const PREV_SHAPE_BUCKETS: readonly string[] = ['集中（上期隔期 0 開出 ≥ 6 顆）', '散開（上期隔期 0 開出 < 6 顆）']

/** 給 UI 列順序用：照「業務語意」排（時段照晝夜、冷度照低→高、形態照集中→散開） */
export function regimeBucketOrder(regimeKey: RegimeKey): readonly string[] {
  if (regimeKey === 'timeSlot') return TIME_SLOT_BUCKETS
  if (regimeKey === 'globalColdness') return COLDNESS_BUCKETS
  return PREV_SHAPE_BUCKETS
}

function timeSlotBucketForHour(hour: number): string {
  if (hour >= 0 && hour < 6) return TIME_SLOT_BUCKETS[0]!
  if (hour < 12) return TIME_SLOT_BUCKETS[1]!
  if (hour < 18) return TIME_SLOT_BUCKETS[2]!
  return TIME_SLOT_BUCKETS[3]!
}

/**
 * 把每期歸到一個波段 bucket。
 *
 * 三個切換開關：
 *   - timeSlot：用每日最早 drawTerm = 07:05 + 每 5 分鐘一期，推算小時、再切 4 段。
 *     算不出小時 → 該期不入波段（skip）。
 *   - globalColdness：每期 Σ slot.recordValueBefore = 整盤冷度；
 *     用全期 33/66 百分位切「低 / 中 / 高」。
 *   - prevShape：看上一期 slot[0].hitsThisDraw、≥ 6 = 集中、否則 散開。
 *     第 1 期無上期可參考 → skip。
 *
 * 第一期 (snapshots[0]) 一律 skip（初始狀態無命中資訊）。
 */
export function assignRegime(
  snapshots: PerDrawSnapshot[],
  regimeKey: RegimeKey
): RegimeAssignment[] {
  const out: RegimeAssignment[] = []
  if (snapshots.length < 2) return out

  if (regimeKey === 'timeSlot') {
    const minTermByDate = new Map<string, number>()
    for (const s of snapshots) {
      const c = minTermByDate.get(s.drawDate)
      if (c === undefined || s.drawTerm < c) minTermByDate.set(s.drawDate, s.drawTerm)
    }
    const BINGO_START_MIN = 7 * 60 + 5
    const BINGO_INTERVAL_MIN = 5
    for (let i = 1; i < snapshots.length; i++) {
      const snap = snapshots[i]!
      const base = minTermByDate.get(snap.drawDate)
      if (base === undefined) continue
      const offset = snap.drawTerm - base
      if (offset < 0 || offset > 230) continue
      const totalMin = BINGO_START_MIN + offset * BINGO_INTERVAL_MIN
      const hour = Math.floor(totalMin / 60) % 24
      out.push({
        snapshotIndex: i,
        drawTerm: snap.drawTerm,
        drawDate: snap.drawDate,
        bucket: timeSlotBucketForHour(hour)
      })
    }
    return out
  }

  if (regimeKey === 'globalColdness') {
    const coldness: Array<{ idx: number, value: number }> = []
    for (let i = 1; i < snapshots.length; i++) {
      let sum = 0
      for (const s of snapshots[i]!.slots) sum += s.recordValueBefore
      coldness.push({ idx: i, value: sum })
    }
    if (coldness.length === 0) return out
    const sortedValues = coldness.map(c => c.value).sort((a, b) => a - b)
    const p33 = sortedValues[Math.floor(sortedValues.length * 0.33)] ?? 0
    const p66 = sortedValues[Math.floor(sortedValues.length * 0.66)] ?? 0
    for (const c of coldness) {
      const snap = snapshots[c.idx]!
      let bucket: string
      if (c.value <= p33) bucket = COLDNESS_BUCKETS[0]!
      else if (c.value <= p66) bucket = COLDNESS_BUCKETS[1]!
      else bucket = COLDNESS_BUCKETS[2]!
      out.push({
        snapshotIndex: c.idx,
        drawTerm: snap.drawTerm,
        drawDate: snap.drawDate,
        bucket
      })
    }
    return out
  }

  // prevShape
  for (let i = 2; i < snapshots.length; i++) {
    const snap = snapshots[i]!
    const prev = snapshots[i - 1]!
    const k0 = prev.slots[0]?.hitsThisDraw ?? 0
    const bucket = k0 >= 6 ? PREV_SHAPE_BUCKETS[0]! : PREV_SHAPE_BUCKETS[1]!
    out.push({
      snapshotIndex: i,
      drawTerm: snap.drawTerm,
      drawDate: snap.drawDate,
      bucket
    })
  }
  return out
}

/**
 * 取最新一期屬於哪個波段 bucket（用 assignRegime 的最後一筆）。
 * 找不到 → null（例如 timeSlot 推不出小時）。
 */
export function findCurrentBucket(
  snapshots: PerDrawSnapshot[],
  regimeKey: RegimeKey
): { bucket: string, drawTerm: number, drawDate: string } | null {
  const assignments = assignRegime(snapshots, regimeKey)
  if (assignments.length === 0) return null
  const last = assignments[assignments.length - 1]!
  // 必須是最新一期 (snapshots 最後一筆) 才算「目前這期」；若 assignment 不是最新期 → 仍回傳該筆
  return { bucket: last.bucket, drawTerm: last.drawTerm, drawDate: last.drawDate }
}

export interface RegimeBucketResult {
  bucket: string
  /** 該波段在全部 snapshots 中的期數 */
  drawCount: number
  /** 該波段所有期的對照表（含 train + test）— 給 UI 顯示用 */
  cells: IntervalRemainingCell[]
  /** 該波段在「全期 80/20 切點」下、屬於 test 範圍的樣本數（slot 觀察數、剩餘 = 0 不計） */
  testObs: number
  /** 該波段內、用該波段 train lookup 預測 → 平均誤差顆數 */
  meanError: number
  /** 該波段內、用全期 train lookup 預測 → 平均誤差顆數（同一份 test 集） */
  baselineError: number
  /** = baselineError − meanError */
  improvement: number
  /** = improvement / baselineError */
  improvementRatio: number
}

export interface RegimeTopDifference {
  interval: number
  remaining: number
  /** 波段名稱 → 該波段下該 cell 的平均開出顆數 */
  bucketMeans: Record<string, number>
  /** 波段名稱 → 該波段下該 cell 的樣本數 */
  bucketSamples: Record<string, number>
  /** max(bucketMeans) − min(bucketMeans)；只用樣本 ≥ trust 的 bucket */
  spread: number
}

export interface PerRegimeAnalysis {
  regimeKey: RegimeKey
  /** 依 regimeBucketOrder 排序 */
  buckets: RegimeBucketResult[]
  /** 各波段該 (J, X) cell 的平均開出顆數差距最大的 Top 10 */
  topDifferences: RegimeTopDifference[]
  /** 波段化跨 bucket 加權平均誤差顆數（同一份 test 集） */
  weightedMAE: number
  /** 全期單一規則平均誤差顆數（同一份 test 集、用 global lookup） */
  baselineMAE: number
  /** = baselineMAE − weightedMAE */
  improvement: number
  /** = improvement / baselineMAE */
  improvementRatio: number
  /** test 集中、有 bucket 歸屬的總樣本（slot 觀察數） */
  totalTestObs: number
  /** 訓練範圍期數 / 測試範圍期數（給 UI 顯示切點資訊） */
  trainDrawCount: number
  testDrawCount: number
}

const REGIME_TRAIN_RATIO = 0.8
const REGIME_CELL_TRUST = 20

/**
 * Phase 6+7：對指定切換開關、計算
 *   (1) 每波段的 (J, X) 對照表（顯示用、用該波段全部期）
 *   (2) 同一份 test 集上、波段化 vs 全期單一規則的平均誤差比較（嚴格 holdout）
 *   (3) 波段間 (J, X) 平均差距 Top 10
 *
 * 嚴格 holdout 規則：
 *   - 全期 snapshots[1..] 切 80/20（與 Phase 1 / Phase 5 一致）。
 *   - train 範圍內：每個 bucket 維護自己的 (J, X) → mean K 表；同時也累計全期 global 表。
 *   - test 範圍內：對「有 bucket 歸屬」的樣本、分別用 bucket 表與 global 表預測、累計誤差。
 *   - weighted MAE = Σ bucket 誤差 / 總 obs；baseline MAE = global 誤差 / 總 obs（同一份 obs）。
 *   - 兩者用同一份 test 觀察集 → 比較才公平。
 */
export function buildPerRegimeAnalysis(
  snapshots: PerDrawSnapshot[],
  regimeKey: RegimeKey
): PerRegimeAnalysis {
  const empty: PerRegimeAnalysis = {
    regimeKey,
    buckets: [],
    topDifferences: [],
    weightedMAE: 0,
    baselineMAE: 0,
    improvement: 0,
    improvementRatio: 0,
    totalTestObs: 0,
    trainDrawCount: 0,
    testDrawCount: 0
  }
  if (snapshots.length < 2) return empty

  const assignments = assignRegime(snapshots, regimeKey)
  const bucketByIdx = new Map<number, string>()
  for (const a of assignments) bucketByIdx.set(a.snapshotIndex, a.bucket)
  if (bucketByIdx.size === 0) return empty

  const startIdx = 1
  const totalEffective = snapshots.length - startIdx
  const trainEnd = startIdx + Math.floor(totalEffective * REGIME_TRAIN_RATIO)

  interface MeanAcc { sum: number, n: number }
  // Per-bucket train lookups + global train lookup
  const bucketCondAcc = new Map<string, Map<string, MeanAcc>>()
  const bucketBaseAcc = new Map<string, Map<number, MeanAcc>>()
  const globalCondAcc = new Map<string, MeanAcc>()
  const globalBaseAcc = new Map<number, MeanAcc>()

  // 也累計「該波段全部資料」的 cells（給 UI 顯示用）— 不限訓練 / 測試
  const bucketAllAcc = new Map<string, Map<string, { interval: number, remaining: number, sum: number, n: number, hitCount: number }>>()
  const bucketDrawCount = new Map<string, number>()

  function getBucketCondMap(bucket: string): Map<string, MeanAcc> {
    let m = bucketCondAcc.get(bucket)
    if (!m) {
      m = new Map()
      bucketCondAcc.set(bucket, m)
    }
    return m
  }
  function getBucketBaseMap(bucket: string): Map<number, MeanAcc> {
    let m = bucketBaseAcc.get(bucket)
    if (!m) {
      m = new Map()
      bucketBaseAcc.set(bucket, m)
    }
    return m
  }
  function getBucketAllMap(bucket: string): Map<string, { interval: number, remaining: number, sum: number, n: number, hitCount: number }> {
    let m = bucketAllAcc.get(bucket)
    if (!m) {
      m = new Map()
      bucketAllAcc.set(bucket, m)
    }
    return m
  }

  // Pass 1: 累計所有期 (train+test) 的 bucket cells（顯示用） + 訓練 lookups
  for (let i = startIdx; i < snapshots.length; i++) {
    const snap = snapshots[i]!
    const bucket = bucketByIdx.get(i)
    if (bucket === undefined) continue
    bucketDrawCount.set(bucket, (bucketDrawCount.get(bucket) ?? 0) + 1)

    const allMap = getBucketAllMap(bucket)
    for (const s of snap.slots) {
      if (s.remainingBefore <= 0) continue
      const key = `${s.interval}|${s.remainingBefore}`
      const a = allMap.get(key) ?? { interval: s.interval, remaining: s.remainingBefore, sum: 0, n: 0, hitCount: 0 }
      a.sum += s.hitsThisDraw
      a.n += 1
      if (s.hitsThisDraw > 0) a.hitCount += 1
      allMap.set(key, a)
    }

    if (i < trainEnd) {
      const condMap = getBucketCondMap(bucket)
      const baseMap = getBucketBaseMap(bucket)
      for (const s of snap.slots) {
        if (s.remainingBefore <= 0) continue
        const key = `${s.interval}|${s.remainingBefore}`
        const bc = condMap.get(key) ?? { sum: 0, n: 0 }
        bc.sum += s.hitsThisDraw
        bc.n += 1
        condMap.set(key, bc)
        const bb = baseMap.get(s.interval) ?? { sum: 0, n: 0 }
        bb.sum += s.hitsThisDraw
        bb.n += 1
        baseMap.set(s.interval, bb)
        const gc = globalCondAcc.get(key) ?? { sum: 0, n: 0 }
        gc.sum += s.hitsThisDraw
        gc.n += 1
        globalCondAcc.set(key, gc)
        const gb = globalBaseAcc.get(s.interval) ?? { sum: 0, n: 0 }
        gb.sum += s.hitsThisDraw
        gb.n += 1
        globalBaseAcc.set(s.interval, gb)
      }
    }
  }

  // Pass 2: 對 test 範圍內、有 bucket 歸屬的樣本、累計 bucket 誤差與 global 誤差
  interface BucketTestAcc { condErr: number, baseErr: number, obs: number }
  const bucketTestAcc = new Map<string, BucketTestAcc>()
  let totalCondErr = 0
  let totalBaseErr = 0
  let totalObs = 0

  for (let i = trainEnd; i < snapshots.length; i++) {
    const bucket = bucketByIdx.get(i)
    if (bucket === undefined) continue
    const snap = snapshots[i]!
    let acc = bucketTestAcc.get(bucket)
    if (!acc) {
      acc = { condErr: 0, baseErr: 0, obs: 0 }
      bucketTestAcc.set(bucket, acc)
    }
    const condMap = bucketCondAcc.get(bucket)
    const baseMap = bucketBaseAcc.get(bucket)
    for (const s of snap.slots) {
      if (s.remainingBefore <= 0) continue
      const key = `${s.interval}|${s.remainingBefore}`

      // Bucket-specific lookup（找不到 → 退回該 bucket 的 J 基準、再找不到 → 退回 global 基準）
      let condPred = 0
      const bc = condMap?.get(key)
      if (bc && bc.n > 0) {
        condPred = bc.sum / bc.n
      } else {
        const bb = baseMap?.get(s.interval)
        if (bb && bb.n > 0) condPred = bb.sum / bb.n
        else {
          const gb = globalBaseAcc.get(s.interval)
          if (gb && gb.n > 0) condPred = gb.sum / gb.n
        }
      }
      // Global lookup（找不到 → 退回 global 基準）
      let basePred = 0
      const gc = globalCondAcc.get(key)
      if (gc && gc.n > 0) {
        basePred = gc.sum / gc.n
      } else {
        const gb = globalBaseAcc.get(s.interval)
        if (gb && gb.n > 0) basePred = gb.sum / gb.n
      }
      const k = s.hitsThisDraw
      const condErr = Math.abs(k - condPred)
      const baseErr = Math.abs(k - basePred)
      acc.condErr += condErr
      acc.baseErr += baseErr
      acc.obs += 1
      totalCondErr += condErr
      totalBaseErr += baseErr
      totalObs += 1
    }
  }

  // 組 buckets 結果（依 regimeBucketOrder 順序、跳過完全沒資料的 bucket）
  const order = regimeBucketOrder(regimeKey)
  const buckets: RegimeBucketResult[] = []
  for (const bname of order) {
    const drawCount = bucketDrawCount.get(bname) ?? 0
    if (drawCount === 0) continue
    const allMap = bucketAllAcc.get(bname) ?? new Map()
    const cells: IntervalRemainingCell[] = []
    for (const a of allMap.values()) {
      const mean = a.n > 0 ? a.sum / a.n : 0
      cells.push({
        interval: a.interval,
        remaining: a.remaining,
        sampleCount: a.n,
        meanHits: mean,
        stdHits: 0,
        hitProbability: a.n > 0 ? a.hitCount / a.n : 0
      })
    }
    cells.sort((a, b) => {
      if (a.interval !== b.interval) return a.interval - b.interval
      return a.remaining - b.remaining
    })
    const test = bucketTestAcc.get(bname)
    const meanError = test && test.obs > 0 ? test.condErr / test.obs : 0
    const baselineError = test && test.obs > 0 ? test.baseErr / test.obs : 0
    const improvement = baselineError - meanError
    const improvementRatio = baselineError > 0 ? improvement / baselineError : 0
    buckets.push({
      bucket: bname,
      drawCount,
      cells,
      testObs: test?.obs ?? 0,
      meanError,
      baselineError,
      improvement,
      improvementRatio
    })
  }

  // Top differences：找 (J, X) cell 在不同 bucket 下的平均差距最大者
  const allKeys = new Set<string>()
  for (const b of buckets) {
    for (const c of b.cells) allKeys.add(`${c.interval}|${c.remaining}`)
  }
  const diffs: RegimeTopDifference[] = []
  for (const key of allKeys) {
    const [jStr, xStr] = key.split('|')
    const j = Number.parseInt(jStr ?? '', 10)
    const x = Number.parseInt(xStr ?? '', 10)
    if (!Number.isFinite(j) || !Number.isFinite(x)) continue
    const bucketMeans: Record<string, number> = {}
    const bucketSamples: Record<string, number> = {}
    let max = -Infinity
    let min = Infinity
    let valid = 0
    for (const b of buckets) {
      const c = b.cells.find(x2 => x2.interval === j && x2.remaining === x)
      if (!c || c.sampleCount < REGIME_CELL_TRUST) continue
      bucketMeans[b.bucket] = c.meanHits
      bucketSamples[b.bucket] = c.sampleCount
      if (c.meanHits > max) max = c.meanHits
      if (c.meanHits < min) min = c.meanHits
      valid++
    }
    if (valid < 2) continue
    diffs.push({
      interval: j,
      remaining: x,
      bucketMeans,
      bucketSamples,
      spread: max - min
    })
  }
  diffs.sort((a, b) => b.spread - a.spread)
  const topDifferences = diffs.slice(0, 10)

  const weightedMAE = totalObs > 0 ? totalCondErr / totalObs : 0
  const baselineMAE = totalObs > 0 ? totalBaseErr / totalObs : 0
  const improvement = baselineMAE - weightedMAE
  const improvementRatio = baselineMAE > 0 ? improvement / baselineMAE : 0

  return {
    regimeKey,
    buckets,
    topDifferences,
    weightedMAE,
    baselineMAE,
    improvement,
    improvementRatio,
    totalTestObs: totalObs,
    trainDrawCount: trainEnd - startIdx,
    testDrawCount: snapshots.length - trainEnd
  }
}

// ---------------- 額外：位置 > 10 來源隔期分布 ----------------

export interface HighPositionDistRow {
  interval: number
  /** 該隔期累計開出總顆數 (Σ hitsThisDraw) */
  totalHits: number
  /** 該隔期累計開出、位置 > 10 的顆數 */
  highPositionHits: number
  /** 該隔期內、位置 > 10 佔該隔期總開出的比例 */
  ratio: number
  /** 該隔期歷史最大 pre-T 剩餘顆數（上下文） */
  maxRemaining: number
  /** 該隔期 pre-T 剩餘 ≥ 11 顆的期數（= 位置 11+ 才有可能出現） */
  exposureCount: number
}

/**
 * 額外分析：開出號碼中、位置 > 10 的、來自哪些隔期、各隔期內佔比。
 *
 * 規則：
 *   - 位置 > 10 = hitPositions 中 y > 10 的元素（即位置 11 或以上）
 *   - 對每隔期 j、累計 totalHits 與 highPositionHits（位置 > 10 的命中數）
 *   - ratio = highPositionHits / totalHits（該隔期內、高位佔比）
 *   - 只回 highPositionHits > 0 的隔期（過濾沒資料的）
 *
 * 第一期 (snapshots[0]) 跳過、與其他 phase 一致。
 */
export function buildHighPositionDistribution(snapshots: PerDrawSnapshot[]): HighPositionDistRow[] {
  if (snapshots.length < 2) return []
  const intervalCount = snapshots[1]!.slots.length

  const totalHits = new Array<number>(intervalCount).fill(0)
  const highPositionHits = new Array<number>(intervalCount).fill(0)
  const maxRemaining = new Array<number>(intervalCount).fill(0)
  const exposureCount = new Array<number>(intervalCount).fill(0)

  for (let i = 1; i < snapshots.length; i++) {
    const snap = snapshots[i]!
    for (let j = 0; j < intervalCount; j++) {
      const slot = snap.slots[j]
      if (!slot) continue
      totalHits[j]! += slot.hitsThisDraw
      if (slot.remainingBefore > maxRemaining[j]!) maxRemaining[j] = slot.remainingBefore
      if (slot.remainingBefore >= 11) exposureCount[j]! += 1
      for (const y of slot.hitPositions) {
        if (y > 10) highPositionHits[j]! += 1
      }
    }
  }

  const out: HighPositionDistRow[] = []
  for (let j = 0; j < intervalCount; j++) {
    if (highPositionHits[j]! === 0) continue
    out.push({
      interval: j,
      totalHits: totalHits[j]!,
      highPositionHits: highPositionHits[j]!,
      ratio: totalHits[j]! > 0 ? highPositionHits[j]! / totalHits[j]! : 0,
      maxRemaining: maxRemaining[j]!,
      exposureCount: exposureCount[j]!
    })
  }
  return out
}
