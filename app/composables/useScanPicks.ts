/**
 * /scan 判斷勾選（2026-10-11 使用者拍板）：開獎前勾「這期我信哪幾點」，開獎後自動對答案、累積成績單。
 *
 * 存在 Firestore users/{uid}/scanPicks/lotto539（firestore.rules：只有本人可讀寫）。
 * 一份文件放全部勾選：開頁讀 1 次、每次改動寫 1 次（延遲合併），量很小。
 * 鍵 = 勾選當下「最新一期」的期號（勾的是它的下一期），下一期開出後就鎖住不能改。
 */
import { doc, getDoc, setDoc } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { POINT_KEYS, type PointKey } from '~~/shared/lotto/scan/points/evaluate'

type Picks = Record<string, PointKey[]>

const SAVE_DELAY_MS = 800

const isPointKey = (k: unknown): k is PointKey => typeof k === 'string' && (POINT_KEYS as readonly string[]).includes(k)

export function useScanPicks() {
  const { $firebase } = useNuxtApp()
  const user = useState<User | null>('firebase-user', () => null)
  const picks = ref<Picks>({})
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const errorText = ref('')
  let timer: ReturnType<typeof setTimeout> | null = null

  const ref539 = (uid: string) => doc($firebase.firestore, 'users', uid, 'scanPicks', 'lotto539')

  async function load(uid: string): Promise<void> {
    status.value = 'loading'
    try {
      const snap = await getDoc(ref539(uid))
      const raw = (snap.exists() ? snap.data().picks : null) as Record<string, unknown> | null
      const clean: Picks = {}
      for (const [issue, list] of Object.entries(raw ?? {})) {
        if (Array.isArray(list)) clean[issue] = list.filter(isPointKey)
      }
      picks.value = clean
      status.value = 'ready'
    } catch (error: unknown) {
      status.value = 'error'
      errorText.value = error instanceof Error ? error.message : '讀取失敗'
    }
  }

  watch(() => user.value?.uid, (uid) => {
    if (uid) load(uid)
  }, { immediate: true })

  function save(): void {
    if (timer) clearTimeout(timer)
    timer = setTimeout(async () => {
      const uid = user.value?.uid
      if (!uid) return
      try {
        await setDoc(ref539(uid), { picks: picks.value, updatedAt: new Date().toISOString() })
        errorText.value = ''
      } catch (error: unknown) {
        errorText.value = `勾選沒存到：${error instanceof Error ? error.message : '未知錯誤'}`
      }
    }, SAVE_DELAY_MS)
  }

  /** 切換某期（baseIssue 開完後）對某一點的勾選 */
  function toggle(baseIssue: string, key: PointKey): void {
    const cur = picks.value[baseIssue] ?? []
    const nextList = cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key]
    picks.value = { ...picks.value, [baseIssue]: nextList }
    save()
  }

  const isPicked = (baseIssue: string, key: PointKey): boolean => (picks.value[baseIssue] ?? []).includes(key)

  return { picks, status, errorText, toggle, isPicked }
}
