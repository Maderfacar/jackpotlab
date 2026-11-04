/**
 * 活的篩法第二版（2026-11-05 使用者：第 1～3 步直接做；70% 與整體檢查要保留深挖）。
 *
 * 判斷跟第一版（live-core.ts）一樣：隔期四段、頭數、三區、號碼總和、y＝4／5 三個一起、y 1～5 走勢、值 0～9 走勢。
 * 一直用：G 區間、V 區間、大於 10 的值近三期出現過的格排除。
 *
 * 第 1 步 允許錯幾條（整體檢查的改良版）：用上的強判斷，拿歷史上每期實際開出的五顆去對，數每期錯幾條；
 *   取最小的 k，讓「錯 k 條以內」的歷史期數達到門檻 X（試 30%、50%）。組合只要錯的條數 ≤ k 就留。排不出就 k 加 1。
 * 第 2 步 判斷本身的波段：每條判斷記下自己每期判對、判錯；看它現在連對或連錯幾期（連對 1～5 以上、連錯 1～3 以上），
 *   歷史上同樣連法時下一期判對的比例＝這條的強弱（樣本不到 30 次就用原本的比例）。號碼總和用整條規定（方向＋區間）量對錯。
 * 第 3 步 「值出現比例 < 30% 排除」也看強弱：每個被排除的值變成一條判斷「這個值不出現」，強弱照第 2 步量，
 *   跟其他判斷一起進第 1 步（可以被允許錯）。（使用者：多強由我照歷史和近十期判斷 → 用第 2 步的連對連錯，就是近幾期的狀態。）
 *
 * 做法 A：只做第 1 步；B：第 1＋2 步；C：第 1＋2＋3 步。強的門檻 60%、70%（次數 30 以上）。
 * 用法：node --import tsx scripts/live2.ts            → docs/live2-backtest.md（2024 起盲測）
 *       node --import tsx scripts/live2.ts 期號|next   → 單期報告（印在畫面）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { allDecisions, draws, next, rows, type Ball, type Decision, SLOTS } from './blind-test'
import { V_ITEMS, Y_ITEMS, judgeAt, seriesOf } from './item-trend'

const OUT = 'docs/live2-backtest.md'
const FROM = '2024-01-01'
const MIN_N = 30
const HIST_FROM = 60
/** 第 2 步的對錯紀錄從 2024 前 1500 期開始記 */
const TRACK_BACK = 1500
const SUM_BIN = 20
const MOVE = ['變少', '一樣', '變多']
const SEG_NAME = ['0～5', '6～9', '10～19', '20 以上']
const ZONE_NAME = ['1～13', '14～26', '27～39']
const segOf = (sl: number): number => (sl <= 5 ? 0 : sl <= 9 ? 1 : sl <= 19 ? 2 : 3)
const headOf = (x: number): number => Math.floor(x / 10)
const zoneOf = (x: number): number => (x <= 13 ? 0 : x <= 26 ? 1 : 2)

const D = allDecisions.length
type Attr = 'seg' | 'head' | 'zone' | 'num' | 'rank' | 'value' | 'rank45'
/** 一條判斷：五顆裡「attr＝eq 的顆數」（num＝號碼加總）要在 lo～hi；rank45 只算第 2～5 顆 */
interface J { key: string, stage: string, name: string, say: string, share: number, n: number, attr: Attr, eq: number, lo: number, hi: number, soft3?: boolean }
const weight = (a: Attr, eq: number, x: number, o: Ball): number => {
  switch (a) {
    case 'seg': return segOf(o.slot) === eq ? 1 : 0
    case 'head': return headOf(x) === eq ? 1 : 0
    case 'zone': return zoneOf(x) === eq ? 1 : 0
    case 'num': return x
    case 'rank': return o.rank === eq ? 1 : 0
    case 'value': return o.value === eq ? 1 : 0
    case 'rank45': return o.rank >= 4 ? 1 : 0
  }
}
/** 五顆（由小到大）在盤面 bb 上符不符合 */
const okOn = (u: J, x: number[], bb: Ball[]): boolean => {
  let s = 0
  for (let i = u.attr === 'rank45' ? 1 : 0; i < x.length; i++) s += weight(u.attr, u.eq, x[i]!, bb[x[i]!]!)
  return s >= u.lo && s <= u.hi
}

