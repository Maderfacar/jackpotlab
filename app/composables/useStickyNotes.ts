/**
 * /draws 便條紙（2026-10-21 使用者拍板）：一張張隨手記，存在這台裝置的瀏覽器，換裝置不會跟著走。
 */

export interface StickyNote {
  id: string
  text: string
  /** 最後修改時間（ISO） */
  updatedAt: string
}

const STORAGE_KEY = 'jackpotlab-notes-v1'

function restore(raw: unknown): StickyNote[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is StickyNote =>
    !!x && typeof x === 'object'
    && typeof (x as StickyNote).id === 'string'
    && typeof (x as StickyNote).text === 'string'
    && typeof (x as StickyNote).updatedAt === 'string'
  )
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export function useStickyNotes() {
  const notes = ref<StickyNote[]>([])
  onMounted(() => {
    try {
      notes.value = restore(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
    } catch {
      // 讀不到就從空白開始
    }
  })
  watch(notes, (v) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
    } catch {
      // 無痕模式等存不了，不影響使用
    }
  }, { deep: true })

  /** 新的一張放最上面 */
  const addNote = () => {
    notes.value = [{ id: newId(), text: '', updatedAt: new Date().toISOString() }, ...notes.value]
  }
  const updateNote = (id: string, text: string) => {
    notes.value = notes.value.map(n => (n.id === id ? { ...n, text, updatedAt: new Date().toISOString() } : n))
  }
  const removeNote = (id: string) => {
    notes.value = notes.value.filter(n => n.id !== id)
  }
  return { notes, addNote, updateNote, removeNote }
}
