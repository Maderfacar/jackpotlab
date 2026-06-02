/**
 * 隔期狀態分析引擎（純函式 / immutable）
 *
 * Ported 539.htm 的 PeriodTable 邏輯。所有 function 回傳新 state；
 * 禁止 mutate 傳入的 state。
 *
 * 對齊 reference/539.htm（commit `cadf635` 之後）：
 *   - 首筆放 slot[n-1]
 *   - step c shift right 只搬 descriptor (issue/date/dateDay/prizes/hasEverMatched)，
 *     `record` 與 `period` 留在原 slot
 *   - step d 不重置 slot[0].record（保留 step b 算出來的值）
 *   - updateRecord 完全照 539.htm（含 filter(Boolean)）
 *   - 「獎號關聯」總和 = 該期所有 foundIdx 加總；全 0 顯示 ''
 *
 * 與 539.htm 唯一仍有差異：history 為了相容於前一輪 spec 採 merged single entry
 * per draw（539.htm 是 periods-entry + tailEntry 拆兩筆 push）。
 * 顯示端的 filter 條件等價，使用者觀察不到差別。
 */

export interface AnalysisPeriod {
  period: number
  issue: string
  date: string
  dateDay: number | null
  prizes: number[]
  record: string
  hasEverMatched: boolean
}

export interface HistoryEntry {
  issue: string
  date: string
  prizes: string
  tails: number[]
  periods?: string
  /** 539.htm: `periods.filter(n => n !== '').reduce(+) || ''` — 可能是正數或空字串。 */
  sum?: number | ''
  values?: string
  positions?: string
}

export interface AnalysisState {
  v: 2
  gameId: string
  n: number
  lastProcessedTerm: number | null
  periods: AnalysisPeriod[]
  history: HistoryEntry[]
}

export interface AnalysisDrawInput {
  drawTerm: number
  drawDate: string
  prizes: number[]
}

const STORAGE_PREFIX = 'jackpotlab-analysis'

export function stateKey(gameId: string, n: number): string {
  return `${STORAGE_PREFIX}-${gameId}-v2-n${n}`
}

export function createInitialState(gameId: string, n: number): AnalysisState {
  const periods: AnalysisPeriod[] = []
  for (let i = 0; i < n; i++) {
    periods.push({
      period: i,
      issue: '',
      date: '',
      dateDay: null,
      prizes: [],
      record: '',
      hasEverMatched: false
    })
  }
  return {
    v: 2,
    gameId,
    n,
    lastProcessedTerm: null,
    periods,
    history: []
  }
}

function parseDateDay(date: string): number | null {
  if (!date || date.length < 10) return null
  const day = Number.parseInt(date.slice(8, 10), 10)
  return Number.isFinite(day) ? day : null
}

function computeTails(prizes: number[]): number[] {
  const counts: number[] = new Array(10).fill(0)
  for (const p of prizes) {
    const idx = ((p % 10) + 10) % 10
    counts[idx] = (counts[idx] ?? 0) + 1
  }
  return counts
}

function parseLeftValue(record: string): number {
  if (!record) return 0
  const first = record.split(',')[0]
  if (first === undefined || first === '') return 0
  const v = Number.parseInt(first, 10)
  return Number.isFinite(v) ? v : 0
}

/**
 * 539.htm:246-257 updateRecord — 完全照搬：
 *   hasMatch=true  → `0,${recordStr}`（即使 recordStr 為空也是 '0,'，保留 trailing comma）
 *   hasMatch=false → split + filter(Boolean) + 首位 +1；無項時回 '1'
 */
function updateRecord(recordStr: string, hasMatch: boolean): string {
  if (hasMatch) {
    return `0,${recordStr}`
  }
  const parts = recordStr ? recordStr.split(',').filter(Boolean) : []
  if (parts.length === 0) {
    return '1'
  }
  const first = Number.parseInt(parts[0]!, 10)
  parts[0] = String((Number.isFinite(first) ? first : 0) + 1)
  return parts.join(',')
}

