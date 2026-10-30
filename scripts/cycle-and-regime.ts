/**
 * 週期偵測＋隱藏模式切換（2026-10-30 使用者：只看隔期盤面、不看號碼的方法，挑「週期偵測」和「隱藏模式切換」）。
 *
 * 每期取幾個盤面數字（隔期 0～5 幾顆、隔期和、值合計、x 合計、y=1 幾顆），都用頁面的 computeFeatures 算。
 * 1. 週期：自相關（這期跟 N 期前像不像）、功率譜（有沒有「每 N 期一輪」的節奏）、星期幾。
 * 2. 隱藏模式：假設背後有 2 或 3 種看不見的開法在輪替（隱藏馬可夫模型），看多分幾種模式能不能把紀錄解釋得更好，
 *    再找出每期最可能是哪種模式、多久換一次、現在是哪一種。
 *
 * 判斷標準跟 gap-randomness-audit.ts 一樣：同樣的開獎日跑公平開獎，用同一套算法算同樣的數字，
 * p = 公平模擬裡跟實際一樣強或更強的比例。另外跑三組對照：公平、故意埋週期、故意埋模式切換，確認方法抓得到。
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
import type { Peak } from './lib/spectrum'

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
 * 模式至少平均待 20 期才換。不限制的話，模型會抓到容器算法本身「這期 0～5 多、下期 10+ 多」的每 1～2 期交替，
 * 公平開獎也一樣，反而看不到背後慢慢換的開法（試過：埋進去的慢切換只猜中 51%）。
 */
const MIN_STAY = 0.95
const MAX_LAG = 60
const MIN_PERIOD = 2
const MAX_PERIOD = 300
const TOP_LAGS = 3
const TOP_PEAKS = 3
const RECENT_SEGMENTS = 12
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
/** 埋週期：每 7 期裡的前 3 期，隔期 0～5 的號碼權重 ×1.25 */
const PLANT_CYCLE = { period: 7, on: 3, weight: 1.25 }
/**
 * 埋模式切換：兩種模式隨機輪替（每期 2% 機會換，平均 50 期換一次），模式 B 時隔期 0～5 的號碼權重加重。
 * ×2 ≈ 模式 B 每期隔期 0～5 多半顆；×1.3 ≈ 只多 0.2 顆，用來看這個方法的極限。
 */
const PLANT_REGIME = { stay: 0.98, weights: [2, 1.3], seed: 7 }

// ── 每期取的盤面數字 ─────────────────────────────────────────

interface SeriesDef { id: string, name: string, of: (f: DrawFeatures) => number }

const count = (xs: (number | null)[], ok: (x: number) => boolean): number => xs.filter(x => x != null && ok(x)).length
const total = (xs: (number | null)[], miss: number): number => xs.reduce<number>((s, x) => s + (x ?? miss), 0)

const SERIES: SeriesDef[] = [
  { id: 'near', name: '隔期 0～5 幾顆', of: f => count(f.gaps, g => g <= 5) },
  { id: 'gapSum', name: '隔期和', of: f => total(f.gaps, SLOTS) },
  { id: 'valueSum', name: '值合計', of: f => total(f.values, 0) },
  { id: 'xSum', name: 'x 合計', of: f => total(f.xs, 0) },
  { id: 'y1', name: 'y=1 幾顆', of: f => count(f.ys, y => y === 1) }
]

/** 隱藏模式用的觀察：隔期 0～5 幾顆（0～5）、隔期 10+ 幾顆（0～3+）、y=1 幾顆（0～4+）、有沒有值 1 */
const CATS = [6, 4, 5, 2]
const OBS_NAMES = ['隔期 0～5', '隔期 10+', 'y=1', '有值 1']
const hmmObs = (f: DrawFeatures): number[] => [
  count(f.gaps, g => g <= 5),
  Math.min(3, f.gaps.filter(g => g == null || g >= 10).length),
  Math.min(4, count(f.ys, y => y === 1)),
  f.values.some(v => v === 1) ? 1 : 0
]

// ── 一段紀錄 → 週期、模式的統計 ───────────────────────────────

interface SeriesStats { acf: number[], peaks: Peak[], top: Peak, week: number }

function weekdaySpread(xs: number[], days: number[]): number {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length
  return WEEKDAYS.reduce((s, _, d) => {
    const g = xs.filter((_, i) => days[i] === d)
    if (!g.length) return s
    const gm = g.reduce((a, b) => a + b, 0) / g.length
    return s + g.length * (gm - m) ** 2 / v
  }, 0)
}

