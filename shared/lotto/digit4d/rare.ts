/**
 * 少見狀況通報（2026-11-09 使用者：目前盤面各種少見狀況，對照歷史上同樣狀況之後怎麼開）。
 *
 * 每一種狀況都只拿「那一期以前」的期數比較：
 *   少見 = 歷史上像現在這樣（或更極端）的期數不到 RARE_SHARE（一成，我補的標準）。
 *   後續 = 歷史上出現同樣狀況的那幾期，下一期／之後五期內有沒有發生對應的事；
 *         「平常」= 不管有沒有這個狀況，所有期數發生同一件事的比例。
 */
import { DIGITS, POS_LABELS, WARMUP, boxLabel, createRunner, type DrawStep } from './state'
import type { DigitPlainDraw } from '../digit-history'

export const RARE_SHARE = 0.1
/** 歷史次數少於這個就標「次數少」 */
export const FEW = 10
const AHEAD = 5

export interface Outcome {
  label: string
  /** 歷史上同樣狀況的次數（能看下一期的） */
  n: number
  hit: number
  /** 平常的比例 */
  base: number
}

export interface RareItem {
  key: string
  group: string
  title: string
  /** 歷史上像現在這樣（或更極端）的期數比例 */
  share: number
  next: Outcome
  within: Outcome | null
}

/** 每期開完之後的盤面數值（index = t） */
interface Series {
  steps: DrawStep[]
  /** [位置][名次][t] 名次的值 */
  rankValue: Int32Array[][]
  /** [位置][數字][t] 數字的隔期 */
  digitGap: Int32Array[][]
  /** [位置][t] 這期開到的名次連續幾期都是同一個名次 */
  rankRun: Int32Array[]
  l2Max: Int32Array
  l2MaxBox: Int32Array
  l2Ready: number
  distinctRun: Int32Array
  repeatRun: Int32Array
}

function buildSeries(draws: DigitPlainDraw[]): Series {
  const n = draws.length
  const r = createRunner()
  const rankValue = Array.from({ length: DIGITS }, () => Array.from({ length: 10 }, () => new Int32Array(n)))
  const digitGap = Array.from({ length: DIGITS }, () => Array.from({ length: 10 }, () => new Int32Array(n)))
  const rankRun = Array.from({ length: DIGITS }, () => new Int32Array(n))
  const l2Max = new Int32Array(n)
  const l2MaxBox = new Int32Array(n)
  const distinctRun = new Int32Array(n)
  const repeatRun = new Int32Array(n)
  /** 100 組後兩碼都開過之後的第一期（之前「最久沒開」會被沒開過的組拉高） */
  let l2Ready = 0
  const steps: DrawStep[] = []
  draws.forEach((d, t) => {
    const s = r.push(d)
    for (let p = 0; p < DIGITS; p++) {
      for (let k = 0; k < 10; k++) {
        rankValue[p]![k]![t] = t - r.rankLast[p]![k]!
        digitGap[p]![k]![t] = t - r.lastSeen[p]![k]!
      }
      const same = t > 0 && steps[t - 1]!.pos[p]!.rank === s.pos[p]!.rank
      rankRun[p]![t] = same ? rankRun[p]![t - 1]! + 1 : 1
    }
    const l2 = r.levelLast[1]!
    let best = -1
    let bestBox = 0
    let unseen = 0
    for (let box = 0; box < 100; box++) {
      if (l2[box]! < 0) unseen++
      const g = t - l2[box]!
      if (g > best) {
        best = g
        bestBox = box
      }
    }
    l2Max[t] = best
    l2MaxBox[t] = bestBox
    if (unseen > 0) l2Ready = t + 1
    const distinct = s.shape === 'distinct'
    distinctRun[t] = distinct ? (t > 0 ? distinctRun[t - 1]! : 0) + 1 : 0
    repeatRun[t] = distinct ? 0 : (t > 0 ? repeatRun[t - 1]! : 0) + 1
    steps.push(s)
  })
  return { steps, rankValue, digitGap, rankRun, l2Max, l2MaxBox, l2Ready, distinctRun, repeatRun }
}

/** 歷史上（WARMUP 起到 last）符合 cond 的 t，看下一期／五期內 */
function follow(last: number, points: number[], next: (t: number) => boolean, within?: (t: number) => boolean): { n: number, hit: number, n5: number, hit5: number } {
  const ps = points.filter(t => t + 1 <= last)
  const p5 = points.filter(t => t + AHEAD <= last)
  return {
    n: ps.length,
    hit: ps.filter(next).length,
    n5: p5.length,
    hit5: within ? p5.filter(within).length : 0
  }
}

