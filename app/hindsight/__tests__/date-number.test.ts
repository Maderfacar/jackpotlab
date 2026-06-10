/**
 * 訊號 2：日期號（三桶獨立子判定）測試
 *
 * 2026-06-11 拍板：訊號 2 改成三桶獨立子判定。測試涵蓋每個子判定的獨立亮/不亮場景。
 * 規格依據：docs/HINDSIGHT-SIGNALS-AUDIT.md「拍板紀錄 — 訊號 2」段落。
 */

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

/** 構造 N 期不會命中任何桶的填充期。日期月份固定為 02，filler numbers 用 [25,27,28,29,30] 與所有 d±1 ∈ [01..20] 範圍互不重疊。 */
function pushFiller(history: BrainDraw[], fromTerm: number, toTerm: number) {
  for (let i = fromTerm; i <= toTerm; i++) {
    const dd = String(((i - 1) % 20) + 1).padStart(2, '0')
    history.push({
      drawTerm: i,
      drawDate: `2026-02-${dd}`,
      numbers: [25, 27, 28, 29, 30]
    })
  }
}

describe('signal: date_number（2026-06-11 三桶獨立子判定）', () => {
  it('三桶都有 hits 且 gap ≥ mean → 三子判定全亮、picks = 三候選聯集', () => {
    // 539: todayD=15 → 候選 c₋₁=14、c₀=15、c₊₁=16
    const history: BrainDraw[] = []
    // T1 d=10: numbers=[9,10,11,30,35] → 三桶各 +1（9=d-1、10=d、11=d+1）
    history.push({ drawTerm: 1, drawDate: '2026-01-10', numbers: [9, 10, 11, 30, 35] })
    // T2 d=20: numbers=[19,20,21,30,35] → 三桶各 +1
    history.push({ drawTerm: 2, drawDate: '2026-01-20', numbers: [19, 20, 21, 30, 35] })
    pushFiller(history, 3, 30)
    // 三桶 hits 都 = [1, 2]，mean = 1，lastHit = 2，currentTerm = 30，gap = 28 ≥ 1 → 三桶都亮

    const out = dateNumberSignal.evaluate(mkParams('lotto539', history, '2026-06-15'))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [14, 15, 16])
    assert.equal(out.pickGroups?.length, 3)
    assert.deepEqual(out.pickGroups?.[0], { label: '日期 −1：14', numbers: [14] })
    assert.deepEqual(out.pickGroups?.[1], { label: '日期：15', numbers: [15] })
    assert.deepEqual(out.pickGroups?.[2], { label: '日期 +1：16', numbers: [16] })
  })

  it('只有桶 minus1 亮（其他桶 hit < 2）→ 只推 c₋₁', () => {
    // 539: todayD=15 → 候選 [14, 15, 16]
    const history: BrainDraw[] = []
    // 只讓 minus1 桶累積 2 次 hit、其他桶完全不累
    // T1 d=10: numbers=[9, 30, 35, 36, 37] → 只 minus1（9 = d-1）
    history.push({ drawTerm: 1, drawDate: '2026-01-10', numbers: [9, 30, 35, 36, 37] })
    // T2 d=20: numbers=[19, 30, 35, 36, 37] → 只 minus1
    history.push({ drawTerm: 2, drawDate: '2026-01-20', numbers: [19, 30, 35, 36, 37] })
    pushFiller(history, 3, 30)

    const out = dateNumberSignal.evaluate(mkParams('lotto539', history, '2026-06-15'))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [14])
    assert.equal(out.pickGroups?.length, 1)
    assert.deepEqual(out.pickGroups?.[0], { label: '日期 −1：14', numbers: [14] })
  })

  it('某桶 gap < mean → 該位置不亮、其他桶亮可獨立成立', () => {
    // 設計：minus1 桶 hits=[1, 50] → mean = 49，最新 currentTerm = 51，gap = 1 < 49 → minus1 不亮
    //       zero 桶 hits=[1, 50] → 同上不亮
    //       plus1 桶 hits=[1, 2] → mean = 1，gap = 51 − 2 = 49 ≥ 1 → 亮
    const history: BrainDraw[] = []
    history.push({ drawTerm: 1, drawDate: '2026-01-10', numbers: [9, 10, 11, 30, 35] }) // 三桶各 +1
    history.push({ drawTerm: 2, drawDate: '2026-01-20', numbers: [21, 30, 35, 36, 37] }) // plus1 +1（21=d+1）
    pushFiller(history, 3, 49)
    history.push({ drawTerm: 50, drawDate: '2026-03-10', numbers: [9, 10, 30, 35, 36] }) // minus1+zero +1
    pushFiller(history, 51, 51)
    // 桶狀態：
    //   minus1 = [1, 50] → mean = 49、lastHit = 50、gap = 51 − 50 = 1 < 49 → 不亮
    //   zero   = [1, 50] → 同上不亮
    //   plus1  = [1, 2]  → mean = 1、lastHit = 2、gap = 51 − 2 = 49 ≥ 1 → 亮

    const out = dateNumberSignal.evaluate(mkParams('lotto539', history, '2026-06-15'))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [16])
    assert.equal(out.pickGroups?.length, 1)
    assert.deepEqual(out.pickGroups?.[0], { label: '日期 +1：16', numbers: [16] })
  })

  it('今日 todayD = 1：c₋₁ = 0 不在彩種範圍 → minus1 子判定跳過（不評估）', () => {
    // 即使 minus1 桶歷史 hit ≥ 2 且 gap ≥ mean，候選 0 不在 1-39 → 跳過
    const history: BrainDraw[] = []
    history.push({ drawTerm: 1, drawDate: '2026-01-10', numbers: [9, 30, 35, 36, 37] })
    history.push({ drawTerm: 2, drawDate: '2026-01-20', numbers: [19, 30, 35, 36, 37] })
    pushFiller(history, 3, 30)

    const out = dateNumberSignal.evaluate(mkParams('lotto539', history, '2026-06-01'))
    // todayD = 1 → c₋₁ = 0（跳過）、c₀ = 1（zero 桶 hits = 0 → 不亮）、c₊₁ = 2（plus1 桶 hits = 0 → 不亮）
    assert.equal(out.fires, false)
    assert.deepEqual(out.picks, [])
  })

  it('今日 todayD = 39：c₊₁ = 40 不在彩種範圍 → plus1 子判定跳過；其他位置仍可獨立亮', () => {
    // 構造：plus1 桶 hits 多但候選跳過；zero 桶照常評
    const history: BrainDraw[] = []
    // 每期 numbers 都含「該期 d」、確保 zero 桶 +1
    history.push({ drawTerm: 1, drawDate: '2026-01-10', numbers: [10, 30, 35, 36, 37] }) // zero +1
    history.push({ drawTerm: 2, drawDate: '2026-01-20', numbers: [20, 30, 35, 36, 37] }) // zero +1
    pushFiller(history, 3, 30)
    // todayD = 39 → c₋₁ = 38（minus1 桶 hits = 0 → 不亮）、c₀ = 39（zero 桶 hits = [1,2]、mean=1、gap=28 → 亮）、c₊₁ = 40（跳過）

    const out = dateNumberSignal.evaluate(mkParams('lotto539', history, '2026-06-39'))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [39])
    assert.equal(out.pickGroups?.length, 1)
    assert.deepEqual(out.pickGroups?.[0], { label: '日期：39', numbers: [39] })
  })

  it('歷史掃描時，d ± 1 越界該期該桶不計（不會誤算）', () => {
    // 539 範圍 1-39。T1 d=1 → minus1 target = 0 越界、不計入 minus1 桶
    //                      zero target = 1 在範圍、numbers 含 1 → zero +1
    //                      plus1 target = 2 在範圍、numbers 含 2 → plus1 +1
    const history: BrainDraw[] = []
    history.push({ drawTerm: 1, drawDate: '2026-01-01', numbers: [1, 2, 30, 35, 36] })
    history.push({ drawTerm: 2, drawDate: '2026-01-02', numbers: [2, 3, 30, 35, 36] })
    // T1: minus1 ✗（0 越界）、zero ✓（含 1）、plus1 ✓（含 2）
    // T2: minus1 ✓（d-1=1、含 1）、zero ✓（含 2）、plus1 ✓（含 3）
    pushFiller(history, 3, 30)
    // minus1 hits=[2]、zero hits=[1,2]、plus1 hits=[1,2]
    // todayD=15 → c=[14,15,16]
    //   minus1 hits=1 < 2 → 不亮
    //   zero hits=[1,2] mean=1 lastHit=2 currentTerm=30 gap=28 ≥ 1 → 亮（推 15）
    //   plus1 hits=[1,2] mean=1 gap=28 ≥ 1 → 亮（推 16）

    const out = dateNumberSignal.evaluate(mkParams('lotto539', history, '2026-06-15'))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [15, 16])
    assert.equal(out.pickGroups?.length, 2)
    assert.deepEqual(out.pickGroups?.[0], { label: '日期：15', numbers: [15] })
    assert.deepEqual(out.pickGroups?.[1], { label: '日期 +1：16', numbers: [16] })
  })

  it('全部三桶都 hit < 2 → fires = false', () => {
    const history: BrainDraw[] = []
    pushFiller(history, 1, 20)

    const out = dateNumberSignal.evaluate(mkParams('lotto539', history, '2026-06-15'))
    assert.equal(out.fires, false)
    assert.deepEqual(out.picks, [])
  })

  it('賓果直接 fires = false（不論 history）', () => {
    const history: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-09', numbers: Array.from({ length: 20 }, (_, i) => i + 1) }
    ]
    const out = dateNumberSignal.evaluate(mkParams('bingo_bingo', history, '2026-06-09'))
    assert.equal(out.fires, false)
    assert.deepEqual(out.picks, [])
  })

  it('history 為空 → fires = false', () => {
    const out = dateNumberSignal.evaluate(mkParams('lotto539', [], '2026-06-15'))
    assert.equal(out.fires, false)
    assert.deepEqual(out.picks, [])
  })

  it('todayD 三候選全越界（539 用 99）→ 三子判定全跳過、fires = false', () => {
    const history: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-05', numbers: [5, 10, 20, 30, 35] }
    ]
    const out = dateNumberSignal.evaluate(mkParams('lotto539', history, '2026-06-99'))
    assert.equal(out.fires, false)
    assert.deepEqual(out.picks, [])
  })

  it('大樂透 649 範圍 1-49、三桶各自獨立判定（與 539 行為一致）', () => {
    // 649: todayD=30 → 候選 [29, 30, 31]
    const history: BrainDraw[] = []
    history.push({ drawTerm: 1, drawDate: '2026-01-10', numbers: [9, 10, 11, 30, 40, 45] }) // 三桶各 +1
    history.push({ drawTerm: 2, drawDate: '2026-01-20', numbers: [19, 20, 21, 30, 40, 45] }) // 三桶各 +1
    pushFiller(history, 3, 30)

    const out = dateNumberSignal.evaluate(mkParams('lotto649', history, '2026-06-30'))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [29, 30, 31])
    assert.equal(out.pickGroups?.length, 3)
  })
})