interface Rule { lo: number, hi: number }
const moveRule = (pick: number, last: number): Rule => (pick === 0 ? { lo: last, hi: last } : pick > 0 ? { lo: last + 1, hi: Infinity } : { lo: -Infinity, hi: last - 1 })
const rName = (r: Rule): string => (r.lo === r.hi ? `${r.lo} 顆` : r.lo === -Infinity && r.hi <= 0 ? '0 顆' : r.lo === -Infinity ? `${r.hi} 顆以下` : r.hi === Infinity ? `${r.lo} 顆以上` : `${r.lo}～${r.hi}`)
const headCnt = draws.map(d => [0, 1, 2, 3].map(h => d.filter(x => headOf(x) === h).length))
const zoneCnt = draws.map(d => [0, 1, 2].map(z => d.filter(x => zoneOf(x) === z).length))
const sums = draws.map(d => d.reduce((a, c) => a + c, 0))
const ySeries = Y_ITEMS.map(seriesOf)
const vSeries = V_ITEMS.map(seriesOf)
const k45 = allDecisions.map(d => draws[d.t]!.slice(1).filter(x => d.ballOf[x]!.rank >= 4).length)
const run45 = k45.map(() => 0)
for (let i = 0; i < D; i++) run45[i] = k45[i]! > 0 ? (i ? run45[i - 1]! : 0) + 1 : 0
const sup45 = (bb: Ball[]): number => bb.slice(1).filter(o => o!.slot < SLOTS && o!.rank >= 4).length
const abc = (i: number, bb: Ball[]): boolean => i >= 3 && run45[i - 1]! >= 3 && k45[i - 1]! + k45[i - 2]! + k45[i - 3]! >= 4 && sup45(bb) >= 4 && sup45(bb) <= 5
const abcHist = allDecisions.map((d, i) => abc(i, d.ballOf))

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

interface Ctx { j: number, t: number, b: Ball[], p: Decision['plan'] }
const ctxAt = (j: number): Ctx => ({ j, t: j < D ? allDecisions[j]!.t : rows.length, b: j < D ? allDecisions[j]!.ballOf : next.ballOf, p: j < D ? allDecisions[j]!.plan : next.plan })

