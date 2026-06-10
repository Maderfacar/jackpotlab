/**
 * 訊號入口：W2 + Batch-2 訊號集中註冊。
 *
 * 加新訊號時 import 並在 registerAllSignals() 內 registerSignal()。
 */

import { registerSignal } from '../registry'
import { coldNumberSignal } from './cold-number'
import { consecutiveChainSignal } from './consecutive-chain'
import { dateNumberSignal } from './date-number'
import { firstPositionSignal } from './first-position'
import { intervalMeanSignal } from './interval-mean'
import { intervalSumSignal } from './interval-sum'
import { positionDistributionSignal } from './position-distribution'
import { streakAlertSignal } from './bingo-streak-alert'
import { tailPairSignal } from './tail-pair'

export function registerAllSignals(): void {
  registerSignal(intervalMeanSignal)
  registerSignal(dateNumberSignal)
  registerSignal(consecutiveChainSignal)
  registerSignal(intervalSumSignal)
  registerSignal(tailPairSignal)
  registerSignal(coldNumberSignal)
  registerSignal(positionDistributionSignal)
  registerSignal(streakAlertSignal)
  registerSignal(firstPositionSignal)
}

export {
  coldNumberSignal,
  consecutiveChainSignal,
  dateNumberSignal,
  firstPositionSignal,
  intervalMeanSignal,
  intervalSumSignal,
  positionDistributionSignal,
  streakAlertSignal,
  tailPairSignal
}
