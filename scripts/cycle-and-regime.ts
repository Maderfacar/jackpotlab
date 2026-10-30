/**
 * 週期偵測＋隱藏模式切換（2026-10-30 使用者：方向是隔期、值、位置，不是五顆加總）。
 *
 * 每一格分開看，每顆獎號照它的來源歸類：
 * - 隔期：隔期 0、1、2…9 各自一類，10～14、15～19、20+ 合併
 * - 值：值 0～5 各自一類，6～9、10～19、20+ 合併
 * - 位置：x·y 的每一種組合（x1·y1、x2·y1、x2·y2…x5·y5）
 * 隔期、值、x、y 都用頁面的 computeFeatures 算。
 *
 * 1. 週期：每一類各自一條「每期開出幾顆」的序列，找有沒有「每 N 期一輪」（功率譜）、跟 N 期前像不像（自相關）。
 * 2. 隱藏模式：每個方向各自假設背後有 2 種模式輪替（平均至少 20 期才換），模式不同、各類開出的比例就不同；
 *    看分兩種模式能不能把紀錄解釋得更好，再找現在是哪一種。
 *
 * 判斷：同樣的開獎日跑公平開獎（每期 39 取 5、跟過去無關），同一套算法算同樣的數字；
 * p = 公平模擬裡一樣強或更強的比例。另跑對照組：公平、埋單格週期、三種埋單格模式切換，確認方法抓得到。
 * 種子固定，重跑結果一模一樣。
 *
 * 用法：node --import tsx scripts/cycle-and-regime.ts
 * 輸出：docs/cycle-and-regime.md
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { computeFeatures } from '../shared/lotto/patterns/features'
import type { DrawFeatures } from '../shared/lotto/patterns/features'
import type { HistoryFile } from '../shared/lotto/history-file'
import { FAIR, SLOTS, mulberry32, simulate } from './lib/container-sim'
import type { Rule } from './lib/container-sim'
import { fitHmm } from './lib/hmm'
import type { HmmFit } from './lib/hmm'
import { autocorr, periodogram } from './lib/spectrum'

const SRC = 'public/data/lotto539-history.json'
const OUT = 'docs/cycle-and-regime.md'
/** 前 60 期容器還沒裝滿，不算 */
const BURN_IN = SLOTS
const SIMS = 200
/** 隱藏模式比較花時間，只拿前 100 次公平模擬來比 */
const HMM_SIMS = 100
const SEED = 20261030
const HMM_SEED = 1030
const RESTARTS = 3
/**
 * 模式至少平均待 20 期才換。不限制的話，模型會抓到容器算法本身每 1～2 期的交替
 * （這期開出的 5 顆下期一定在隔期 0），公平開獎也一樣，看不到背後慢慢換的開法。
 */
const MIN_STAY = 0.95
const MAX_LAG = 60
const MIN_PERIOD = 2
const MAX_PERIOD = 300
const SIG = 0.01
/** 實際的 p 已經碰到 100 次模擬的下限時，那個方向再加跑這麼多次公平模擬確認 */
const EXTRA_HMM_SIMS = 400
const EXTRA_SEED = 20261031
const TOP_DIFF = 3
const RECENT_SEGMENTS = 6
/** 埋週期：每 7 期裡的前 3 期，隔期 2 的號碼權重 ×2 */
const PLANT_CYCLE = { period: 7, on: 3, slot: 2, weight: 2 }
/** 埋模式切換：兩種模式隨機輪替（每期 2% 機會換，平均 50 期換一次），模式 B 時某一類的號碼權重 ×1.5 */
const PLANT_REGIME = { stay: 0.98, weight: 1.5, seed: 7 }

// ── 三個方向：每顆獎號歸哪一類 ───────────────────────────────

interface Direction {
  id: 'gap' | 'value' | 'pos'
  name: string
  labels: string[]
  /** 第 i 顆的類別；最後一類 = 盤外（超過 60 格找不到） */
  of: (f: DrawFeatures, i: number) => number
}