function judgmentsAt({ j, t, b, p }: Ctx): J[] {
  const js: J[] = []
  const mode = p.segSum === 5 ? 0 : p.segSum < 5 ? 1 : -1
  p.seg.forEach((s, si) => js.push({ key: `seg${si}`, stage: '一篩', name: `隔期 ${SEG_NAME[si]}`, say: `${mode === 0 ? '' : mode > 0 ? '至少 ' : '最多 '}${s.top} 顆（盤面剩 ${s.sup}）`, share: s.share, n: s.n, attr: 'seg', eq: si, lo: mode < 0 ? -Infinity : s.top, hi: mode > 0 ? Infinity : s.top }))
  for (let h = 0; h < 4; h++) {
    const r = judge(headCnt.map(c => c[h]!), t, false, x => x)
    js.push({ key: `head${h}`, stage: '二篩', name: `${h} 頭`, say: `${MOVE[r.pick + 1] ?? '查無'} → ${rName(r.rule)}`, share: r.share, n: r.n, attr: 'head', eq: h, ...r.rule })
  }
  for (let z = 0; z < 3; z++) {
    const r = judge(zoneCnt.map(c => c[z]!), t, false, x => x)
    js.push({ key: `zone${z}`, stage: '二篩', name: ZONE_NAME[z]!, say: `${MOVE[r.pick + 1] ?? '查無'} → ${rName(r.rule)}`, share: r.share, n: r.n, attr: 'zone', eq: z, ...r.rule })
  }
  {
    const r = judge(sums, t, true, x => Math.floor(x / SUM_BIN))
    js.push({ key: 'sum', stage: '二篩', name: '號碼總和', say: `${MOVE[r.pick + 1] ?? '查無'} → ${r.rule.lo}～${r.rule.hi}`, share: r.share, n: r.n, attr: 'num', eq: 0, ...r.rule })
  }
  if (abc(j, b)) {
    let n = 0, none = 0
    for (let i = 3; i < j; i++) if (abcHist[i]) { n++; if (!k45[i]) none++ }
    js.push({ key: 'y45', stage: '三篩', name: 'y＝4／5 三個一起', say: '剩下四顆沒有 y＝4／5', share: n ? none / n : 0, n, attr: 'rank45', eq: 0, lo: -Infinity, hi: 0 })
  }
  for (const [items, series, w, attr] of [[Y_ITEMS, ySeries, false, 'rank'], [V_ITEMS, vSeries, true, 'value']] as const) {
    items.forEach((it, k) => {
      const s = series[k]!
      const r = judgeAt(s, j, w)
      if (!r.n) return
      const rule = moveRule(r.pick, s.X[j - 1]!)
      js.push({ key: `${attr}${attr === 'rank' ? k + 1 : k}`, stage: '三篩', name: it.name, say: `${MOVE[r.pick + 1]} → ${rName(rule)}`, share: r.cnt[r.pick + 1]! / r.n, n: r.n, attr, eq: attr === 'rank' ? k + 1 : k, ...rule })
    })
  }
  // 第 3 步：排除的值各一條「這個值不出現」
  for (const l of p.lowVals) if (p.oneSlots.some(sl => b.slice(1).some(o => o!.slot === sl && o!.value === l.v))) {
    js.push({ key: `ex${l.v}`, stage: '一篩', name: `排除值 ${l.v}`, say: `值 ${l.v}（剩 ${l.balls} 顆）不出現`, share: 1 - l.rate, n: l.n, attr: 'value', eq: l.v, lo: -Infinity, hi: 0, soft3: true })
  }
  return js
}

// 先把每期的判斷和對錯算好（第 2 步要用）
const from = allDecisions.findIndex(d => rows[d.t]![1] >= FROM)
const F0 = Math.max(HIST_FROM + 3, from - TRACK_BACK)
const JS: J[][] = []
const RIGHT: boolean[][] = []
for (let j = F0; j <= D; j++) {
  const c = ctxAt(j)
  const js = judgmentsAt(c)
  JS[j] = js
  if (j < D) RIGHT[j] = js.map(u => okOn(u, draws[c.t]!, c.b))
}
/** 第 2 步：每條判斷在第 j 期之前的對錯紀錄 → 現在的連法 → 歷史同樣連法下一期判對的比例（一次算好每期） */
interface Streak { share: number, n: number, state: string, r10: string }
const STREAK = new Map<string, Map<number, Streak>>()
{
  const seqs = new Map<string, { j: number, ok: boolean }[]>()
  for (let j = F0; j < D; j++) JS[j]!.forEach((u, k) => { const a = seqs.get(u.key) ?? []; a.push({ j, ok: RIGHT[j]![k]! }); seqs.set(u.key, a) })
  for (const [key, seq] of seqs) {
    const m = new Map<number, Streak>()
    const cnt = new Map<string, { n: number, ok: number }>()
    let last = false, run = 0
    const stateNow = (): string => (run ? (last ? `對${Math.min(run, 5)}` : `錯${Math.min(run, 3)}`) : '')
    const put = (j: number, e: number): void => { const st = stateNow(); const c = cnt.get(st); const l10 = seq.slice(Math.max(0, e - 10), e); m.set(j, { share: c && c.n ? c.ok / c.n : 0, n: c?.n ?? 0, state: st, r10: `${l10.filter(q => q.ok).length}/${l10.length}` }) }
    seq.forEach((q, e) => {
      put(q.j, e)
      const st = stateNow()
      if (st) { const c = cnt.get(st) ?? { n: 0, ok: 0 }; c.n++; if (q.ok) c.ok++; cnt.set(st, c) }
      if (run && q.ok === last) run++; else { last = q.ok; run = 1 }
    })
    put(D, seq.length)
    STREAK.set(key, m)
  }
}
const streakShare = (key: string, j: number): Streak => STREAK.get(key)?.get(j) ?? { share: 0, n: 0, state: '', r10: '' }

