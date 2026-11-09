import { Timestamp } from 'firebase-admin/firestore'
import { analysisCacheSeconds } from '../../../../shared/lotto/cache-window'
import { DIGIT_GAMES, normalizeDigitDraw, type DigitDraw, type DigitGameId } from '../../../../shared/lotto/digit-games'
import { tryGetAdminFirestore } from '../../../utils/firebase-admin'

/**
 * GET /api/digit/:gameId/since?after=<期號> — 三星彩／四星彩期號 > after 的期數（由舊到新）。
 *
 * 給 /4d 用：過去的期數讀 public/data/lotto4d-history.json，這裡只補檔案之後的新期數（讀取次數 = 新期數）。
 * 資料庫比官方舊時（排程沒跑到），順手向官方要缺的期數並寫回資料庫，最多補 MAX_FILL 期。
 */
const API_BASE = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery'
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; JackpotLab/1.0)', 'Accept': 'application/json', 'Referer': 'https://www.taiwanlottery.com/' }
const MAX_FILL = 12
const MAX_ROWS = 500

interface SinceRow { drawTerm: number, drawDate: string, numbers: number[] }

const isDigitGameId = (v: unknown): v is DigitGameId => typeof v === 'string' && v in DIGIT_GAMES

async function official(url: string): Promise<Record<string, unknown> | null> {
  const r = await fetch(url, { headers: HEADERS })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const json = await r.json() as { rtCode: number, content?: Record<string, unknown> | null }
  if (json.rtCode !== 0) throw new Error(`rtCode=${json.rtCode}`)
  return json.content ?? null
}

/** 官方比 known 新的期數（同一年度內、最多 MAX_FILL 期） */
async function fetchOfficialAfter(id: DigitGameId, known: number): Promise<DigitDraw[]> {
  const g = DIGIT_GAMES[id]
  const raw = (await official(`${API_BASE}/LatestResult`))?.[g.latestField]
  if (!raw || typeof raw !== 'object') return []
  const top = normalizeDigitDraw(id, raw as Record<string, unknown>)
  if (top.drawTerm <= known) return []
  const out = [top]
  const yearStart = Math.floor(top.drawTerm / 1e6) * 1e6 + 1
  for (let t = Math.max(known + 1, top.drawTerm - MAX_FILL, yearStart); t < top.drawTerm; t++) {
    const arr = (await official(`${API_BASE}/${g.endpoint}?period=${t}`))?.[g.listField]
    if (Array.isArray(arr) && arr[0]) out.push(normalizeDigitDraw(id, arr[0] as Record<string, unknown>))
  }
  return out.sort((a, b) => a.drawTerm - b.drawTerm)
}

export default defineEventHandler(async (event): Promise<{ gameId: DigitGameId, results: SinceRow[], officialError?: string }> => {
  const gameId = getRouterParam(event, 'gameId')
  if (!isDigitGameId(gameId)) throw createError({ statusCode: 400, statusMessage: `Unknown gameId: ${gameId}` })
  const raw = getQuery(event).after
  const after = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN
  if (!Number.isInteger(after) || after < 0) throw createError({ statusCode: 400, statusMessage: 'after 必須是期號（正整數）' })

  const db = tryGetAdminFirestore()
  const col = db?.collection('draws').doc(gameId).collection('results')
  const stored: SinceRow[] = col
    ? (await col.where('drawTerm', '>', after).orderBy('drawTerm', 'asc').limit(MAX_ROWS).get())
        .docs.map((d) => {
          const x = d.data() as SinceRow
          return { drawTerm: x.drawTerm, drawDate: x.drawDate, numbers: x.numbers }
        })
    : []

  let officialError: string | undefined
  let filled: DigitDraw[] = []
  try {
    filled = await fetchOfficialAfter(gameId, stored.at(-1)?.drawTerm ?? after)
    if (db && col && filled.length) {
      const batch = db.batch()
      for (const d of filled) batch.set(col.doc(String(d.drawTerm)), { ...d, fetchedAt: Timestamp.now() })
      const latestRef = db.collection('draws').doc(gameId).collection('latest').doc('current')
      const cur = (await latestRef.get()).data()?.drawTerm ?? 0
      if (filled.at(-1)!.drawTerm > cur) batch.set(latestRef, { ...filled.at(-1)!, fetchedAt: Timestamp.now() })
      await batch.commit()
    }
  } catch (e: unknown) {
    officialError = e instanceof Error ? e.message : '官方讀取失敗'
  }

  const results = [...stored, ...filled.map(d => ({ drawTerm: d.drawTerm, drawDate: d.drawDate, numbers: d.numbers }))]
  setResponseHeader(event, 'Cache-Control', `public, s-maxage=${analysisCacheSeconds(new Date())}, stale-while-revalidate=60`)
  return { gameId, results, ...(officialError ? { officialError } : {}) }
})
