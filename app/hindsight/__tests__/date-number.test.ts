import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import type { GameId } from '../../../shared/lotto/games'
import { createInitialState } from '../../utils/analysis'
import { dateNumberSignal } from '../signals/date-number'
import type { BrainDraw, SignalEvalParams } from '../types'

function mkParams(
  gameId: GameId,
  history: BrainDraw[],
  todayDate: string
): SignalEvalParams {
  return {
    gameId,
    history,
    analysisState: createInitialState(gameId, 60),
    todayDate
  }
}

describe('signal: date_number', () => {
  it('條件成立 → fires=true、picks 是候選號（升序）', () => {
    // 539: 今天 2026-06-15 → todayD=15、候選=[14,15,16]
    // 構造 history 使日期號出現很久沒中：
    //   T1 (2026-01-01 d=1 候選 [1,2]) numbers=[1,5,10,20,30] → 命中（1 in [1,2]）
    //   T2 (2026-01-02 d=2 候選 [1,2,3]) numbers=[2,7,11,22,33] → 命中
    //   T3..T20 一連串都沒中日期號
    const history: BrainDraw[] = []
    history.push({ drawTerm: 1, drawDate: '2026-01-01', numbers: [1, 5, 10, 20, 30] })
    history.push({ drawTerm: 2, drawDate: '2026-01-02', numbers: [2, 7, 11, 22, 33] })
    // 中間 18 期都用「保證不會撞到該日 ±1」的號碼填充
    for (let i = 3; i <= 20; i++) {
      // dayOf 用 dateStr.slice(8,10)，所以 drawDate 月日格式正確
      // 用一個與當天無關的固定 numbers，挑遠離日期的號
      history.push({
        drawTerm: i,
        drawDate: `2026-02-${String(i).padStart(2, '0')}`,
        numbers: [35, 36, 37, 38, 39]
      })
    }
    // hitTerms = [1, 2]、intervals=[1]、meanInterval=1、lastTerm=2、currentTerm=20、gap=18 >= 1 → fires
    const out = dateNumberSignal.evaluate(mkParams('lotto539', history, '2026-06-15'))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [14, 15, 16])
  })

  it('條件不成立（gap < meanInterval） → fires=false', () => {
    // history 中每期都中日期號 → meanInterval=1、gap=1 不滿足 1 < 1? 不對：gap >= meanInterval 才 fire
    // 改造：構造 lastTerm = currentTerm → gap = 0 < meanInterval → false
    const history: BrainDraw[] = []
    // hitTerms = [1, 10], intervals=[9], mean=9, lastTerm=10, currentTerm=12, gap=2 < 9 → false
    history.push({ drawTerm: 1, drawDate: '2026-01-01', numbers: [1, 30, 31, 32, 33] }) // 命中 (1 in [1,2])
    for (let i = 2; i <= 9; i++) {
      history.push({
        drawTerm: i,
        drawDate: `2026-02-${String(i).padStart(2, '0')}`,
        numbers: [35, 36, 37, 38, 39] // 不命中
      })
    }
    history.push({ drawTerm: 10, drawDate: '2026-03-10', numbers: [10, 30, 31, 32, 33] }) // d=10 候選[9,10,11]、numbers 含 10 → 命中
    history.push({ drawTerm: 11, drawDate: '2026-03-11', numbers: [35, 36, 37, 38, 39] }) // 不命中
    history.push({ drawTerm: 12, drawDate: '2026-03-12', numbers: [35, 36, 37, 38, 39] }) // 不命中
    const out = dateNumberSignal.evaluate(mkParams('lotto539', history, '2026-06-15'))
    assert.equal(out.fires, false)
    assert.deepEqual(out.picks, [])
  })

  it('邊界：賓果直接 fires=false（不論 history）', () => {
    const history: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-09', numbers: Array.from({ length: 20 }, (_, i) => i + 1) }
    ]
    const out = dateNumberSignal.evaluate(mkParams('bingo_bingo', history, '2026-06-09'))
    assert.equal(out.fires, false)
    assert.deepEqual(out.picks, [])
  })

  it('邊界：日=1 → d-1=0 過濾掉，候選 = [1, 2]', () => {
    // 539 範圍 1-39，d=1 → 候選 [0,1,2] 過濾 → [1,2]
    // 填充期都用 [35..39]：dayOf 從未涵蓋這段（最大候選 d=31 → [30,31,32]），
    // 所以填充期保證 0 命中、不會污染 hitTerms。
    const history: BrainDraw[] = []
    history.push({ drawTerm: 1, drawDate: '2026-01-05', numbers: [5, 10, 20, 30, 33] }) // d=5 候選[4,5,6] 命中(5)
    history.push({ drawTerm: 2, drawDate: '2026-01-06', numbers: [6, 11, 21, 31, 34] }) // d=6 候選[5,6,7] 命中(6)
    for (let i = 3; i <= 30; i++) {
      history.push({
        drawTerm: i,
        drawDate: `2026-02-${String(i).padStart(2, '0')}`,
        numbers: [35, 36, 37, 38, 39]
      })
    }
    // hitTerms=[1,2], mean=1, gap=30-2=28 >= 1 → fire
    const out = dateNumberSignal.evaluate(mkParams('lotto539', history, '2026-07-01'))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [1, 2])
  })

  it('邊界：候選空 → fires=false', () => {
    // 威力彩第二區是另外的，主號範圍 1-38；今天 d=99 不可能，但用越界日期測試
    // 用日期 d=40，超出 539 1-39 範圍：候選 [39,40,41] 過濾後只剩 [39]
    // 改成測「候選整段空」更乾淨：用一個 D 大於 numberMax+1 的情況
    // 539 範圍 1-39，d=99 → 99-1=98、99、100 全 > 39 → 候選空
    // 但 dayOf 只取 slice(8,10) 兩位數，所以最大就是 99（合法日期不可能但函式接受）
    const history: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-05', numbers: [5, 10, 20, 30, 35] }
    ]
    // 使用 dateStr 第 9-10 位是 '99' → todayD = 99 → 候選 [98,99,100] 全超出 1-39 → 空
    const out = dateNumberSignal.evaluate(mkParams('lotto539', history, '2026-06-99'))
    assert.equal(out.fires, false)
    assert.deepEqual(out.picks, [])
  })

  it('邊界：hitTerms.length < 2（樣本不足）→ fires=false', () => {
    // 全 history 都沒中日期號
    const history: BrainDraw[] = []
    for (let i = 1; i <= 10; i++) {
      history.push({
        drawTerm: i,
        drawDate: `2026-02-${String(i).padStart(2, '0')}`,
        numbers: [35, 36, 37, 38, 39]
      })
    }
    const out = dateNumberSignal.evaluate(mkParams('lotto539', history, '2026-06-20'))
    assert.equal(out.fires, false)
    assert.deepEqual(out.picks, [])
  })

  it('只看主號碼（numbers），與規格一致', () => {
    // numbers 直接就是主號（BrainDraw 介面定義），不分特別號
    // 這個測試其實已被「條件成立」測試覆蓋；明確再標一筆
    const history: BrainDraw[] = []
    history.push({ drawTerm: 1, drawDate: '2026-01-10', numbers: [10, 20, 30, 40, 50] }) // d=10 候選[9,10,11] 命中
    history.push({ drawTerm: 2, drawDate: '2026-01-11', numbers: [11, 21, 31, 41, 49] }) // d=11 候選[10,11,12] 命中
    for (let i = 3; i <= 15; i++) {
      history.push({
        drawTerm: i,
        drawDate: `2026-02-${String(i).padStart(2, '0')}`,
        numbers: [3, 4, 5, 6, 7]
      })
    }
    const out = dateNumberSignal.evaluate(mkParams('lotto649', history, '2026-06-30'))
    // 大樂透 6 顆主號，候選=[29,30,31]
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [29, 30, 31])
  })
})