const bucket = (v: number, edges: number[]): number => {
  const i = edges.findIndex(e => v < e)
  return i < 0 ? edges.length : i
}
const POS_XY = [1, 2, 3, 4, 5].flatMap(x => Array.from({ length: x }, (_, y) => [x, y + 1] as const))
const POS_LABELS = POS_XY.map(([x, y]) => `x${x}·y${y}`)

const DIRECTIONS: Direction[] = [
  {
    id: 'gap',
    name: '隔期',
    labels: [...Array.from({ length: 10 }, (_, g) => `隔期 ${g}`), '隔期 10～14', '隔期 15～19', '隔期 20+', '盤外'],
    of: (f, i) => (f.gaps[i] == null ? 13 : bucket(f.gaps[i]!, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20]))
  },
  {
    id: 'value',
    name: '值',
    labels: [...Array.from({ length: 6 }, (_, v) => `值 ${v}`), '值 6～9', '值 10～19', '值 20+', '盤外'],
    of: (f, i) => (f.values[i] == null ? 9 : bucket(f.values[i]!, [1, 2, 3, 4, 5, 6, 10, 20]))
  },
  {
    id: 'pos',
    name: '位置',
    labels: [...POS_LABELS, '盤外'],
    of: (f, i) => (f.xs[i] == null || f.ys[i] == null ? 15 : f.xs[i]! * (f.xs[i]! - 1) / 2 + f.ys[i]! - 1)
  }
]
const seriesCount = (d: Direction): number => d.labels.length - 1

// ── 一段紀錄 → 每一類的週期統計、每個方向的模式 ───────────────────

interface Cycle { acf: number[], period: number, power: number }
interface Dataset {
  obs: Record<Direction['id'], number[][]>
  cycles: Record<Direction['id'], Cycle[]>
}

function analyse(draws: number[][]): Dataset {
  const feats = computeFeatures(draws).slice(BURN_IN)
  const obs = {} as Dataset['obs']
  const cycles = {} as Dataset['cycles']
  for (const d of DIRECTIONS) {
    obs[d.id] = feats.map(f => f.gaps.map((_, i) => d.of(f, i)))
    cycles[d.id] = Array.from({ length: seriesCount(d) }, (_, c) => {
      const xs = obs[d.id].map(o => o.filter(x => x === c).length)
      const peak = periodogram(xs, MIN_PERIOD, MAX_PERIOD).reduce((a, b) => (b.power > a.power ? b : a))
      return { acf: autocorr(xs, MAX_LAG), period: peak.period, power: peak.power }
    })
  }
  return { obs, cycles }
}

interface Regime { gain: number, fit: HmmFit }

function regime(obs: number[][], cats: number, rng: () => number): Regime {
  const ll1 = fitHmm(obs, [cats], 1, rng, 1, { tied: true }).ll
  const fit = fitHmm(obs, [cats], 2, rng, RESTARTS, { tied: true, minStay: MIN_STAY })
  return { gain: fit.ll - ll1, fit }
}
const regimes = (d: Dataset, rng: () => number): Record<Direction['id'], Regime> =>
  Object.fromEntries(DIRECTIONS.map(dir => [dir.id, regime(d.obs[dir.id], dir.labels.length, rng)])) as Record<Direction['id'], Regime>

// ── 跟公平模擬比 ───────────────────────────────────────────

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
const sd = (xs: number[]): number => Math.sqrt(xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / (xs.length - 1))
const quantile = (xs: number[], q: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))]!
const pUpper = (x: number, sims: number[]): number => (1 + sims.filter(s => s >= x - 1e-12).length) / (sims.length + 1)
/** 每次公平模擬自己的 p（跟其他模擬比），用來看「公平開獎平常會冒出幾條 p < 0.01」 */
const simPs = (sims: number[]): number[] => sims.map((x, i) => (1 + sims.filter((s, j) => j !== i && s >= x - 1e-12).length) / sims.length)

interface Test { name: string, value: (d: Dataset, dir: Direction['id'], c: number) => number, show: (d: Dataset, dir: Direction['id'], c: number) => string }