/** 每期實際開出的五顆（由小到大）與盤面，給第 1 步數歷史錯幾條 */
const histDraws = allDecisions.map(d => ({ x: draws[d.t]!, b: d.ballOf }))

type Method = 'A' | 'B' | 'C'
interface Opt { method: Method, strong: number, cover: number }
interface Out { list: number[], use: number[], k: number, left: number }
interface Pre { js: J[], strengthA: number[], strengthB: number[], histFail: Uint32Array[], comboFail: Uint32Array[], blocked: Uint8Array, combos: Uint8Array, nC: number }
const WORDS = 2
const popc = (v: number): number => { v = v - ((v >>> 1) & 0x55555555); v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return (((v + (v >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24 }
/** 一期先算好：每條判斷的兩種強弱、歷史每期與每個組合不符合哪幾條（位元） */
function prepare(c: Ctx, js: J[], base: { combos: Uint8Array, n: number, ex: Set<number> }): Pre {
  if (js.length > 32 * WORDS) throw new Error('判斷太多條')
  const strengthA = js.map(u => u.share)
  const strengthB = js.map(u => { const s = streakShare(u.key, c.j); return s.n >= MIN_N ? s.share : u.share })
  const histFail = Array.from({ length: WORDS }, () => new Uint32Array(c.j))
  for (let i = HIST_FROM; i < c.j; i++) { const h = histDraws[i]!; js.forEach((u, k) => { if (!okOn(u, h.x, h.b)) histFail[k >> 5]![i] |= 1 << (k & 31) }) }
  const nC = base.n, combos = base.combos
  const comboFail = Array.from({ length: WORDS }, () => new Uint32Array(nC))
  const blocked = new Uint8Array(nC)
  const exBall = new Uint8Array(40)
  for (let x = 1; x <= 39; x++) if (base.ex.has(c.b[x]!.slot)) exBall[x] = 1
  js.forEach((u, k) => {
    const w = new Float64Array(40)
    for (let x = 1; x <= 39; x++) w[x] = weight(u.attr, u.eq, x, c.b[x]!)
    const skip = u.attr === 'rank45', word = comboFail[k >> 5]!, bit = 1 << (k & 31)
    for (let i = 0, o5 = 0; i < nC; i++, o5 += 5) {
      const sm = (skip ? 0 : w[combos[o5]!]!) + w[combos[o5 + 1]!]! + w[combos[o5 + 2]!]! + w[combos[o5 + 3]!]! + w[combos[o5 + 4]!]!
      if (sm < u.lo || sm > u.hi) word[i] |= bit
    }
  })
  for (let i = 0, o5 = 0; i < nC; i++, o5 += 5) if (exBall[combos[o5]!] || exBall[combos[o5 + 1]!] || exBall[combos[o5 + 2]!] || exBall[combos[o5 + 3]!] || exBall[combos[o5 + 4]!]) blocked[i] = 1
  return { js, strengthA, strengthB, histFail, comboFail, blocked, combos, nC }
}
function pickAt(pre: Pre, j: number, o: Opt): Out {
  const { js, histFail, comboFail, blocked, combos, nC } = pre
  const st = o.method === 'A' ? pre.strengthA : pre.strengthB
  const use = js.map((_, k) => k).filter(k => (o.method === 'C' || !js[k]!.soft3) && st[k]! >= o.strong && js[k]!.n >= MIN_N)
  const mask = Array.from({ length: WORDS }, (_, w) => use.filter(k => k >> 5 === w).reduce((a, k) => (a | (1 << (k & 31))) >>> 0, 0))
  const fails: number[] = []
  for (let i = HIST_FROM; i < j; i++) { let f = 0; for (let w = 0; w < WORDS; w++) f += popc((histFail[w]![i]! & mask[w]!) >>> 0); fails.push(f) }
  fails.sort((a, b) => a - b)
  let k = fails.length ? fails[Math.min(fails.length - 1, Math.max(0, Math.ceil(o.cover * fails.length) - 1))]! : 0
  const fc = new Uint8Array(nC)
  for (let i = 0; i < nC; i++) { let f = 0; for (let w = 0; w < WORDS; w++) f += popc((comboFail[w]![i]! & mask[w]!) >>> 0); fc[i] = f }
  const isBlocked = (i: number): boolean => o.method !== 'C' && blocked[i] === 1
  const survive = (kk: number): number[] => { const out: number[] = []; for (let i = 0; i < nC; i++) if (!isBlocked(i) && fc[i]! <= kk) out.push(i); return out }
  let left = survive(k)
  while (!left.length && k < use.length) left = survive(++k)
  const set = new Set<number>()
  for (const i of left) for (let q = 0; q < 5; q++) set.add(combos[i * 5 + q]!)
  const list = left.length ? [...set].sort((a, b) => a - b) : Array.from({ length: 39 }, (_, q) => q + 1)
  return { list, use, k, left: left.length }
}

/** 一直用的條件：G、V、大於 10 的值近三期出現過；不排除值出現比例低的格（A、B 另外擋） */
function baseCombos({ j, b, p }: Ctx): { combos: Uint8Array, n: number, ex: Set<number>, bigVals: number[] } {
  const bigVals = new Set<number>()
  for (let k = j - 3; k < j; k++) { const e = allDecisions[k]!; for (const x of draws[e.t]!) if (e.ballOf[x]!.value > 10) bigVals.add(e.ballOf[x]!.value) }
  const pool: number[] = []
  for (let x = 1; x <= 39; x++) { const o = b[x]!; if (o.slot < SLOTS && !bigVals.has(o.value)) pool.push(x) }
  const out: number[] = []
  const P = pool.length, sl = pool.map(x => b[x]!.slot), va = pool.map(x => b[x]!.value), gr = p.g.range, vr = p.v
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
          if (G >= gr.lo && G <= gr.hi && V >= vr.lo && V <= vr.hi) out.push(pool[a]!, pool[c]!, pool[d]!, pool[e]!, pool[f]!)
        }
      }
    }
  }
  return { combos: Uint8Array.from(out), n: out.length / 5, ex: new Set(p.oneSlots), bigVals: [...bigVals] }
}

