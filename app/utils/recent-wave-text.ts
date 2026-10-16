/**
 * 近期波段的文字（2026-10-16 使用者要求的寫法）：
 * - 明講「第幾期開了幾顆」，不能只說「0 顆之後」。
 * - 合計一定寫出是哪幾期、幾顆、門檻幾顆；推估要舉「下一期開幾顆 → 合計幾顆 → 在哪個波段」。
 * - 「下一期開完」是依目前盤面推估的部分，forecast = true，頁面用不同顏色標示。
 * 頁面 /trend 與 scripts/y-wave.ts 都用這支，保證寫出來的一樣。
 */
import { pctOf, type Dist, type ForecastOption, type RecentWave, type Zone } from './recent-wave'

export interface WaveSection {
  title: string
  forecast: boolean
  lines: string[]
  bullets: string[]
  /** 列在 bullets 之後的句子 */
  after: string[]
}

const ZONE_NAME: Record<Zone, string> = { 高: '高波段', 中: '中間', 低: '低波段' }
const ZONE_RANK: Record<Zone, number> = { 低: 0, 中: 1, 高: 2 }
const SMALL_SAMPLE = 30

/** 115000250 → 250 */
export const shortIssue = (issue: string) => String(Number(issue.slice(-3)))

function pct(p: number): string {
  if (p > 0 && p < 0.005) return '不到 1%'
  return `${Math.round(p * 100)}%`
}

export function unitName(r: RecentWave): string {
  return r.kind === 'y' ? `位置 y=${r.key}` : `值 ${r.key}`
}

function hasPhrase(r: RecentWave, count: number): string {
  return r.kind === 'y' ? `${count} 顆位置是 y=${r.key}` : `${count} 顆的值是 ${r.key}`
}

function seqTrend(xs: number[]): string {
  const [a, b, c] = xs as [number, number, number]
  if (a < b && b < c) return '一路往上'
  if (a > b && b > c) return '一路往下'
  if (a === b && b === c) return '持平'
  if (c > b) return '最近往上'
  if (c < b) return '最近往下'
  return '持平'
}

function distText(d: Dist): string {
  return `${d.items.map(it => `${it.k} 顆${pct(it.pct).startsWith('不到') ? '' : ' '}${pct(it.pct)}`).join('、')}，平均 ${d.mean.toFixed(2)} 顆`
}

function nowSection(r: RecentWave): WaveSection {
  const lines = [`${shortIssue(r.latest.issue)} 期有 ${hasPhrase(r, r.latest.count)}。`]
  const last3 = r.recent.slice(-3)
  lines.push(`最近三期是 ${last3.map(x => `${shortIssue(x.issue)} 期 ${x.count} 顆`).join('、')}，${seqTrend(last3.map(x => x.count))}。`)
  if (r.latest.count === 0) {
    lines.push(r.lastSeen
      ? `最近一次開出是 ${shortIssue(r.lastSeen.issue)} 期，已經 ${r.lastSeen.ago} 期沒開。`
      : `${r.year} 年還沒開出過。`)
  }
  return { title: '目前盤面', forecast: false, lines, bullets: [], after: [] }
}

function bandSection(r: RecentWave): WaveSection {
  const verb = r.kind === 'y' ? `有 ${r.window.sum} 顆位置是 y=${r.key}` : `開出 ${r.window.sum} 顆值 ${r.key}`
  const [a, b] = r.lastSums
  return {
    title: '目前波段',
    forecast: false,
    lines: [
      `最近 ${r.w} 期（${shortIssue(r.window.from)}～${shortIssue(r.window.to)} 期）一共${verb}。`,
      `高波段是 ${r.hi} 顆以上、低波段是 ${r.lo} 顆以下，現在**在${ZONE_NAME[r.zone]}**；前兩次的 ${r.w} 期合計是 ${a} 顆、${b} 顆，${seqTrend(r.lastSums)}。`
    ],
    bullets: [],
    after: []
  }
}

function sameBoardSection(r: RecentWave): WaveSection {
  const cond = `上一期 ${r.latest.count} 顆＋${ZONE_NAME[r.zone]}`
  const lines = [`${cond}，全史 ${r.sameAll.total} 次，下一期：${distText(r.sameAll)}。${r.sameAll.total < SMALL_SAMPLE ? '次數少，只能參考。' : ''}`]
  lines.push(r.sameYear.total === 0
    ? `${r.year} 年還沒遇過這種盤面。`
    : `${r.year} 年 ${r.sameYear.total} 次：${distText(r.sameYear)}。`)
  return { title: '同盤面', forecast: false, lines, bullets: [], after: [] }
}

