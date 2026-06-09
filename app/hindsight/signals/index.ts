/**
 * 訊號入口：W2 三個訊號集中註冊。
 *
 * 加新訊號時 import 並在 registerAllSignals() 內 registerSignal()。
 */

import { registerSignal } from '../registry'
import { consecutiveChainSignal } from './consecutive-chain'
import { dateNumberSignal } from './date-number'
import { intervalMeanSignal } from './interval-mean'

export function registerAllSignals(): void {
  registerSignal(intervalMeanSignal)
  registerSignal(dateNumberSignal)
  registerSignal(consecutiveChainSignal)
}

export { consecutiveChainSignal, dateNumberSignal, intervalMeanSignal }
