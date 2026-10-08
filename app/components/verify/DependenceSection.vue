<script setup lang="ts">
import type { DependenceResult, Direction, PairItem, StatCell, StatGroup } from '~~/shared/lotto/patterns/dependence'

const GAME_ID = 'lotto539'
const apiPath = `/api/patterns/${GAME_ID}/dependence`

const { data, status, error } = useFetch<{ result: DependenceResult, generatedAt: string }>(apiPath, {
  query: { format: 'json' },
  server: false
})

const result = computed(() => data.value?.result ?? null)

type Part = 'all' | 'front' | 'back'
const PARTS: Part[] = ['all', 'front', 'back']
const PART_NAME: Record<Part, string> = { all: '全部', front: '前段', back: '後段' }

// ---------- 白話文字 ----------

const SECTION: Record<string, { question: string, how: string }> = {
  blocks: {
    question: '最近常開的號碼，接下來還會常開嗎？',
    how: '把期數切成每段 B 期，比較相鄰兩段裡 39 個號碼各開了幾次。如果「冷熱會延續」，這段常開的號碼下一段也會常開。'
  },
  blockSeries: {
    question: '一段時間偏高的數字，下一段還會偏高嗎？',
    how: '每段 B 期取平均（例如隔期和），看這段偏高時，下一段是不是也偏高（延續）或反過來偏低（反轉）。'
  },
  autocorr: {
    question: '這一期的特徵，會影響後面幾期嗎？',
    how: '例如這期重號多，1～5 期後是不是也多（同向）或比較少（反向）。'
  },
  transition: {
    question: '這期是某一型，下期會偏向某一型嗎？',
    how: '例如這期只開 0～1 個奇數時，下期開 4～5 個奇數的比例，有沒有比洗亂的牌多或少。'
  },
  gaps: {
    question: '剛開過的號碼，會比較快（或比較慢）再開嗎？',
    how: '開出的號碼中，上期剛開過的占多少、隔 1 期的占多少……和洗亂的牌比較。'
  }
}

const SERIES: Record<string, string> = {
  repeat: '重號數',
  gapSum: '隔期和',
  gapMax: '最大隔期',
  valueSum: '現值和',
  x1: '位置 x=1 的個數',
  y1: '位置 y=1 的個數',
  numSum: '號碼和',
  odd: '奇數個數',
  big: '大號個數',
  tails: '尾數種類',
  consec: '連號組數'
}

function rowQuestion(g: StatGroup, c: StatCell): string {
  const [kind, a, b] = c.id.split(':')
  if (kind === 'blk') return `這 ${a} 期常開的號碼，下 ${a} 期還常開嗎？`
  if (kind === 'bs') return `這 ${b} 期的${SERIES[a!] ?? a}偏高，下 ${b} 期也偏高嗎？`
  if (kind === 'ac') return `這期的${SERIES[a!] ?? a}，和 ${b} 期後的有關嗎？`
  if (kind === 'tr') {
    const m = c.label.match(/^(.+) 本期 (.+) → 下期 (.+)$/)
    return m ? `這期${m[1]}是「${m[2]}」時，下期是「${m[3]}」的比例` : c.label
  }
  if (kind === 'gap') {
    const k = c.label.replace('隔期 ', '')
    return k === '0' ? '開出的號碼中，上期剛開過的比例' : `開出的號碼中，隔 ${k} 期再開的比例`
  }
  return g.kind === 'p' ? c.label : c.label
}

function word(g: StatGroup, dir: Direction): string {
  if (dir == null) return ''
  if (g.id === 'blocks' || g.id === 'blockSeries') return dir === 'high' ? '延續' : '反轉'
  if (g.id === 'autocorr') return dir === 'high' ? '同向' : '反向'
  return dir === 'high' ? '偏多' : '偏少'
}

function side(c: StatCell, part: Part): Direction {
  const v = c.real[part]
  const lo = c.low[part]
  const hi = c.high[part]
  if (v == null || lo == null || hi == null) return null
  return v < lo ? 'low' : v > hi ? 'high' : null
}

function verdictText(g: StatGroup, c: StatCell): string {
  if (c.verdict === 'normal') return '跟洗亂的牌一樣'
  if (c.verdict === 'replicated') return `前段、後段都${word(g, c.direction)} → 可能是規律`
  const parts = (['front', 'back'] as const).filter(p => side(c, p) != null)
  if (parts.length === 0) return `合併看有點${word(g, side(c, 'all'))}，但前後段分開看都沒有 → 巧合`
  return `只有${parts.map(p => PART_NAME[p]).join('、')}${word(g, side(c, parts[0]!))}，另一段沒有 → 巧合`
}

