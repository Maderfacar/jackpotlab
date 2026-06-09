import { strict as assert } from 'node:assert'
import { afterEach, describe, it } from 'node:test'

import {
  _resetRegistryForTests,
  getSignalsForGame,
  registerSignal,
  signalRegistry
} from '../registry'
import type { SignalDef } from '../types'

function makeSignal(id: string, appliesTo: SignalDef['appliesTo']): SignalDef {
  return {
    id,
    nameZh: id,
    description: '',
    appliesTo,
    evaluate: () => ({ fires: false, picks: [] })
  }
}

describe('registry', () => {
  afterEach(() => {
    _resetRegistryForTests()
  })

  it('registerSignal 重複 id 會 throw', () => {
    registerSignal(makeSignal('dup', ['all']))
    assert.throws(() => registerSignal(makeSignal('dup', ['lotto539'])),
      /already registered/)
  })

  it('getSignalsForGame 篩出 appliesTo 含目標 gameId 或 all 的', () => {
    registerSignal(makeSignal('all-sig', ['all']))
    registerSignal(makeSignal('539-only', ['lotto539']))
    registerSignal(makeSignal('bingo-only', ['bingo_bingo']))

    const for539 = getSignalsForGame('lotto539').map(s => s.id).sort()
    assert.deepEqual(for539, ['539-only', 'all-sig'])

    const forBingo = getSignalsForGame('bingo_bingo').map(s => s.id).sort()
    assert.deepEqual(forBingo, ['all-sig', 'bingo-only'])
  })

  it('W1 初始 registry 為空（_resetRegistryForTests 起跑）', () => {
    assert.equal(signalRegistry.size, 0)
  })
})