// ── 主程式 ────────────────────────────────────────────────

const started = Date.now()
const raw = readFileSync(SRC)
const file = JSON.parse(raw.toString('utf8')) as HistoryFile
const sha = createHash('sha256').update(raw).digest('hex')
const dates = file.rows.map(r => r[1])
const terms = file.rows.map(r => r[0])
const draws = file.rows.map(r => [...r[2]].sort((a, b) => a - b))

const modeRng = mulberry32(PLANT_REGIME.seed)
const modes: number[] = []
for (let t = 0; t < dates.length; t++) modes.push(t > 0 && modeRng() > PLANT_REGIME.stay ? 1 - modes[t - 1]! : (modes[t - 1] ?? 0))
const inB = (t: number): boolean => modes[t] === 1
const w = PLANT_REGIME.weight

const CONTROLS: { name: string, rule: Rule, regime?: Direction['id'] }[] = [
  { name: '公平', rule: FAIR },
  { name: `埋週期：每 ${PLANT_CYCLE.period} 期前 ${PLANT_CYCLE.on} 期，隔期 ${PLANT_CYCLE.slot} ×${PLANT_CYCLE.weight}`, rule: (s, _v, _d, t) => (s === PLANT_CYCLE.slot && t % PLANT_CYCLE.period < PLANT_CYCLE.on ? PLANT_CYCLE.weight : 1) },
  { name: `埋隔期模式：模式 B 時隔期 1～3 ×${w}`, rule: (s, _v, _d, t) => (s >= 1 && s <= 3 && inB(t) ? w : 1), regime: 'gap' },
  { name: `埋值模式：模式 B 時值 ≥ 6 ×${w}`, rule: (s, v, _d, t) => (s >= 0 && v >= 6 && inB(t) ? w : 1), regime: 'value' },
  { name: `埋位置模式：模式 B 時 y=1 ×${w}`, rule: (s, _v, _d, t, _x, y) => (s >= 0 && y === 1 && inB(t) ? w : 1), regime: 'pos' }
]

const rng = mulberry32(SEED)
const hmmRng = mulberry32(HMM_SEED)
const real = analyse(draws)
const realReg = regimes(real, hmmRng)
const sims: Dataset[] = []
const simReg: Record<Direction['id'], Regime>[] = []
for (let s = 0; s < SIMS; s++) {
  const d = analyse(simulate(dates, rng, FAIR))
  sims.push(d)
  if (s < HMM_SIMS) simReg.push(regimes(d, hmmRng))
}
const controls = CONTROLS.map((c) => {
  const d = analyse(simulate(dates, rng, c.rule))
  return { ...c, data: d, reg: regimes(d, hmmRng) }
})

/** 每個落後期數，公平模擬的自相關平均與標準差（容器算法本身就讓前後幾期有關，所以跟模擬比、不跟 0 比） */
const lagNull = new Map<string, { mu: number[], sd: number[] }>()
for (const d of DIRECTIONS) {
  for (let c = 0; c < seriesCount(d); c++) {
    const per = Array.from({ length: MAX_LAG }, (_, k) => sims.map(x => x.cycles[d.id][c]!.acf[k]!))
    lagNull.set(`${d.id}${c}`, { mu: per.map(mean), sd: per.map(sd) })
  }
}
const zs = (ds: Dataset, dir: Direction['id'], c: number): number[] => {
  const n = lagNull.get(`${dir}${c}`)!
  return ds.cycles[dir][c]!.acf.map((r, k) => (r - n.mu[k]!) / n.sd[k]!)
}

const TESTS: Test[] = [
  {
    name: '功率譜（每 N 期一輪）',
    value: (d, dir, c) => d.cycles[dir][c]!.power,
    show: (d, dir, c) => `${d.cycles[dir][c]!.period.toFixed(1)} 期一輪（強度 ${d.cycles[dir][c]!.power.toFixed(1)}）`
  },
  {
    name: '自相關（跟 N 期前像不像）',
    value: (d, dir, c) => Math.max(...zs(d, dir, c).map(Math.abs)),
    show: (d, dir, c) => {
      const z = zs(d, dir, c)
      const k = z.reduce((b, x, i) => (Math.abs(x) > Math.abs(z[b]!) ? i : b), 0)
      return `落後 ${k + 1} 期（${z[k]! >= 0 ? '+' : ''}${z[k]!.toFixed(1)} 個標準差）`
    }
  }
]

