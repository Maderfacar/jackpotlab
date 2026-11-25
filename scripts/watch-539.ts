/**
 * 539 每期開完的查看清單（2026-11-25 使用者口述；清單見記憶 user-539-per-draw-checklist）。
 * 只列少見的：這期的狀態在 2007 起的歷史上「這麼極端以上」的比例低於門檻（RARE，我定的），
 * 日期牌照使用者的話：沒開出的期數超過歷史平均間隔就列。號碼隔 30 期以上照使用者的話直接列。
 * 每一項附：歷史上幾次、最長、前一次在哪（含那期開獎前的盤面）、同樣情況下一期怎麼走 vs 平常。
 *
 * 用法：pnpm dlx tsx scripts/watch-539.ts [--at=期號] [--all]
 *   --at  只用到那一期為止的資料（回頭對上一期報的結果）；--all  不套門檻，全部列出（定門檻用）
 */
/* eslint-disable @stylistic/max-statements-per-line -- 分析腳本，計數迴圈寫成一行比較好對照 */
import { readFileSync } from 'node:fs'
import { walk } from '../app/utils/wave-series'

type Row = [number, string, number[]]
type Src = '你的' | '我加的'
const allRows = (JSON.parse(readFileSync('public/data/lotto539-history.json', 'utf8')) as { rows: Row[] }).rows
const atArg = process.argv.find(a => a.startsWith('--at='))
const rows = atArg ? allRows.filter(r => r[0] <= Number(atArg.slice(5))) : allRows
const SHOW_ALL = process.argv.includes('--all')
const N = rows.length, LAST = N - 1, WARM = 100
/** 歷史上這麼極端以上的比例低於這個才列（我定的） */
const RARE = 0.05
/** 次數少於這個標「次數少」 */
const FEW = 10
/** 號碼隔幾期以上直接列（使用者：三十幾、四十才開始注意） */
const DEEP_NUM = 30
/** 總和連幾期同在 100 的一邊直接列（使用者舉例：連 3 期、5 期大於 100） */
const SUM_SIDE_RUN = 3

const nums = rows.map(r => [...new Set(r[2])].sort((a, b) => a - b))
const { balls } = walk(rows.map(([t, d], i) => ({ drawTerm: t, drawDate: d, prizes: nums[i]! })))
// 隔期自己算（不設上限）；值、y 用 walk（與 /board、/draws 同一套）
const gaps: number[][] = []
const remSeg: number[][] = [] // 開完第 t 期後，盤面上隔期 0～5、6～9、10～19、20 以上各剩幾顆
const gapNow = new Array<number>(40).fill(999)
{
  const last = new Array<number>(40).fill(-1)
  for (let t = 0; t < N; t++) {
    gaps.push(nums[t]!.map(n => (last[n]! < 0 ? 999 : t - last[n]! - 1)))
    for (const n of nums[t]!) last[n] = t
    const c = [0, 0, 0, 0]
    for (let n = 1; n <= 39; n++) if (last[n]! >= 0) c[segOf(t - last[n]!)]! += 1
    remSeg.push(c)
    if (t === LAST) for (let n = 1; n <= 39; n++) gapNow[n] = last[n]! < 0 ? 999 : t - last[n]!
  }
}
function segOf(g: number): number { return g <= 5 ? 0 : g <= 9 ? 1 : g <= 19 ? 2 : 3 }
const SEG = ['0～5', '6～9', '10～19', '20 以上']
const zoneOf = (n: number): number => (n <= 13 ? 0 : n <= 26 ? 1 : 2)
const ZONE = ['1～13', '14～26', '27～39']

const sum = nums.map(ns => ns.reduce((a, b) => a + b, 0))
const zones = nums.map(ns => [0, 1, 2].map(z => ns.filter(n => zoneOf(n) === z).length))
const G = gaps.map(gs => gs.reduce((a, b) => a + Math.min(b, 99), 0))
const V = balls.map(bs => bs.reduce((a, b) => a + (b.value ?? 0), 0))
const segCnt = gaps.map(gs => [0, 1, 2, 3].map(s => gs.filter(g => segOf(g) === s).length))
const yCat = (t: number, k: number): number => Math.min(balls[t]![k]!.y ?? 1, 3)
const yCnt = balls.map((_, t) => [1, 2, 3].map(c => [0, 1, 2, 3, 4].filter(k => yCat(t, k) === c).length))
const day = rows.map(r => Number(r[1].slice(8, 10)))
const dateHit = nums.map((ns, t) => ns.includes(day[t]!))

