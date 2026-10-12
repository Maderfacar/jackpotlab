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
import { predictNext, trendOf } from '../wave-series'

const file = JSON.parse(readFileSync('public/data/lotto539-history.json', 'utf8')) as HistoryFile
const draws = file.rows.map(([drawTerm, drawDate, prizes]) => ({ drawTerm, drawDate, prizes }))

describe('predictNext', () => {
  // 隔期 4：目前已等 2，最近 15 個（含目前）2,1,2,3,4,0,…；歷史含目前共 51 個、總和 102
  const recent = [2, 1, 2, 3, 4, 0, 1, 6, 1, 1, 0, 1, 0, 8, 0]

  it('隔期格輸入 0：下一期從這格開出，新的 0 排最前面、也算進平均', () => {
    const p = predictNext(true, 2, recent, 102, 51, 0)!
    assert.equal(p.current, 0)
    assert.equal(p.avgs[0], (0 + 2 + 1 + 2 + 3) / 5)
    assert.equal(p.avgs[1], (0 + 2 + 1 + 2 + 3 + 4 + 0 + 1 + 6 + 1) / 10)
    assert.equal(p.avgs[3], 102 / 52)
  })

  it('隔期格輸入目前 +1 以上：還沒開出，目前那個變成輸入的數字', () => {
    const p = predictNext(true, 2, recent, 102, 51, 3)!
    assert.equal(p.current, 3)
    assert.equal(p.avgs[0], (3 + 1 + 2 + 3 + 4) / 5)
    assert.equal(p.avgs[3], 103 / 51)
  })

  it('隔期格輸入 1～目前：不可能，回 null', () => {
    assert.equal(predictNext(true, 2, recent, 102, 51, 1), null)
    assert.equal(predictNext(true, 2, recent, 102, 51, 2), null)
  })

  it('第 1～5 顆：輸入的數字排最前面、算進平均', () => {
    const r = [0, 4, 1, 0, 2, 3, 11, 2, 6, 7, 0, 4, 0, 2, 19]
    const p = predictNext(false, 0, r, 900, 100, 5)!
    assert.equal(p.current, 5)
    assert.equal(p.avgs[0], (5 + 0 + 4 + 1 + 0) / 5)
    assert.equal(p.avgs[3], 905 / 101)
  })

  it('預測的平均 = 真的多開一期之後重算的平均', () => {
    // 拿 113000222 前一期當「現在」，用實際開出的下一期驗證
    const t = draws.findIndex(d => d.drawTerm === 113000222)
    const before = computeWave(draws.slice(0, t))!
    const after = computeWave(draws.slice(0, t + 1))!
    for (const k of ['gap', 'gapBall', 'value'] as const) {
      before[k].forEach((r, i) => {
        const real = after[k][i]!
        const p = predictNext(r.open, r.current, r.recent, r.histSum, r.histCount, real.current)!
        assert.ok(p, `${k} ${r.key}`)
        p.avgs.forEach((a, j) => assert.ok(Math.abs(a - real.avgs[j]!.avg) < 1e-9, `${k} ${r.key} ${j}`))
      })
    }
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
