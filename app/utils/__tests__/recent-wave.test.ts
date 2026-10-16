/**
 * 近期波段（app/utils/recent-wave.ts、recent-wave-text.ts）。
 * 固定用到第 115000250 期的資料（2026-10-16 對話中逐項核對過的數字），歷史檔之後變長也不會跑掉。
 */
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import type { HistoryFile } from '../../../shared/lotto/history-file'
import { hydrateFromDraws } from '../analysis'
import { analyzeRecentWave, recentWaveDraws, type RecentWave } from '../recent-wave'
import { recentWaveText } from '../recent-wave-text'

const LAST = 115000250
const file = JSON.parse(readFileSync('public/data/lotto539-history.json', 'utf8')) as HistoryFile
const draws = file.rows
  .filter(([t]) => t <= LAST)
  .map(([drawTerm, drawDate, prizes]) => ({ drawTerm, drawDate, prizes }))
const waveDraws = recentWaveDraws(draws)

function must(kind: 'y' | 'value', key: number): RecentWave {
  const r = analyzeRecentWave(waveDraws, kind, key)
  assert.ok(r, `${kind}=${key} 應有結果`)
  return r
}

describe('recentWaveDraws', () => {
  // 最前面幾期 analysis.ts 的盤面還沒排好（第一期放在最後一格），兩邊不同；統計本來就去掉前 100 期
  it('第 101 期起，每期的 y、值與 analysis.ts（/draws 的位置、數值欄）逐期一致', () => {
    const history = hydrateFromDraws('lotto539', 60, draws).history
    assert.equal(history.length, waveDraws.length)
    history.forEach((h, i) => {
      if (i < 100) return
      const values = (h.values ?? '').split(',').filter(x => x !== '').map(Number)
      const ys = (h.positions ?? '').split(',').filter(x => x !== '').map(p => Number(p.split('-')[1]))
      assert.deepEqual(waveDraws[i]!.values, values, `第 ${h.issue} 期值`)
      assert.deepEqual(waveDraws[i]!.ys, ys, `第 ${h.issue} 期 y`)
    })
  })
})

describe('analyzeRecentWave（第 250 期開完）', () => {
  it('y=1：看 3 期，高 ≥9、低 ≤6，合計 8、10、9 在高波段', () => {
    const r = must('y', 1)
    assert.equal(r.w, 3)
    assert.equal(r.hi, 9)
    assert.equal(r.lo, 6)
    assert.deepEqual(r.lastSums, [8, 10, 9])
    assert.equal(r.zone, '高')
    assert.equal(r.latest.count, 2)
  })

  it('值 2：看 12 期，合計 15、14、14 在高波段；同盤面全史 577 次', () => {
    const r = must('value', 2)
    assert.equal(r.w, 12)
    assert.equal(r.hi, 10)
    assert.equal(r.lo, 4)
    assert.deepEqual(r.lastSums, [15, 14, 14])
    assert.equal(r.sameAll.total, 577)
    assert.equal(r.sameYear.total, 23)
    assert.deepEqual(r.next.options.slice(0, 3).map(o => o.sum), [12, 13, 14])
  })

  it('值 1：值總和 2 <10，有影響，推估改用 164 次那組', () => {
    const r = must('value', 1)
    assert.equal(r.zone, '中')
    assert.equal(r.sameAll.total, 1041)
    assert.equal(r.valueSum!.now, 2)
    assert.equal(r.valueSum!.effect, 'strong')
    assert.equal(r.valueSum!.low.total, 164)
    assert.equal(r.forecastDist.total, 164)
  })

  it('值 4：已 5 期沒開，低波段；值總和沒有影響', () => {
    const r = must('value', 4)
    assert.equal(r.zone, '低')
    assert.deepEqual(r.lastSeen, { issue: '115000245', ago: 5 })
    assert.equal(r.sameAll.total, 1169)
    assert.equal(r.valueSum!.effect, 'none')
  })
})

describe('recentWaveText', () => {
  it('值 3 的下一期開完：寫出範圍、移出哪期幾顆、開幾顆 → 合計幾顆', () => {
    const forecast = recentWaveText(must('value', 3)).find(s => s.forecast)!
    assert.equal(forecast.lines[0], '範圍變成 235～251 期，234 期那 1 顆移出。')
    assert.match(forecast.bullets[0]!, /^251 期開 0 顆 → 7 顆；開 1 顆 → 8 顆，都還在中間/)
    assert.match(forecast.bullets[1]!, /^開 2 顆以上 → 9 顆以上，進高波段（約 \d+%）/)
  })

  it('目前盤面寫出第幾期開了幾顆，0 顆時寫最近一次開出', () => {
    const now = recentWaveText(must('value', 5))[0]!
    assert.equal(now.lines[0], '250 期有 0 顆的值是 5。')
    assert.equal(now.lines[2], '最近一次開出是 244 期，已經 6 期沒開。')
  })
})
