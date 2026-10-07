/**
 * GET|HEAD /api/analysis/:gameId — 隔期狀態 + 獎號關聯 JSON 匯出（給 LLM / 程式讀）。
 *
 * 與 /draws 頁完全同一支演算法（app/utils/analysis.ts 的 hydrateFromDraws），
 * 每次請求時以最新開獎資料即時計算 — 固定網址、滾動視窗。
 *
 * Query 參數：
 *   d      灌入深度（抓最近幾期），預設 700 ≒ 539 兩年，clamp 1-5000
 *   days   以「天」指定深度（clamp 1-30），優先於 d — 賓果一天 ~226 期，
 *          用天講比期數實在（2026-09-02 使用者拍板）。慢彩種也通用。
 *   n      隔期表格範圍，預設 60，clamp 1-200
 *   limit  history 只回最近幾期（省 LLM token），預設全回
 *   until  只用 drawTerm ≤ until 的資料計算（凍結到某期的快照）
 *   format 預設 text（純文字表格，一期一列，給 LLM 直接讀）；json = 原本的 JSON
 *          （2026-10-07 使用者拍板：JSON 700 期 144 KB 單行，ChatGPT 讀網址會被壓縮截斷）
 *
 * 回應帶 CDN 快取 5 分鐘（s-maxage=300），LLM 重複讀同一網址不會每次都讀 Firestore。
 */

import { GAMES, isGameId, type GameId } from '../../../shared/lotto/games'
import { getLatestDraw, getRecentDraws } from '../../utils/draw-service'
import {
  hydrateFromDraws, clampD, clampN, defaultD, defaultN,
  type AnalysisDrawInput,
  type AnalysisPeriod,
  type HistoryEntry
} from '../../../app/utils/analysis'

/** 台北時區、往前 n 天的日期（YYYY-MM-DD） */
function taipeiDateNDaysAgo(n: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(Date.now() - n * 24 * 60 * 60 * 1000))
}

const FIELD_GUIDE = {
  periods: '隔期狀態表現況。slot 0 = 最新一期，slot 越大越舊。prizes = 該期還沒被之後任何一期開走的剩餘號碼。record = 這個 slot 位置的開出紀錄（逗號分隔、最左為現值）：最左值 = 此位置已連續幾期沒開出獎號，開出時會在最左補 0。',
  history: '獎號關聯表，每期一列（由舊到新）。prizes = 該期開出號碼（升序）。periods = 每顆號碼回溯到的 slot（隔幾期，逗號對應 prizes 順序）。sum = periods 加總。values = 每顆號碼來源 slot 當時的記錄現值。positions = 每顆號碼的 x-y：x = 來源 slot 當時剩餘號碼數、y = 該號在剩餘號碼（小到大）中的排位。tails = 尾數 0-9 各出現幾顆（index = 尾數）。',
  warmup: 'history 的前 n 期表格尚未填滿，隔期值系統性偏小，做統計時建議剔除。'
} as const

export default defineEventHandler(async (event) => {
  // GET + HEAD 都要接：ChatGPT 等網頁讀取器會先送 HEAD 探測類型，
  // 原本只有 .get.ts → HEAD 回 404 JSON，LLM 誤以為整份資料是「1 行 JSON」（2026-10-08）
  assertMethod(event, ['GET', 'HEAD'])
  const gameId = getRouterParam(event, 'gameId')
  if (!isGameId(gameId)) {
    throw createError({ statusCode: 400, statusMessage: `Unknown gameId: ${gameId}` })
  }

  const query = getQuery(event)
  const rawD = typeof query.d === 'string' ? Number.parseInt(query.d, 10) : Number.NaN
  const rawDays = typeof query.days === 'string' ? Number.parseInt(query.days, 10) : Number.NaN
  const rawN = typeof query.n === 'string' ? Number.parseInt(query.n, 10) : Number.NaN
  const rawLimit = typeof query.limit === 'string' ? Number.parseInt(query.limit, 10) : Number.NaN
  const rawUntil = typeof query.until === 'string' ? Number.parseInt(query.until, 10) : Number.NaN

  const days = Number.isFinite(rawDays) ? Math.max(1, Math.min(30, rawDays)) : null
  // days 模式：先抓「天數 × 單日最多期數」的量，再按日期切
  const perDayMax = gameId === 'bingo_bingo' ? 230 : 1
  const d = days != null
    ? days * perDayMax
    : Number.isFinite(rawD) ? clampD(rawD) : (gameId === 'lotto539' ? 700 : defaultD(gameId))
  const n = Number.isFinite(rawN) ? clampN(rawN) : defaultN()
  const until = Number.isFinite(rawUntil) ? rawUntil : null
  const format = query.format === 'json' ? 'json' : 'text'

  // 與 /api/draws/:gameId/recent 同一套：先觸發 5 分鐘 cache 的最新期補抓，失敗不擋。
  try {
    await getLatestDraw(gameId)
  } catch {
    // 上游掛掉 → 用 Firestore 既有資料照算
  }

  const draws = await getRecentDraws(gameId, d)
  // days 模式的日期下限（台北時區、含當天往前 days 天）
  const cutoffDate = days != null ? taipeiDateNDaysAgo(days - 1) : null
  const byDate = cutoffDate != null ? draws.filter(r => r.drawDate >= cutoffDate) : draws
  const filtered = until != null ? byDate.filter(r => r.drawTerm <= until) : byDate
  const drawsAsc = [...filtered].sort((a, b) => a.drawTerm - b.drawTerm)
  const inputs: AnalysisDrawInput[] = drawsAsc.map((r) => {
    const merged = r.special != null ? [...r.numbers, r.special] : r.numbers
    return {
      drawTerm: r.drawTerm,
      drawDate: r.drawDate,
      prizes: [...new Set(merged)]
    }
  })

  if (inputs.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'No draw data available for the requested window' })
  }

  const state = hydrateFromDraws(gameId, n, inputs)
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(state.history.length, rawLimit))
    : state.history.length
  const history = state.history.slice(-limit)

  const range = {
    firstTerm: inputs[0]!.drawTerm,
    firstDate: inputs[0]!.drawDate,
    lastTerm: inputs.at(-1)!.drawTerm,
    lastDate: inputs.at(-1)!.drawDate,
    drawCount: inputs.length,
    historyReturned: history.length
  }
  const generatedAt = new Date().toISOString()

  setResponseHeader(event, 'Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60')

  if (format === 'text') {
    setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
    return renderText({ gameId, generatedAt, params: { d, days, n, limit, until }, range, periods: state.periods, history })
  }

  return {
    gameId,
    generatedAt,
    params: { d, days, n, limit, until },
    range,
    fieldGuide: FIELD_GUIDE,
    periods: state.periods,
    history
  }
})