const range = (from: number, to: number): number[] => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i)
const rate = (xs: number[], f: (t: number) => boolean): number => (xs.length ? xs.filter(f).length / xs.length : 0)
const anyAhead = (t: number, f: (u: number) => boolean): boolean => range(t + 1, t + AHEAD).some(f)

export function rareItems(draws: DigitPlainDraw[]): RareItem[] {
  const S = buildSeries(draws)
  const last = draws.length - 1
  if (last < WARMUP + 10) return []
  const all = range(WARMUP, last)
  const allNext = range(WARMUP, last - 1)
  const all5 = range(WARMUP, last - AHEAD)
  const items: RareItem[] = []
  const push = (key: string, group: string, title: string, share: number, points: number[], nextLabel: string, next: (t: number) => boolean, withinLabel: string | null, within: ((t: number) => boolean) | null, baseNext: number, base5: number | null): void => {
    if (share > RARE_SHARE) return
    const f = follow(last, points, next, within ?? undefined)
    items.push({
      key,
      group,
      title,
      share,
      next: { label: nextLabel, n: f.n, hit: f.hit, base: baseNext },
      within: within && withinLabel && base5 != null ? { label: withinLabel, n: f.n5, hit: f.hit5, base: base5 } : null
    })
  }
  const hitRank = (p: number, t: number): number => S.steps[t]!.pos[p]!.rank
  const hitDigit = (p: number, t: number): number => S.steps[t]!.digits[p]!

  for (let p = 0; p < DIGITS; p++) {
    const P = POS_LABELS[p]
    // 一、名次久沒被開到
    for (let k = 0; k < 10; k++) {
      const v = S.rankValue[p]![k]![last]!
      if (v < 1) continue
      const share = rate(all, t => S.rankValue[p]![k]![t]! >= v)
      const hitK = (u: number): boolean => hitRank(p, u) === k
      push(`rv-${p}-${k}`, '名次久沒被開到', `${P}「第 ${k} 新」已經 ${v} 期沒被開到`, share,
        all.filter(t => t < last && S.rankValue[p]![k]![t] === v),
        `下一期${P}開到第 ${k} 新`, t => hitK(t + 1), `之後五期內開到第 ${k} 新`, t => anyAhead(t, hitK),
        rate(allNext, t => hitK(t + 1)), rate(all5, t => anyAhead(t, hitK)))
    }
    // 二、數字隔期正處於歷史高位（同一位置 10 個數字一起比）
    const gaps = S.digitGap[p]!
    for (let d = 0; d < 10; d++) {
      const g = gaps[d]![last]!
      let cnt = 0
      for (const t of all) for (let x = 0; x < 10; x++) if (gaps[x]![t]! >= g) cnt++
      const share = cnt / (all.length * 10)
      if (share > RARE_SHARE) continue
      // 歷史上任何一個數字在這個位置剛好空了 g 期的時候
      const points: { t: number, x: number }[] = []
      for (const t of all) for (let x = 0; x < 10; x++) if (t < last && gaps[x]![t] === g) points.push({ t, x })
      const p1 = points.filter(q => q.t + 1 <= last)
      const p5 = points.filter(q => q.t + AHEAD <= last)
      items.push({
        key: `dg-${p}-${d}`,
        group: '數字隔期正處於歷史高位',
        title: `${P}的 ${d} 已經 ${g} 期沒開出`,
        share,
        next: { label: `下一期${P}開出 ${d}`, n: p1.length, hit: p1.filter(q => hitDigit(p, q.t + 1) === q.x).length, base: rate(allNext, t => hitDigit(p, t + 1) === d) },
        within: { label: `之後五期內${P}開出 ${d}`, n: p5.length, hit: p5.filter(q => anyAhead(q.t, u => hitDigit(p, u) === q.x)).length, base: rate(all5, t => anyAhead(t, u => hitDigit(p, u) === d)) }
      })
    }
    // 三、同一個名次連續被開到
    const run = S.rankRun[p]![last]!
    if (run >= 2) {
      const k = hitRank(p, last)
      const share = rate(all, t => S.rankRun[p]![t]! >= run)
      push(`rr-${p}`, '同一名次連續被開到', `${P}連續 ${run} 期都開到「第 ${k} 新」${k === 0 ? '（同一個數字連開）' : ''}`, share,
        all.filter(t => t < last && S.rankRun[p]![t] === run && hitRank(p, t) === k),
        `下一期${P}又開到第 ${k} 新`, t => hitRank(p, t + 1) === k, null, null,
        rate(allNext.filter(t => hitRank(p, t) === k), t => hitRank(p, t + 1) === k), null)
    }
  }

  // 四、後兩碼最久沒開的那一組
  const m = S.l2Max[last]!
  const mBox = S.l2MaxBox[last]!
  {
    const allL2 = all.filter(t => t > S.l2Ready)
    const share = rate(allL2, t => S.l2Max[t]! >= m)
    const reach = allL2.filter(t => t < last && S.l2Max[t]! >= m && (S.l2Max[t - 1]! < m || S.l2MaxBox[t - 1] !== S.l2MaxBox[t]))
    const opens = (t: number, u: number): boolean => S.steps[u]!.levelGap[1] != null && l2Of(S.steps[u]!) === S.l2MaxBox[t]
    push('l2max', '後兩碼最久沒開', `後兩碼 ${boxLabel(mBox, 2)} 已經 ${m} 期沒開出（100 組裡最久）`, share, reach,
      `下一期開出這組後兩碼`, t => opens(t, t + 1), '之後五期內開出這組', t => anyAhead(t, u => opens(t, u)),
      rate(allNext.filter(t => t > S.l2Ready), t => opens(t, t + 1)), rate(all5.filter(t => t > S.l2Ready), t => anyAhead(t, u => opens(t, u))))
  }

  // 五、後兩碼在很短的期數內重複開出
  const g2 = S.steps[last]!.levelGap[1]
  if (g2 != null) {
    const share = rate(all, t => S.steps[t]!.levelGap[1] != null && S.steps[t]!.levelGap[1]! <= g2)
    const again = (t: number, u: number): boolean => l2Of(S.steps[u]!) === l2Of(S.steps[t]!)
    push('l2rep', '後兩碼短期內重複', `後兩碼 ${boxLabel(l2Of(S.steps[last]!), 2)} 隔 ${g2} 期又開出`, share,
      all.filter(t => t < last && S.steps[t]!.levelGap[1] != null && S.steps[t]!.levelGap[1]! <= g2),
      '下一期又開出同一組後兩碼', t => again(t, t + 1), '之後五期內又開出', t => anyAhead(t, u => again(t, u)),
      rate(allNext, t => again(t, t + 1)), rate(all5, t => anyAhead(t, u => again(t, u))))
  }

  // 六、四碼樣子連續
  const dRun = S.distinctRun[last]!
  const rRun = S.repeatRun[last]!
  const isDistinct = (u: number): boolean => S.steps[u]!.shape === 'distinct'
  if (dRun >= 2) {
    push('drun', '四碼樣子連續', `連續 ${dRun} 期四個數字都不同`, rate(all, t => S.distinctRun[t]! >= dRun),
      all.filter(t => t < last && S.distinctRun[t] === dRun), '下一期還是四個都不同', t => isDistinct(t + 1), null, null,
      rate(allNext.filter(isDistinct), t => isDistinct(t + 1)), null)
  }
  if (rRun >= 2) {
    push('rrun', '四碼樣子連續', `連續 ${rRun} 期四碼裡有重複的數字`, rate(all, t => S.repeatRun[t]! >= rRun),
      all.filter(t => t < last && S.repeatRun[t] === rRun), '下一期還是有重複', t => !isDistinct(t + 1), null, null,
      rate(allNext.filter(t => !isDistinct(t)), t => !isDistinct(t + 1)), null)
  }

  // 七、和值在兩頭（兩頭合計一成）
  const sum = S.steps[last]!.sum
  const sumOf = (u: number): number => S.steps[u]!.sum
  const lowShare = rate(all, t => sumOf(t) <= sum)
  const highShare = rate(all, t => sumOf(t) >= sum)
  if (lowShare <= RARE_SHARE / 2) {
    push('sumlo', '四碼和值在兩頭', `四碼加起來 ${sum}，偏小`, lowShare * 2, all.filter(t => t < last && sumOf(t) <= sum),
      `下一期和值大於 ${sum}`, t => sumOf(t + 1) > sum, null, null, rate(allNext, t => sumOf(t + 1) > sum), null)
  }
  if (highShare <= RARE_SHARE / 2) {
    push('sumhi', '四碼和值在兩頭', `四碼加起來 ${sum}，偏大`, highShare * 2, all.filter(t => t < last && sumOf(t) >= sum),
      `下一期和值小於 ${sum}`, t => sumOf(t + 1) < sum, null, null, rate(allNext, t => sumOf(t + 1) < sum), null)
  }

  return items.sort((a, b) => a.share - b.share)
}

const l2Of = (s: DrawStep): number => s.digits[2]! * 10 + s.digits[3]!