function seriesStats(xs: number[], days: number[]): SeriesStats {
  const peaks = periodogram(xs, MIN_PERIOD, MAX_PERIOD)
  const top = peaks.reduce((a, b) => (b.power > a.power ? b : a))
  return { acf: autocorr(xs, MAX_LAG), peaks, top, week: weekdaySpread(xs, days) }
}

interface Dataset { feats: DrawFeatures[], stats: Record<string, SeriesStats> }

function analyse(dates: string[], draws: number[][]): Dataset {
  const feats = computeFeatures(draws).slice(BURN_IN)
  const days = dates.slice(BURN_IN).map(d => new Date(`${d}T00:00:00Z`).getUTCDay())
  const stats = Object.fromEntries(SERIES.map(s => [s.id, seriesStats(feats.map(s.of), days)]))
  return { feats, stats }
}

interface HmmResult { gain2: number, gain3: number, fit2: HmmFit }

function hmmResult(feats: DrawFeatures[], rng: () => number): HmmResult {
  const obs = feats.map(hmmObs)
  const ll1 = fitHmm(obs, CATS, 1, rng, 1).ll
  const fit2 = fitHmm(obs, CATS, 2, rng, RESTARTS, MIN_STAY)
  const fit3 = fitHmm(obs, CATS, 3, rng, RESTARTS, MIN_STAY)
  return { gain2: fit2.ll - ll1, gain3: fit3.ll - ll1, fit2 }
}

// ── 跟公平模擬比 ───────────────────────────────────────────

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
const sd = (xs: number[]): number => Math.sqrt(xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / (xs.length - 1))
const quantile = (xs: number[], q: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))]!
const pUpper = (x: number, sims: number[]): number => (1 + sims.filter(s => s >= x - 1e-12).length) / (sims.length + 1)

/** 每個落後期數，公平模擬的自相關平均與標準差（容器算法本身就會讓相鄰幾期有關，所以跟模擬比、不跟 0 比） */
interface LagNull { mu: number[], sd: number[] }

function lagNull(sims: Dataset[], id: string): LagNull {
  const per = Array.from({ length: MAX_LAG }, (_, k) => sims.map(d => d.stats[id]!.acf[k]!))
  return { mu: per.map(mean), sd: per.map(sd) }
}

const zOf = (acf: number[], nul: LagNull): number[] => acf.map((r, k) => (r - nul.mu[k]!) / nul.sd[k]!)
const maxAbs = (zs: number[]): number => Math.max(...zs.map(Math.abs))

// ── 埋規律 ─────────────────────────────────────────────────

const RULE_CYCLE: Rule = (slot, _v, _d, t) => (slot >= 0 && slot <= 5 && t % PLANT_CYCLE.period < PLANT_CYCLE.on ? PLANT_CYCLE.weight : 1)

function regimeModes(n: number): number[] {
  const rng = mulberry32(PLANT_REGIME.seed)
  const modes: number[] = []
  let m = 0
  for (let t = 0; t < n; t++) {
    if (t > 0 && rng() > PLANT_REGIME.stay) m = 1 - m
    modes.push(m)
  }
  return modes
}

// ── 主程式 ────────────────────────────────────────────────

const started = Date.now()
const raw = readFileSync(SRC)
const file = JSON.parse(raw.toString('utf8')) as HistoryFile
const sha = createHash('sha256').update(raw).digest('hex')
const dates = file.rows.map(r => r[1])
const terms = file.rows.map(r => r[0])
const draws = file.rows.map(r => [...r[2]].sort((a, b) => a - b))
const modes = regimeModes(dates.length)
const ruleRegime = (w: number): Rule => (slot, _v, _d, t) => (slot >= 0 && slot <= 5 && modes[t] === 1 ? w : 1)

const rng = mulberry32(SEED)
const hmmRng = mulberry32(HMM_SEED)
const real = analyse(dates, draws)
const realHmm = hmmResult(real.feats, hmmRng)
const sims: Dataset[] = []
const simHmm: HmmResult[] = []
for (let s = 0; s < SIMS; s++) {
  const d = analyse(dates, simulate(dates, rng, FAIR))
  sims.push(d)
  if (s < HMM_SIMS) simHmm.push(hmmResult(d.feats, hmmRng))
}
const controls = [
  { name: '對照：公平', rule: FAIR, regime: false },
  { name: `對照：埋週期（每 ${PLANT_CYCLE.period} 期前 ${PLANT_CYCLE.on} 期隔期 0～5 ×${PLANT_CYCLE.weight}）`, rule: RULE_CYCLE, regime: false },
  ...PLANT_REGIME.weights.map(w => ({
    name: `對照：埋模式切換（平均 ${Math.round(1 / (1 - PLANT_REGIME.stay))} 期換一次，隔期 0～5 ×${w}）`,
    rule: ruleRegime(w),
    regime: true
  }))
].map((c) => {
  const d = analyse(dates, simulate(dates, rng, c.rule))
  return { ...c, data: d, hmm: hmmResult(d.feats, hmmRng) }
})

