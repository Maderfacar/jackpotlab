<script setup lang="ts">
/**
 * 賓果海尼根浮動選號工具
 *
 * - 右下角固定 FAB，點開全螢幕 modal（手機）/ 置中卡片（桌機）
 * - 內含 1-80 號碼牌、星等、大小、單雙、倍數選擇
 * - 即時產生 QR Code（暫時字串，正式編碼等樣本敲定）
 * - 提示「請把螢幕亮度調到最大」
 */
import QRCode from 'qrcode'
import {
  buildBetDataString,
  makeEmptyBet,
  validateBet,
  MULTIPLIER_OPTIONS,
  STAR_OPTIONS,
  TOTAL_NUMBERS,
  type BigSmall,
  type Multiplier,
  type OddEven
} from '~/utils/bingo-bet'

const open = ref(false)
const bet = ref(makeEmptyBet())
const qrDataUrl = ref('')
const qrError = ref<string | null>(null)

const validation = computed(() => validateBet(bet.value))
const dataString = computed(() => buildBetDataString(bet.value))
const remainingPicks = computed(() => bet.value.stars - bet.value.numbers.length)

const playSelectionComplete = computed(
  () => bet.value.numbers.length === bet.value.stars
)

function toggleOpen() {
  open.value = !open.value
}

function close() {
  open.value = false
}

function isPicked(n: number): boolean {
  return bet.value.numbers.includes(n)
}

function toggleNumber(n: number) {
  if (isPicked(n)) {
    bet.value.numbers = bet.value.numbers.filter(x => x !== n)
    return
  }
  if (bet.value.numbers.length >= bet.value.stars) return // 達上限不再加
  bet.value.numbers = [...bet.value.numbers, n]
}

function setStars(s: number) {
  bet.value.stars = s
  // 如果之前選太多，裁掉多餘
  if (bet.value.numbers.length > s) {
    bet.value.numbers = bet.value.numbers.slice(0, s)
  }
}

function setMultiplier(m: Multiplier) {
  bet.value.multiplier = m
}

function setBigSmall(v: Exclude<BigSmall, null>) {
  bet.value.bigSmall = bet.value.bigSmall === v ? null : v
}

function setOddEven(v: Exclude<OddEven, null>) {
  bet.value.oddEven = bet.value.oddEven === v ? null : v
}

function clearAll() {
  bet.value = makeEmptyBet()
}

function randomPick() {
  const pool = Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = pool[i] as number
    pool[i] = pool[j] as number
    pool[j] = tmp
  }
  bet.value.numbers = pool.slice(0, bet.value.stars).sort((a, b) => a - b)
}

async function renderQr() {
  qrError.value = null
  if (!validation.value.valid) {
    qrDataUrl.value = ''
    return
  }
  try {
    qrDataUrl.value = await QRCode.toDataURL(dataString.value, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })
  } catch (e: unknown) {
    qrError.value = e instanceof Error ? e.message : 'QR 產生失敗'
    qrDataUrl.value = ''
  }
}

watch([dataString, () => validation.value.valid], () => {
  renderQr()
}, { immediate: true })

const allNumbers = computed(() =>
  Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1)
)

// 點開時鎖 body scroll
watch(open, (v) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = v ? 'hidden' : ''
})

