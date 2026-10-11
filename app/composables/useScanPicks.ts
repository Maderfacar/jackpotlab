/**
 * /scan 判斷勾選（2026-10-11 使用者拍板）：開獎前勾「這期我信哪幾點」，開獎後自動對答案、累積成績單。
 *
 * 存在這台裝置的瀏覽器（localStorage），不讀寫資料庫。
 * 原本規劃存 Firestore users/{uid}，但網站的 Firebase 匿名登入沒開（auth/configuration-not-found），
 * 寫不進去；兩種做法都只限同一台裝置，所以改用瀏覽器存。清除瀏覽器資料會不見。
 * 鍵 = 勾選當下「最新一期」的期號（勾的是它的下一期），下一期開出後就鎖住不能改。
 */
import { POINT_KEYS } from '~~/shared/lotto/scan/points/evaluate'
import type { PickKey } from '~~/shared/lotto/scan/points/meta'

type Picks = Record<string, PickKey[]>

const STORAGE_KEY = 'jackpotlab-scan-picks-v1'

const isPickKey = (k: unknown): k is PickKey => typeof k === 'string' && (POINT_KEYS as readonly string[]).includes(k.replace(/@h$/, ''))

export function useScanPicks() {
  const picks = ref<Picks>({})
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const errorText = ref('')

  onMounted(() => {
    try {
      const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>
      const clean: Picks = {}
      for (const [issue, list] of Object.entries(raw)) {
        if (Array.isArray(list)) clean[issue] = list.filter(isPickKey)
      }
      picks.value = clean
      status.value = 'ready'
    } catch {
      status.value = 'error'
      errorText.value = '這個瀏覽器讀不到勾選紀錄（可能是無痕模式或封鎖網站資料）'
    }
  })

  function save(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(picks.value))
      errorText.value = ''
    } catch {
      errorText.value = '勾選沒存到：這個瀏覽器不允許存資料（可能是無痕模式）'
    }
  }

  /** 切換某期（baseIssue 開完後）對某一點的勾選 */
  function toggle(baseIssue: string, key: PickKey): void {
    const cur = picks.value[baseIssue] ?? []
    const nextList = cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key]
    picks.value = { ...picks.value, [baseIssue]: nextList }
    save()
  }

  const isPicked = (baseIssue: string, key: PickKey): boolean => (picks.value[baseIssue] ?? []).includes(key)

  return { picks, status, errorText, toggle, isPicked }
}
