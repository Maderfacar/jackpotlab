import { GAME_IDS, GAMES, type GameId } from '../../../shared/lotto/games'
import { getLatest } from '../../utils/draw-store'
import { tryGetAdminFirestore } from '../../utils/firebase-admin'
import { taiwanLottery } from '../../utils/taiwan-lottery'

interface GameHealth {
  id: GameId
  name: string
  cadenceLabel: string
  drawSchedule: string
  realtime: boolean
  latest: {
    drawTerm: number
    drawDate: string
    fetchedAt: string
    ageSeconds: number
  } | null
  heartbeat: {
    status: 'ok' | 'error' | 'unknown'
    lastRunAt: string | null
    lastSuccessAt: string | null
    lastErrorMessage: string | null
    lastDurationMs: number | null
  } | null
}

interface HealthResponse {
  generatedAt: string
  firestore: {
    enabled: boolean
    message: string
  }
  source: {
    url: string
    status: 'ok' | 'degraded' | 'down'
    latencyMs: number | null
    error: string | null
  }
  games: GameHealth[]
}

export default defineEventHandler(async (): Promise<HealthResponse> => {
  const firestoreEnabled = tryGetAdminFirestore() !== null

  // 1. 來源 ping —— 打 LatestResult 一發，量時間。
  const sourceStart = Date.now()
  const source: HealthResponse['source'] = {
    url: 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery/LatestResult',
    status: 'ok',
    latencyMs: null,
    error: null
  }
  try {
    await taiwanLottery.fetchLatestSnapshot()
    source.latencyMs = Date.now() - sourceStart
    source.status = source.latencyMs > 3000 ? 'degraded' : 'ok'
  } catch (error) {
    source.latencyMs = Date.now() - sourceStart
    source.status = 'down'
    source.error = error instanceof Error ? error.message : 'unknown'
  }

  // 2. 每個彩種拉 Firestore latest + heartbeat。
  const games = await Promise.all(GAME_IDS.map(id => loadGameHealth(id)))

  return {
    generatedAt: new Date().toISOString(),
    firestore: {
      enabled: firestoreEnabled,
      message: firestoreEnabled
        ? 'Firebase Admin 已連線'
        : 'Firebase Admin 未設定（FIREBASE_SERVICE_ACCOUNT_JSON 缺失），快取已停用'
    },
    source,
    games
  }
})

async function loadGameHealth(id: GameId): Promise<GameHealth> {
  const meta = GAMES[id]
  const base: GameHealth = {
    id,
    name: meta.name,
    cadenceLabel: meta.cadenceLabel,
    drawSchedule: meta.drawSchedule,
    realtime: meta.realtime,
    latest: null,
    heartbeat: null
  }

  try {
    const latest = await getLatest(id)
    if (latest) {
      base.latest = {
        drawTerm: latest.drawTerm,
        drawDate: latest.drawDate,
        fetchedAt: latest.fetchedAt,
        ageSeconds: Math.round((Date.now() - new Date(latest.fetchedAt).getTime()) / 1000)
      }
    }
  } catch { /* swallow — health page should never crash on one game */ }

  try {
    const fs = tryGetAdminFirestore()
    if (fs) {
      const snap = await fs.collection('health').doc(id).get()
      if (snap.exists) {
        const data = snap.data() ?? {}
        base.heartbeat = {
          status: (data.status as 'ok' | 'error' | undefined) ?? 'unknown',
          lastRunAt: toIso(data.lastRunAt),
          lastSuccessAt: toIso(data.lastSuccessAt),
          lastErrorMessage: (data.lastErrorMessage as string | undefined) ?? null,
          lastDurationMs: (data.lastDurationMs as number | undefined) ?? null
        }
      }
    }
  } catch { /* swallow */ }

  return base
}

function toIso(v: unknown): string | null {
  if (v == null) return null
  // Firestore Timestamp 有 toDate()
  if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString()
  }
  if (typeof v === 'string') return v
  return null
}
