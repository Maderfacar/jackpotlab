import { strict as assert } from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  brainStateKey,
  loadBrainState,
  saveBrainState,
  sweepStaleHindsightStorage
} from '../storage'
import type { BrainState } from '../types'

// 簡易 localStorage stub（node:test 沒 jsdom）
class LocalStorageStub {
  private store: Map<string, string> = new Map()

  get length(): number {
    return this.store.size
  }

  key(i: number): string | null {
    return [...this.store.keys()][i] ?? null
  }

  getItem(k: string): string | null {
    return this.store.get(k) ?? null
  }

  setItem(k: string, v: string): void {
    this.store.set(k, v)
  }

  removeItem(k: string): void {
    this.store.delete(k)
  }

  clear(): void {
    this.store.clear()
  }
}

interface GlobalWithWindow {
  window?: { localStorage: LocalStorageStub }
}

function asGlobal(): GlobalWithWindow {
  return globalThis as unknown as GlobalWithWindow
}

describe('storage', () => {
  beforeEach(() => {
    asGlobal().window = {
      localStorage: new LocalStorageStub()
    }
  })

  afterEach(() => {
    delete asGlobal().window
  })

  it('round-trip：save 之後 load 拿回完整 BrainState', () => {
    const state: BrainState = {
      v: 7,
      gameId: 'lotto539',
      lastProcessedTerm: 42,
      scorecards: {
        s1: {
          signalId: 's1',
          totalFires: 5,
          totalHits: 3,
          totalPicks: 10,
          recentFirings: [
            { drawTerm: 42, drawDate: '2026-06-09', picks: [1, 2, 3], hits: 1, hitNumbers: [2] }
          ],
          firingTerms: [38, 39, 40, 41, 42],
          coFiringCounts: { s2: 2 }
        }
      },
      alerts: [
        {
          id: 'multi_signal-42',
          type: 'multi_signal',
          drawTerm: 42,
          drawDate: '2026-06-09',
          detail: 'test',
          signals: ['s1', 's2'],
          createdAt: '2026-06-09T00:00:00.000Z'
        }
      ],
      updatedAt: '2026-06-09T00:00:00.000Z'
    }
    saveBrainState(state)
    const loaded = loadBrainState('lotto539')
    assert.notEqual(loaded, null)
    assert.deepEqual(loaded, state)
  })

  it('load 不同 gameId 回 null', () => {
    const state: BrainState = {
      v: 7,
      gameId: 'lotto539',
      lastProcessedTerm: null,
      scorecards: {},
      alerts: [],
      updatedAt: ''
    }
    saveBrainState(state)
    assert.equal(loadBrainState('bingo_bingo'), null)
  })

  it('sweepStaleHindsightStorage 掃掉舊版本 key、留下當前版本', () => {
    const ls = asGlobal().window!.localStorage

    // 灌 3 個 key：當前版本、舊版本、無關 key
    const currentKey = brainStateKey('lotto539')
    ls.setItem(currentKey, JSON.stringify({ v: 7, gameId: 'lotto539', lastProcessedTerm: null, scorecards: {}, alerts: [], updatedAt: '' }))
    ls.setItem('jackpotlab-hindsight-lotto539-v3', 'old')
    ls.setItem('jackpotlab-hindsight-lotto539-v4', 'oldv4')
    ls.setItem('jackpotlab-hindsight-lotto539-v5', 'oldv5')
    ls.setItem('jackpotlab-hindsight-lotto539-v6', 'oldv6')
    ls.setItem('jackpotlab-hindsight-fake_game-v7', 'invalid')
    ls.setItem('jackpotlab-analysis-lotto539-v3-n60', 'unrelated')

    sweepStaleHindsightStorage()

    assert.notEqual(ls.getItem(currentKey), null, 'current version should survive')
    assert.equal(ls.getItem('jackpotlab-hindsight-lotto539-v3'), null, 'old version should be swept')
    assert.equal(ls.getItem('jackpotlab-hindsight-lotto539-v4'), null, 'old version should be swept')
    assert.equal(ls.getItem('jackpotlab-hindsight-lotto539-v5'), null, 'old version should be swept')
    assert.equal(ls.getItem('jackpotlab-hindsight-lotto539-v6'), null, 'old version should be swept')
    assert.equal(ls.getItem('jackpotlab-hindsight-fake_game-v7'), null, 'invalid gameId should be swept')
    assert.notEqual(ls.getItem('jackpotlab-analysis-lotto539-v3-n60'), null, 'unrelated prefix untouched')
  })
})