export function processDraw(state: AnalysisState, draw: AnalysisDrawInput): AnalysisState {
  const n = state.n
  const newPrizes = [...draw.prizes].sort((a, b) => a - b)
  const newPrizesSet = new Set(newPrizes)
  const dateDay = parseDateDay(draw.drawDate)
  const tails = computeTails(newPrizes)
  const issue = String(draw.drawTerm)
  const date = draw.drawDate

  const isEmpty = state.periods.every(p => !p.issue)

  if (isEmpty) {
    // 539.htm: this.periods[lastIdx] = { ...new desc }。其他 slot 不動（record 也不動）。
    const lastIdx = n - 1
    const newPeriods: AnalysisPeriod[] = state.periods.map((p, i) => i === lastIdx
      ? {
          ...p,
          issue,
          date,
          dateDay,
          prizes: [...newPrizes],
          hasEverMatched: dateDay != null && newPrizesSet.has(dateDay)
        }
      : p)
    return {
      ...state,
      lastProcessedTerm: draw.drawTerm,
      periods: newPeriods,
      history: [
        ...state.history,
        { issue, date, prizes: newPrizes.join(','), tails }
      ]
    }
  }

  // Step a: tempPrizes per row。掃描 i = n-1 → 0 找第一個含 p 的 slot。
  const tempPrizes: number[][] = state.periods.map(p => [...p.prizes])
  const periodsCsv: string[] = []
  const valuesCsv: string[] = []
  const positionsCsv: string[] = []

  for (const p of newPrizes) {
    let foundIdx = -1
    for (let i = n - 1; i >= 0; i--) {
      const tp = tempPrizes[i]
      if (tp && tp.includes(p)) {
        foundIdx = i
        break
      }
    }
    if (foundIdx === -1) {
      periodsCsv.push('')
      valuesCsv.push('')
      positionsCsv.push('')
      continue
    }
    const row = state.periods[foundIdx]!
    const leftVal = parseLeftValue(row.record)
    const remaining = tempPrizes[foundIdx]!.length
    const sortedSnapshot = [...tempPrizes[foundIdx]!].sort((a, b) => a - b)
    const origPos = sortedSnapshot.indexOf(p) + 1

    periodsCsv.push(String(foundIdx))
    valuesCsv.push(String(leftVal))
    positionsCsv.push(`${remaining}-${origPos}`)

    tempPrizes[foundIdx] = tempPrizes[foundIdx]!.filter(x => x !== p)
  }

  // Step b: 每個 slot 跑一次 — 更新該 slot 的 record + 真實扣掉中獎號。
  const stepB: AnalysisPeriod[] = state.periods.map((row) => {
    let hasMatch = false
    const toRemove: number[] = []
    if (row.prizes.length > 0) {
      for (const p of newPrizesSet) {
        if (row.prizes.includes(p)) {
          toRemove.push(p)
          hasMatch = true
        }
      }
    }
    const newRowPrizes = hasMatch ? row.prizes.filter(x => !toRemove.includes(x)) : row.prizes
    return {
      ...row,
      prizes: newRowPrizes,
      record: updateRecord(row.record, hasMatch)
    }
  })

  // Step c: shift right — 只搬 descriptor (issue/date/dateDay/prizes/hasEverMatched)。
  // record + period 留在原 slot。
  const shifted: AnalysisPeriod[] = new Array<AnalysisPeriod>(n)
  for (let i = n - 1; i >= 1; i--) {
    const src = stepB[i - 1]!
    const own = stepB[i]!
    shifted[i] = {
      period: i,
      issue: src.issue,
      date: src.date,
      dateDay: src.dateDay,
      prizes: [...src.prizes],
      hasEverMatched: src.hasEverMatched,
      record: own.record
    }
  }
  // Step d: slot[0] 給新 desc；record 保留 stepB[0]（不重置）。
  shifted[0] = {
    period: 0,
    issue,
    date,
    dateDay,
    prizes: [...newPrizes],
    hasEverMatched: dateDay != null && newPrizesSet.has(dateDay),
    record: stepB[0]!.record
  }

  // 539.htm: `const sum = periods.filter(n => n !== '').reduce((a, b) => a + parseInt(b), 0) || '';`
  const sumNum = periodsCsv
    .filter(x => x !== '')
    .reduce((a, b) => a + Number.parseInt(b, 10), 0)
  const sum: number | '' = sumNum > 0 ? sumNum : ''

  return {
    ...state,
    lastProcessedTerm: draw.drawTerm,
    periods: shifted,
    history: [
      ...state.history,
      {
        issue,
        date,
        prizes: newPrizes.join(','),
        tails,
        periods: periodsCsv.join(','),
        sum,
        values: valuesCsv.join(','),
        positions: positionsCsv.join(',')
      }
    ]
  }
}

export function hydrateFromDraws(
  gameId: string,
  n: number,
  drawsAsc: AnalysisDrawInput[]
): AnalysisState {
  let s = createInitialState(gameId, n)
  for (const draw of drawsAsc) {
    s = processDraw(s, draw)
  }
  return s
}

export function applyNewDraws(state: AnalysisState, drawsAsc: AnalysisDrawInput[]): AnalysisState {
  const lastTerm = state.lastProcessedTerm
  const newDraws = lastTerm == null
    ? drawsAsc
    : drawsAsc.filter(d => d.drawTerm > lastTerm)
  let s = state
  for (const draw of newDraws) {
    s = processDraw(s, draw)
  }
  return s
}

export function loadState(gameId: string, n: number): AnalysisState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(stateKey(gameId, n))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AnalysisState>
    if (!parsed || parsed.v !== 2 || parsed.gameId !== gameId || parsed.n !== n) return null
    if (!Array.isArray(parsed.periods) || !Array.isArray(parsed.history)) return null
    return parsed as AnalysisState
  } catch {
    return null
  }
}

export function saveState(state: AnalysisState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(stateKey(state.gameId, state.n), JSON.stringify(state))
  } catch {
    // localStorage quota / disabled — swallow
  }
}

/** D 灌入深度的 per-game preferences。 */
export function defaultD(gameId: string): number {
  return gameId === 'bingo_bingo' ? 500 : 300
}

export function defaultN(): number {
  return 60
}

export function clampD(d: number): number {
  if (!Number.isFinite(d)) return 300
  return Math.max(1, Math.min(5000, Math.floor(d)))
}

export function clampN(n: number): number {
  if (!Number.isFinite(n)) return 60
  return Math.max(1, Math.min(200, Math.floor(n)))
}

/** 平均（用於「記錄」cell 紅字判斷）。 */
export function averageOfCsvFirst(periods: AnalysisPeriod[]): number {
  if (periods.length === 0) return 0
  let total = 0
  let count = 0
  for (const p of periods) {
    const first = parseLeftValue(p.record)
    if (p.record !== '') {
      total += first
      count++
    }
  }
  return count === 0 ? 0 : total / count
}
