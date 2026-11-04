/**
 * 活的篩法的核心（給 live-pick.ts 單期報告、live-backtest.ts 往前盲測共用）。
 *   每一條判斷附上「歷史上同樣狀況有幾成這樣走、共幾次」；強的才用、弱的不用。
 *   一直用（不是看比例的判斷）：G 區間、V 區間、同值同顆數 < 30% 的值的格排除、大於 10 的值近三期出現過的格排除。
 *   看強弱的：隔期四段各開幾顆、頭數、三區、號碼總和、y＝4／5 三個一起、y 1～5 走勢、值 0～9 走勢。
 *   整體檢查（補，2026-11-05）：用上的強判斷合起來，歷史上實際開出的五顆同時符合的比例太低時，先放掉最弱的那條。
 *   每期只用開獎前的盤面與到上一期為止的資料。j＝allDecisions 的 index；j＝D 是下一期。
 */
import { allDecisions, draws, next, rows, type Ball, type Decision, SLOTS } from './blind-test'
import { V_ITEMS, Y_ITEMS, judgeAt, seriesOf } from './item-trend'

const SUM_BIN = 20
const MOVE = ['變少', '一樣', '變多']
const segOf = (sl: number): number => (sl <= 5 ? 0 : sl <= 9 ? 1 : sl <= 19 ? 2 : 3)
const SEG_NAME = ['0～5', '6～9', '10～19', '20 以上']
const headOf = (x: number): number => Math.floor(x / 10)
const zoneOf = (x: number): number => (x <= 13 ? 0 : x <= 26 ? 1 : 2)
const ZONE_NAME = ['1～13', '14～26', '27～39']

export const D = allDecisions.length
export interface Rule { lo: number, hi: number }
/** ok(x, bb)：五顆 x 在盤面 bb 上符不符合這條判斷（bb 可以換成歷史上別期的盤面，給整體檢查用） */
export interface Judgment { stage: string, name: string, say: string, share: number, n: number, ok: (x: number[], bb: Ball[]) => boolean }
export interface Ctx { j: number, t: number, b: Ball[], p: Decision['plan'] }

export const ctxAt = (j: number): Ctx => ({
  j,
  t: j < D ? allDecisions[j]!.t : rows.length,
  b: j < D ? allDecisions[j]!.ballOf : next.ballOf,
  p: j < D ? allDecisions[j]!.plan : next.plan
})

const headCnt = draws.map(d => [0, 1, 2, 3].map(h => d.filter(x => headOf(x) === h).length))
const zoneCnt = draws.map(d => [0, 1, 2].map(z => d.filter(x => zoneOf(x) === z).length))
const sums = draws.map(d => d.reduce((a, c) => a + c, 0))
const ySeries = Y_ITEMS.map(seriesOf)
const vSeries = V_ITEMS.map(seriesOf)
const k45 = allDecisions.map(d => [...draws[d.t]!].sort((a, c) => a - c).slice(1).filter(x => d.ballOf[x]!.rank >= 4).length)
const run45 = k45.map(() => 0)
for (let i = 0; i < D; i++) run45[i] = k45[i]! > 0 ? (i ? run45[i - 1]! : 0) + 1 : 0
const sup45 = (bb: Ball[]): number => bb.slice(1).filter(o => o!.slot < SLOTS && o!.rank >= 4).length
const abc = (i: number, bb: Ball[]): boolean => i >= 3 && run45[i - 1]! >= 3 && k45[i - 1]! + k45[i - 2]! + k45[i - 3]! >= 4 && sup45(bb) >= 4 && sup45(bb) <= 5
const abcHist: boolean[] = allDecisions.map((d, i) => abc(i, d.ballOf))

const inR = (c: number, r: Rule): boolean => c >= r.lo && c <= r.hi
const rName = (r: Rule): string => (r.lo === r.hi ? `${r.lo} 顆` : r.lo === -Infinity && r.hi === 0 ? '0 顆' : r.lo === -Infinity ? `${r.hi} 顆以下` : r.hi === Infinity ? `${r.lo} 顆以上` : `${r.lo}～${r.hi}`)
const moveRule = (pick: number, last: number): Rule => (pick === 0 ? { lo: last, hi: last } : pick > 0 ? { lo: last + 1, hi: Infinity } : { lo: -Infinity, hi: last - 1 })

