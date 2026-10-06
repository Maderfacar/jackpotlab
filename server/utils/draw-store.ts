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

/** 資料可靠度：官方完整 2 > 官方號碼 1 > 第三方 0。 */
function rank(draw: Pick<DrawResult, 'provisional'>): number {
  if (draw.provisional === 'thirdparty') return 0
  if (draw.provisional === 'numbers') return 1
  return 2
}

/**
 * 寫入一批開獎紀錄。drawTerm 重複的會被覆蓋。
 * latest/current 只在這次 batch 的最高期 > 現存 latest 時才更新（避免 backfill
 * 把舊 batch 的「該批最高」蓋過真正的最新）；同一期則只允許初步結果升級成官方。
 */
export async function upsertDraws(gameId: GameId, draws: DrawResult[]): Promise<void> {
  if (draws.length === 0) return

  const firestore = db()
  if (!firestore) return
  const batch = firestore.batch()
  const resultsCol = firestore.collection(COLLECTION).doc(gameId).collection(RESULTS_SUBCOLLECTION)

  const provisional = draws.filter(d => d.provisional)
  for (const draw of draws) {
    if (draw.provisional) continue
    const ref = resultsCol.doc(resultDocId(draw.drawTerm))
    batch.set(ref, toStored(draw))
  }

  await batch.commit()

  // 初步結果不可蓋掉已存在的官方完整紀錄（cron 與開站補抓可能同時寫）
  for (const draw of provisional) {
    const ref = resultsCol.doc(resultDocId(draw.drawTerm))
    await firestore.runTransaction(async (t) => {
      const snap = await t.get(ref)
      if (snap.exists && rank(snap.data() as StoredDrawResult) > rank(draw)) return
      t.set(ref, toStored(draw))
    })
  }

  const highestInBatch = draws.reduce((a, b) => (a.drawTerm > b.drawTerm ? a : b))
  const latestRef = firestore
    .collection(COLLECTION).doc(gameId)
    .collection(LATEST_SUBCOLLECTION).doc(LATEST_DOC)

  await firestore.runTransaction(async (t) => {
    const snap = await t.get(latestRef)
    const existing = snap.exists ? (snap.data() as StoredDrawResult) : null
    const existingDrawTerm = existing?.drawTerm ?? 0
    // 同一期：只允許往更可靠的等級升級（第三方 → 官方號碼 → 官方完整）
    const upgradesSameTerm = existing != null
      && highestInBatch.drawTerm === existingDrawTerm
      && rank(highestInBatch) > rank(existing)
    if (highestInBatch.drawTerm > existingDrawTerm || upgradesSameTerm) {
      t.set(latestRef, toStored(highestInBatch))
    }
  })
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