const pct = (x: number): string => `${(100 * x).toFixed(1)}%`
const arg = process.argv[2]
if (arg) {
  // 單期報告：做法 C、強 70%、門檻 50%（補：先用這組看）
  const j = arg === 'next' ? D : allDecisions.findIndex(d => rows[d.t]![0] === Number(arg))
  const c = ctxAt(j)
  const js = JS[j]!
  const base = baseCombos(c)
  const o: Opt = { method: (process.argv[3] as Method) ?? 'C', strong: Number(process.argv[4] ?? 0.7), cover: Number(process.argv[5] ?? 0.5) }
  const r = pickAt(prepare(c, js, base), j, o)
  const lines: string[] = [`第 ${j < D ? rows[c.t]![0] : rows[rows.length - 1]![0] + 1} 期｜做法 ${o.method}、強 ${Math.round(o.strong * 100)}%、錯幾條門檻 ${Math.round(o.cover * 100)}%`]
  lines.push(`一直用：G ${c.p.g.range.lo}～${c.p.g.range.hi}、V ${c.p.v.lo}～${c.p.v.hi}、排除值 ${base.bigVals.join('、') || '無'} 的格（大於 10 近三期）；基本組合 ${base.n} 組`)
  lines.push('| 篩 | 項目 | 判 | 原本比例 | 連法 | 近十期判對 | 連法下一期判對 | 用不用 |')
  lines.push('|---|---|---|---|---|---|---|---|')
  js.forEach((u, k) => { const s = streakShare(u.key, j); lines.push(`| ${u.stage} | ${u.name} | ${u.say} | ${pct(u.share)}（${u.n}） | ${s.state} | ${s.r10} | ${s.n ? `${pct(s.share)}（${s.n}）` : '—'} | ${r.use.includes(k) ? '用' : '不用'} |`) })
  lines.push(`用 ${r.use.length} 條、允許錯 ${r.k} 條、剩 ${r.left} 組、名單 ${r.list.length} 顆：${r.list.join(' ')}`)
  if (j < D) { const x = draws[c.t]!; lines.push(`開出 ${x.join(' ')}：中 ${x.filter(q => r.list.includes(q)).length} 顆`) }
  console.log(lines.join('\n'))
} else {
  const opts: Opt[] = (['A', 'B', 'C'] as Method[]).flatMap(m => [0.6, 0.7].flatMap(s => [0.3, 0.5].map(cv => ({ method: m, strong: s, cover: cv }))))
  const acc = opts.map(() => ({ n: 0, size: 0, dist: [0, 0, 0, 0, 0, 0], last10: [] as string[], k: 0 }))
  const t0 = Date.now()
  for (let j = from; j < D; j++) {
    const c = ctxAt(j)
    const base = baseCombos(c)
    const x = draws[c.t]!
    const pre = prepare(c, JS[j]!, base)
    opts.forEach((o, vi) => {
      const r = pickAt(pre, j, o)
      const h = x.filter(q => r.list.includes(q)).length
      const a = acc[vi]!
      a.n++; a.size += r.list.length; a.dist[h]!++; a.k += r.k
      if (j >= D - 10) a.last10.push(`${r.list.length}/${h}`)
    })
    if ((j - from) % 100 === 0) process.stderr.write(`${j - from}/${D - from} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`)
  }
  const prev = readFileSync('docs/live-backtest.md', 'utf8').split(/\r?\n/).filter(l => /^\| (死規矩版（三篩）|強 70%、不檢查|強 70%、整體 30%) \|/.test(l))
  const out: string[] = []
  out.push('# 活的篩法第二版往前盲測：2024 起每一期')
  out.push('')
  out.push(`> 由 \`scripts/live2.ts\` 產生。資料到第 ${rows[rows.length - 1]![0]} 期，共 ${D - from} 期。每期只用開獎前的資料。`)
  out.push('> A＝允許錯幾條；B＝A＋判斷本身的波段（連對連錯）量強弱；C＝B＋「值出現比例 < 30% 排除」也看強弱、可被允許錯。門檻＝歷史上錯 k 條以內的期數要達到多少（補）。')
  out.push('')
  out.push('| 篩法 | 平均顆數 | 中 5 | 中 4 | 中 3 | 中 2 | 中 1 | 中 0 | 中 3 顆以上 | 平均允許錯 |')
  out.push('|---|---|---|---|---|---|---|---|---|---|')
  for (const l of prev) out.push(`${l} — |`)
  opts.forEach((o, vi) => {
    const a = acc[vi]!
    out.push(`| ${o.method}：強 ${Math.round(o.strong * 100)}%、門檻 ${Math.round(o.cover * 100)}% | ${(a.size / a.n).toFixed(1)} | ${[5, 4, 3, 2, 1, 0].map(k => a.dist[k]).join(' | ')} | ${pct((a.dist[5]! + a.dist[4]! + a.dist[3]!) / a.n)} | ${(a.k / a.n).toFixed(1)} 條 |`)
  })
  out.push('')
  out.push('## 最近十期（篩完顆數／中幾顆）')
  out.push('')
  const terms = allDecisions.slice(D - 10).map(d => rows[d.t]![0] % 1000)
  out.push(`| 篩法 | ${terms.join(' | ')} |`)
  out.push(`|---|${terms.map(() => '---').join('|')}|`)
  opts.forEach((o, vi) => out.push(`| ${o.method}：強 ${Math.round(o.strong * 100)}%、門檻 ${Math.round(o.cover * 100)}% | ${acc[vi]!.last10.join(' | ')} |`))
  writeFileSync(OUT, out.join('\n') + '\n')
  console.log(out.join('\n'))
}