const fmtP = (p: number, n: number): string => (p <= 1 / (n + 1) + 1e-9 ? `< ${(2 / (n + 1)).toFixed(3)}` : p.toFixed(3))
const mark = (p: number, n: number): string => (p < 0.01 ? `**${fmtP(p, n)}**` : fmtP(p, n))
const f2 = (x: number): string => x.toFixed(2)
const f1 = (x: number): string => x.toFixed(1)

// ── 報告：週期 ───────────────────────────────────────────────

interface CycleTest { name: string, value: (d: Dataset, id: string, nul: LagNull) => number, show: (d: Dataset, id: string, nul: LagNull) => string }

const CYCLE_TESTS: CycleTest[] = [
  {
    name: '自相關：最偏的落後期數',
    value: (d, id, nul) => maxAbs(zOf(d.stats[id]!.acf, nul)),
    show: (d, id, nul) => {
      const z = zOf(d.stats[id]!.acf, nul)
      const k = z.reduce((b, x, i) => (Math.abs(x) > Math.abs(z[b]!) ? i : b), 0)
      return `落後 ${k + 1} 期，偏 ${f1(z[k]!)} 個標準差`
    }
  },
  {
    name: '功率譜：最強的節奏',
    value: (d, id) => d.stats[id]!.top.power,
    show: (d, id) => `${f1(d.stats[id]!.top.period)} 期一輪，強度 ${f1(d.stats[id]!.top.power)}`
  },
  {
    name: '星期幾',
    value: (d, id) => d.stats[id]!.week,
    show: (d, id) => `差異 ${f1(d.stats[id]!.week)}`
  }
]

function cycleTable(): string[] {
  const head = `| 盤面數字 | 方法 | 實際 | 公平 95% 上限 | 實際的 p | ${controls.map(c => c.name).join(' | ')} |`
  const rows = SERIES.flatMap((s) => {
    const nul = lagNull(sims, s.id)
    return CYCLE_TESTS.map((t) => {
      const simVals = sims.map(d => t.value(d, s.id, nul))
      const ctrl = controls.map(c => mark(pUpper(t.value(c.data, s.id, nul), simVals), SIMS)).join(' | ')
      return `| ${s.name} | ${t.name} | ${t.show(real, s.id, nul)} | ${f1(quantile(simVals, 0.95))} | ${mark(pUpper(t.value(real, s.id, nul), simVals), SIMS)} | ${ctrl} |`
    })
  })
  return [head, `|${'---|'.repeat(5 + controls.length)}`, ...rows]
}

function lagDetail(): string[] {
  const rows = SERIES.map((s) => {
    const nul = lagNull(sims, s.id)
    const z = zOf(real.stats[s.id]!.acf, nul)
    const top = z.map((x, k) => ({ k, x })).sort((a, b) => Math.abs(b.x) - Math.abs(a.x)).slice(0, TOP_LAGS)
    return `| ${s.name} | ${top.map(({ k, x }) => `${k + 1} 期：${f2(real.stats[s.id]!.acf[k]!)}（公平 ${f2(nul.mu[k]!)}，${x >= 0 ? '+' : ''}${f1(x)}）`).join('；')} |`
  })
  return ['| 盤面數字 | 偏最多的 3 個落後期數：實際自相關（公平平均，偏幾個標準差） |', '|---|---|', ...rows]
}

/** 功率譜的前幾個峰（相鄰的同一個峰只算一次） */
function peakDetail(): string[] {
  const rows = SERIES.map((s) => {
    const p = real.stats[s.id]!.peaks
    const local = p.filter((x, i) => (i === 0 || x.power >= p[i - 1]!.power) && (i === p.length - 1 || x.power >= p[i + 1]!.power))
    const top = local.sort((a, b) => b.power - a.power).slice(0, TOP_PEAKS)
    const simTop = sims.map(d => d.stats[s.id]!.top.power)
    return `| ${s.name} | ${top.map(x => `${f1(x.period)} 期（${f1(x.power)}）`).join('、')} | ${f1(quantile(simTop, 0.95))} |`
  })
  return ['| 盤面數字 | 最強的 3 個節奏：幾期一輪（強度） | 公平開獎「最強那個」的 95% 上限 |', '|---|---|---|', ...rows]
}

