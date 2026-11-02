/**
 * 每期每個挑號策略挑出的球（positive-strategies.ts、positive-columns.ts 共用）：
 *   單一條件挑出的球；同一條件只在成立線判斷「採用」時才下；少見 R1/R2；一篩、二篩；任兩個條件的交集（≥2 顆）。
 */
import { conds, type Decision } from '../blind-test'

export function setsOf(d: Decision): Map<string, number[]> {
  const m = new Map<string, number[]>()
  for (const u of d.used) {
    m.set(u.cond.id, u.set)
    if (u.apply) m.set(`${u.cond.id}（採用時）`, u.set)
  }
  for (const id of ['R1', 'R2'] as const) {
    const balls = [...new Set(d.rare.filter(r => r.id === id).flatMap(r => r.balls))]
    if (balls.length) m.set(id, balls)
  }
  m.set('一篩', d.stage1)
  m.set('二篩', d.final)
  const base = [...conds.map(c => c.id), 'R1', 'R2']
  for (let i = 0; i < base.length; i++) for (let j = i + 1; j < base.length; j++) {
    const a = m.get(base[i]!)
    const b = m.get(base[j]!)
    if (!a || !b) continue
    const bs = new Set(b)
    const x = a.filter(v => bs.has(v))
    if (x.length >= 2) m.set(`${base[i]}∩${base[j]}`, x)
  }
  return m
}