/** 同一年只寫後三碼，跨年寫完整期號 */
const term = (t: number): string => (Math.floor(rows[t]![0] / 1e6) === Math.floor(rows[LAST]![0] / 1e6) ? `${rows[t]![0] % 1000}` : `${rows[t]![0]}`)
const dateOf = (t: number): string => rows[t]![1]
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`
const boardAt = (t: number): string => {
  const b = remSeg[t - 1]!
  return `那期開獎前盤面 ${SEG.map((s, i) => `${s} 剩 ${b[i]}`).join('、')}；開出 ${nums[t]!.join(' ')}（G ${G[t]}、V ${V[t]}）`
}
function runs(pred: (t: number) => boolean): Int32Array {
  const r = new Int32Array(N)
  for (let t = 0; t < N; t++) r[t] = pred(t) ? (t > 0 ? r[t - 1]! : 0) + 1 : 0
  return r
}
/** 歷史上 cond(t) 成立時，下一期 ok 的比例，對照平常 */
function follow(cond: (t: number) => boolean, ok: (u: number) => boolean): string {
  let c = 0, k = 0, b = 0, bn = 0
  for (let t = WARM; t < LAST; t++) { bn++; const o = ok(t + 1); if (o) b++; if (cond(t)) { c++; if (o) k++ } }
  return c ? `${pct(k / c)}（${c} 次${c < FEW ? '，次數少' : ''}；平常 ${pct(b / bn)}）` : '歷史上沒有'
}

interface Item { src: Src, group: string, title: string, share: number, force: boolean, lines: string[] }
const items: Item[] = []

/** 連續型：pred 已連 cur 期 */
function streak(src: Src, group: string, title: (cur: number) => string, pred: (t: number) => boolean, nextName: string, force = false): void {
  const r = runs(pred), cur = r[LAST]!
  if (cur < 1) return
  let n = 0, ge = 0, maxR = 0, maxAt = -1
  const reach: number[] = []
  for (let t = WARM; t < LAST; t++) { n++; if (r[t]! >= cur) ge++; if (r[t] === cur) reach.push(t); if (r[t]! > maxR) { maxR = r[t]!; maxAt = t } }
  const lines = [`歷史上連到 ${cur} 期以上 ${reach.length} 次；最長 ${maxR} 期（到第 ${term(maxAt)} 期，${dateOf(maxAt)}）`]
  if (reach.length) {
    const p = reach.at(-1)!
    let end = p
    while (end + 1 < LAST && pred(end + 1)) end++
    lines.push(`前一次：第 ${term(p)} 期（${dateOf(p)}，${LAST - p} 期前），那次一共連 ${r[end]} 期；${boardAt(p)}`)
    if (reach.length >= 2) lines.push(`平均每 ${Math.round((reach.at(-1)! - reach[0]!) / (reach.length - 1))} 期出現一次`)
  }
  lines.push(`下一期${nextName}：${follow(t => r[t]! >= cur, u => !pred(u))}`)
  items.push({ src, group, title: title(cur), share: ge / n, force, lines })
}

/** 數值型：s(LAST) 在歷史上偏高或偏低 */
function level(src: Src, group: string, name: string, s: (t: number) => number, from = WARM): void {
  const x = s(LAST)
  let n = 0, lo = 0, hi = 0
  for (let t = from; t < LAST; t++) { n++; const v = s(t); if (v <= x) lo++; if (v >= x) hi++ }
  const low = lo <= hi
  const cond = (t: number): boolean => (low ? s(t) <= x : s(t) >= x)
  let prev = -1
  for (let t = LAST - 1; t >= from; t--) if (cond(t)) { prev = t; break }
  const lines = [`歷史上${low ? '這麼低以下' : '這麼高以上'} ${low ? lo : hi} 次${prev >= 0 ? `；前一次第 ${term(prev)} 期（${dateOf(prev)}，${LAST - prev} 期前）` : ''}`]
  lines.push(`下一期${low ? '變大' : '變小'}：${follow(t => t >= from && cond(t), u => (low ? s(u) > s(u - 1) : s(u) < s(u - 1)))}`)
  items.push({ src, group, title: `${name} ${x}（偏${low ? '低' : '高'}）`, share: (low ? lo : hi) / n, force: false, lines })
}
const roll = (f: (t: number) => number, w: number) => (t: number): number => { let a = 0; for (let i = 0; i < w; i++) a += f(t - i); return a }

// 1. 日期牌（你的）：沒開出超過歷史平均間隔就列
{
  const hits: number[] = []
  for (let t = WARM; t <= LAST; t++) if (dateHit[t]) hits.push(t)
  const avg = (hits.at(-1)! - hits[0]!) / (hits.length - 1)
  const miss = runs(t => !dateHit[t])[LAST]!
  streak('你的', '日期牌', c => `已連 ${c} 期沒開出當天日期（歷史平均每 ${avg.toFixed(1)} 期開出一次）`, t => !dateHit[t], '開出日期牌', miss > avg)
  level('你的', '日期牌', '近 10 期開出日期牌次數', roll(t => (dateHit[t] ? 1 : 0), 10), WARM + 10)
}
// 2. 總和（你的）
{
  const side = sum[LAST]! > 100
  const sidePred = (t: number): boolean => (side ? sum[t]! > 100 : sum[t]! < 100)
  // 使用者：連 3 期、5 期都大於 100 就算少見（歷史上連 3 期以上約 12%）→ 連 3 期以上直接列
  if (sum[LAST] !== 100) streak('你的', '總和', c => `總和已連 ${c} 期${side ? '大於' : '小於'} 100`, sidePred, `總和${side ? '小於等於' : '大於等於'} 100`, runs(sidePred)[LAST]! >= SUM_SIDE_RUN)
  const up = sum[LAST]! > sum[LAST - 1]!
  streak('你的', '總和', c => `總和已連 ${c} 期變${up ? '大' : '小'}`, t => t > 0 && (up ? sum[t]! > sum[t - 1]! : sum[t]! < sum[t - 1]!), `轉${up ? '小' : '大'}`)
  level('你的', '總和', '總和', t => sum[t]!)
  for (const w of [3, 5, 10]) level('你的', '總和', `近 ${w} 期總和合計`, roll(t => sum[t]!, w), WARM + w)
}
// 3. 三分區（你的）
{
  const key = (t: number): string => zones[t]!.join('-')
  const freq = new Map<string, number>()
  let n = 0
  for (let t = WARM; t < LAST; t++) { n++; freq.set(key(t), (freq.get(key(t)) ?? 0) + 1) }
  const cur = key(LAST), fc = freq.get(cur) ?? 0
  let rarer = 0
  for (const v of freq.values()) if (v <= fc) rarer += v
  const nextFreq = new Map<string, number>()
  let nc = 0
  for (let t = WARM; t < LAST; t++) if (key(t) === cur) { nc++; nextFreq.set(key(t + 1), (nextFreq.get(key(t + 1)) ?? 0) + 1) }
  const top = [...nextFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${pct(v / nc)}（平常 ${pct((freq.get(k) ?? 0) / n)}）`)
  items.push({ src: '你的', group: '三分區', title: `型態 ${cur}（三區各幾顆）`, share: rarer / n, force: false, lines: [`歷史上 ${fc} 次（${pct(fc / n)}）`, `下一期最常：${top.join('、') || '—'}`] })
  for (let z = 0; z < 3; z++) {
    const c = Math.min(zones[LAST]![z]!, 2)
    const nm = c === 2 ? '2 顆以上' : `${c} 顆`
    streak('你的', '三分區', r => `${ZONE[z]} 已連 ${r} 期開 ${nm}`, t => Math.min(zones[t]![z]!, 2) === c, `${ZONE[z]} 不是 ${nm}`)
    for (const w of [3, 5, 10]) level('你的', '三分區', `${ZONE[z]} 近 ${w} 期合計顆數`, roll(t => zones[t]![z]!, w), WARM + w)
  }
}
// 4. G、V（你的）
for (const [nm, s] of [['隔期和 G', G], ['值總和 V', V]] as const) {
  const up = s[LAST]! > s[LAST - 1]!
  streak('你的', nm, c => `${nm} 已連 ${c} 期變${up ? '大' : '小'}`, t => t > 0 && (up ? s[t]! > s[t - 1]! : s[t]! < s[t - 1]!), `轉${up ? '小' : '大'}`)
  level('你的', nm, nm, t => s[t]!)
  for (const w of [3, 5]) level('你的', nm, `${nm} 近 ${w} 期合計`, roll(t => s[t]!, w), WARM + w)
}
// 5. 各位置的隔期（你的）
for (let k = 0; k < 5; k++) {
  const in05 = gaps[LAST]![k]! <= 5
  streak('你的', '位置隔期', c => `第 ${k + 1} 顆已連 ${c} 期${in05 ? '' : '不是'}來自隔期 0～5`, t => (gaps[t]![k]! <= 5) === in05, `第 ${k + 1} 顆${in05 ? '不是' : '回到'} 0～5`)
}
// 6. 各位置的 y、整期 y（你的）
for (let k = 0; k < 5; k++) {
  const c = yCat(LAST, k), nm = c === 3 ? 'y 3 以上' : `y=${c}`
  streak('你的', '位置 y', r => `第 ${k + 1} 顆已連 ${r} 期 ${nm}`, t => yCat(t, k) === c, `第 ${k + 1} 顆不是 ${nm}`)
}
;[1, 2, 3].forEach((c, i) => level('你的', '整期 y', `整期 ${c === 3 ? 'y 3 以上' : `y=${c}`} 的顆數`, t => yCnt[t]![i]!))
streak('你的', '整期 y', c => `已連 ${c} 期整期沒有 y=1`, t => yCnt[t]![0] === 0, '出現 y=1')
// 7. 號碼隔很久（你的：30 期以上直接列）
{
  const deep = Array.from({ length: 39 }, (_, i) => i + 1).filter(n => gapNow[n]! >= DEEP_NUM && gapNow[n]! < 999).sort((a, b) => gapNow[b]! - gapNow[a]!)
  for (const x of deep) {
    const g = gapNow[x]!
    let n = 0, ge = 0, nx = 0, maxG = 0
    const last = new Array<number>(40).fill(-1)
    for (let t = 0; t < LAST; t++) {
      for (const m of nums[t]!) last[m] = t
      if (t < WARM) continue
      for (let m = 1; m <= 39; m++) {
        if (last[m]! < 0) continue
        const gm = t - last[m]!
        n++; if (gm > maxG) maxG = gm
        if (gm >= g) { ge++; if (nums[t + 1]!.includes(m)) nx++ }
      }
    }
    items.push({ src: '你的', group: '號碼隔很久', title: `${x} 已 ${g} 期沒開`, share: ge / n, force: true, lines: [`所有號碼隔到 ${g} 期以上歷史 ${ge} 次（2007 起最久 ${maxG} 期）`, `下一期開出：${ge ? pct(nx / ge) : '—'}（平常 12.8%）`] })
  }
}
// 8～10. 隔期四段（你的；10～19 是我加的）
streak('你的', '隔期 20 以上', c => `已連 ${c} 期沒有號碼從隔期 20 以上開出（盤面現在剩 ${remSeg[LAST]![3]} 顆）`, t => segCnt[t]![3] === 0, '有號碼從 20 以上開出')
streak('你的', '隔期 6～9', c => `已連 ${c} 期沒有號碼從隔期 6～9 開出（盤面現在剩 ${remSeg[LAST]![1]} 顆）`, t => segCnt[t]![1] === 0, '有號碼從 6～9 開出')
streak('我加的', '隔期 10～19', c => `已連 ${c} 期沒有號碼從隔期 10～19 開出（盤面現在剩 ${remSeg[LAST]![2]} 顆）`, t => segCnt[t]![2] === 0, '有號碼從 10～19 開出')
{
  const c05 = (t: number): number => segCnt[t]![0]!
  const cur = c05(LAST)
  level('你的', '隔期 0～5', '這期來自隔期 0～5 的顆數', c05)
  if (cur !== 3) streak('你的', '隔期 0～5', c => `已連 ${c} 期來自 0～5 ${cur < 3 ? '不到 3' : '超過 3'} 顆`, t => (cur < 3 ? c05(t) < 3 : c05(t) > 3), `0～5 ${cur < 3 ? '3 顆以上' : '3 顆以下'}`)
  for (const w of [3, 5, 10]) level('你的', '隔期 0～5', `近 ${w} 期來自 0～5 合計`, roll(c05, w), WARM + w)
}
// 我加的：尾數連續沒出現
for (let d = 0; d < 10; d++) streak('我加的', '尾數', c => `尾數 ${d} 已連 ${c} 期沒出現`, t => !nums[t]!.some(n => n % 10 === d), `出現尾數 ${d}`)

