/**
 * 位置波段（2026-10-27 使用者：/draws 獎號關聯裡由小到大第 1～5 顆，各自的隔期、值波段）。
 *
 * - 每個位置兩串數字：每期那一顆的隔期、那一顆的值（computeFeatures，號碼升序）。
 * - 分檔（使用者拍板）：隔期 0~5／6~9／10 以上；值分細一點 0／1~2／3~5／6~9／10 以上。
 * - 相似波形 = 最近 L 期的檔位一模一樣（L 由使用者自己切），看之後 1～3 期的數字。
 * - 平均含最新一期（同 /board 四種均值的定義）。
 */
import type { DrawFeatures } from '../patterns/features'

export type PosKind = 'gap' | 'value'

export interface Bucket {
  label: string
  min: number
  max: number
}

export const BUCKETS: Record<PosKind, Bucket[]> = {
  gap: [
    { label: '0~5', min: 0, max: 5 },
    { label: '6~9', min: 6, max: 9 },
    { label: '10+', min: 10, max: Number.POSITIVE_INFINITY }
  ],
  value: [
    { label: '0', min: 0, max: 0 },
    { label: '1~2', min: 1, max: 2 },
    { label: '3~5', min: 3, max: 5 },
    { label: '6~9', min: 6, max: 9 },
    { label: '10+', min: 10, max: Number.POSITIVE_INFINITY }
  ]
}

export const AVG_LENGTHS = [5, 10, 15] as const
export const POSITIONS = 5

export function bucketOf(kind: PosKind, v: number): number {
  return BUCKETS[kind].findIndex(b => v >= b.min && v <= b.max)
}

/** 每個位置（第 1～5 顆）每期的數字；暖機期間找不到為 null */
export function positionValues(feats: DrawFeatures[], kind: PosKind): (number | null)[][] {
  return Array.from({ length: POSITIONS }, (_, p) => feats.map((f) => {
    const arr = kind === 'gap' ? f.gaps : f.values
    return arr.length === POSITIONS ? arr[p] ?? null : null
  }))
}

export interface Spread {
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
}

export function spread(values: number[]): Spread | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]!
  return { p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9) }
}

export interface PositionStats {
  current: number | null
  /** 最近 5、10、15 期平均（含最新一期） */
  avgs: (number | null)[]
  /** 歷史全部的分布 */
  band: Spread | null
}

export function positionStats(values: (number | null)[]): PositionStats {
  const known = values.filter((v): v is number => v != null)
  const avgs = AVG_LENGTHS.map((n) => {
    const tail = values.slice(-n)
    return tail.length === n && tail.every(v => v != null) ? (tail as number[]).reduce((a, b) => a + b, 0) / n : null
  })
  return { current: values.at(-1) ?? null, avgs, band: spread(known) }
}

export interface Similar {
  L: number
  /** 最近 L 期的檔位（舊 → 新） */
  pattern: number[]
  /** 以前同樣檔位的最後一期索引（不含最新一期） */
  hits: number[]
  /** 下一期落在各檔的次數 */
  nextBuckets: number[]
  nextCount: number
  /** 之後第 1、2、3 期的數字分布（扇形） */
  fan: (Spread | null)[]
}

const AHEAD = 3

export function similar(values: (number | null)[], kind: PosKind, L: number): Similar | null {
  const last = values.length - 1
  const tail = values.slice(-L)
  if (tail.length < L || tail.some(v => v == null)) return null
  const bk = values.map(v => (v == null ? -1 : bucketOf(kind, v)))
  const pattern = bk.slice(-L)
  const hits: number[] = []
  for (let i = L - 1; i < last; i++) {
    let ok = true
    for (let j = 0; j < L; j++) {
      if (bk[i - L + 1 + j] !== pattern[j]) {
        ok = false
        break
      }
    }
    if (ok) hits.push(i)
  }
  const nextBuckets = BUCKETS[kind].map(() => 0)
  const ahead: number[][] = Array.from({ length: AHEAD }, () => [])
  for (const i of hits) {
    for (let a = 1; a <= AHEAD; a++) {
      const v = values[i + a]
      if (i + a > last || v == null) continue
      ahead[a - 1]!.push(v)
      if (a === 1) nextBuckets[bucketOf(kind, v)]! += 1
    }
  }
  return { L, pattern, hits, nextBuckets, nextCount: ahead[0]!.length, fan: ahead.map(spread) }
}
