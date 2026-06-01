import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

let firestoreInstance: Firestore | null = null
let initErrorMessage: string | null = null

/**
 * 取得 firebase-admin Firestore client。Server-only。
 *
 * 認證來源優先序：
 *  1. FIREBASE_SERVICE_ACCOUNT_JSON env var (本機 .env.local / Vercel server env)
 *  2. GOOGLE_APPLICATION_CREDENTIALS (Cloud Functions / GCP 預設)
 *  3. Application Default Credentials
 *
 * 同一個 Node 程序只 init 一次（serverless cold start 才會重來）。
 */
export function getAdminFirestore(): Firestore {
  if (firestoreInstance) return firestoreInstance

  const app = getApps().length > 0 ? getApp() : initializeAdminApp()
  firestoreInstance = getFirestore(app)
  return firestoreInstance
}

/**
 * 軟性檢查 — 在尚未設定 service account 的開發環境下，避免每個 request 都炸。
 *
 * 不光只是 catch — initializeApp() 不指定 credential 會「初始化成功」但實際 query 時才炸，
 * 所以這裡要主動檢查環境變數，沒有就直接回 null。
 */
export function tryGetAdminFirestore(): Firestore | null {
  if (firestoreInstance) return firestoreInstance
  if (initErrorMessage !== null) return null

  if (!hasAnyCredential()) {
    initErrorMessage = 'no FIREBASE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS set'
    // eslint-disable-next-line no-console
    console.warn(`[firebase-admin] disabled: ${initErrorMessage}`)
    return null
  }

  try {
    return getAdminFirestore()
  } catch (error) {
    initErrorMessage = error instanceof Error ? error.message : 'unknown'
    // eslint-disable-next-line no-console
    console.warn(`[firebase-admin] disabled: ${initErrorMessage}`)
    return null
  }
}

function hasAnyCredential(): boolean {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (sa && sa.trim().length > 0) return true
  const adc = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (adc && adc.trim().length > 0) return true
  return false
}

export function getInitErrorMessage(): string | null {
  return initErrorMessage
}

function initializeAdminApp(): App {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON

  if (serviceAccountJson && serviceAccountJson.trim().length > 0) {
    const credentials = parseServiceAccount(serviceAccountJson)
    return initializeApp({
      credential: cert(credentials),
      projectId: credentials.projectId
    })
  }

  // GOOGLE_APPLICATION_CREDENTIALS / ADC fallback (used in Cloud Functions)
  return initializeApp()
}

interface ServiceAccountKey {
  projectId: string
  clientEmail: string
  privateKey: string
}

interface RawServiceAccount {
  project_id?: string
  client_email?: string
  private_key?: string
  projectId?: string
  clientEmail?: string
  privateKey?: string
}

function parseServiceAccount(raw: string): ServiceAccountKey {
  try {
    const parsed = JSON.parse(raw) as RawServiceAccount
    const projectId = parsed.projectId ?? parsed.project_id
    const clientEmail = parsed.clientEmail ?? parsed.client_email
    const privateKeyRaw = parsed.privateKey ?? parsed.private_key
    if (!projectId || !clientEmail || !privateKeyRaw) {
      throw new Error('service account JSON missing required fields')
    }
    return {
      projectId,
      clientEmail,
      // Vercel multi-line env vars often arrive with literal \n — normalize.
      privateKey: privateKeyRaw.replace(/\\n/g, '\n')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON parse failed: ${message}`)
  }
}
