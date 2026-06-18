<script setup lang="ts">
/**
 * 賓果海尼根浮動選號工具
 *
 * - 右下角固定 FAB，點開全螢幕 modal（手機）/ 置中卡片（桌機）
 * - 一張單可以含多注：星等注 / 大小注 / 單雙注，每注獨立倍數
 * - 上：已加入注清單（可刪除）
 * - 中：草稿區（切換注型 → 編輯 → 確認加入）
 * - 下：QR Code（M 容錯 + 螢幕亮度提示）
 */
import QRCode from 'qrcode'
import {
  buildBetslipDataString,
  makeEmptyBetslip,
  newBigSmallBet,
  newOddEvenBet,
  newStarBet,
  summarizeBet,
  validateBet,
  validateBetslip,
  MULTIPLIER_OPTIONS,
  STAR_OPTIONS,
  TOTAL_NUMBERS,
  type Bet,
  type BetKind,
  type Multiplier
} from '~/utils/bingo-bet'

const open = ref(false)
const slip = ref(makeEmptyBetslip())
const draft = ref<Bet>(newStarBet())
const qrDataUrl = ref('')
const qrError = ref<string | null>(null)

const draftValidation = computed(() => validateBet(draft.value))
const slipValidation = computed(() => validateBetslip(slip.value))
const dataString = computed(() => buildBetslipDataString(slip.value))

const allNumbers = computed(() =>
  Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1)
)

const draftRemainingPicks = computed(() => {
  if (draft.value.kind !== 'star') return 0
  return draft.value.stars - draft.value.numbers.length
})

function toggleOpen() {
  open.value = !open.value
}

function close() {
  open.value = false
}

function switchDraftKind(kind: BetKind) {
  if (kind === 'star') draft.value = newStarBet()
  else if (kind === 'bigsmall') draft.value = newBigSmallBet()
  else draft.value = newOddEvenBet()
}

function setStars(s: number) {
  if (draft.value.kind !== 'star') return
  draft.value.stars = s
  if (draft.value.numbers.length > s) {
    draft.value.numbers = draft.value.numbers.slice(0, s)
  }
}

function isPicked(n: number): boolean {
  return draft.value.kind === 'star' && draft.value.numbers.includes(n)
}

function toggleNumber(n: number) {
  if (draft.value.kind !== 'star') return
  if (isPicked(n)) {
    draft.value.numbers = draft.value.numbers.filter(x => x !== n)
    return
  }
  if (draft.value.numbers.length >= draft.value.stars) return
  draft.value.numbers = [...draft.value.numbers, n]
}

function setMultiplier(m: Multiplier) {
  draft.value.multiplier = m
}

function setBigSmall(v: 'big' | 'small') {
  if (draft.value.kind !== 'bigsmall') return
  draft.value.value = v
}

function setOddEven(v: 'odd' | 'even') {
  if (draft.value.kind !== 'oddeven') return
  draft.value.value = v
}

function randomPick() {
  if (draft.value.kind !== 'star') return
  const pool = Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = pool[i] as number
    pool[i] = pool[j] as number
    pool[j] = tmp
  }
  draft.value.numbers = pool.slice(0, draft.value.stars).sort((a, b) => a - b)
}

function clearDraft() {
  switchDraftKind(draft.value.kind)
}

function addDraftToSlip() {
  if (!draftValidation.value.valid) return
  slip.value.bets = [...slip.value.bets, JSON.parse(JSON.stringify(draft.value)) as Bet]
  // 加完之後保留同一注型，但欄位歸零，方便連續打同型不同號的注
  clearDraft()
}

function removeBet(idx: number) {
  slip.value.bets = slip.value.bets.filter((_, i) => i !== idx)
}

function clearAllBets() {
  slip.value = makeEmptyBetslip()
}

async function renderQr() {
  qrError.value = null
  if (!slipValidation.value.valid) {
    qrDataUrl.value = ''
    return
  }
  try {
    qrDataUrl.value = await QRCode.toDataURL(dataString.value, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: { dark: '#000000', light: '#ffffff' }
    })
  } catch (e: unknown) {
    qrError.value = e instanceof Error ? e.message : 'QR 產生失敗'
    qrDataUrl.value = ''
  }
}

watch([dataString, () => slipValidation.value.valid], () => {
  renderQr()
}, { immediate: true })

watch(open, (v) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = v ? 'hidden' : ''
})

