/**
 * 週期偵測用：自相關、功率譜（FFT）。
 * 輸入都是「每期一個數」的序列，例如每期隔期 0～5 幾顆。
 */

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

/** 第 1～maxLag 期落後的自相關：這期跟 lag 期前像不像（-1～1） */
export function autocorr(xs: number[], maxLag: number): number[] {
  const m = mean(xs)
  const d = xs.map(x => x - m)
  const v = d.reduce((s, x) => s + x * x, 0)
  return Array.from({ length: maxLag }, (_, k) => {
    const lag = k + 1
    let s = 0
    for (let i = 0; i + lag < d.length; i++) s += d[i]! * d[i + lag]!
    return v > 0 ? s / v : 0
  })
}

/** 原地 FFT（長度須為 2 的次方） */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!]
      ;[im[i], im[j]] = [im[j]!, im[i]!]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k)
        const wi = Math.sin(ang * k)
        const a = i + k
        const b = a + len / 2
        const xr = re[b]! * wr - im[b]! * wi
        const xi = re[b]! * wi + im[b]! * wr
        re[b] = re[a]! - xr
        im[b] = im[a]! - xi
        re[a] = re[a]! + xr
        im[a] = im[a]! + xi
      }
    }
  }
}

export interface Peak {
  /** 幾期一輪 */
  period: number
  /** 這個週期的強度：佔整串變化的比例 × 頻率數，平均 ≈ 1 */
  power: number
}

/** 功率譜：只用整數個頻率（period = n / k），回傳週期介於 minPeriod～maxPeriod 的每一點 */
export function periodogram(xs: number[], minPeriod: number, maxPeriod: number): Peak[] {
  const m = mean(xs)
  let size = 1
  while (size < xs.length) size <<= 1
  const re = new Float64Array(size)
  const im = new Float64Array(size)
  xs.forEach((x, i) => {
    re[i] = x - m
  })
  fft(re, im)
  const half = size / 2
  const raw = Array.from({ length: half }, (_, k) => (k === 0 ? 0 : re[k]! * re[k]! + im[k]! * im[k]!))
  const avg = raw.slice(1).reduce((a, b) => a + b, 0) / (half - 1)
  const out: Peak[] = []
  for (let k = 1; k < half; k++) {
    const period = size / k
    if (period >= minPeriod && period <= maxPeriod) out.push({ period, power: raw[k]! / avg })
  }
  return out
}
