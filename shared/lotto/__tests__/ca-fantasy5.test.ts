/**
 * 加州天天樂來源解析與合併（shared/lotto/ca-fantasy5.ts）。
 * 網頁片段照 2026-10-12 實際抓到的三家格式。
 */
import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { caDrawTerm, isValidDraw, mergeSources, parseDraws } from '../ca-fantasy5'

describe('parseDraws：三家網頁格式', () => {
  it('lotterycorner 年頁', () => {
    const html = '<tr><td>December 31, 2016</td><td><span>12</span><span>22</span><span>27</span><span>35</span><span>37</span></td><td>$188,000</td></tr>'
      + '<tr><td>November 01, 2013</td><td>1</td><td>13</td><td>17</td><td>18</td><td>19</td></tr>'
    assert.deepEqual(parseDraws(html), [
      { date: '2016-12-31', nums: [12, 22, 27, 35, 37] },
      { date: '2013-11-01', nums: [1, 13, 17, 18, 19] }
    ])
  })

  it('lottery.net（最近 30 天頁中間夾 Draw Payouts）', () => {
    const html = '<div>Sunday October 11, 2026 <a>Draw Payouts</a></div><ul><li>8</li><li>18</li><li>26</li><li>27</li><li>36</li></ul>'
    assert.deepEqual(parseDraws(html), [{ date: '2026-10-11', nums: [8, 18, 26, 27, 36] }])
  })

  it('lotteryusa（月份縮寫、有星期）', () => {
    const html = '<td>Sunday, Oct 11, 2026</td><td><li>8</li><li>18</li><li>26</li><li>27</li><li>36</li></td><script>var x = "Oct 1, 2026 1 2 3 4 5"</script>'
    assert.deepEqual(parseDraws(html), [{ date: '2026-10-11', nums: [8, 18, 26, 27, 36] }])
  })

  it('只有日期沒有 5 顆號碼的不算', () => {
    assert.deepEqual(parseDraws('Next draw Oct 12, 2026 at 6:30 pm'), [])
  })
})

describe('isValidDraw', () => {
  it('5 顆、1～39、不重複', () => {
    assert.equal(isValidDraw({ date: '2026-10-11', nums: [1, 2, 3, 4, 39] }), true)
    assert.equal(isValidDraw({ date: '2026-10-11', nums: [1, 2, 3, 4, 40] }), false)
    assert.equal(isValidDraw({ date: '2026-10-11', nums: [1, 2, 3, 4, 4] }), false)
    assert.equal(isValidDraw({ date: '2026-10-11', nums: [1, 2, 3, 4] }), false)
  })
})

describe('mergeSources', () => {
  it('兩家一致 → 收，sources 兩家', () => {
    const r = mergeSources({ a: [{ date: '2020-01-01', nums: [1, 2, 3, 4, 5] }], b: [{ date: '2020-01-01', nums: [1, 2, 3, 4, 5] }] })
    assert.deepEqual(r.draws, [{ date: '2020-01-01', nums: [1, 2, 3, 4, 5], sources: ['a', 'b'], dropped: [] }])
  })

  it('只有一家 → 收，標單一來源', () => {
    const r = mergeSources({ a: [{ date: '1999-05-05', nums: [1, 2, 3, 4, 5] }], b: [] })
    assert.deepEqual(r.draws[0]!.sources, ['a'])
  })

  it('不一致且某家跟自己前一天一樣 → 剔掉那家（lottery.net 月初貼錯）', () => {
    const r = mergeSources({
      corner: [{ date: '2013-10-31', nums: [7, 9, 13, 16, 39] }, { date: '2013-11-01', nums: [1, 13, 17, 18, 19] }],
      net: [{ date: '2013-10-31', nums: [7, 9, 13, 16, 39] }, { date: '2013-11-01', nums: [7, 9, 13, 16, 39] }]
    })
    assert.deepEqual(r.conflicts, [])
    assert.deepEqual(r.draws[1], { date: '2013-11-01', nums: [1, 13, 17, 18, 19], sources: ['corner'], dropped: ['net'] })
  })

  it('不一致又看不出誰錯 → 不收，列進 conflicts', () => {
    const r = mergeSources({ a: [{ date: '2020-01-02', nums: [1, 2, 3, 4, 5] }], b: [{ date: '2020-01-02', nums: [6, 7, 8, 9, 10] }] })
    assert.equal(r.draws.length, 0)
    assert.equal(r.conflicts.length, 1)
  })

  it('期號 = YYYYMMDD', () => {
    assert.equal(caDrawTerm('2026-10-11'), 20261011)
  })
})
