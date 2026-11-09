/**
 * /4d 的資料：四星彩、三星彩歷史檔 + 檔案之後的新期數（/api/digit/{id}/since），全部在瀏覽器算。
 */
import type { DigitGameId } from '~~/shared/lotto/digit-games'
import { digitHistoryPath, mergeDigitDraws, parseDigitHistory, type DigitPlainDraw } from '~~/shared/lotto/digit-history'
import { anyDigitLast, boardOf } from '~~/shared/lotto/digit4d/board'
import { rareItems } from '~~/shared/lotto/digit4d/rare'
import { findSegments, segmentBounds } from '~~/shared/lotto/digit4d/segments'
import { buildSteps } from '~~/shared/lotto/digit4d/state'

interface SinceResponse { results: { drawTerm: number, drawDate: string, numbers: number[] }[], officialError?: string }

async function loadGame(id: DigitGameId): Promise<{ draws: DigitPlainDraw[], warning: string }> {
  const history = parseDigitHistory(id, await $fetch(digitHistoryPath(id)))
  let newer: DigitPlainDraw[] = []
  let warning = ''
  try {
    const res = await $fetch<SinceResponse>(`/api/digit/${id}/since`, { query: { after: history.at(-1)?.issue ?? '0' } })
    newer = res.results.map(r => ({ issue: String(r.drawTerm), date: r.drawDate, digits: [...r.numbers] }))
    if (res.officialError) warning = `官方最新期讀取失敗（${res.officialError}），只顯示資料庫已有的期數`
  } catch (e: unknown) {
    warning = `新期數讀取失敗（${e instanceof Error ? e.message : '未知錯誤'}），只顯示歷史檔到 ${history.at(-1)?.date ?? ''}`
  }
  return { draws: mergeDigitDraws(history, newer), warning }
}

export function useDigit4d() {
  const { data, status, error } = useAsyncData('digit4d-draws', async () => {
    const [d4, d3] = await Promise.all([loadGame('lotto4d'), loadGame('lotto3d')])
    return { d4: d4.draws, d3: d3.draws, warnings: [d4.warning, d3.warning].filter(Boolean) }
  }, { server: false })

  const draws = computed(() => data.value?.d4 ?? [])
  const built = computed(() => buildSteps(draws.value))
  const steps = computed(() => built.value.steps)
  const board = computed(() => boardOf(built.value.runner, anyDigitLast(draws.value.map(d => d.digits))))
  const rare = computed(() => rareItems(draws.value))
  // 時間分段要打亂比較幾百次，只在打開分段／分佈分頁時才算（computed 用到才算）
  const segments = computed(() => findSegments(steps.value, data.value?.d3 ?? []))
  const bounds = computed(() => segmentBounds(segments.value.suspects, steps.value.length))
  const latest3 = computed(() => data.value?.d3.at(-1) ?? null)

  return { data, status, error, draws, steps, board, rare, segments, bounds, latest3 }
}

export const digitPct = (x: number, digits = 1): string => `${(x * 100).toFixed(digits)}%`