const fmtP = (p: number, n: number): string => (p <= 1 / (n + 1) + 1e-9 ? `< ${(2 / (n + 1)).toFixed(3)}` : p.toFixed(3))
const mark = (p: number, n: number): string => (p < SIG ? `**${fmtP(p, n)}**` : fmtP(p, n))
const pct = (x: number): string => `${(x * 100).toFixed(0)}%`

// ── 報告：週期 ───────────────────────────────────────────────

function cycleDetail(d: Direction): string[] {
  const rows = Array.from({ length: seriesCount(d) }, (_, c) => {
    const cells = TESTS.map((t) => {
      const p = pUpper(t.value(real, d.id, c), sims.map(s => t.value(s, d.id, c)))
      return `${t.show(real, d.id, c)} | ${mark(p, SIMS)}`
    })
    return `| ${d.labels[c]} | ${cells.join(' | ')} |`
  })
  return [`| ${d.name} | 最強的節奏 | p | 最偏的落後期數 | p |`, '|---|---|---|---|---|', ...rows]
}

/** 每個方向 × 方法：幾條 p < 0.01；公平開獎平常會冒出幾條；對照組抓到哪幾條 */
function cycleSummary(): string[] {
  const rows = DIRECTIONS.flatMap(d => TESTS.map((t) => {
    const perSeries = Array.from({ length: seriesCount(d) }, (_, c) => sims.map(s => t.value(s, d.id, c)))
    const flagged = (ds: Dataset): string[] => perSeries.flatMap((sv, c) => (pUpper(t.value(ds, d.id, c), sv) < SIG ? [d.labels[c]!] : []))
    const simP = perSeries.map(simPs)
    const simCounts = sims.map((_, i) => simP.filter(ps => ps[i]! < SIG).length)
    const realF = flagged(real)
    const ctrl = controls.map((c) => {
      const f = flagged(c.data)
      return f.length ? `${f.length}：${f.join('、')}` : '0'
    }).join(' | ')
    return `| ${d.name} | ${t.name} | ${seriesCount(d)} | ${realF.length}${realF.length ? `：${realF.join('、')}` : ''} | ${quantile(simCounts, 0.025)} ～ ${quantile(simCounts, 0.975)} | ${ctrl} |`
  }))
  return [
    `| 方向 | 方法 | 幾條 | 實際 p < ${SIG} 的 | 公平開獎平常冒出幾條（95%） | ${controls.map(c => `對照：${c.name}`).join(' | ')} |`,
    `|${'---|'.repeat(5 + controls.length)}`,
    ...rows
  ]
}

// ── 報告：隱藏模式 ───────────────────────────────────────────

function regimeSummary(): string[] {
  const rows = DIRECTIONS.map((d) => {
    const sv = simReg.map(r => r[d.id].gain)
    const ctrl = controls.map(c => mark(pUpper(c.reg[d.id].gain, sv), HMM_SIMS)).join(' | ')
    return `| ${d.name} | ${realReg[d.id].gain.toFixed(1)} | ${quantile(sv, 0.025).toFixed(1)} ～ ${quantile(sv, 0.975).toFixed(1)} | ${mark(pUpper(realReg[d.id].gain, sv), HMM_SIMS)} | ${ctrl} |`
  })
  return [
    `| 方向 | 實際多解釋了多少 | 公平開獎 95% 範圍 | 實際的 p | ${controls.map(c => `對照：${c.name}`).join(' | ')} |`,
    `|${'---|'.repeat(4 + controls.length)}`,
    ...rows
  ]
}

