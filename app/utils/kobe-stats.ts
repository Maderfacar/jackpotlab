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
  type AnalysisDrawInput
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

/**
 * 漸進式 hydration、每期保留 pre-T slot snapshot。
 *
 * 為何要 pre-T 而非 post-T：
 *   要回答「(J, X) → 下一期 K 多少」必須以 pre-T 的 X 當條件、再看 T 期的 K。
 *   post-T 的 X 已扣掉 T 期命中、不能當條件。
 */
export function buildSnapshots(drawsAsc: KobeDraw[], n: number): PerDrawSnapshot[] {
  const out: PerDrawSnapshot[] = []
  let state = createInitialState('bingo_bingo', n)

  for (const d of drawsAsc) {
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
          hitNumbers: []
        })),
        newcomerCount: 0
      })
      continue
    }

    const periodsParts = hist.periods.split(',')
    const prizeNums = hist.prizes ? hist.prizes.split(',').map(s => Number.parseInt(s, 10)) : []
    const hitNumbersByInterval = new Map<number, number[]>()
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
      const arr = hitNumbersByInterval.get(pNum) ?? []
      arr.push(num)
      hitNumbersByInterval.set(pNum, arr)
    }

    const slots: SlotSnapshot[] = preSlots.map((s) => {
      const hits = hitNumbersByInterval.get(s.interval) ?? []
      return {
        interval: s.interval,
        remainingBefore: s.remainingBefore,
        recordValueBefore: s.recordValueBefore,
        hitsThisDraw: hits.length,
        hitNumbers: [...hits].sort((a, b) => a - b)
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
  return out
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
 */
export function holdoutValidate(snapshots: PerDrawSnapshot[], trainRatio = 0.8): HoldoutResult {
  const effective = snapshots.slice(1)
  const trainCount = Math.floor(effective.length * trainRatio)
  const train = effective.slice(0, trainCount)
  const test = effective.slice(trainCount)

  interface MeanAcc { sum: number, n: number }
  const condAcc = new Map<string, MeanAcc>()
  const baseAcc = new Map<number, MeanAcc>()

  for (const snap of train) {
    for (const s of snap.slots) {
      if (s.remainingBefore <= 0) continue
      const condKey = `${s.interval}|${s.remainingBefore}`
      const c = condAcc.get(condKey) ?? { sum: 0, n: 0 }
      c.sum += s.hitsThisDraw
      c.n += 1
      condAcc.set(condKey, c)

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

  for (const snap of test) {
    for (const s of snap.slots) {
      if (s.remainingBefore <= 0) continue
      const condKey = `${s.interval}|${s.remainingBefore}`
      const c = condAcc.get(condKey)
      const b = baseAcc.get(s.interval)
      const basePred = b && b.n > 0 ? b.sum / b.n : 0
      let condPred: number
      if (c && c.n > 0) {
        condPred = c.sum / c.n
        condCovered++
      } else {
        // lookup miss → 退回基準預測
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
    trainingCount: train.length,
    testCount: test.length,
    testObservations: obs,
    conditionalMeanError: condMAE,
    baselineMeanError: baseMAE,
    improvement,
    improvementRatio,
    coverageRatio: obs > 0 ? condCovered / obs : 0
  }
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