onUnmounted(() => {
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})

const kindLabel = (k: BetKind) => k === 'star' ? '星等注' : k === 'bigsmall' ? '大小注' : '單雙注'
const kindIcon = (k: BetKind) =>
  k === 'star' ? 'i-lucide-star' : k === 'bigsmall' ? 'i-lucide-scale' : 'i-lucide-binary'
</script>

<template>
  <!-- 右下角浮動按鈕 -->
  <button
    type="button"
    class="bet-fab"
    aria-label="開啟賓果選號工具"
    @click="toggleOpen"
  >
    <UIcon
      name="i-lucide-ticket"
      class="size-6"
    />
    <span class="bet-fab-label">選號</span>
    <span
      v-if="slip.bets.length > 0"
      class="bet-fab-badge"
    >{{ slip.bets.length }}</span>
  </button>

  <!-- 浮動面板 -->
  <Teleport to="body">
    <Transition name="bet-fade">
      <div
        v-if="open"
        class="bet-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="賓果選號工具"
        @click.self="close"
      >
        <div class="bet-panel">
          <!-- Header -->
          <header class="bet-panel-header">
            <div>
              <h2 class="text-lg font-semibold">
                賓果選號 / QR
              </h2>
              <p class="text-xs text-muted">
                請把手機亮度調最大再讓店家掃描
              </p>
            </div>
            <button
              type="button"
              class="bet-close"
              aria-label="關閉"
              @click="close"
            >
              <UIcon
                name="i-lucide-x"
                class="size-5"
              />
            </button>
          </header>

          <div class="bet-panel-body">
            <!-- 已加入注清單 -->
            <section class="bet-section">
              <div class="bet-section-title">
                <span>本單注內容（{{ slip.bets.length }} 注）</span>
                <button
                  v-if="slip.bets.length > 0"
                  type="button"
                  class="bet-link-btn"
                  @click="clearAllBets"
                >
                  全部清除
                </button>
              </div>
              <ul
                v-if="slip.bets.length > 0"
                class="bet-list"
              >
                <li
                  v-for="(b, i) in slip.bets"
                  :key="i"
                  class="bet-list-item"
                >
                  <UIcon
                    :name="kindIcon(b.kind)"
                    class="size-4 text-primary"
                  />
                  <span class="bet-list-text">{{ summarizeBet(b) }}</span>
                  <button
                    type="button"
                    class="bet-list-del"
                    aria-label="刪除此注"
                    @click="removeBet(i)"
                  >
                    <UIcon
                      name="i-lucide-x"
                      class="size-4"
                    />
                  </button>
                </li>
              </ul>
              <p
                v-else
                class="bet-empty-hint"
              >
                還沒有任何注，從下方草稿區加入。
              </p>
            </section>

            <!-- 草稿區 -->
            <section class="bet-section bet-draft">
              <div class="bet-section-title">
                <span>新增注</span>
              </div>

              <!-- 注型切換 -->
              <div class="bet-chips">
                <button
                  v-for="k in (['star', 'bigsmall', 'oddeven'] as BetKind[])"
                  :key="k"
                  type="button"
                  class="bet-chip"
                  :class="{ active: draft.kind === k }"
                  @click="switchDraftKind(k)"
                >
                  <UIcon
                    :name="kindIcon(k)"
                    class="size-3.5 mr-1 align-middle"
                  />
                  {{ kindLabel(k) }}
                </button>
              </div>

              <!-- 星等注 -->
              <template v-if="draft.kind === 'star'">
                <div class="bet-subtitle">
                  <span>星等</span>
                  <span class="text-xs text-muted">
                    已選 {{ draft.numbers.length }} / {{ draft.stars }}
                  </span>
                </div>
                <div class="bet-chips">
                  <button
                    v-for="s in STAR_OPTIONS"
                    :key="s"
                    type="button"
                    class="bet-chip"
                    :class="{ active: draft.stars === s }"
                    @click="setStars(s)"
                  >
                    {{ s }}星
                  </button>
                </div>

                <div class="bet-subtitle">
                  <span>號碼（01-80）</span>
                  <span
                    v-if="draftRemainingPicks > 0"
                    class="text-xs text-primary"
                  >還可選 {{ draftRemainingPicks }}</span>
                  <span
                    v-else
                    class="text-xs text-success"
                  >已選滿</span>
                </div>
                <div class="bet-grid">
                  <button
                    v-for="n in allNumbers"
                    :key="n"
                    type="button"
                    class="bet-num"
                    :class="{
                      picked: isPicked(n),
                      disabled: !isPicked(n) && draftRemainingPicks === 0
                    }"
                    @click="toggleNumber(n)"
                  >
                    {{ n.toString().padStart(2, '0') }}
                  </button>
                </div>
                <div class="flex gap-2 pt-2">
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-shuffle"
                    @click="randomPick"
                  >
                    電腦選號
                  </UButton>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-eraser"
                    @click="clearDraft"
                  >
                    清除
                  </UButton>
                </div>
              </template>

              <!-- 大小注 -->
              <template v-else-if="draft.kind === 'bigsmall'">
                <div class="bet-subtitle">
                  <span>大或小</span>
                </div>
                <div class="bet-chips">
                  <button
                    type="button"
                    class="bet-chip"
                    :class="{ active: draft.value === 'big' }"
                    @click="setBigSmall('big')"
                  >
                    大（&gt;40）
                  </button>
                  <button
                    type="button"
                    class="bet-chip"
                    :class="{ active: draft.value === 'small' }"
                    @click="setBigSmall('small')"
                  >
                    小（≤40）
                  </button>
                </div>
              </template>

              <!-- 單雙注 -->
              <template v-else-if="draft.kind === 'oddeven'">
                <div class="bet-subtitle">
                  <span>單或雙</span>
                </div>
                <div class="bet-chips">
                  <button
                    type="button"
                    class="bet-chip"
                    :class="{ active: draft.value === 'odd' }"
                    @click="setOddEven('odd')"
                  >
                    單
                  </button>
                  <button
                    type="button"
                    class="bet-chip"
                    :class="{ active: draft.value === 'even' }"
                    @click="setOddEven('even')"
                  >
                    雙
                  </button>
                </div>
              </template>

              <!-- 此注倍數 -->
              <div class="bet-subtitle">
                <span>此注倍數</span>
              </div>
              <div class="bet-chips">
                <button
                  v-for="m in MULTIPLIER_OPTIONS"
                  :key="m"
                  type="button"
                  class="bet-chip"
                  :class="{ active: draft.multiplier === m }"
                  @click="setMultiplier(m)"
                >
                  {{ m }}x
                </button>
              </div>

              <!-- 加入此注 -->
              <div class="bet-draft-actions">
                <UButton
                  block
                  color="primary"
                  :disabled="!draftValidation.valid"
                  icon="i-lucide-plus-circle"
                  @click="addDraftToSlip"
                >
                  加入此注 ({{ summarizeBet(draft) }})
                </UButton>
                <ul
                  v-if="!draftValidation.valid"
                  class="bet-warn"
                >
                  <li
                    v-for="r in draftValidation.reasons"
                    :key="r"
                  >
                    {{ r }}
                  </li>
                </ul>
              </div>
            </section>

            <!-- QR 區 -->
            <section class="bet-section">
              <div class="bet-section-title">
                <span>QR Code</span>
                <span class="text-xs text-muted">M 容錯</span>
              </div>
              <div
                v-if="slipValidation.valid"
                class="bet-qr-wrap"
              >
                <div class="bet-qr-tip">
                  <UIcon
                    name="i-lucide-sun"
                    class="size-4"
                  />
                  記得把螢幕亮度開到最大
                </div>
                <img
                  v-if="qrDataUrl"
                  :src="qrDataUrl"
                  alt="賓果投注 QR Code"
                  class="bet-qr-img"
                  draggable="false"
                >
                <div
                  v-if="qrError"
                  class="text-xs text-error pt-2"
                >
                  {{ qrError }}
                </div>
                <details class="bet-debug">
                  <summary>Data String（暫時格式，待真實格式上線）</summary>
                  <code>{{ dataString }}</code>
                </details>
              </div>
              <div
                v-else
                class="bet-qr-empty"
              >
                <UIcon
                  name="i-lucide-info"
                  class="size-4"
                />
                <ul>
                  <li
                    v-for="r in slipValidation.reasons"
                    :key="r"
                  >
                    {{ r }}
                  </li>
                </ul>
              </div>
            </section>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.bet-fab {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 60px;
  height: 60px;
  border-radius: 999px;
  background: var(--ui-primary, #f59e0b);
  color: #1a1a1a;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.06);
  border: none;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.bet-fab:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(0, 0, 0, 0.45); }
.bet-fab:active { transform: translateY(0); }
.bet-fab-label { font-size: 10px; font-weight: 600; letter-spacing: 0.04em; }
.bet-fab-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.4);
}

