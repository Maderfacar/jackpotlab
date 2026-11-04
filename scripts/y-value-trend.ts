/**
 * y 1～5、值 0～9 各自的走勢（2026-11-05 使用者）：只看、不刪號碼、不進任何一篩。
 *   走勢：每期開出的五顆裡，這個 y（或值）有幾顆；這期比上期多、少、一樣。
 *   同樣狀況：這期方向一樣、這期開出顆數一樣；「加盤面」版再加上盤面上這個 y（或值）現在剩的顆數在同一段。
 *     盤面顆數分段：0～5 各自一段，6 以上每 3 顆一段（6～8、9～11…）。
 *   判：同樣狀況的歷史期，下一期變多／變少／一樣哪個最多；一樣多時順序同二篩（一樣 > 變多 > 變少）。
 *   盤面上不在 60 格內的球不算。每期只用到上一期為止的資料。
 *   往前盲算：2024 起每一期照上面判，開獎後看判對沒。兩種判法（只看走勢／加盤面）都列，看盤面剩幾顆影響大不大。
 *
 * 用法：node --import tsx scripts/y-value-trend.ts  → docs/y-value-trend.md
 */
import { writeFileSync } from 'node:fs'
import { allDecisions, draws, next, rows, type Ball } from './blind-test'

const OUT = 'docs/y-value-trend.md'
const FROM = '2024-01-01'
const SLOTS = 60
const MOVES = ['變少', '一樣', '變多'] as const

interface Item { name: string, of: (o: Ball) => boolean }
const ITEMS: Item[] = [
  ...[1, 2, 3, 4, 5].map(k => ({ name: `y=${k}`, of: (o: Ball) => o.rank === k })),
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => ({ name: `值 ${k}`, of: (o: Ball) => o.value === k }))
]

const onBoard = (o: Ball): boolean => o.slot < SLOTS
const D = allDecisions.length
const boards: Ball[][] = [...allDecisions.map(d => d.ballOf), next.ballOf]
const band = (s: number): number => (s <= 5 ? s : 6 + Math.floor((s - 6) / 3))
const bandName = (s: number): string => { const b = band(s); return b <= 5 ? `${b}` : `${6 + (b - 6) * 3}～${8 + (b - 6) * 3}` }

interface Judge { n: number, cnt: number[], pick: number }
/** 第 j 期開獎前判下一步：X 到 j-1 為止、S[j] 是這期開獎前的盤面顆數 */
function judge(X: number[], S: number[], j: number, withSupply: boolean): Judge {
  const last = X[j - 1]!
  const dir = Math.sign(last - X[j - 2]!)
  const cnt = [0, 0, 0]
  for (let i = 1; i < j - 1; i++) {
    if (X[i] !== last || Math.sign(X[i]! - X[i - 1]!) !== dir) continue
    if (withSupply && band(S[i + 1]!) !== band(S[j]!)) continue
    cnt[Math.sign(X[i + 1]! - X[i]!) + 1]!++
  }
  const n = cnt[0]! + cnt[1]! + cnt[2]!
  const best = Math.max(...cnt)
  const pick = !n ? NaN : cnt[1] === best ? 0 : cnt[2] === best ? 1 : -1
  return { n, cnt, pick }
}

const from = allDecisions.findIndex(d => rows[d.t]![1] >= FROM)
const pct = (a: number, b: number): string => (b ? (100 * a / b).toFixed(1) : '—')
const out: string[] = []
const nowRows: string[] = []
const blindRows: string[] = []
const moveName = (m: number): string => (Number.isNaN(m) ? '查無' : MOVES[m + 1]!)
const dist = (r: Judge): string => (r.n ? `${moveName(r.pick)}（少 ${pct(r.cnt[0]!, r.n)}%／同 ${pct(r.cnt[1]!, r.n)}%／多 ${pct(r.cnt[2]!, r.n)}%，${r.n} 次）` : '查無')

