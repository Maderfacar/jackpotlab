<script setup lang="ts">
/**
 * 便條紙：一張一個框，打字就自動存在這台裝置。刪掉要再按一次確認。
 */
const { notes, addNote, updateNote, removeNote } = useStickyNotes()

/** 按過一次「刪掉」、等確認的那張 */
const confirming = ref<string | null>(null)

function askRemove(id: string) {
  if (confirming.value === id) {
    removeNote(id)
    confirming.value = null
    return
  }
  confirming.value = id
}

function formatTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date(iso))
  const get = (type: string): string => parts.find(p => p.type === type)?.value ?? ''
  return `${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}
</script>

<template>
  <div class="space-y-3 p-4 text-sm">
    <div class="flex items-center justify-between gap-2">
      <p class="text-xs text-muted">
        存在這台裝置的瀏覽器，換手機或電腦看不到；清除瀏覽器資料會不見。
      </p>
      <UButton
        size="xs"
        icon="i-lucide-plus"
        @click="addNote"
      >
        新增一張
      </UButton>
    </div>

    <p
      v-if="notes.length === 0"
      class="rounded-lg border border-dashed border-default p-6 text-center text-muted"
    >
      還沒有便條，按「新增一張」開始記。
    </p>

    <div
      v-for="note in notes"
      :key="note.id"
      class="note-paper rounded-lg p-3 shadow-sm"
    >
      <textarea
        :value="note.text"
        rows="4"
        class="note-text w-full resize-y bg-transparent outline-none"
        placeholder="寫點什麼…"
        aria-label="便條內容"
        @input="(e: Event) => updateNote(note.id, (e.target as HTMLTextAreaElement).value)"
      />
      <div class="mt-1 flex items-center justify-between text-xs text-muted">
        <span class="font-mono">{{ formatTime(note.updatedAt) }}</span>
        <button
          type="button"
          class="rounded px-1.5 py-0.5 hover:text-error"
          :class="confirming === note.id ? 'bg-error text-white hover:text-white' : ''"
          @click="askRemove(note.id)"
          @blur="confirming = null"
        >
          {{ confirming === note.id ? '確定刪掉？' : '刪掉' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.note-paper {
  background: #fef3c7;
  color: #422006;
}
:global(.dark) .note-paper {
  background: #3f3a1e;
  color: #fef3c7;
}
.note-text {
  /* 一張便條至少佔大半個畫面，不用在小框裡捲（2026-10-22 使用者：七、八成螢幕） */
  min-height: 65dvh;
  font-size: 0.95rem;
  line-height: 1.6;
}
.note-text::placeholder {
  color: currentColor;
  opacity: 0.45;
}
</style>
