/**
 * GET|HEAD /api/patterns/:gameId/dependence — 規律驗證 第二～四組：
 *   偏差持續性、連續性與相關性、前後段重現。演算法見 shared/lotto/patterns/dependence.ts。
 *
 * 與 /api/analysis/:gameId 用同一份開獎資料。對照基準 = 同一批真實獎號只打亂順序（固定種子）。
 *
 * Query 參數：
 *   d       用最近幾期，預設 539 = 700，clamp 1-5000
 *   back    後段期數，預設 200
 *   format  預設 text（純文字，給 LLM 讀）；json
 *
 * 計算約 1–2 秒（打亂 200 次），回應帶 CDN 快取 30 分鐘。
 */
import { GAMES, isGameId } from '../../../../shared/lotto/games'
import { analyzeDependence, type DependenceResult, type StatCell, type StatGroup } from '../../../../shared/lotto/patterns/dependence'
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
  const rawBack = int(query.back)
  const back = Number.isFinite(rawBack) ? Math.max(50, Math.min(2000, rawBack)) : 200

  try {
    await getLatestDraw(gameId)
  } catch {
    // 上游掛掉 → 用 Firestore 既有資料照算
  }

  const draws = (await getRecentDraws(gameId, d))
    .sort((a, b) => a.drawTerm - b.drawTerm)
    .map(r => ({ drawTerm: r.drawTerm, drawDate: r.drawDate, numbers: r.numbers }))
  if (draws.length < 200) {
    throw createError({ statusCode: 404, statusMessage: 'Not enough draw data (need ≥ 200)' })
  }

  const result = analyzeDependence(draws, GAMES[gameId].numberMax, { backDraws: back })
  const generatedAt = new Date().toISOString()

  setResponseHeader(event, 'Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=300')

  if (query.format === 'json') {
    return { gameId, generatedAt, params: { d, back }, result }
  }
  setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return renderText(GAMES[gameId].name, gameId, generatedAt, { d, back }, result)
})

const VERDICT_TEXT: Record<StatCell['verdict'], string> = {
  replicated: '★重現',
  partial: '單段超出',
  normal: '範圍內'
}

function fmt(kind: StatGroup['kind'], v: number | null): string {
  if (v == null || Number.isNaN(v)) return '—'
  return kind === 'p' ? `${(v * 100).toFixed(1)}%` : v.toFixed(3)
}

function renderText(name: string, gameId: string, generatedAt: string, p: { d: number, back: number }, r: DependenceResult): string {
  const taipei = new Date(new Date(generatedAt).getTime() + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ')
  const m = r.meta
  const c = r.calibration
  const L: string[] = []
  const replicated = r.groups.flatMap(g => g.cells.filter(x => x.verdict === 'replicated').map(x => `${g.title}：${x.label}（${x.direction === 'high' ? '偏高' : '偏低'}）`))

  L.push(
    `# JackpotLab 規律驗證 第二～四組：偏差持續性、連續性與相關性、前後段重現 — ${name}（${gameId}）`,
    `產生時間：${taipei}（台北）`,
    `資料範圍：第 ${m.firstTerm} 期（${m.firstDate}）～ 第 ${m.lastTerm} 期（${m.lastDate}），共 ${m.drawCount} 期`,
    `前段：第 ${m.front.startTerm}～${m.front.endTerm} 期（${m.front.draws} 期，已略過最前面 ${m.warmup} 期暖機）；後段：第 ${m.back.startTerm}～${m.back.endTerm} 期（${m.back.draws} 期）`,
    `參數：d=${p.d} back=${p.back}；打亂順序 ${m.shuffles} 次（固定種子 ${m.seed}，結果可重現）。JSON 版請加 ?format=json`,
    '',
    '## 方法（只用這份真實開獎號碼）',
    '- 每一項指標都用真實開出順序算出「全部 / 前段 / 後段」三個值。',
    '- 對照範圍：把同一批真實獎號的開出順序打亂、隔期等欄位照原算法重算，重複多次，取 2.5%～97.5% 範圍（方括號內）。',
    '  號碼本身完全不變，只有前後順序被打亂；若真實順序有持續性或前後關聯，真實值會落在這個範圍外。',
    '- 不用「相隔很遠的期數」當對照，因為隔期 / 現值 / 位置是從前面各期推出來的，本身就有前後關聯，遠距對照會把算法造成的關聯誤判成規律。',
    '- 判定：前段與後段都超出範圍且方向相同 =「★重現」；只有全部或單一段超出 =「單段超出」（不算持續存在）；其餘 =「範圍內」。',
    '',
    '## 總結',
    `- 檢驗格數：${c.cells}；真實資料「★重現」：${c.realReplicated} 格。`,
    `- 校正：把打亂後的資料當成真實資料做同樣判定，平均 ${c.shuffleReplicatedMean.toFixed(2)} 格會被判成重現（95% 情況下不超過 ${c.shuffleReplicatedP95} 格）。`,
    `- 號碼接續（本期 i → 下期 j，${r.pairs.pairsChecked} 種組合）：前後段都偏多 ${r.pairs.realMore} 對（打亂後平均 ${r.pairs.shuffleMore.mean.toFixed(1)}、95% ≤ ${r.pairs.shuffleMore.p95}）；都偏少 ${r.pairs.realLess} 對（打亂後平均 ${r.pairs.shuffleLess.mean.toFixed(1)}、95% ≤ ${r.pairs.shuffleLess.p95}）。`,
    replicated.length > 0 ? `- 重現項目：${replicated.join('；')}` : '- 重現項目：無'
  )

  for (const g of r.groups) {
    L.push('', `## ${g.title}`, g.description, '項目|全部［對照範圍］|前段［對照範圍］|後段［對照範圍］|判定')
    for (const x of g.cells) {
      const part = (k: 'all' | 'front' | 'back') => `${fmt(g.kind, x.real[k])}［${fmt(g.kind, x.low[k])}～${fmt(g.kind, x.high[k])}］`
      const dir = x.direction === 'high' ? '偏高' : x.direction === 'low' ? '偏低' : ''
      L.push(`${x.label}|${part('all')}|${part('front')}|${part('back')}|${VERDICT_TEXT[x.verdict]}${dir ? `（${dir}）` : ''}`)
    }
  }

  const pairLine = (x: DependenceResult['pairs']['more'][number]) =>
    `${String(x.from).padStart(2, '0')} → ${String(x.to).padStart(2, '0')}|${x.front}（推算 ${x.frontExpected.toFixed(1)}）|${x.back}（推算 ${x.backExpected.toFixed(1)}）`
  L.push(
    '',
    '## 第三組 ④ 號碼接續（本期開出 i → 下期開出 j）',
    `推算次數 = 本段 i 開出次數 × 下期 j 開出次數 ÷ 本段接續期數（只用本段資料）。前後段都 ≥ ${r.pairs.ratio} 倍算偏多、都 ≤ 1/${r.pairs.ratio} 算偏少。`,
    `偏多 ${r.pairs.realMore} 對 vs 打亂順序平均 ${r.pairs.shuffleMore.mean.toFixed(1)} 對；偏少 ${r.pairs.realLess} 對 vs 打亂順序平均 ${r.pairs.shuffleLess.mean.toFixed(1)} 對。`,
    '偏多：i → j|前段次數|後段次數'
  )
  r.pairs.more.forEach(x => L.push(pairLine(x)))
  L.push('偏少：i → j|前段次數|後段次數')
  r.pairs.less.forEach(x => L.push(pairLine(x)))
  L.push('', '（完）')
  return L.join('\n') + '\n'
}
