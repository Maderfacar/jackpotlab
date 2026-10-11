/** /scan 八點的名稱與一句話規則（頁面顯示用；規則本身在 evaluate.ts） */
import type { PointKey } from './evaluate'

export interface PointMeta {
  key: PointKey
  no: string
  name: string
  /** 什麼時候亮燈（白話） */
  when: string
  /** 亮了就猜下一期什麼（白話；只是照這個看法去猜，準不準看歷史說中比例） */
  claim: string
  /** 「歷史挑」怎麼挑（白話） */
  history: string
}

export const POINT_META: PointMeta[] = [
  { key: 'low', no: '①', name: '0~5 開幾顆', when: '連續 5 期，每期都有 3 或 4 顆是從隔期 0~5 開出來的', claim: '下一期從 0~5 只開 0～2 顆', history: '看這期 0~5 開幾顆、已經連幾期 3～4 顆，查 20 年同樣情況，下一期開幾顆最比平常多' },
  { key: 'gapsum', no: '②', name: '隔期和', when: '隔期和連續 2 次都比上一期大（或都比上一期小）；連 3 次算很強', claim: '下一期的隔期和反過來', history: '看隔期和已經連幾次同方向，查 20 年同樣情況，下一期反過來、繼續還是一樣，哪個最比平常多' },
  { key: 'value', no: '③', name: '值', when: '某個值很久沒出現了：隔的期數已經是它平常的 2 倍以上', claim: '下一期開出這個值', history: '看每個值現在隔幾期，查 20 年隔這麼久的時候，哪個值下一期開出最比平常多' },
  { key: 'pair', no: '④', name: '同尾對', when: '這期有 2 顆號碼尾數一樣（例如 14 和 34）', claim: '下一期再開出這個尾數', history: '看前 10 期的同尾後來有沒有帶出同尾，查 20 年同樣情況，下一期再開出這個尾數還是不開' },
  { key: 'y', no: '⑤', name: '位置 y', when: '第 1、2 顆平常大多是 y=1，卻連續 2 期都不是', claim: '下一期這顆回到 y=1', history: '看每一顆的 y、連幾期不是 1，查 20 年同樣情況，下一期哪一顆的哪個 y 最比平常多' },
  { key: 'pos', no: '⑥', name: '球位隔期', when: '同一顆球（號碼由小到大排第幾顆）連續 2 期都從隔期 6 以上開出', claim: '下一期這顆回到隔期 0～5', history: '看每一顆從哪段隔期開出、連幾期在 6 以上，查 20 年同樣情況，下一期哪一顆從哪段開出最比平常多' },
  { key: 'chain', no: '⑦', name: '連莊・梯型', when: '有號碼連開 2 期，或出現 12→13 這種走了 2 步的梯子', claim: '下一期開出候選號其中一顆（連開第 3 期，或梯子走到 14）', history: '看有沒有連莊、梯型的候選號，查 20 年同樣情況，下一期連開、走梯子、還是都不開，哪個最比平常多' },
  { key: 'tail', no: '⑧', name: '剔除尾數', when: '這期有 2 顆同尾，而且最近 5 次出現同尾時，下一期都有再開出同尾', claim: '這次反過來：下一期不開這個尾數（這個尾數的號碼全部剔除）', history: '看每個尾數現在隔幾期，查 20 年隔這麼久的時候，哪個尾數下一期開出比它自己平常少最多，就猜它不開' }
]

export const metaOf = (key: PointKey): PointMeta => POINT_META.find(m => m.key === key)!

/** 「我信」可以按在「你的看法」或「歷史挑」：歷史挑的鍵多一個 @h */
export type PickKey = PointKey | `${PointKey}@h`
export const pickKey = (key: PointKey, hist: boolean): PickKey => (hist ? `${key}@h` : key)
export const parsePickKey = (k: PickKey): { key: PointKey, hist: boolean } =>
  ({ key: k.replace('@h', '') as PointKey, hist: k.endsWith('@h') })
