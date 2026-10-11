/**
 * /scan 八點的逐期底稿：每期五顆的隔期 / 值 / 位置 x-y（與 /draws 獎號關聯同一套算法）＋常用衍生量。
 */
import type { PlainDraw } from '../../history-file'
import { computeFeatures } from '../../patterns/features'
import type { ScanDraw } from '../scan'

/** 隔期表格範圍（與 /draws 預設相同） */
export const BOARD_N = 60

export type Row = ScanDraw

export function buildRows(draws: PlainDraw[]): Row[] {
  const feats = computeFeatures(draws.map(d => d.nums), BOARD_N)
  return draws.map((d, i) => ({ issue: d.issue, date: d.date, nums: d.nums, ...feats[i]! }))
}

/** 隔期 0~5 開出幾顆（超出表格範圍的不算） */
export const lowCount = (r: Row): number => r.gaps.filter(g => g != null && g <= 5).length
/** 隔期和（與網站獎號關聯相同：只加找得到的） */
export const gapSumOf = (r: Row): number => r.gaps.reduce<number>((a, g) => a + (g ?? 0), 0)
/** 值 0～1 的顆數 */
export const smallValueCount = (r: Row): number => r.values.filter(v => v != null && v <= 1).length
/** y = 1 的顆數 */
export const y1Count = (r: Row): number => r.ys.filter(y => y === 1).length
/** 連莊（隔期 0）顆數 */
export const repeatCount = (r: Row): number => r.gaps.filter(g => g === 0).length
/** 有 2 顆以上同尾的尾數（升序） */
export function pairTails(nums: number[]): number[] {
  const c = new Array<number>(10).fill(0)
  nums.forEach(n => c[n % 10]!++)
  return c.flatMap((k, d) => (k >= 2 ? [d] : []))
}
export const hasTail = (nums: number[], d: number): boolean => nums.some(n => n % 10 === d)
