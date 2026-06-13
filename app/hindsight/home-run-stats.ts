/**
 * 全壘打歷史分析統計 — 純函式、給 bingo-heineken-stats 頁用。
 *
 * 對 computeHomeRunEvidence 算出來的 evidence 序列、按隔期分別跑：
 *   - 樣本數 (n)
 *   - 長期 mean / std（每隔期 rate 序列）
 *   - rolling mean 在 N=5/10/20/30 窗口下的 std（觀察 noise 隨窗口縮小）
 *   - 熱期 / 冷期平均長度（連續 > mean+std 或 < mean−std 的 stretch）
 *   - 不同 z-band 落點分布（< −1σ / [−1σ,0] / [0,1σ] / > 1σ）
 *
 * 這份輸出用來幫使用者決定：
 *   - 紅綠藍閾值（看 mean ± k*std 落點分布）
 *   - 適合的窗口大小（看 rolling std 隨 N 衰減速度 + 熱期典型長度）
 */

import type { HomeRunEvidenceRow } from './home-run-evidence'

export interface IntervalStats {
  interval: number
  /** 該隔期有 picks 的樣本數（picks=0 的 row 不計） */
  n: number
  /** 長期 mean 命中率 */
  mean: number | null
  /** 單期 std */
  std: number | null
  /** 5 期 rolling mean 的 std（沿時間滾動算每個窗口平均後、再算這些平均的 std） */
  rollingStd5: number | null
  rollingStd10: number | null
  rollingStd20: number | null
  rollingStd30: number | null
  /** 連續 > mean+std 的「熱期」 stretch 平均長度（無熱期回 null） */
  hotStreakAvg: number | null
  /** 連續 < mean−std 的「冷期」 stretch 平均長度 */
  coldStreakAvg: number | null
  /** 連續 ≥ N 期都熱的 stretch 個數 */
  hotStreakCount: number
  coldStreakCount: number
  /** rate 落在 [< −1σ, [−1σ,mean), [mean,+1σ], > +1σ] 的計數 */
  bandCounts: {
    belowMinus1Sigma: number
    minus1ToMean: number
    meanToPlus1Sigma: number
    abovePlus1Sigma: number
  }
}

function mean(arr: number[]): number | null {
  if (arr.length === 0) return null
  let sum = 0
  for (const v of arr) sum += v
  return sum / arr.length
}

function std(arr: number[], mu: number): number | null {
  if (arr.length < 2) return null
  let sq = 0
  for (const v of arr) sq += (v - mu) ** 2
  return Math.sqrt(sq / (arr.length - 1))
}

/**
 * 對 series 沿時間滾動算每個 N 期窗口的平均、再算這些平均的 std。
 * N > series.length 或滾動結果 < 2 個時回 null。
 */
function rollingMeanStd(series: number[], window: number): number | null {
  if (series.length < window + 1) return null
  const rollingMeans: number[] = []
  for (let i = 0; i + window <= series.length; i++) {
    let sum = 0
    for (let k = 0; k < window; k++) sum += series[i + k]!
    rollingMeans.push(sum / window)
  }
  if (rollingMeans.length < 2) return null
  const mu = mean(rollingMeans)
  if (mu == null) return null
  return std(rollingMeans, mu)
}

/**
 * 找連續 cond(v)==true 的 stretches、回每段長度。
 */
function findStreaks(series: number[], cond: (v: number) => boolean): number[] {
  const out: number[] = []
  let run = 0
  for (const v of series) {
    if (cond(v)) {
      run++
    } else {
      if (run > 0) out.push(run)
      run = 0
    }
  }
  if (run > 0) out.push(run)
  return out
}

/**
 * 對 evidence (新→舊順序) 拆出每隔期的時間正序 rate 序列、計算 IntervalStats。
 *
 * evidence 是 reverse 過、所以時間正序 = evidence.reverse()。
 * picks=0 的 row 對該隔期 rate 是 null、不計入該隔期樣本。
 */
export function analyzeIntervalStats(
  evidence: HomeRunEvidenceRow[],
  slotCount: number
): IntervalStats[] {
  const out: IntervalStats[] = []
  // evidence 新→舊、反過來成時間正序
  const forward = [...evidence].reverse()

  for (let j = 0; j < slotCount; j++) {
    const series: number[] = []
    for (const row of forward) {
      const r = row.rateByInterval[j]
      if (r != null) series.push(r)
    }
    const n = series.length
    const mu = mean(series)
    const sigma = mu != null ? std(series, mu) : null

    let hotStreaks: number[] = []
    let coldStreaks: number[] = []
    let bands = { belowMinus1Sigma: 0, minus1ToMean: 0, meanToPlus1Sigma: 0, abovePlus1Sigma: 0 }
    if (mu != null && sigma != null && sigma > 0) {
      hotStreaks = findStreaks(series, v => v > mu + sigma)
      coldStreaks = findStreaks(series, v => v < mu - sigma)
      for (const v of series) {
        if (v < mu - sigma) bands.belowMinus1Sigma++
        else if (v < mu) bands.minus1ToMean++
        else if (v <= mu + sigma) bands.meanToPlus1Sigma++
        else bands.abovePlus1Sigma++
      }
    }

    out.push({
      interval: j,
      n,
      mean: mu,
      std: sigma,
      rollingStd5: rollingMeanStd(series, 5),
      rollingStd10: rollingMeanStd(series, 10),
      rollingStd20: rollingMeanStd(series, 20),
      rollingStd30: rollingMeanStd(series, 30),
      hotStreakAvg: hotStreaks.length > 0 ? hotStreaks.reduce((a, b) => a + b, 0) / hotStreaks.length : null,
      coldStreakAvg: coldStreaks.length > 0 ? coldStreaks.reduce((a, b) => a + b, 0) / coldStreaks.length : null,
      hotStreakCount: hotStreaks.length,
      coldStreakCount: coldStreaks.length,
      bandCounts: bands
    })
  }
  return out
}