function valueSumSection(r: RecentWave): WaveSection | null {
  const v = r.valueSum
  if (!v) return null
  const side = v.isLow ? '小於 10' : '10 以上'
  const when = v.isLow ? '值總和小於 10 的時候' : '值總和在 10 以上的時候'
  const lines = [
    `現在值總和是 ${v.now}（${side}）。`,
    `同盤面又遇到值總和小於 10：全史 ${v.low.total} 次，下一期平均 ${v.low.mean.toFixed(2)} 顆；值總和 10 以上：${v.high.total} 次，平均 ${v.high.mean.toFixed(2)} 顆。`
  ]
  const nowMean = v.isLow ? v.low.mean : v.high.mean
  const otherMean = v.isLow ? v.high.mean : v.low.mean
  const dir = nowMean > otherMean ? '多' : '少'
  if (v.effect === 'strong') {
    const d = v.isLow ? v.low : v.high
    lines.push(`**有影響**：${when}，下一期的${unitName(r)} 明顯變${dir}。下面的推估改用這 ${d.total} 次：${distText(d)}。`)
  } else if (v.effect === 'slight') {
    lines.push(`${when}略${dir}一點，影響很小，推估照同盤面。`)
  } else if (v.effect === 'none') {
    lines.push('兩邊差不多，沒有影響。')
  } else {
    lines.push(`${v.low.total < v.high.total ? '小於 10' : '10 以上'}那邊只有 ${Math.min(v.low.total, v.high.total)} 次，次數太少，看不出有沒有影響。`)
  }
  return { title: '值總和', forecast: false, lines, bullets: [], after: [] }
}

function zoneChange(from: Zone, to: Zone, many: boolean): string {
  if (from === to) return `${many ? '都' : ''}還在${ZONE_NAME[to]}`
  if (ZONE_RANK[to] > ZONE_RANK[from]) return to === '高' ? '進高波段' : '回到中間'
  return to === '低' ? '掉到低波段' : '掉回中間'
}

/** 連續、落在同一個波段的選項併成一句 */
function groupOptions(options: ForecastOption[]): ForecastOption[][] {
  const groups: ForecastOption[][] = []
  for (const o of options) {
    const g = groups.at(-1)
    if (g && g.at(-1)!.zone === o.zone) g.push(o)
    else groups.push([o])
  }
  return groups
}

function forecastSection(r: RecentWave): WaveSection {
  const n = r.next
  const nextShort = shortIssue(n.issue)
  const lines = [`範圍變成 ${shortIssue(n.from)}～${nextShort} 期，${shortIssue(n.dropIssue)} 期那 ${n.dropCount} 顆移出。`]
  const groups = groupOptions(n.options)
  const bullets = groups.map((g, gi) => {
    const isLast = gi === groups.length - 1
    const say = (o: ForecastOption, i: number, orMore: boolean) =>
      `${gi === 0 && i === 0 ? `${nextShort} 期開` : '開'} ${o.k} 顆${orMore ? '以上' : ''} → ${o.sum} 顆${orMore ? '以上' : ''}`
    // 最後一組的最後一個代表「開這麼多以上」；只有一組時先逐一列前兩個，免得寫成「開 0 顆以上」
    const listed = isLast && g.length > 1
      ? (groups.length === 1 ? g.slice(0, Math.min(3, g.length)) : g.slice(0, 1))
      : g
    const parts = listed.map((o, i) => say(o, i, isLast && i === listed.length - 1))
    const p = pctOf(r.forecastDist, k => isLast ? k >= g[0]!.k : g.some(o => o.k === k))
    const chance = p === 0 ? '這種盤面沒發生過' : p < 0.005 ? '不到 1%' : `約 ${pct(p)}`
    const where = groups.length === 1 ? `不管開幾顆，${zoneChange(r.zone, g[0]!.zone, false)}` : zoneChange(r.zone, g[0]!.zone, g.length > 1)
    return `${parts.join('；')}，${where}（${chance}）。`
  })
  const after: string[] = []
  const best = [...r.forecastDist.items].sort((a, b) => b.pct - a.pct)[0]
  if (best) {
    const sum = n.options.find(o => o.k === best.k)?.sum
    if (sum !== undefined) after.push(`最可能開 ${best.k} 顆（${pct(best.pct)}），${r.w} 期合計會是 ${sum} 顆。`)
  }
  return { title: '下一期開完', forecast: true, lines, bullets, after }
}

export function recentWaveText(r: RecentWave): WaveSection[] {
  return [nowSection(r), bandSection(r), sameBoardSection(r), valueSumSection(r), forecastSection(r)]
    .filter((s): s is WaveSection => s !== null)
}
