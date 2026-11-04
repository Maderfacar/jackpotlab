/**
 * y 1～5、值 0～9 各自的走勢（2026-11-05 使用者）：給 y-value-trend.ts（只看）與 three-stage.ts（三篩）共用。
 *   走勢：每期開出的五顆裡，這個 y（或值）有幾顆；這期比上期多、少、一樣。
 *   同樣狀況：這期方向一樣、這期開出顆數一樣；加盤面時再加上盤面上這個 y（或值）剩的顆數在同一段
 *     （0～5 各自一段，6 以上每 3 顆一段）。
 *   判：同樣狀況的歷史期，下一期變多／變少／一樣哪個最多；一樣多時順序同二篩（一樣 > 變多 > 變少）。
 *   盤面上不在 60 格內的球不算。index 用 allDecisions 的 index；第 D 期＝下一期（next）。
 */
import { allDecisions, draws, next, type Ball } from './blind-test'

const SLOTS = 60
export interface Item { name: string, of: (o: Ball) => boolean, withSupply: boolean }
/** 使用者定（2026-11-05）：y 不看盤面顆數；值加盤面顆數 */
export const Y_ITEMS: Item[] = [1, 2, 3, 4, 5].map(k => ({ name: `y=${k}`, of: (o: Ball) => o.rank === k, withSupply: false }))
export const V_ITEMS: Item[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => ({ name: `值 ${k}`, of: (o: Ball) => o.value === k, withSupply: true }))

export const onBoard = (o: Ball): boolean => o.slot < SLOTS
export const band = (s: number): number => (s <= 5 ? s : 6 + Math.floor((s - 6) / 3))
export const bandName = (s: number): string => { const b = band(s); return b <= 5 ? `${b}` : `${6 + (b - 6) * 3}～${8 + (b - 6) * 3}` }

const boards: Ball[][] = [...allDecisions.map(d => d.ballOf), next.ballOf]
export interface Series { X: number[], S: number[] }
/** X[j]＝第 j 期開出幾顆；S[j]＝第 j 期開獎前盤面剩幾顆（S 多一格給下一期） */
export function seriesOf(it: Item): Series {
  return {
    X: allDecisions.map(d => draws[d.t]!.filter(x => onBoard(d.ballOf[x]!) && it.of(d.ballOf[x]!)).length),
    S: boards.map(b => b.slice(1).filter(o => onBoard(o!) && it.of(o!)).length)
  }
}

export interface Judge { n: number, cnt: number[], pick: number }
/** 第 j 期開獎前判：-1 變少、0 一樣、1 變多、NaN 查無 */
export function judgeAt({ X, S }: Series, j: number, withSupply: boolean): Judge {
  const last = X[j - 1]!
  const dir = Math.sign(last - X[j - 2]!)
  const cnt = [0, 0, 0]
  for (let i = 1; i < j - 1; i++) {
    if (X[i] !== last || Math.sign(X[i]! - X[i - 1]!) !== dir) continue
    if (withSupply && band(S[i + 1]!) !== band(S[j]!)) continue
    cnt[Math.sign(X[i + 1]! - X[i]!) + 1]!++
  }
  const n = cnt[0]! + cnt[1]! + cnt[2]!
  const best = Math.max(...cnt)
  const pick = !n ? NaN : cnt[1] === best ? 0 : cnt[2] === best ? 1 : -1
  return { n, cnt, pick }
}

export interface CountRule { lo: number, hi: number }
/** 判換成這期組合裡的顆數範圍（同二篩：一樣＝同顆數、變多＝比上期多、變少＝比上期少） */
export function ruleAt(s: Series, j: number, withSupply: boolean): CountRule {
  const { pick } = judgeAt(s, j, withSupply)
  const last = s.X[j - 1]!
  if (Number.isNaN(pick)) return { lo: -Infinity, hi: Infinity }
  return pick === 0 ? { lo: last, hi: last } : pick > 0 ? { lo: last + 1, hi: Infinity } : { lo: -Infinity, hi: last - 1 }
}
