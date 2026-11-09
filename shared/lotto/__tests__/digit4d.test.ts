/**
 * 四星彩盤面（shared/lotto/digit4d）與三星／四星歷史檔（shared/lotto/digit-history.ts）。
 */
import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { normalizeDigitDraw } from '../digit-games'
import { mergeDigitDraws, parseDigitHistory, type DigitPlainDraw } from '../digit-history'
import { anyDigitLast, boardOf } from '../digit4d/board'
import { gapTable, percentiles, weekdayChanges } from '../digit4d/dist'
import { rareItems } from '../digit4d/rare'
import { segmentBounds } from '../digit4d/segments'
import { buildSteps, levelBox, shapeOf } from '../digit4d/state'

const draw = (i: number, digits: number[], date = '2020-01-06'): DigitPlainDraw => ({ issue: String(100 + i), date, digits })

describe('normalizeDigitDraw', () => {
  it('照開出順序存、不排序、可重複', () => {
    const d = normalizeDigitDraw('lotto4d', { period: 115000270, lotteryDate: '2026-11-07T00:00:00', drawNumberAppear: [5, 3, 8, 0], sellAmount: 1 })
    assert.deepEqual(d.numbers, [5, 3, 8, 0])
    assert.equal(d.drawDate, '2026-11-07')
    assert.deepEqual(d.extras, { sellAmount: 1 })
  })
  it('數字個數或範圍不對就丟錯', () => {
    assert.throws(() => normalizeDigitDraw('lotto3d', { period: 1, lotteryDate: '2026-11-07', drawNumberAppear: [1, 2, 3, 4] }))
    assert.throws(() => normalizeDigitDraw('lotto4d', { period: 1, lotteryDate: '2026-11-07', drawNumberAppear: [1, 2, 3, 10] }))
  })
})

describe('歷史檔', () => {
  it('期號要遞增、格式不對丟錯', () => {
    assert.throws(() => parseDigitHistory('lotto4d', { game: 'lotto4d', rows: [[2, '2026-01-01', [1, 2, 3, 4]], [1, '2026-01-02', [1, 2, 3, 4]]] }))
    assert.throws(() => parseDigitHistory('lotto4d', { game: 'lotto3d', rows: [] }))
  })
  it('合併只接檔案之後的期數', () => {
    const h = [draw(1, [1, 2, 3, 4]), draw(2, [1, 2, 3, 4])]
    const m = mergeDigitDraws(h, [draw(2, [9, 9, 9, 9]), draw(3, [5, 5, 5, 5])])
    assert.deepEqual(m.map(d => d.issue), ['101', '102', '103'])
    assert.deepEqual(m[1]!.digits, [1, 2, 3, 4])
  })
})

describe('state', () => {
  it('樣子與後 k 碼', () => {
    assert.equal(shapeOf([1, 2, 3, 4]), 'distinct')
    assert.equal(shapeOf([1, 1, 2, 3]), 'pair')
    assert.equal(shapeOf([1, 1, 2, 2]), 'twoPair')
    assert.equal(shapeOf([1, 1, 1, 2]), 'triple')
    assert.equal(shapeOf([7, 7, 7, 7]), 'quad')
    assert.equal(levelBox([1, 2, 3, 4], 2), 34)
    assert.equal(levelBox([0, 0, 0, 9], 3), 9)
  })
  it('隔期、第幾新、名次的值', () => {
    const { steps } = buildSteps([draw(1, [1, 0, 0, 5]), draw(2, [2, 0, 0, 6]), draw(3, [1, 0, 0, 5])])
    // 第三期個位 5：隔期 1（中間隔一期）、開出前是第 1 新；第 1 新這個名次之前沒被開到
    assert.deepEqual(steps[2]!.pos[3], { digit: 5, gap: 1, rank: 1, rankValue: null })
    // 百位 0 連開：隔期 0、第 0 新；第 0 新上一期剛被開到 → 值 0
    assert.deepEqual(steps[2]!.pos[1], { digit: 0, gap: 0, rank: 0, rankValue: 0 })
    // 後兩碼 05 隔一期再開；四碼 1005 也是
    assert.deepEqual(steps[2]!.levelGap, [1, 1, 1, 1])
  })
  it('盤面：同一位置 10 個數字的隔期都不一樣', () => {
    const ds = Array.from({ length: 30 }, (_, i) => draw(i, [i % 10, (i * 3) % 10, (i * 7) % 10, (i * 9) % 10]))
    const { runner } = buildSteps(ds)
    const b = boardOf(runner, anyDigitLast(ds.map(d => d.digits)))
    for (const pos of b.positions) assert.equal(new Set(pos.map(r => r.gap)).size, 10)
    assert.equal(b.positions[0]![0]!.digit, 9)
    assert.equal(b.positions[0]![0]!.gap, 0)
  })
})

describe('rare / dist / segments', () => {
  it('期數太少不通報', () => {
    assert.deepEqual(rareItems([draw(1, [1, 2, 3, 4])]), [])
  })
  it('隔期表累積到 99% 之後併成一行', () => {
    const rows = gapTable([...Array<number>(99).fill(0), 50])
    assert.equal(rows.length, 2)
    assert.equal(rows[0]!.count, 99)
    assert.match(rows[1]!.gap, /^1 以上（最長 50）$/)
    assert.equal(percentiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])[4]!.gap, 6)
  })
  it('開獎星期改變（最前面 10 期只拿來認識平常的星期）', () => {
    const weekdays = ['2010-12-13', '2010-12-14', '2010-12-15', '2010-12-16', '2010-12-17', '2010-12-20', '2010-12-21', '2010-12-22', '2010-12-23', '2010-12-24', '2010-12-31', '2011-01-01', '2011-01-08']
    const { steps } = buildSteps(weekdays.map((d, i) => draw(i, [1, 2, 3, 4], d)))
    assert.deepEqual(weekdayChanges(steps), [{ date: '2011-01-01', text: '第一次在星期六開獎（這天起星期六共開了 2 期）' }])
  })
  it('依可疑日期切段', () => {
    assert.deepEqual(segmentBounds([{ t: 500, date: '', flags: [] }], 1000), [{ from: 100, to: 500 }, { from: 500, to: 1000 }])
    assert.deepEqual(segmentBounds([], 1000), [{ from: 100, to: 1000 }])
  })
})
