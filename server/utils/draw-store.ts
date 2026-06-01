import type { Firestore } from 'firebase-admin/firestore'
import { Timestamp } from 'firebase-admin/firestore'
import type { GameId } from '../../shared/lotto/games'
import type { DrawResult } from '../../shared/lotto/types'
import { tryGetAdminFirestore } from './firebase-admin'

const COLLECTION = 'draws'
const RESULTS_SUBCOLLECTION = 'results'
const LATEST_SUBCOLLECTION = 'latest'
const LATEST_DOC = 'current'

/**
 * Firestore layout:
 *   draws/{gameId}/results/{drawTerm}     ← 完整歷史，drawTerm 當 doc id
 *   draws/{gameId}/latest/current          ← 最新一期 mirror，client onSnapshot 訂閱這個
 *
 * 所有讀寫都靠 tryGetAdminFirestore — 如果 Firebase Admin 還沒設定（早期開發 / CI），
 * 讀回 null/[]，寫 no-op。整套服務退化為「直接打 taiwanlottery + 無快取」。
 */

interface StoredDrawResult extends Omit<DrawResult, 'fetchedAt'> {
  fetchedAt: Timestamp
}

function db(): Firestore | null {
  return tryGetAdminFirestore()
}

function resultDocId(drawTerm: number): string {
  return drawTerm.toString()
}

function toStored(draw: DrawResult): StoredDrawResult {
  return {
    ...draw,
    fetchedAt: Timestamp.fromDate(new Date(draw.fetchedAt))
  }
}

function fromStored(stored: StoredDrawResult): DrawResult {
  return {
    ...stored,
    fetchedAt: stored.fetchedAt.toDate().toISOString()
  }
}

/**
 * 寫入一批開獎紀錄。drawTerm 重複的會被覆蓋。
 * 同時把當批最新一期 mirror 到 latest/current。
 */
export async function upsertDraws(gameId: GameId, draws: DrawResult[]): Promise<void> {
  if (draws.length === 0) return

  const firestore = db()
  if (!firestore) return
  const batch = firestore.batch()
  const resultsCol = firestore.collection(COLLECTION).doc(gameId).collection(RESULTS_SUBCOLLECTION)

  for (const draw of draws) {
    const ref = resultsCol.doc(resultDocId(draw.drawTerm))
    batch.set(ref, toStored(draw))
  }

  await batch.commit()

  const highest = draws.reduce((a, b) => (a.drawTerm > b.drawTerm ? a : b))
  await firestore
    .collection(COLLECTION).doc(gameId)
    .collection(LATEST_SUBCOLLECTION).doc(LATEST_DOC)
    .set(toStored(highest))
}

/** 拉最新一期（讀 latest/current 鏡像 doc）。 */
export async function getLatest(gameId: GameId): Promise<DrawResult | null> {
  const firestore = db()
  if (!firestore) return null
  const snap = await firestore
    .collection(COLLECTION).doc(gameId)
    .collection(LATEST_SUBCOLLECTION).doc(LATEST_DOC)
    .get()
  if (!snap.exists) return null
  return fromStored(snap.data() as StoredDrawResult)
}

/** 用日期查（drawDate 必須 YYYY-MM-DD）。賓果賓果同日會回多筆。 */
export async function getByDate(gameId: GameId, drawDate: string): Promise<DrawResult[]> {
  const firestore = db()
  if (!firestore) return []
  const snap = await firestore
    .collection(COLLECTION).doc(gameId)
    .collection(RESULTS_SUBCOLLECTION)
    .where('drawDate', '==', drawDate)
    .orderBy('drawTerm', 'desc')
    .get()
  return snap.docs.map(d => fromStored(d.data() as StoredDrawResult))
}

/** 用期號查單筆。 */
export async function getByDrawTerm(gameId: GameId, drawTerm: number): Promise<DrawResult | null> {
  const firestore = db()
  if (!firestore) return null
  const snap = await firestore
    .collection(COLLECTION).doc(gameId)
    .collection(RESULTS_SUBCOLLECTION).doc(resultDocId(drawTerm))
    .get()
  if (!snap.exists) return null
  return fromStored(snap.data() as StoredDrawResult)
}

/** 取最近 N 期，drawTerm 由新到舊。 */
export async function getRecent(gameId: GameId, limit: number): Promise<DrawResult[]> {
  const firestore = db()
  if (!firestore) return []
  const snap = await firestore
    .collection(COLLECTION).doc(gameId)
    .collection(RESULTS_SUBCOLLECTION)
    .orderBy('drawTerm', 'desc')
    .limit(limit)
    .get()
  return snap.docs.map(d => fromStored(d.data() as StoredDrawResult))
}
