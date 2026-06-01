/**
 * 純診斷 — 揭露 env var 「是否存在 + 長度 + 首尾 8 字元」，不洩漏完整值。
 * 用完即刪。
 */
export default defineEventHandler(() => {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  const adc = process.env.GOOGLE_APPLICATION_CREDENTIALS
  const projId = process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID

  const safe = (v: string | undefined) => {
    if (!v) return { exists: false }
    return {
      exists: true,
      length: v.length,
      head: v.slice(0, 12),
      tail: v.slice(-12),
      hasNewlines: v.includes('\n'),
      hasEscapedNewlines: v.includes('\\n')
    }
  }

  return {
    NODE_ENV: process.env.NODE_ENV ?? null,
    VERCEL: process.env.VERCEL ?? null,
    VERCEL_ENV: process.env.VERCEL_ENV ?? null,
    FIREBASE_SERVICE_ACCOUNT_JSON: safe(sa),
    GOOGLE_APPLICATION_CREDENTIALS: safe(adc),
    NUXT_PUBLIC_FIREBASE_PROJECT_ID: safe(projId)
  }
})
