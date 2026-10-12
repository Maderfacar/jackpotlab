/**
 * 波段均值（app/utils/wave.ts）。
 * docs/wave/wave.json 已用 Python 照定義獨立重算核對過（30 列全一致），這裡確保程式結果不跑掉。
 */
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import type { HistoryFile } from '../../../shared/lotto/history-file'
import { hydrateFromDraws } from '../analysis'
import { buildWaveRow, computeWave, type WaveResult } from '../wave'

describe('buildWaveRow', () => {
  it('目前的值大於均值才算高於（等於不算）', () => {
    const row = buildWaveRow('x', 2, [2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 9], [2, 2])
    assert.deepEqual(row.avgs.map(a => [a.label, a.avg, a.above]), [
      ['5', 2, false],
      ['10', 1.5, true],
      ['15', 1, true],
      ['歷史', 2, false]
    ])
    assert.equal(row.recent.length, 15)
  })
})

describe('computeWave', () => {
  const file = JSON.parse(readFileSync('public/data/lotto539-history.json', 'utf8')) as HistoryFile
  const draws = file.rows.map(([drawTerm, drawDate, prizes]) => ({ drawTerm, drawDate, prizes }))

  it('期數不夠回 null', () => {
    assert.equal(computeWave(draws.slice(0, 50)), null)
  })

  it('值盤面與 /draws 引擎的隔期狀態表一致（每格的值、號碼）', () => {
    const part = draws.slice(0, 700)
    const engine = hydrateFromDraws('lotto539', 60, part)
    const expected = new Map<number, number[]>()
    engine.periods.filter(p => p.prizes.length > 0).forEach((p) => {
      const value = Number(p.record.split(',')[0] || 0)
      expected.set(value, [...(expected.get(value) ?? []), ...p.prizes].sort((a, b) => a - b))
    })
    const got = computeWave(part)!.valueBoard
    assert.deepEqual(new Map(got.map(g => [g.value, g.numbers])), expected)
    assert.equal(got.reduce((n, g) => n + g.numbers.length, 0), 39)
  })

  it('115000246 盤面與已核對的 docs/wave/wave.json 一致', () => {
    const upTo = draws.filter(d => d.drawTerm <= 115000246)
    const expected = JSON.parse(readFileSync('docs/wave/wave.json', 'utf8')) as WaveResult
    assert.deepEqual(computeWave(upTo), expected)
  })
})