// 輸出
const shown = items.filter(i => SHOW_ALL || i.force || i.share < RARE).sort((a, b) => a.share - b.share)
const nextDate = (() => { const d = new Date(`${dateOf(LAST)}T00:00:00Z`); do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() === 0); return d.toISOString().slice(0, 10) })()
const nd = Number(nextDate.slice(8, 10))
console.log(`# 第 ${rows[LAST]![0]} 期（${dateOf(LAST)}）開出 ${nums[LAST]!.join(' ')}`)
console.log(`總和 ${sum[LAST]}、三分區 ${zones[LAST]!.join('-')}、G ${G[LAST]}、V ${V[LAST]}、隔期 ${gaps[LAST]!.join(' ')}、值 ${balls[LAST]!.map(b => b.value).join(' ')}、y ${balls[LAST]!.map(b => b.y).join(' ')}`)
console.log(`盤面：${SEG.map((s, i) => `${s} 剩 ${remSeg[LAST]![i]}`).join('、')}`)
console.log(`下一期若在 ${nextDate}，日期牌 ${nd}（目前隔 ${gapNow[nd]} 期）`)
console.log(`門檻：歷史上這麼極端以上 < ${pct(RARE)}；日期牌超過平均間隔；總和連 ${SUM_SIDE_RUN} 期以上同在 100 一邊；號碼隔 ${DEEP_NUM} 期以上。共 ${items.length} 項檢查，列出 ${shown.length} 項\n`)
for (const i of shown) {
  console.log(`- [${i.src}｜${i.group}] ${i.title}（歷史 ${pct(i.share)}）`)
  for (const l of i.lines) console.log(`    ${l}`)
}
