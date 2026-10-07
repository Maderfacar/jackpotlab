/**
 * GET|HEAD /api/patterns/:gameId/uniform — 規律驗證 第一組：短期均勻現象。
 *
 * 與 /api/analysis/:gameId 用同一份開獎資料（getRecentDraws），只用真實開獎號碼計算，
 * 演算法見 shared/lotto/patterns/uniform.ts。
 *
 * Query 參數：
 *   d       用最近幾期，預設 539 = 700（與 /api/analysis 相同），clamp 1-5000
 *   min/max 視窗期數範圍，預設 5-40
 *   format  預設 text（純文字，給 LLM 讀）；json
 *
 * 回應帶 CDN 快取 5 分鐘。
 */
import { GAMES, isGameId } from '../../../../shared/lotto/games'
import { analyzeUniform, type UniformResult } from '../../../../shared/lotto/patterns/uniform'
import { clampD, defaultD } from '../../../../app/utils/analysis'
import { getLatestDraw, getRecentDraws } from '../../../utils/draw-service'

export default defineEventHandler(async (event) => {
  assertMethod(event, ['GET', 'HEAD'])
  const gameId = getRouterParam(event, 'gameId')
  if (!isGameId(gameId) || gameId === 'bingo_bingo') {
    throw createError({ statusCode: 400, statusMessage: `Unsupported gameId: ${gameId}` })
  }

  const query = getQuery(event)
  const int = (v: unknown) => (typeof v === 'string' ? Number.parseInt(v, 10) : Number.NaN)
  const rawD = int(query.d)
  const d = Number.isFinite(rawD) ? clampD(rawD) : (gameId === 'lotto539' ? 700 : defaultD(gameId))
  const rawMin = int(query.min)
  const rawMax = int(query.max)
  const minSize = Number.isFinite(rawMin) ? Math.max(2, Math.min(200, rawMin)) : 5
  const maxSize = Number.isFinite(rawMax) ? Math.max(minSize, Math.min(200, rawMax)) : 40

  try {
    await getLatestDraw(gameId)
  } catch {
    // 上游掛掉 → 用 Firestore 既有資料照算
  }

  const draws = (await getRecentDraws(gameId, d))
    .sort((a, b) => a.drawTerm - b.drawTerm)
    .map(r => ({ drawTerm: r.drawTerm, drawDate: r.drawDate, numbers: r.numbers }))
  if (draws.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'No draw data available' })
  }

  const result = analyzeUniform(draws, GAMES[gameId].numberMax, minSize, maxSize)
  const generatedAt = new Date().toISOString()

  setResponseHeader(event, 'Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60')

  if (query.format === 'json') {
    return { gameId, generatedAt, params: { d, min: minSize, max: maxSize }, result }
  }
  setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return renderText(GAMES[gameId].name, gameId, generatedAt, { d, minSize, maxSize }, result)
})

function renderText(
  name: string,
  gameId: string,
  generatedAt: string,
  p: { d: number, minSize: number, maxSize: number },
  r: UniformResult
): string {
  const taipei = new Date(new Date(generatedAt).getTime() + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ')
  const range = (x: { startTerm: number, startDate: string, endTerm: number, endDate: string }) =>
    `${x.startTerm}～${x.endTerm}（${x.startDate}～${x.endDate}）`
  const L: string[] = []

  L.push(
    `# JackpotLab 規律驗證 第一組：短期均勻現象 — ${name}（${gameId}）`,
    `產生時間：${taipei}（台北）`,
    `資料範圍：第 ${r.firstTerm} 期（${r.firstDate}）～ 第 ${r.lastTerm} 期（${r.lastDate}），共 ${r.drawCount} 期，每期 ${r.ballsPerDraw} 顆主號，號碼 1～${r.numberMax}`,
    `參數：d=${p.d} 視窗 ${p.minSize}～${p.maxSize} 期。JSON 版請加 ?format=json`,
    '',
    '## 說明（只用真實開獎號碼，沒有任何機率模型或模擬）',
    '- 視窗：連續 W 期。從第 1 期開始逐期往後滑，每個視窗統計 1～' + r.numberMax + ' 號各出現幾次。',
    '- 差距 = 視窗內出現最多的號碼次數 − 出現最少的號碼次數。差距越小越均勻。',
    '- 理想均勻 = 總球數平均分給每個號碼，每號只差 0 或 1 次（純算術，整除時差距 0，否則 1）。',
    '- 最均勻視窗 = 實際資料中差距最小的視窗；互相重疊的合併成一「段」。',
    '- 段間隔 = 相鄰兩段的起始期相隔幾期，用來看是否以固定間隔反覆出現。',
    '- 全號覆蓋 = 從某一期開始，要連續幾期才能讓 1～' + r.numberMax + ' 號全部至少出現一次。',
    '',
    '## 一、各視窗長度總表',
    '視窗期數|總球數|理想（每號次數）|理想差距|達到理想的視窗|實際最小差距|達到最小差距的視窗/總視窗|段數|段間隔（期）'
  )
  for (const s of r.sizes) {
    L.push([
      s.size,
      s.balls,
      s.idealLow === s.idealHigh ? `${s.idealLow}` : `${s.idealLow}～${s.idealHigh}`,
      s.idealSpread,
      s.idealCount,
      s.bestSpread,
      `${s.bestCount}/${s.windowCount}`,
      s.episodes.length,
      s.episodeGaps.join(' ') || '-'
    ].join('|'))
  }

  L.push('', '## 二、各視窗長度的差距分布（差距:視窗數）')
  for (const s of r.sizes) {
    L.push(`W=${s.size}｜${s.spreadHistogram.map(h => `${h.spread}:${h.count}`).join(' ')}`)
  }

  L.push('', '## 三、最均勻的段（每個視窗長度）', '視窗期數|段|期數範圍|跨幾期|合併視窗數')
  for (const s of r.sizes) {
    s.episodes.forEach((e, i) => {
      L.push(`${s.size}|${i + 1}|${range(e)}|${e.draws}|${e.windows}`)
    })
  }

  const c = r.coverage
  L.push(
    '',
    '## 四、全號覆蓋',
    `共 ${c.starts} 個起始期完成覆蓋：最快 ${c.min} 期、中位數 ${c.median} 期、最慢 ${c.max} 期`,
    `需要期數:次數｜${c.histogram.map(h => `${h.draws}:${h.count}`).join(' ')}`,
    `最快（${c.min} 期）的區段：`
  )
  c.fastest.forEach((f, i) => L.push(`${i + 1}. ${range(f)}`))
  L.push(`最快區段之間相隔（期）：${c.fastestGaps.join(' ') || '-'}`, '', '（完）')
  return L.join('\n') + '\n'
}