function fmt(kind: StatGroup['kind'], v: number | null): string {
  if (v == null || Number.isNaN(v)) return '—'
  return kind === 'p' ? `${(v * 100).toFixed(1)}%` : v.toFixed(3)
}

const VERDICT_COLOR: Record<StatCell['verdict'], 'error' | 'warning' | 'neutral'> = {
  replicated: 'error',
  partial: 'warning',
  normal: 'neutral'
}

// ---------- 區塊 ----------

const showAll = ref<Record<string, boolean>>({})

const sections = computed(() => (result.value?.groups ?? []).map((g) => {
  const replicated = g.cells.filter(c => c.verdict === 'replicated').length
  const partial = g.cells.filter(c => c.verdict === 'partial').length
  const flagged = g.cells.filter(c => c.verdict !== 'normal')
  let answer: string
  if (replicated > 0) answer = `有 ${replicated} 項前段、後段都出現 → 可能是規律（見下方紅色）。`
  else if (partial > 0) answer = `沒有。${g.cells.length} 項中有 ${partial} 項只在單一段出現（屬於巧合），其餘都跟洗亂的牌一樣。`
  else answer = `沒有。${g.cells.length} 項都跟洗亂的牌一樣。`
  return {
    group: g,
    ...SECTION[g.id] ?? { question: g.title, how: g.description },
    answer,
    ok: replicated === 0,
    rows: showAll.value[g.id] ? g.cells : flagged,
    hidden: showAll.value[g.id] ? 0 : g.cells.length - flagged.length
  }
}))

const total = computed(() => result.value?.calibration.cells ?? 0)
const found = computed(() => result.value?.calibration.realReplicated ?? 0)
const pairsOk = computed(() => {
  const p = result.value?.pairs
  return p != null && p.realMore <= p.shuffleMore.p95 && p.realLess <= p.shuffleLess.p95
})

const pad2 = (n: number) => String(n).padStart(2, '0')
const times = (n: number, e: number) => `${n} 次（一般約 ${e.toFixed(1)} 次）`
const showPairs = ref(false)
const pairLists = computed(() => {
  const p = result.value?.pairs
  if (!p) return []
  return [
    { key: 'more', title: '前後段都特別常接著出現', items: p.more as PairItem[] },
    { key: 'less', title: '前後段都特別少接著出現', items: p.less as PairItem[] }
  ]
})
</script>

