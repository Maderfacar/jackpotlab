/** /scan 八點的名稱與一句話規則（頁面顯示用；規則本身在 evaluate.ts） */
import type { PointKey } from './evaluate'

export interface PointMeta {
  key: PointKey
  no: string
  name: string
  /** 什麼時候亮燈 */
  when: string
  /** 亮燈時說下一期會怎樣 */
  claim: string
}

export const POINT_META: PointMeta[] = [
  { key: 'low', no: '①', name: '0~5 開幾顆', when: '0~5 連 5 期都開 3～4 顆', claim: '下一期 0~5 只開 0～2 顆' },
  { key: 'gapsum', no: '②', name: '隔期和', when: '跟前一期比，連 2 次同方向（3 次 = 強）', claim: '下一期反轉' },
  { key: 'value', no: '③', name: '值', when: '某個值已隔平均間隔 2 倍以上沒出現', claim: '下一期開出這個值' },
  { key: 'pair', no: '④', name: '同尾對', when: '本期有 2 顆同尾', claim: '下一期開出這個尾數' },
  { key: 'y', no: '⑤', name: '位置 y', when: '平常多半 y=1 的那顆，連 2 期 y≠1', claim: '下一期這顆 y=1' },
  { key: 'pos', no: '⑥', name: '球位隔期', when: '同一顆連 2 期隔期 > 5', claim: '下一期這顆隔期 0～5' },
  { key: 'chain', no: '⑦', name: '連莊・梯型', when: '連莊 2 期、或梯型走了 2 步', claim: '下一期走完第 3 步' },
  { key: 'tail', no: '⑧', name: '尾數隔期', when: '照目前隔期，下一期開出比例比它自己平常低最多的尾數', claim: '下一期不開這個尾數' }
]

export const metaOf = (key: PointKey): PointMeta => POINT_META.find(m => m.key === key)!