// ── 報告：隱藏模式 ───────────────────────────────────────────

function gainTable(): string[] {
  const rows = (['gain2', 'gain3'] as const).map((key, i) => {
    const simVals = simHmm.map(h => h[key])
    const ctrl = controls.map(c => mark(pUpper(c.hmm[key], simVals), HMM_SIMS)).join(' | ')
    return `| 分 ${i + 2} 種模式 | ${f1(realHmm[key])} | ${f1(quantile(simVals, 0.025))} ～ ${f1(quantile(simVals, 0.975))} | ${mark(pUpper(realHmm[key], simVals), HMM_SIMS)} | ${ctrl} |`
  })
  return [`| | 實際多解釋了多少 | 公平開獎 95% 範圍 | 實際的 p | ${controls.map(c => c.name).join(' | ')} |`, `|${'---|'.repeat(4 + controls.length)}`, ...rows]
}

const expect = (dist: number[]): number => dist.reduce((s, p, c) => s + p * c, 0)

/** 模式照「隔期 0～5 平均幾顆」由少到多排，A、B 的意思才固定 */
function ordered(fit: HmmFit): { order: number[], path: number[] } {
  const order = Array.from({ length: fit.k }, (_, s) => s).sort((a, b) => expect(fit.b[a]![0]!) - expect(fit.b[b]![0]!))
  const rank = order.map((_, i) => order.indexOf(i))
  return { order, path: fit.path.map(s => rank[s]!) }
}
const LABEL = ['A', 'B', 'C']

function modeTable(fit: HmmFit): string[] {
  const { order, path } = ordered(fit)
  const rows = order.map((s, i) => {
    const share = path.filter(p => p === i).length / path.length
    const stay = 1 / (1 - fit.a[s]![s]!)
    const means = [0, 1, 2].map(f => f2(expect(fit.b[s]![f]!)))
    return `| ${LABEL[i]} | ${(share * 100).toFixed(0)}% | ${f1(stay)} 期 | ${means.join(' | ')} | ${(fit.b[s]![3]![1]! * 100).toFixed(0)}% |`
  })
  return [`| 模式 | 佔幾成的期數 | 平均待幾期才換 | ${OBS_NAMES.slice(0, 3).map(n => `${n} 平均`).join(' | ')} | ${OBS_NAMES[3]} 的期數 |`, '|---|---|---|---|---|---|---|', ...rows]
}

interface Segment { mode: number, from: number, to: number }

function segments(path: number[]): Segment[] {
  const out: Segment[] = []
  path.forEach((m, t) => {
    const last = out.at(-1)
    if (last && last.mode === m) out[out.length - 1] = { ...last, to: t }
    else out.push({ mode: m, from: t, to: t })
  })
  return out
}

function segmentStats(path: number[]): string {
  const lens = segments(path).map(s => s.to - s.from + 1).sort((a, b) => a - b)
  return `共換了 ${lens.length - 1} 次；每段長度中位數 ${lens[Math.floor(lens.length / 2)]} 期、最長 ${lens.at(-1)} 期`
}

function recentSegments(path: number[]): string[] {
  const at = (t: number): string => `${terms[t + BURN_IN]}（${dates[t + BURN_IN]}）`
  const rows = segments(path).slice(-RECENT_SEGMENTS).map(s => `| ${LABEL[s.mode]} | ${at(s.from)} | ${at(s.to)} | ${s.to - s.from + 1} |`)
  return ['| 模式 | 從 | 到 | 幾期 |', '|---|---|---|---|', ...rows]
}

/** 埋模式切換的對照：分 2 種模式後每期猜的模式，跟埋進去的真模式對得上幾成（50% = 等於亂猜） */
function regimeRecovery(): string[] {
  const truth = modes.slice(BURN_IN)
  const near = (fs: DrawFeatures[], m: number): string => f2(mean(fs.filter((_, t) => truth[t] === m).map(SERIES[0]!.of)))
  return controls.filter(c => c.regime).map((c) => {
    const agree = c.hmm.fit2.path.filter((m, t) => m === truth[t]).length / truth.length
    return `- ${c.name}：兩種模式每期隔期 0～5 平均 ${near(c.data.feats, 0)} 顆 vs ${near(c.data.feats, 1)} 顆，猜的模式對得上 ${(Math.max(agree, 1 - agree) * 100).toFixed(0)}%`
  })
}

