<script setup lang="ts">
definePageMeta({
  title: '系統健康'
})

interface SourceStatus {
  url: string
  status: 'ok' | 'degraded' | 'down'
  latencyMs: number | null
  error: string | null
}

interface GameHealth {
  id: string
  name: string
  cadenceLabel: string
  drawSchedule: string
  realtime: boolean
  latest: {
    drawTerm: number
    drawDate: string
    fetchedAt: string
    ageSeconds: number
  } | null
  heartbeat: {
    status: 'ok' | 'error' | 'unknown'
    lastRunAt: string | null
    lastSuccessAt: string | null
    lastErrorMessage: string | null
    lastDurationMs: number | null
  } | null
}

interface HealthResponse {
  generatedAt: string
  firestore: { enabled: boolean, message: string }
  source: SourceStatus
  games: GameHealth[]
}

const { data, status, error, refresh } = await useFetch<HealthResponse>('/api/admin/health', {
  key: 'admin-health',
  server: false
})

let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  if (import.meta.client) {
    timer = setInterval(() => refresh(), 30_000)
  }
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const loading = computed(() => status.value === 'pending')

function sourceColor(s: SourceStatus['status']): 'success' | 'warning' | 'error' {
  return s === 'ok' ? 'success' : s === 'degraded' ? 'warning' : 'error'
}

function sourceLabel(s: SourceStatus['status']): string {
  return s === 'ok' ? '正常' : s === 'degraded' ? '緩慢' : '故障'
}

function gameTone(g: GameHealth): 'success' | 'warning' | 'error' | 'neutral' {
  if (!g.latest) return 'neutral'
  if (g.heartbeat?.status === 'error') return 'error'
  if (g.realtime) {
    if (g.latest.ageSeconds > 600) return 'error'
    if (g.latest.ageSeconds > 180) return 'warning'
    return 'success'
  }
  if (g.latest.ageSeconds > 60 * 60 * 24 * 7) return 'warning'
  return 'success'
}

function gameToneLabel(tone: ReturnType<typeof gameTone>): string {
  return tone === 'success' ? '正常'
    : tone === 'warning' ? '注意'
      : tone === 'error' ? '異常'
        : '未抓取'
}

function fmtAge(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  if (seconds < 60) return `${seconds} 秒前`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分鐘前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小時前`
  return `${Math.floor(seconds / 86400)} 天前`
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).format(new Date(iso))
}
</script>

<template>
  <UContainer class="py-10 space-y-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="space-y-1">
        <h1 class="text-3xl font-semibold tracking-tight">系統健康</h1>
        <p class="text-sm text-muted">
          每 30 秒自動更新
          <span
            v-if="data"
            class="ml-2 font-mono text-xs"
          >
            {{ fmtTime(data.generatedAt) }}
          </span>
        </p>
      </div>
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-refresh-cw"
        :loading="loading"
        @click="refresh()"
      >
        立即重新整理
      </UButton>
    </header>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="`Health 查詢失敗: ${error.message ?? '未知錯誤'}`"
    />

    <UAlert
      v-if="data && !data.firestore.enabled"
      color="warning"
      variant="subtle"
      icon="i-lucide-info"
      title="Firebase Admin 未連線"
      :description="data.firestore.message"
    />

    <section
      v-if="data"
      class="grid gap-4 md:grid-cols-2"
    >
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold">資料來源</h2>
            <UBadge
              :color="sourceColor(data.source.status)"
              variant="subtle"
            >
              {{ sourceLabel(data.source.status) }}
            </UBadge>
          </div>
        </template>

        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-muted">URL</span>
            <span class="font-mono text-xs break-all">{{ data.source.url }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">延遲</span>
            <span class="font-mono">{{ data.source.latencyMs ?? '—' }} ms</span>
          </div>
          <div
            v-if="data.source.error"
            class="text-xs text-error"
          >
            {{ data.source.error }}
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold">Firestore</h2>
            <UBadge
              :color="data.firestore.enabled ? 'success' : 'neutral'"
              variant="subtle"
            >
              {{ data.firestore.enabled ? '已連線' : '未連線' }}
            </UBadge>
          </div>
        </template>
        <div class="text-sm text-muted">
          {{ data.firestore.message }}
        </div>
      </UCard>
    </section>

    <section
      v-if="data"
      class="space-y-3"
    >
      <h2 class="text-lg font-semibold">彩種狀態</h2>
      <div class="grid gap-3 md:grid-cols-2">
        <UCard
          v-for="g in data.games"
          :key="g.id"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <h3 class="font-semibold">{{ g.name }}</h3>
                <UBadge
                  color="neutral"
                  variant="subtle"
                  size="xs"
                >
                  {{ g.cadenceLabel }}
                </UBadge>
              </div>
              <UBadge
                :color="gameTone(g)"
                variant="subtle"
              >
                {{ gameToneLabel(gameTone(g)) }}
              </UBadge>
            </div>
          </template>

          <div class="space-y-3 text-sm">
            <div>
              <p class="text-xs text-muted">最新一期</p>
              <p
                v-if="g.latest"
                class="font-mono"
              >
                {{ g.latest.drawTerm }} <span class="text-muted">·</span> {{ g.latest.drawDate }}
              </p>
              <p
                v-else
                class="text-muted"
              >
                尚無資料
              </p>
            </div>

            <div class="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p class="text-muted">最後抓取</p>
                <p class="font-mono">
                  {{ fmtAge(g.latest?.ageSeconds) }}
                </p>
              </div>
              <div>
                <p class="text-muted">心跳</p>
                <p
                  v-if="g.heartbeat"
                  class="font-mono"
                  :class="{ 'text-error': g.heartbeat.status === 'error' }"
                >
                  {{ fmtTime(g.heartbeat.lastRunAt) }}
                </p>
                <p
                  v-else
                  class="text-muted"
                >
                  尚無心跳
                </p>
              </div>
            </div>

            <UAlert
              v-if="g.heartbeat?.status === 'error' && g.heartbeat.lastErrorMessage"
              color="error"
              variant="subtle"
              :description="g.heartbeat.lastErrorMessage"
              icon="i-lucide-triangle-alert"
            />

            <p class="text-xs text-muted">
              排程：{{ g.drawSchedule }}
            </p>
          </div>
        </UCard>
      </div>
    </section>
  </UContainer>
</template>