<template>
  <div class="space-y-6">
    <!-- 這頁在問什麼 -->
    <UCard>
      <div class="space-y-3 text-sm">
        <p class="text-base font-semibold">
          這頁在問：開獎號碼的「先後順序」裡，有沒有藏著規律？
        </p>
        <p>例如：這期開了 12，下期是不是特別容易開 19？最近常開的號碼，接下來是不是還會常開？</p>
        <div class="rounded-md bg-elevated p-3 space-y-1.5">
          <p class="font-semibold">
            怎麼測：洗牌比較
          </p>
          <p>① 拿 {{ result?.meta.drawCount ?? 700 }} 期真實開獎，每期 5 個號碼原封不動，只把<span class="font-semibold">期與期的先後順序洗亂</span>。洗亂的牌，順序一定沒有規律。</p>
          <p>② 洗 {{ result?.meta.shuffles ?? 200 }} 次，對「真實順序」和「洗亂的順序」量同樣的東西。</p>
          <p>③ 真實順序量到的結果<span class="font-semibold">跟洗亂的牌差不多</span> → 沒有規律；出現<span class="font-semibold">洗亂的牌幾乎不會有的結果</span> → 可能有規律。</p>
          <p>④ 再把期數分成<span class="font-semibold">前段、後段</span>各測一次：兩段都出現、方向相同才算規律；只出現在一段的當作巧合。</p>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <UBadge
            color="neutral"
            variant="outline"
          >
            跟洗亂的牌一樣
          </UBadge>
          <span class="text-muted">沒有規律</span>
          <UBadge
            color="warning"
            variant="subtle"
          >
            巧合
          </UBadge>
          <span class="text-muted">只在一段出現</span>
          <UBadge
            color="error"
            variant="subtle"
          >
            可能是規律
          </UBadge>
          <span class="text-muted">前後段都出現</span>
        </div>
      </div>
    </UCard>

    <div
      v-if="status === 'pending'"
      class="py-10 text-center text-sm text-muted"
    >
      計算中（洗牌比較約需 1–2 秒）…
    </div>
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="`載入失敗：${error.statusMessage ?? error.message}`"
    />

    <template v-else-if="result">
      <!-- 結論 -->
      <UCard>
        <div class="space-y-3">
          <p class="text-xs text-muted">
            結論
          </p>
          <p class="text-2xl font-semibold">
            {{ found === 0 && pairsOk ? '沒有找到規律' : `找到 ${found} 項可能的規律` }}
          </p>
          <p class="text-sm">
            <template v-if="found === 0 && pairsOk">
              這 {{ result.meta.drawCount }} 期的開出順序，量了 {{ total }} 項，加上 {{ result.pairs.pairsChecked.toLocaleString() }} 種號碼接續組合，結果都和同一批號碼洗亂後的順序沒有差別。
            </template>
            <template v-else>
              有項目在前段、後段都和洗亂的牌不同，見下方紅色標示。
            </template>
          </p>
          <p class="text-xs text-muted">
            參考：拿洗亂的牌用同樣標準去判斷，平均也會「誤判」{{ result.calibration.shuffleReplicatedMean.toFixed(1) }} 項，最多約 {{ result.calibration.shuffleReplicatedP95 }} 項。
            前段 = 第 {{ result.meta.front.startTerm }}～{{ result.meta.front.endTerm }} 期（{{ result.meta.front.draws }} 期），後段 = 第 {{ result.meta.back.startTerm }}～{{ result.meta.back.endTerm }} 期（{{ result.meta.back.draws }} 期）。
          </p>
          <UButton
            :to="apiPath"
            target="_blank"
            size="xs"
            color="neutral"
            variant="link"
            icon="i-lucide-file-text"
            class="px-0"
          >
            純文字版（給 LLM 讀）
          </UButton>
        </div>
      </UCard>

      <!-- 各個問題 -->
      <UCard
        v-for="s in sections"
        :key="s.group.id"
      >
        <template #header>
          <div class="flex items-start gap-3">
            <UIcon
              :name="s.ok ? 'i-lucide-circle-check' : 'i-lucide-circle-alert'"
              class="mt-0.5 size-5 shrink-0"
              :class="s.ok ? 'text-success' : 'text-error'"
            />
            <div class="space-y-1">
              <h2 class="font-semibold">
                {{ s.question }}
              </h2>
              <p class="text-sm">
                {{ s.answer }}
              </p>
              <p class="text-xs text-muted">
                {{ s.how }}
              </p>
            </div>
          </div>
        </template>

        <div class="space-y-2">
          <div
            v-for="c in s.rows"
            :key="c.id"
            class="rounded-md border border-default/60 px-3 py-2"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-sm">{{ rowQuestion(s.group, c) }}</span>
              <UBadge
                :color="VERDICT_COLOR[c.verdict]"
                :variant="c.verdict === 'normal' ? 'outline' : 'subtle'"
              >
                {{ verdictText(s.group, c) }}
              </UBadge>
            </div>
            <details class="mt-1 text-xs text-muted">
              <summary class="cursor-pointer select-none">
                看細節
              </summary>
              <table class="mt-1.5 w-full max-w-md">
                <thead>
                  <tr class="text-left">
                    <th class="py-0.5 pr-3 font-medium" />
                    <th class="py-0.5 pr-3 font-medium">
                      真實順序
                    </th>
                    <th class="py-0.5 font-medium">
                      洗亂的牌（正常範圍）
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="part in PARTS"
                    :key="part"
                  >
                    <td class="py-0.5 pr-3">
                      {{ PART_NAME[part] }}
                    </td>
                    <td
                      class="py-0.5 pr-3 font-mono"
                      :class="side(c, part) ? 'font-semibold text-warning' : 'text-default'"
                    >
                      {{ fmt(s.group.kind, c.real[part]) }}
                    </td>
                    <td class="py-0.5 font-mono">
                      {{ fmt(s.group.kind, c.low[part]) }} ～ {{ fmt(s.group.kind, c.high[part]) }}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p
                v-if="s.group.kind === 'r'"
                class="mt-1"
              >
                數字是關聯度：0 = 沒關係，正數 = 同向／延續，負數 = 反向／反轉。
              </p>
            </details>
          </div>

          <UButton
            v-if="s.hidden > 0 || showAll[s.group.id]"
            size="xs"
            color="neutral"
            variant="ghost"
            :icon="showAll[s.group.id] ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            @click="showAll[s.group.id] = !showAll[s.group.id]"
          >
            {{ showAll[s.group.id] ? '只看有標示的項目' : `其餘 ${s.hidden} 項都跟洗亂的牌一樣，展開看` }}
          </UButton>
        </div>
      </UCard>

      <!-- 號碼接續 -->
      <UCard>
        <template #header>
          <div class="flex items-start gap-3">
            <UIcon
              :name="pairsOk ? 'i-lucide-circle-check' : 'i-lucide-circle-alert'"
              class="mt-0.5 size-5 shrink-0"
              :class="pairsOk ? 'text-success' : 'text-error'"
            />
            <div class="space-y-1">
              <h2 class="font-semibold">
                開了某個號碼，下期會特別容易開某個號碼嗎？
              </h2>
              <p class="text-sm">
                <template v-if="pairsOk">
                  沒有。看起來特別常接著出現的組合，數量和洗亂的牌一樣多，屬於巧合。
                </template>
                <template v-else>
                  這類組合的數量比洗亂的牌多，可能有規律。
                </template>
              </p>
              <p class="text-xs text-muted">
                「這期開 i → 下期開 j」共 {{ result.pairs.pairsChecked.toLocaleString() }} 種組合。組合這麼多，就算完全沒有規律，也一定會有一些剛好特別常（或特別少）接著出現，所以要看「數量」有沒有比洗亂的牌多。
              </p>
            </div>
          </div>
        </template>

        <div class="space-y-3 text-sm">
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-md bg-elevated p-3">
              <div class="text-xs text-muted">
                前後段都特別常接著出現
              </div>
              <div>
                真實：<span class="font-mono text-lg font-semibold">{{ result.pairs.realMore }}</span> 種
                <span class="text-muted">／洗亂的牌平均 {{ result.pairs.shuffleMore.mean.toFixed(1) }} 種</span>
              </div>
            </div>
            <div class="rounded-md bg-elevated p-3">
              <div class="text-xs text-muted">
                前後段都特別少接著出現
              </div>
              <div>
                真實：<span class="font-mono text-lg font-semibold">{{ result.pairs.realLess }}</span> 種
                <span class="text-muted">／洗亂的牌平均 {{ result.pairs.shuffleLess.mean.toFixed(1) }} 種</span>
              </div>
            </div>
          </div>

          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            :icon="showPairs ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            @click="showPairs = !showPairs"
          >
            {{ showPairs ? '收起組合清單' : '看是哪些組合' }}
          </UButton>

          <div
            v-if="showPairs"
            class="grid gap-6 lg:grid-cols-2"
          >
            <section
              v-for="list in pairLists"
              :key="list.key"
              class="min-w-0 space-y-2"
            >
              <h3 class="text-sm font-semibold">
                {{ list.title }}（{{ list.items.length }} 種）
              </h3>
              <div class="max-h-80 overflow-auto">
                <table class="w-full text-sm">
                  <thead class="sticky top-0 bg-default">
                    <tr class="border-b border-default text-left text-xs text-muted">
                      <th class="py-1 pr-3 font-medium">
                        這期 → 下期
                      </th>
                      <th class="py-1 pr-3 font-medium">
                        前段
                      </th>
                      <th class="py-1 font-medium">
                        後段
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="x in list.items"
                      :key="`${x.from}-${x.to}`"
                      class="border-b border-default/50"
                    >
                      <td class="py-1 pr-3 font-mono">
                        {{ pad2(x.from) }} → {{ pad2(x.to) }}
                      </td>
                      <td class="py-1 pr-3 text-xs">
                        {{ times(x.front, x.frontExpected) }}
                      </td>
                      <td class="py-1 text-xs">
                        {{ times(x.back, x.backExpected) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </UCard>

      <!-- 名詞 -->
      <UCard>
        <details class="text-sm">
          <summary class="cursor-pointer font-semibold select-none">
            名詞說明
          </summary>
          <ul class="mt-3 space-y-1.5">
            <li><span class="font-semibold">隔期</span>：這個號碼距離上次開出，中間隔了幾期。0 = 上期剛開過。</li>
            <li><span class="font-semibold">隔期和／最大隔期</span>：這期 5 個號碼的隔期加總／最大值。</li>
            <li><span class="font-semibold">重號數</span>：這期有幾個號碼上期也開過。</li>
            <li><span class="font-semibold">現值</span>：隔期狀態表中，號碼來源那一列「已連續幾期沒開出」的數字。</li>
            <li><span class="font-semibold">位置 x / y</span>：號碼來源那一列當時還剩 x 個號碼，它排第 y 小。x=1 = 那一列只剩它；y=1 = 它是那一列最小的。</li>
            <li><span class="font-semibold">大號</span>：20～39。<span class="font-semibold">尾數種類</span>：5 個號碼的個位數有幾種。<span class="font-semibold">連號組數</span>：相鄰號碼（如 12、13）有幾組。</li>
            <li><span class="font-semibold">一般約 N 次</span>：用這一段自己的資料推算，i 跟 j 互不相干時，「這期 i → 下期 j」大約會出現幾次。</li>
          </ul>
        </details>
      </UCard>
    </template>
  </div>
</template>