onUnmounted(() => {
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})
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
            <!-- 星等 -->
            <section class="bet-section">
              <div class="bet-section-title">
                <span>星等</span>
                <span class="text-xs text-muted">
                  已選 {{ bet.numbers.length }} / {{ bet.stars }}
                </span>
              </div>
              <div class="bet-chips">
                <button
                  v-for="s in STAR_OPTIONS"
                  :key="s"
                  type="button"
                  class="bet-chip"
                  :class="{ active: bet.stars === s }"
                  @click="setStars(s)"
                >
                  {{ s }}星
                </button>
              </div>
            </section>

            <!-- 1-80 號碼牌 -->
            <section class="bet-section">
              <div class="bet-section-title">
                <span>號碼（01-80）</span>
                <span
                  v-if="remainingPicks > 0"
                  class="text-xs text-primary"
                >還可選 {{ remainingPicks }}</span>
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
                    disabled: !isPicked(n) && remainingPicks === 0
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
                  @click="clearAll"
                >
                  全部清除
                </UButton>
              </div>
            </section>

            <!-- 加注玩法 -->
            <section class="bet-section">
              <div class="bet-section-title">
                <span>加注玩法</span>
                <span
                  v-if="!playSelectionComplete"
                  class="text-xs text-muted"
                >請先選滿號碼</span>
              </div>
              <div class="bet-rows">
                <div class="bet-row">
                  <span class="bet-row-label">大小</span>
                  <div class="bet-chips">
                    <button
                      type="button"
                      class="bet-chip"
                      :class="{ active: bet.bigSmall === 'big' }"
                      @click="setBigSmall('big')"
                    >
                      大（&gt;40）
                    </button>
                    <button
                      type="button"
                      class="bet-chip"
                      :class="{ active: bet.bigSmall === 'small' }"
                      @click="setBigSmall('small')"
                    >
                      小（≤40）
                    </button>
                  </div>
                </div>
                <div class="bet-row">
                  <span class="bet-row-label">單雙</span>
                  <div class="bet-chips">
                    <button
                      type="button"
                      class="bet-chip"
                      :class="{ active: bet.oddEven === 'odd' }"
                      @click="setOddEven('odd')"
                    >
                      單
                    </button>
                    <button
                      type="button"
                      class="bet-chip"
                      :class="{ active: bet.oddEven === 'even' }"
                      @click="setOddEven('even')"
                    >
                      雙
                    </button>
                  </div>
                </div>
                <div class="bet-row">
                  <span class="bet-row-label">倍數</span>
                  <div class="bet-chips">
                    <button
                      v-for="m in MULTIPLIER_OPTIONS"
                      :key="m"
                      type="button"
                      class="bet-chip"
                      :class="{ active: bet.multiplier === m }"
                      @click="setMultiplier(m)"
                    >
                      {{ m }}x
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <!-- QR 區 -->
            <section class="bet-section">
              <div class="bet-section-title">
                <span>QR Code</span>
                <span class="text-xs text-muted">M 容錯</span>
              </div>
              <div
                v-if="validation.valid"
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
                    v-for="r in validation.reasons"
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

.bet-fab:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.45);
}

.bet-fab:active {
  transform: translateY(0);
}

.bet-fab-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
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
  .bet-overlay {
    align-items: center;
  }
  .bet-panel {
    border-radius: 16px;
    max-height: 88vh;
  }
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

.bet-close:hover {
  background: rgba(255, 255, 255, 0.14);
}

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

.bet-section-title > :last-child {
  font-weight: 400;
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

.bet-chip:hover {
  background: rgba(255, 255, 255, 0.06);
}

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

.bet-num:hover {
  background: rgba(255, 255, 255, 0.06);
}

.bet-num.picked {
  background: var(--ui-primary, #f59e0b);
  color: #1a1a1a;
  border-color: transparent;
  font-weight: 700;
  transform: scale(0.98);
}

.bet-num.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.bet-num.disabled:hover {
  background: rgba(255, 255, 255, 0.03);
}

.bet-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bet-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bet-row-label {
  width: 56px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text);
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

.bet-debug summary {
  cursor: pointer;
  padding: 4px 0;
}

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

.bet-qr-empty ul {
  list-style: disc;
  padding-left: 18px;
}

.bet-fade-enter-active,
.bet-fade-leave-active {
  transition: opacity 0.18s ease;
}

.bet-fade-enter-active .bet-panel,
.bet-fade-leave-active .bet-panel {
  transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.bet-fade-enter-from,
.bet-fade-leave-to {
  opacity: 0;
}

.bet-fade-enter-from .bet-panel,
.bet-fade-leave-to .bet-panel {
  transform: translateY(20px);
}
</style>