/** 二篩：序列 xs 在第 t 期開獎前判（同 three-stage.ts，多回傳比例） */
function judge(xs: number[], t: number, withRange: boolean, band: (x: number) => number): { rule: Rule, pick: number, share: number, n: number } {
  const last = xs[t - 1]!
  const dir = Math.sign(last - xs[t - 2]!)
  const cnt = [0, 0, 0]
  const nx: number[] = []
  for (let i = 2; i < t - 1; i++) {
    if (Math.sign(xs[i]! - xs[i - 1]!) !== dir || band(xs[i]!) !== band(last)) continue
    cnt[Math.sign(xs[i + 1]! - xs[i]!) + 1]!++
    nx.push(xs[i + 1]!)
  }
  const n = nx.length
  if (!n) return { rule: { lo: -Infinity, hi: Infinity }, pick: NaN, share: 0, n }
  const best = Math.max(...cnt)
  const pick = cnt[1] === best ? 0 : cnt[2] === best ? 1 : -1
  let rule = moveRule(pick, last)
  if (withRange) {
    const s = [...nx].sort((a, c) => a - c)
    const q = (r: number): number => s[Math.floor(r * (s.length - 1))]!
    rule = { lo: Math.max(rule.lo, q(0.25)), hi: Math.min(rule.hi, q(0.75)) }
    if (rule.lo > rule.hi) rule = { lo: q(0.25), hi: q(0.75) }
  }
  return { rule, pick, share: best / n, n }
}

/** 這期每一條看強弱的判斷 */
export function judgmentsAt({ j, t, p }: Ctx, b: Ball[]): Judgment[] {
  const js: Judgment[] = []
  p.seg.forEach((s, si) => {
    const top = s.top
    const mode = p.segSum === 5 ? 0 : p.segSum < 5 ? 1 : -1
    js.push({
      stage: '一篩', name: `隔期 ${SEG_NAME[si]}`, say: `${mode === 0 ? '' : mode > 0 ? '至少 ' : '最多 '}${top} 顆（盤面剩 ${s.sup}）`, share: s.share, n: s.n,
      ok: (x, bb) => { const c = x.filter(m => segOf(bb[m]!.slot) === si).length; return mode === 0 ? c === top : mode > 0 ? c >= top : c <= top }
    })
  })
  for (let h = 0; h < 4; h++) {
    const r = judge(headCnt.map(c => c[h]!), t, false, x => x)
    js.push({ stage: '二篩', name: `${h} 頭`, say: `${MOVE[r.pick + 1] ?? '查無'} → ${rName(r.rule)}`, share: r.share, n: r.n, ok: x => inR(x.filter(m => headOf(m) === h).length, r.rule) })
  }
  for (let z = 0; z < 3; z++) {
    const r = judge(zoneCnt.map(c => c[z]!), t, false, x => x)
    js.push({ stage: '二篩', name: ZONE_NAME[z]!, say: `${MOVE[r.pick + 1] ?? '查無'} → ${rName(r.rule)}`, share: r.share, n: r.n, ok: x => inR(x.filter(m => zoneOf(m) === z).length, r.rule) })
  }
  {
    const r = judge(sums, t, true, x => Math.floor(x / SUM_BIN))
    js.push({ stage: '二篩', name: '號碼總和', say: `${MOVE[r.pick + 1] ?? '查無'} → ${r.rule.lo}～${r.rule.hi}`, share: r.share, n: r.n, ok: x => inR(x.reduce((a, c) => a + c, 0), r.rule) })
  }
  if (abc(j, b)) {
    let n = 0, none = 0
    for (let i = 3; i < j; i++) if (abcHist[i]) { n++; if (!k45[i]) none++ }
    js.push({ stage: '三篩', name: 'y＝4／5 三個一起', say: '剩下四顆沒有 y＝4／5', share: n ? none / n : 0, n, ok: (x, bb) => ![...x].sort((a, c) => a - c).slice(1).some(m => bb[m]!.rank >= 4) })
  }
  for (const [items, series, w] of [[Y_ITEMS, ySeries, false], [V_ITEMS, vSeries, true]] as const) {
    items.forEach((it, k) => {
      const s = series[k]!
      const r = judgeAt(s, j, w)
      if (!r.n) return
      const rule = moveRule(r.pick, s.X[j - 1]!)
      js.push({ stage: '三篩', name: it.name, say: `${MOVE[r.pick + 1]} → ${rName(rule)}`, share: r.cnt[r.pick + 1]! / r.n, n: r.n, ok: (x, bb) => inR(x.filter(m => bb[m]!.slot < SLOTS && it.of(bb[m]!)).length, rule) })
    })
  }
  return js
}