.bet-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.bet-panel {
  width: 100%;
  max-width: 480px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  background: var(--ui-bg, #18181b);
  color: var(--ui-text, #fafafa);
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

@media (min-width: 768px) {
  .bet-overlay { align-items: center; }
  .bet-panel { border-radius: 16px; max-height: 88vh; }
}

.bet-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent);
}

.bet-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--ui-text);
  border: none;
  cursor: pointer;
}

.bet-close:hover { background: rgba(255, 255, 255, 0.14); }

.bet-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px 28px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.bet-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  padding-bottom: 8px;
  color: var(--ui-text);
}

.bet-section-title > :last-child { font-weight: 400; }

.bet-subtitle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-muted, #a1a1aa);
}

.bet-draft {
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 12px;
}

.bet-link-btn {
  background: none;
  border: none;
  color: var(--ui-muted, #a1a1aa);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
}

.bet-link-btn:hover { color: var(--ui-text); text-decoration: underline; }

.bet-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  list-style: none;
  padding: 0;
  margin: 0;
}

.bet-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.bet-list-text { flex: 1; }

.bet-list-del {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--ui-text);
  border: none;
  cursor: pointer;
}

.bet-list-del:hover { background: rgba(239, 68, 68, 0.4); }

.bet-empty-hint {
  font-size: 12px;
  color: var(--ui-muted, #a1a1aa);
  padding: 10px 0;
}

.bet-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bet-chip {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
  color: var(--ui-text);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.12s ease;
  min-width: 44px;
}

.bet-chip:hover { background: rgba(255, 255, 255, 0.06); }
.bet-chip.active {
  background: var(--ui-primary, #f59e0b);
  color: #1a1a1a;
  border-color: transparent;
  font-weight: 600;
}

.bet-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 6px;
}

.bet-num {
  aspect-ratio: 1 / 1;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
  color: var(--ui-text);
  border-radius: 8px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: transform 0.06s ease, background 0.12s ease, border-color 0.12s ease;
}

.bet-num:hover { background: rgba(255, 255, 255, 0.06); }
.bet-num.picked {
  background: var(--ui-primary, #f59e0b);
  color: #1a1a1a;
  border-color: transparent;
  font-weight: 700;
  transform: scale(0.98);
}

.bet-num.disabled { opacity: 0.35; cursor: not-allowed; }
.bet-num.disabled:hover { background: rgba(255, 255, 255, 0.03); }

.bet-draft-actions {
  padding-top: 12px;
  border-top: 1px dashed rgba(255, 255, 255, 0.08);
  margin-top: 14px;
}

.bet-warn {
  list-style: disc;
  padding-left: 18px;
  font-size: 12px;
  color: #facc15;
  margin-top: 8px;
}

.bet-qr-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
}

.bet-qr-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #fbbf24;
}

.bet-qr-img {
  width: 240px;
  height: 240px;
  border-radius: 8px;
  background: #fff;
  padding: 8px;
  user-select: none;
}

.bet-debug {
  width: 100%;
  font-size: 11px;
  color: var(--ui-muted, #a1a1aa);
}

.bet-debug summary { cursor: pointer; padding: 4px 0; }
.bet-debug code {
  display: block;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 6px;
  padding: 8px;
  word-break: break-all;
  white-space: pre-wrap;
  margin-top: 4px;
}

.bet-qr-empty {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  padding: 12px;
  background: rgba(250, 204, 21, 0.06);
  border: 1px solid rgba(250, 204, 21, 0.18);
  border-radius: 12px;
  color: #facc15;
}

.bet-qr-empty ul { list-style: disc; padding-left: 18px; }

.bet-fade-enter-active,
.bet-fade-leave-active { transition: opacity 0.18s ease; }

.bet-fade-enter-active .bet-panel,
.bet-fade-leave-active .bet-panel {
  transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.bet-fade-enter-from,
.bet-fade-leave-to { opacity: 0; }

.bet-fade-enter-from .bet-panel,
.bet-fade-leave-to .bet-panel { transform: translateY(20px); }
</style>
