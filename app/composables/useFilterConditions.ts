/**
 * /gapfilter 的條件清單：存在這台裝置的瀏覽器 localStorage。
 * 預設依 id 合併，使用者自己加的 u- 條件照存。
 */
import { DEFAULT_CONDITIONS, KIND_META, KIND_SPEC, sortByGroup, type Condition } from '~~/shared/lotto/filter/conditions'

// v2：2026-10-09 「至少 N 顆」改成「有 a～b 顆」、加獎號總和與分組，舊版設定不沿用
const STORAGE_KEY = 'jackpotlab-filter-conditions-v2'

const defaults = (): Condition[] => sortByGroup(DEFAULT_CONDITIONS.map(c => ({ ...c, p: [...c.p], nums: c.nums ? [...c.nums] : undefined })))

function restore(raw: unknown): Condition[] | null {
  if (!Array.isArray(raw)) return null
  const saved = raw.filter((x): x is Condition => !!x && typeof x.id === 'string' && typeof x.kind === 'string' && x.kind in KIND_SPEC && Array.isArray(x.p))
  const cleanP = (src: number[], fallback: number[]) => fallback.map((v, i) => (Number.isFinite(src[i]) ? src[i]! : v))
  const merged = DEFAULT_CONDITIONS.map((d) => {
    const s = saved.find(x => x.id === d.id && x.kind === d.kind)
    return s ? { ...d, enabled: !!s.enabled, p: cleanP(s.p, d.p), nums: Array.isArray(s.nums) ? s.nums.filter(Number.isFinite) : d.nums } : { ...d }
  })
  const added = saved
    .filter(x => x.id.startsWith('u-') && KIND_META[x.kind].repeatable)
    .map(x => ({ id: x.id, kind: x.kind, enabled: !!x.enabled, p: cleanP(x.p, KIND_META[x.kind].repeatable!) }))
  return sortByGroup([...merged, ...added])
}

export function useFilterConditions() {
  const conds = ref<Condition[]>(defaults())

  onMounted(() => {
    try {
      const restored = restore(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
      if (restored) conds.value = restored
    } catch {
      // 讀不到就用預設
    }
  })
  watch(conds, (v) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
    } catch {
      // 無痕模式等存不了，不影響使用
    }
  }, { deep: true })

  const resetConds = () => {
    conds.value = defaults()
  }
  return { conds, resetConds }
}