function nowLine(fit: HmmFit): string {
  const { order } = ordered(fit)
  const probs = order.map((s, i) => `${LABEL[i]} ${(fit.last[s]! * 100).toFixed(0)}%`).join('、')
  const path = ordered(fit).path
  const seg = segments(path).at(-1)!
  return `最新一期 ${terms.at(-1)}（${dates.at(-1)}）單看這一期：${probs}。把整段連起來排最可能的走法：現在在模式 ${LABEL[seg.mode]}，從 ${terms[seg.from + BURN_IN]} 起已 ${seg.to - seg.from + 1} 期。`
}

const fit = realHmm.fit2
writeFileSync(OUT, [
  '# 週期偵測＋隱藏模式切換',
  '',
  `由 \`scripts/cycle-and-regime.ts\` 產生，任何人重跑都會得到一模一樣的數字。`,
  '',
  '## 資料與重跑',
  '',
  `- 資料：\`${SRC}\`，${file.count} 期，${terms[0]}（${dates[0]}）～ ${file.lastTerm}（${file.lastDate}）；前 ${BURN_IN} 期容器還沒裝滿，不算`,
  `- 檔案 SHA-256：\`${sha}\``,
  `- 重跑：\`node --import tsx scripts/cycle-and-regime.ts\`（種子 ${SEED}／${HMM_SEED}，公平模擬 ${SIMS} 次、隱藏模式比 ${HMM_SIMS} 次，約 ${Math.round((Date.now() - started) / 1000)} 秒）`,
  '- 隔期、值、x、y 都用頁面的 `computeFeatures` 算；公平模擬也用同一套。',
  '',
  '## 怎麼讀',
  '',
  '- 每一項都拿實際紀錄跟「公平開獎」比：同樣的開獎日，每期 39 取 5、跟過去無關，跑很多次，用同樣的算法算同樣的數字。',
  '- **p** ＝ 公平模擬裡跟實際一樣強、或更強的比例。p 很小（< 0.01，粗體）＝ 公平開獎很難做出來。',
  '- 右邊三欄是對照組：一段公平模擬、一段故意埋了週期、一段故意埋了模式切換。埋的那欄 p 變很小，代表這個方法抓得到那種規律。',
  '',
  '## 一、週期',
  '',
  '- 自相關：這期跟 N 期前像不像。容器算法本身就會讓前後幾期有關（例如這期開出的 5 顆下期在隔期 0），所以跟公平模擬同一個落後期數比，看偏了幾個標準差；取 1～60 期裡偏最多的那個。',
  `- 功率譜：把整串拆成各種「幾期一輪」的節奏（${MIN_PERIOD}～${MAX_PERIOD} 期），看最強那個有多強。強度平均約 1。`,
  '- 星期幾：一到六開出的盤面數字平均差多少。',
  '',
  ...cycleTable(),
  '',
  '### 自相關偏最多的落後期數（實際紀錄）',
  '',
  ...lagDetail(),
  '',
  '### 功率譜最強的節奏（實際紀錄）',
  '',
  ...peakDetail(),
  '',
  '## 二、隱藏模式切換',
  '',
  `每期看 4 樣：${OBS_NAMES.join('、')}。模型假設背後有 2 或 3 種模式在輪替，每種模式這 4 樣的比例不一樣，`,
  `而且一種模式平均至少待 ${Math.round(1 / (1 - MIN_STAY))} 期才換（只找慢慢換的開法；不限制的話會抓到容器算法本身每 1～2 期的交替，公平開獎也有）。`,
  '「多解釋了多少」＝ 分成幾種模式後，比只用一種（全部期數混在一起）多解釋的量（對數概似差）。',
  '分越多種一定多解釋一些，所以要跟公平開獎分出來的比：超過公平開獎的範圍，才代表真的有模式在換。',
  '',
  ...gainTable(),
  '',
  '埋模式切換的對照，分 2 種模式後每期猜的模式跟埋進去的真模式比（50% = 等於亂猜）：',
  '',
  ...regimeRecovery(),
  '',
  '### 實際紀錄分 2 種模式的樣子',
  '',
  ...modeTable(fit),
  '',
  segmentStats(ordered(fit).path),
  '',
  '### 現在',
  '',
  nowLine(fit),
  '',
  `最近 ${RECENT_SEGMENTS} 段：`,
  '',
  ...recentSegments(ordered(fit).path),
  ''
].join('\n'))
process.stdout.write(`${OUT} 已寫入（${Math.round((Date.now() - started) / 1000)} 秒）\n`)