/** p 碰到下限的方向：另用一組種子加跑公平模擬，合起來重算 p；三個方向一起看再乘 3 */
function confirm(): string[] {
  const r = mulberry32(EXTRA_SEED)
  return DIRECTIONS.flatMap((d) => {
    const base = simReg.map(x => x[d.id].gain)
    const g = realReg[d.id].gain
    if (pUpper(g, base) >= SIG) return []
    const extra = Array.from({ length: EXTRA_HMM_SIMS }, () => {
      const feats = computeFeatures(simulate(dates, r, FAIR)).slice(BURN_IN)
      return regime(feats.map(f => f.gaps.map((_, i) => d.of(f, i))), d.labels.length, hmmRng).gain
    })
    const all = [...base, ...extra]
    const ge = all.filter(s => s >= g - 1e-12).length
    const p = (1 + ge) / (all.length + 1)
    return [`- ${d.name}：加跑 ${EXTRA_HMM_SIMS} 次公平模擬（共 ${all.length} 次），多解釋 ≥ ${g.toFixed(1)} 的有 ${ge} 次，p = ${p.toFixed(3)}。三個方向一起看，公平開獎碰巧有一個方向這麼強的機會約 ${Math.min(1, p * DIRECTIONS.length).toFixed(3)}。`]
  })
}

/** 位置：每一段裡，開出的球是容器裡最小或最大那顆（y=1 或 y=x，只算 x ≥ 3）的比例，跟公平應該的比例 */
function edgeBySegment(path: number[]): string[] {
  const obs = real.obs.pos
  const rows = segments(path).map((s) => {
    let n = 0
    let edge = 0
    let exp = 0
    for (let t = s.from; t <= s.to; t++) {
      for (const c of obs[t]!) {
        const xy = POS_XY[c]
        if (!xy || xy[0] < 3) continue
        n += 1
        exp += 2 / xy[0]
        if (xy[1] === 1 || xy[1] === xy[0]) edge += 1
      }
    }
    return `| ${'AB'[s.mode]} | ${at(s.from)} | ${at(s.to)} | ${s.to - s.from + 1} | ${(edge / n * 100).toFixed(1)}% | ${(exp / n * 100).toFixed(1)}% |`
  })
  return ['| 模式 | 從 | 到 | 幾期 | 開出最小或最大那顆 | 公平應該 |', '|---|---|---|---|---|---|', ...rows]
}

function recovery(): string[] {
  const truth = modes.slice(BURN_IN)
  return controls.filter(c => c.regime).map((c) => {
    const path = c.reg[c.regime!].fit.path
    const agree = path.filter((m, t) => m === truth[t]).length / truth.length
    return `- ${c.name}：${DIRECTIONS.find(d => d.id === c.regime)!.name}的模式每期猜的跟真模式對得上 ${pct(Math.max(agree, 1 - agree))}`
  })
}

interface Segment { mode: number, from: number, to: number }
function segments(path: number[]): Segment[] {
  return path.reduce<Segment[]>((out, m, t) => {
    const last = out.at(-1)
    return last && last.mode === m ? [...out.slice(0, -1), { ...last, to: t }] : [...out, { mode: m, from: t, to: t }]
  }, [])
}
const at = (t: number): string => `${terms[t + BURN_IN]}（${dates[t + BURN_IN]}）`