export interface Base { combos: number[][], ex: number[], bigVals: number[] }
/** 一直用的：G、V、排除的格 → 所有組合 */
export function baseCombos({ j, b, p }: Ctx): Base {
  const bigVals = new Set<number>()
  for (let k = j - 3; k < j; k++) { const e = allDecisions[k]!; for (const x of draws[e.t]!) if (e.ballOf[x]!.value > 10) bigVals.add(e.ballOf[x]!.value) }
  const ex = new Set(p.oneSlots)
  const pool: number[] = []
  for (let x = 1; x <= 39; x++) { const o = b[x]!; if (o.slot < SLOTS && !ex.has(o.slot) && !bigVals.has(o.value)) pool.push(x) }
  const combos: number[][] = []
  const P = pool.length
  const sl = pool.map(x => b[x]!.slot)
  const va = pool.map(x => b[x]!.value)
  const gr = p.g.range, vr = p.v
  for (let a = 0; a < P; a++) for (let c = a + 1; c < P; c++) {
    const g2 = sl[a]! + sl[c]!, v2 = va[a]! + va[c]!
    if (g2 > gr.hi || v2 > vr.hi) continue
    for (let d = c + 1; d < P; d++) {
      const g3 = g2 + sl[d]!, v3 = v2 + va[d]!
      if (g3 > gr.hi || v3 > vr.hi) continue
      for (let e = d + 1; e < P; e++) {
        const g4 = g3 + sl[e]!, v4 = v3 + va[e]!
        if (g4 > gr.hi || v4 > vr.hi) continue
        for (let f = e + 1; f < P; f++) {
          const G = g4 + sl[f]!, V = v4 + va[f]!
          if (G >= gr.lo && G <= gr.hi && V >= vr.lo && V <= vr.hi) combos.push([pool[a]!, pool[c]!, pool[d]!, pool[e]!, pool[f]!])
        }
      }
    }
  }
  return { combos, ex: [...ex].sort((x, y) => x - y), bigVals: [...bigVals] }
}

/** 每個組合不符合哪幾條判斷（位元） */
export const failMasks = (combos: number[][], js: Judgment[], b: Ball[]): Uint32Array => {
  const m = new Uint32Array(combos.length)
  combos.forEach((x, i) => { let f = 0; js.forEach((u, k) => { if (!u.ok(x, b)) f |= 1 << k }); m[i] = f })
  return m
}
/** 歷史上（第 j 期之前）每期實際開出的五顆不符合哪幾條判斷（位元），給整體檢查 */
export const histMasks = (j: number, js: Judgment[]): Uint32Array => {
  const m = new Uint32Array(j)
  for (let i = 0; i < j; i++) { const d = allDecisions[i]!; const x = draws[d.t]!; let f = 0; js.forEach((u, k) => { if (!u.ok(x, d.ballOf)) f |= 1 << k }); m[i] = f }
  return m
}
const passRate = (hm: Uint32Array, use: number, from: number): number => { let ok = 0; for (let i = from; i < hm.length; i++) if (!(hm[i]! & use)) ok++; return hm.length > from ? ok / (hm.length - from) : 1 }

export interface Pick { list: number[], use: number[], dropped: number[], joint: number, left: number }
export interface PickOpt { strong: number, minN: number, jointMin: number | null }
/**
 * 選：強的（比例 ≥ strong、次數 ≥ minN）由弱到強排；
 *   有整體檢查時：合起來歷史同時符合 < jointMin → 先放掉最弱的；
 *   排不出組合 → 再放掉最弱的，直到排得出來。基本組合就排不出來時名單是全部 39 顆。
 */
export function choose(js: Judgment[], combos: number[][], fm: Uint32Array, hm: Uint32Array | null, o: PickOpt): Pick {
  const idx = js.map((_, k) => k).filter(k => js[k]!.share >= o.strong && js[k]!.n >= o.minN).sort((x, y) => js[x]!.share - js[y]!.share)
  const dropped: number[] = []
  const maskOf = (ks: number[]): number => ks.reduce((a, k) => a | (1 << k), 0)
  const HIST_FROM = 60
  let joint = hm ? passRate(hm, maskOf(idx), HIST_FROM) : NaN
  while (hm && o.jointMin !== null && idx.length && joint < o.jointMin) { dropped.push(idx.shift()!); joint = passRate(hm, maskOf(idx), HIST_FROM) }
  const leftOf = (u: number): number[] => { const out: number[] = []; for (let i = 0; i < fm.length; i++) if (!(fm[i]! & u)) out.push(i); return out }
  let left = leftOf(maskOf(idx))
  while (!left.length && idx.length) { dropped.push(idx.shift()!); left = leftOf(maskOf(idx)) }
  if (hm) joint = passRate(hm, maskOf(idx), HIST_FROM)
  const list = combos.length ? [...new Set(left.flatMap(i => combos[i]!))].sort((x, y) => x - y) : Array.from({ length: 39 }, (_, k) => k + 1)
  return { list, use: idx, dropped, joint, left: left.length }
}
