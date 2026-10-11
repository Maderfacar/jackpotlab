/** /scan 八點的名稱與一句話規則（頁面顯示用；規則本身在 evaluate.ts） */
import type { PointKey } from './evaluate'

export interface PointMeta {
  key: PointKey
  no: string
  name: string
  /** 什麼時候亮燈（白話） */
  when: string
  /** 亮了代表下一期會怎樣（白話） */
  claim: string
}

export const POINT_META: PointMeta[] = [
  { key: 'low', no: '①', name: '0~5 開幾顆', when: '連續 5 期，每期都有 3 或 4 顆是從隔期 0~5 開出來的', claim: '下一期從 0~5 只會開 0～2 顆' },
  { key: 'gapsum', no: '②', name: '隔期和', when: '隔期和連續 2 次都比上一期大（或都比上一期小）；連 3 次算很強', claim: '下一期會反過來' },
  { key: 'value', no: '③', name: '值', when: '某個值很久沒出現了：隔的期數已經是它平常的 2 倍以上', claim: '下一期會開出這個值' },
  { key: 'pair', no: '④', name: '同尾對', when: '這期有 2 顆號碼尾數一樣（例如 14 和 34）', claim: '下一期會再開出這個尾數' },
  { key: 'y', no: '⑤', name: '位置 y', when: '第 1、2 顆平常大多是 y=1，卻連續 2 期都不是', claim: '下一期這顆會回到 y=1' },
  { key: 'pos', no: '⑥', name: '球位隔期', when: '同一顆球（號碼由小到大排第幾顆）連續 2 期都從隔期 6 以上開出', claim: '下一期這顆會回到隔期 0～5' },
  { key: 'chain', no: '⑦', name: '連莊・梯型', when: '有號碼連開 2 期，或出現 12→13 這種走了 2 步的梯子', claim: '下一期會開出候選號其中一顆（連開第 3 期，或梯子走到 14）' },
  { key: 'tail', no: '⑧', name: '尾數隔期', when: '挑出現在最不容易開的尾數（跟它自己平常比）', claim: '下一期不會開這個尾數' }
]

export const metaOf = (key: PointKey): PointMeta => POINT_META.find(m => m.key === key)!