for (const it of ITEMS) {
  const X = allDecisions.map(d => draws[d.t]!.filter(x => onBoard(d.ballOf[x]!) && it.of(d.ballOf[x]!)).length)
  const S = boards.map(b => b.slice(1).filter(o => onBoard(o!) && it.of(o!)).length)
  // 往前盲算
  const tally = [{ n: 0, ok: 0 }, { n: 0, ok: 0 }]
  let differ = 0
  const byPick = [new Map<number, { n: number, ok: number }>(), new Map<number, { n: number, ok: number }>()]
  for (let j = Math.max(from, 2); j < D; j++) {
    const actual = Math.sign(X[j]! - X[j - 1]!)
    const rs = [judge(X, S, j, false), judge(X, S, j, true)]
    if (rs[0]!.pick !== rs[1]!.pick) differ++
    rs.forEach((r, k) => {
      if (Number.isNaN(r.pick)) return
      tally[k]!.n++
      if (r.pick === actual) tally[k]!.ok++
      const m = byPick[k]!.get(r.pick) ?? { n: 0, ok: 0 }
      m.n++
      if (r.pick === actual) m.ok++
      byPick[k]!.set(r.pick, m)
    })
  }
  const pickCell = (k: number): string => [-1, 0, 1].filter(p => byPick[k]!.has(p)).map(p => `${MOVES[p + 1]} ${byPick[k]!.get(p)!.ok}/${byPick[k]!.get(p)!.n}`).join('、')
  blindRows.push(`| ${it.name} | ${tally[0]!.ok}/${tally[0]!.n}（${pct(tally[0]!.ok, tally[0]!.n)}%） | ${pickCell(0)} | ${tally[1]!.ok}/${tally[1]!.n}（${pct(tally[1]!.ok, tally[1]!.n)}%） | ${pickCell(1)} | ${differ} |`)
  // 下一期
  const last = X[D - 1]!
  const dir = Math.sign(last - X[D - 2]!)
  nowRows.push(`| ${it.name} | ${X[D - 2]} → ${last}（${moveName(dir)}） | ${S[D]}（${bandName(S[D]!)} 段） | ${dist(judge(X, S, D, false))} | ${dist(judge(X, S, D, true))} |`)
}

const lastTerm = rows[rows.length - 1]![0]
out.push('# y 1～5、值 0～9 各自的走勢')
out.push('')
out.push(`> 由 \`scripts/y-value-trend.ts\` 產生。資料到第 ${lastTerm} 期。只看、不刪號碼、不進任何一篩。`)
out.push('> 走勢＝每期開出的五顆裡這個 y（或值）有幾顆，這期比上期多／少／一樣。同樣狀況＝這期方向一樣＋這期開出顆數一樣；「加盤面」再加上盤面這個 y（或值）剩的顆數同一段（0～5 各自一段，6 以上每 3 顆一段）。判＝同樣狀況的歷史期下一期哪個最多。')
out.push('')
out.push(`## 下一期（${lastTerm} 開完後）`)
out.push('')
out.push('| 項目 | 上兩期開出顆數 | 盤面現在剩 | 只看走勢 判 | 加盤面顆數 判 |')
out.push('|---|---|---|---|---|')
out.push(...nowRows)
out.push('')
out.push(`## 往前盲算：2024 起每一期（${D - Math.max(from, 2)} 期）判對幾期`)
out.push('')
out.push('判對＝判變多實際變多、判變少實際變少、判一樣實際一樣。「兩種判法不一樣」＝同一期兩種判法判的不同，有幾期。')
out.push('')
out.push('| 項目 | 只看走勢 判對 | 只看走勢 各判法 判對/判幾次 | 加盤面 判對 | 加盤面 各判法 判對/判幾次 | 兩種判法不一樣 |')
out.push('|---|---|---|---|---|---|')
out.push(...blindRows)
writeFileSync(OUT, out.join('\n') + '\n')
console.log(out.join('\n'))
