/**
 * 波段均值（app/utils/wave.ts、wave-series.ts）。
 * docs/wave/wave.json 已用 Python 照定義獨立重算核對過，這裡確保程式結果不跑掉。
 */
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import type { HistoryFile } from '../../../shared/lotto/history-file'
import { hydrateFromDraws } from '../analysis'
import { buildWaveContext, computeWave, rowAt, type WaveResult } from '../wave'
import { predictAverages, trendOf } from '../wave-series'

const file = JSON.parse(readFileSync('public/data/lotto539-history.json', 'utf8')) as HistoryFile
const draws = file.rows.map(([drawTerm, drawDate, prizes]) => ({ drawTerm, drawDate, prizes }))

describe('predictAverages', () => {
  it('隔期格：輸入的數字就是目前這段等待最後的期數，加進最新一個', () => {
    // 目前已等 2，往前 1,2,3,4,0,…；輸入 3 → 5 個 = (3+1+2+3+4)/5
    const recent = [1, 2, 3, 4, 0, 1, 6, 1, 1, 0, 1, 0, 8, 0, 3]
    const p = predictAverages(true, 2, recent, 100, 50, 3)!
    assert.equal(p[0], 13 / 5)
    assert.equal(p[1], (3 + 1 + 2 + 3 + 4 + 0 + 1 + 6 + 1 + 1) / 10)
    assert.equal(p[3], 103 / 51)
  })

  it('隔期格：輸入比目前已等的還小 → 不可能，回 null', () => {
    assert.equal(predictAverages(true, 5, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], 10, 5, 4), null)
  })

  it('第 1～5 顆：目前那個也算進平均，再加上輸入的數字', () => {
    const recent = [4, 1, 0, 2, 3, 11, 2, 6, 7, 0, 4, 0, 2, 19, 0]
    const p = predictAverages(false, 0, recent, 900, 100, 5)!
    assert.equal(p[0], (5 + 0 + 4 + 1 + 0) / 5)
    assert.equal(p[3], (900 + 0 + 5) / 102)
  })
})

describe('computeWave', () => {
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

describe('走勢：過去某一期的狀態', () => {
  const ctx = buildWaveContext(draws)!

  for (const term of [110000150, 113000222]) {
    it(`第 ${term} 期的狀態 = 只拿到那一期為止的資料重算（不偷看未來）`, () => {
      const t = draws.findIndex(d => d.drawTerm === term)
      const alone = computeWave(draws.slice(0, t + 1))!
      for (const k of ['gap', 'gapBall', 'value'] as const) {
        assert.deepEqual(ctx[k].map(s => rowAt(s, t)), alone[k])
      }
    })
  }

  it('trendOf 每一期的平均與 rowAt 一致', () => {
    const last = draws.length - 1
    const points = trendOf(ctx.gap[4]!, last - 30, last)
    assert.equal(points.length, 31)
    for (const p of points) {
      const row = rowAt(ctx.gap[4]!, p.t)!
      assert.equal(p.current, row.current)
      p.avgs.forEach((a, k) => assert.ok(Math.abs(a! - row.avgs[k]!.avg) < 1e-9))
    }
  })
})
