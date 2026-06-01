import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth, type User } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

interface FirebaseServices {
  app: FirebaseApp
  auth: Auth
  firestore: Firestore
}

export default defineNuxtPlugin(async (nuxtApp) => {
  const config = useRuntimeConfig()
  const fb = config.public.firebase

  const app: FirebaseApp = getApps().length ? getApp() : initializeApp({
    apiKey: fb.apiKey,
    authDomain: fb.authDomain,
    projectId: fb.projectId,
    storageBucket: fb.storageBucket,
    messagingSenderId: fb.messagingSenderId,
    appId: fb.appId
  })

  const auth = getAuth(app)
  const firestore = getFirestore(app)

  const user = useState<User | null>('firebase-user', () => null)

  onAuthStateChanged(auth, (next) => {
    user.value = next
  })

  // Bootstrap an anonymous session so the visitor can read/write their own
  // Firestore subtree immediately. LINE LIFF login (Phase 2) will link this
  // anonymous user to a LINE provider rather than creating a new account.
  if (!auth.currentUser) {
    try {
      await signInAnonymously(auth)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown error'
      console.warn('[firebase] anonymous sign-in failed:', message)
    }
  }

  const services: FirebaseServices = { app, auth, firestore }

  return {
    provide: {
      firebase: services
    }
  }
})
