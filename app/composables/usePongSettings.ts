/**
 * /gapfilter 碰數小工具的設定（連碰 / 立柱選號、每碰金額、賠率、另退本金），存在這台裝置的瀏覽器。
 */
import { DEFAULT_PONG, type PongSettings } from '~~/shared/lotto/filter/pong'

const STORAGE_KEY = 'jackpotlab-pong-v1'

const fresh = (): PongSettings => ({ ...DEFAULT_PONG, nums: [], columns: DEFAULT_PONG.columns.map(() => []), stake: [...DEFAULT_PONG.stake], odds: [...DEFAULT_PONG.odds] })

const validNums = (x: unknown): number[] =>
  Array.isArray(x) ? [...new Set(x.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 39))] : []
const nonNeg = (x: unknown, fallback: number[]): number[] =>
  fallback.map((v, i) => {
    const n = Array.isArray(x) ? Number(x[i]) : Number.NaN
    return Number.isFinite(n) && n >= 0 ? n : v
  })

function restore(raw: unknown): PongSettings | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<PongSettings>
  const d = fresh()
  const columns = Array.isArray(r.columns) ? r.columns.map(validNums) : d.columns
  return {
    mode: r.mode === 'column' ? 'column' : 'chain',
    nums: validNums(r.nums),
    columns: columns.length ? columns : d.columns,
    stake: nonNeg(r.stake, d.stake),
    odds: nonNeg(r.odds, d.odds),
    returnStake: typeof r.returnStake === 'boolean' ? r.returnStake : d.returnStake
  }
}

export function usePongSettings() {
  const settings = ref<PongSettings>(fresh())
  onMounted(() => {
    try {
      const restored = restore(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
      if (restored) settings.value = restored
    } catch {
      // 讀不到就用預設
    }
  })
  watch(settings, (v) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
    } catch {
      // 無痕模式等存不了，不影響使用
    }
  }, { deep: true })
  const resetPong = () => {
    settings.value = fresh()
  }
  return { settings, resetPong }
}