// ---------- 純文字輸出（給 LLM 讀）----------

interface TextInput {
  gameId: GameId
  generatedAt: string
  params: { d: number, days: number | null, n: number, limit: number, until: number | null }
  range: { firstTerm: number, firstDate: string, lastTerm: number, lastDate: string, drawCount: number, historyReturned: number }
  periods: AnalysisPeriod[]
  history: HistoryEntry[]
}

const pad2 = (x: number | string) => String(x).padStart(2, '0')
/** "1,11,27" → "01 11 27" */
const spaced = (csv: string | undefined, padNumbers = false) =>
  (csv ?? '').split(',').filter(x => x !== '').map(x => (padNumbers ? pad2(x) : x)).join(' ')

function renderText(t: TextInput): string {
  const g = GAMES[t.gameId]
  const taipei = new Date(new Date(t.generatedAt).getTime() + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ')
  const lines: string[] = []

  lines.push(
    `# JackpotLab 分析匯出 — ${g.name}（${t.gameId}）`,
    `產生時間：${taipei}（台北）`,
    `資料範圍：第 ${t.range.firstTerm} 期（${t.range.firstDate}）～ 第 ${t.range.lastTerm} 期（${t.range.lastDate}），共 ${t.range.drawCount} 期`,
    `參數：d=${t.params.d}${t.params.days != null ? ` days=${t.params.days}` : ''} n=${t.params.n}${t.params.until != null ? ` until=${t.params.until}` : ''}；history 回傳 ${t.range.historyReturned} 期`,
    `格式：本頁為純文字表格，欄位以「|」分隔、一期一列。JSON 版請加 ?format=json`,
    '',
    '## 欄位說明',
    '- 隔期狀態表（現況）：slot 0 = 最新一期，slot 越大越舊。',
    '  - 剩餘號碼 = 該期開出、但還沒被之後任何一期再開出的號碼；「-」表示已全部被開走。',
    '  - 紀錄 = 這個 slot 位置的開出紀錄，逗號分隔、最左為現值。最左值 = 此位置已連續幾期沒開出獎號；開出時最左補 0。',
    '- 獎號關聯表（由舊到新，一期一列）：',
    '  - 獎號 = 該期開出號碼（升序）。',
    '  - 隔期 = 每顆號碼回溯到的 slot（隔幾期），順序對應獎號。',
    '  - 隔期和 = 隔期加總。',
    '  - 現值 = 每顆號碼來源 slot 當時的紀錄現值，順序對應獎號。',
    '  - 位置 = 每顆號碼的 x-y：x = 來源 slot 當時剩餘號碼數，y = 該號在剩餘號碼（小到大）中的排位。',
    '  - 尾數 = 10 位數字，依序為尾數 0～9 各開出幾顆。',
    `  - 暖機：最前面約 ${t.params.n} 期表格尚未填滿，隔期 / 隔期和 / 現值 / 位置 為「-」或系統性偏小，做統計時建議剔除。`,
    '',
    `## 一、隔期狀態表（現況，共 ${t.periods.length} 個 slot）`,
    'slot|期別|日期|剩餘號碼|紀錄（最左為現值）'
  )
  for (const p of t.periods) {
    const remain = p.prizes.length > 0 ? p.prizes.map(pad2).join(' ') : '-'
    lines.push(`${p.period}|${p.issue}|${p.date}|${remain}|${p.record}`)
  }

  lines.push(
    '',
    `## 二、獎號關聯表（由舊到新，共 ${t.history.length} 期）`,
    '期別|日期|獎號|隔期|隔期和|現值|位置|尾數'
  )
  for (const h of t.history) {
    lines.push([
      h.issue,
      h.date,
      spaced(h.prizes, true),
      spaced(h.periods) || '-',
      h.sum === '' || h.sum == null ? '-' : String(h.sum),
      spaced(h.values) || '-',
      spaced(h.positions) || '-',
      h.tails.join('')
    ].join('|'))
  }

  lines.push('', `（完）共 ${t.history.length} 期。`)
  return lines.join('\n') + '\n'
}
