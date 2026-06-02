/**
 * 隔期狀態分析引擎（純函式 / immutable）
 *
 * Ported 539.htm 的 PeriodTable 邏輯。所有 function 回傳新 state；
 * 禁止 mutate 傳入的 state。
 *
 * 規格 deviation 註記：
 *   spec step 2 寫「首筆放 index n-1」，但 spec step c shift right
 *   (`periods[i] = periods[i-1]`, i=n-1→1) 與 step d (`periods[0] = 新 entry`)
 *   會讓首筆在第二筆即被覆蓋。實作以 index 0 為準，與 shift / step d 一致。
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
  sum?: number
  values?: string
  positions?: string
}

export interface AnalysisState {
  v: 1
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
  return `${STORAGE_PREFIX}-${gameId}-v1-n${n}`
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
    v: 1,
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

export function processDraw(state: AnalysisState, draw: AnalysisDrawInput): AnalysisState {
  const n = state.n
  const newPrizes = [...draw.prizes].sort((a, b) => a - b)
  const newPrizesSet = new Set(newPrizes)
  const dateDay = parseDateDay(draw.drawDate)
  const tails = computeTails(newPrizes)
  const issue = String(draw.drawTerm)
  const date = draw.drawDate

  if (state.lastProcessedTerm == null) {
    const newPeriods: AnalysisPeriod[] = state.periods.map((p, i) => i === 0
      ? {
          period: 0,
          issue,
          date,
          dateDay,
          prizes: [...newPrizes],
          record: '',
          hasEverMatched: dateDay != null && newPrizesSet.has(dateDay)
        }
      : { ...p, period: i })
    const history: HistoryEntry[] = [
      ...state.history,
      {
        issue,
        date,
        prizes: newPrizes.join(','),
        tails
      }
    ]
    return {
      ...state,
      lastProcessedTerm: draw.drawTerm,
      periods: newPeriods,
      history
    }
  }

  // Step a: per-row tempPrizes snapshot for multi-prize-same-row accounting
  const tempPrizes: number[][] = state.periods.map(p => [...p.prizes])
  const periodsCsv: string[] = []
  const valuesCsv: string[] = []
  const positionsCsv: string[] = []
  let sum = 0

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
    sum += leftVal

    tempPrizes[foundIdx] = tempPrizes[foundIdx]!.filter(x => x !== p)
  }

  // Step b: update REAL state.periods — every row gets hasMatch / record / prizes update
  const updatedPeriods: AnalysisPeriod[] = state.periods.map((row) => {
    const hasMatch = row.prizes.some(x => newPrizesSet.has(x))
    let newRecord: string
    if (hasMatch) {
      newRecord = row.record === '' ? '0' : '0,' + row.record
    } else if (row.record === '') {
      newRecord = '1'
    } else {
      const parts = row.record.split(',')
      const first = Number.parseInt(parts[0] ?? '0', 10)
      parts[0] = String((Number.isFinite(first) ? first : 0) + 1)
      newRecord = parts.join(',')
    }
    const newRowPrizes = hasMatch ? row.prizes.filter(x => !newPrizesSet.has(x)) : row.prizes
    return {
      ...row,
      prizes: newRowPrizes,
      record: newRecord
    }
  })

  // Step c: shift right (newest stays at index 0, oldest pushed off at n-1)
  const shifted: AnalysisPeriod[] = new Array<AnalysisPeriod>(n)
  for (let i = n - 1; i >= 1; i--) {
    shifted[i] = updatedPeriods[i - 1]!
  }
  shifted[0] = {
    period: 0,
    issue,
    date,
    dateDay,
    prizes: [...newPrizes],
    record: '',
    hasEverMatched: dateDay != null && newPrizesSet.has(dateDay)
  }

  // Step 4: renumber
  const finalPeriods = shifted.map((p, i) => ({ ...p, period: i }))

  const history: HistoryEntry[] = [
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

  return {
    ...state,
    lastProcessedTerm: draw.drawTerm,
    periods: finalPeriods,
    history
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
    if (!parsed || parsed.v !== 1 || parsed.gameId !== gameId || parsed.n !== n) return null
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