function modeDetail(d: Direction): string[] {
  const { fit } = realReg[d.id]
  const p = fit.b.map(s => s[0]!)
  const diff = d.labels.map((label, c) => ({ label, a: p[0]![c]!, b: p[1]![c]!, gap: Math.abs(p[0]![c]! - p[1]![c]!) }))
    .sort((x, y) => y.gap - x.gap).slice(0, TOP_DIFF)
  const segs = segments(fit.path)
  const lens = segs.map(s => s.to - s.from + 1).sort((a, b) => a - b)
  const share = (m: number): string => pct(fit.path.filter(x => x === m).length / fit.path.length)
  const last = segs.at(-1)!
  return [
    `**${d.name}**：模式 A 佔 ${share(0)}、B 佔 ${share(1)}；換了 ${segs.length - 1} 次，每段中位數 ${lens[Math.floor(lens.length / 2)]} 期、最長 ${lens.at(-1)} 期。`,
    `兩種模式差最多的：${diff.map(x => `${x.label} ${pct(x.a)} vs ${pct(x.b)}`).join('；')}。`,
    `最新一期單看這一期：A ${pct(fit.last[0]!)}、B ${pct(fit.last[1]!)}；整段連起來排，現在在模式 ${'AB'[last.mode]}，從 ${at(last.from)} 起 ${last.to - last.from + 1} 期。`,
    `最近 ${RECENT_SEGMENTS} 段：${segs.slice(-RECENT_SEGMENTS).map(s => `${'AB'[s.mode]} ${s.to - s.from + 1} 期`).join(' → ')}`,
    '',
    ...(d.id === 'pos' ? ['每一段裡，開出的是容器裡最小或最大那顆（y=1 或 y=x，只算 x ≥ 3 的容器）的比例：', '', ...edgeBySegment(fit.path), ''] : [])
  ]
}

const confirmLines = confirm()
writeFileSync(OUT, [
  '# 週期偵測＋隱藏模式切換：隔期、值、位置每一格分開看',
  '',
  `由 \`scripts/cycle-and-regime.ts\` 產生，任何人重跑都會得到一模一樣的數字。`,
  '',
  '## 資料與重跑',
  '',
  `- 資料：\`${SRC}\`，${file.count} 期，${terms[0]}（${dates[0]}）～ ${file.lastTerm}（${file.lastDate}）；前 ${BURN_IN} 期容器還沒裝滿，不算`,
  `- 檔案 SHA-256：\`${sha}\``,
  `- 重跑：\`node --import tsx scripts/cycle-and-regime.ts\`（種子 ${SEED}／${HMM_SEED}，公平模擬 ${SIMS} 次、模式比 ${HMM_SIMS} 次，約 ${Math.round((Date.now() - started) / 1000)} 秒）`,
  '- 隔期、值、x、y 都用頁面的 `computeFeatures` 算；公平模擬、對照組也用同一套。',
  '',
  '## 分類',
  '',
  ...DIRECTIONS.map(d => `- ${d.name}：${d.labels.slice(0, -1).join('、')}（超過 60 格找不到的算盤外）`),
  '',
  '## 怎麼讀',
  '',
  '- 每一項都拿實際紀錄跟「公平開獎」比：同樣的開獎日、每期 39 取 5、跟過去無關，跑很多次，同一套算法算同樣的數字。',
  `- **p** ＝ 公平模擬裡一樣強或更強的比例。p < ${SIG}（粗體）＝ 公平開獎很難做出來。`,
  `- 條數多的時候，公平開獎本來就會偶爾冒出幾條 p < ${SIG}，所以總表附上「公平開獎平常冒出幾條」。`,
  '- 對照組：一段公平、一段埋了單格週期、三段各埋一種單格模式切換。埋的那種被抓到，代表方法有效。',
  '',
  '## 一、週期',
  '',
  ...cycleSummary(),
  '',
  ...DIRECTIONS.flatMap(d => [`### ${d.name}每一類`, '', ...cycleDetail(d), '']),
  '## 二、隱藏模式切換',
  '',
  `每個方向各自看：每期 5 顆各自落在哪一類。假設背後有 2 種模式輪替（平均至少 ${Math.round(1 / (1 - MIN_STAY))} 期才換），`,
  '兩種模式各類開出的比例不同。「多解釋了多少」＝ 分兩種模式比只用一種多解釋的量（對數概似差）；分了一定多一些，所以跟公平開獎分出來的比。',
  '',
  ...regimeSummary(),
  '',
  ...confirmLines,
  '',
  '埋模式切換的對照，猜的模式跟埋進去的真模式比（50% = 等於亂猜）：',
  '',
  ...recovery(),
  '',
  '### 實際紀錄分兩種模式的樣子',
  '',
  ...DIRECTIONS.flatMap(modeDetail)
].join('\n'))
process.stdout.write(`${OUT} 已寫入（${Math.round((Date.now() - started) / 1000)} 秒）\n`)
