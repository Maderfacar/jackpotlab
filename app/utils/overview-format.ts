/**
 * 一頁總覽的顯示小工具：期號縮短、日期、狀態顏色。
 */
import type { StateTone } from '~~/shared/lotto/overview/coords'

/** 一頁總覽底部四個畫面 */
export type OverviewView = 'board' | 'position' | 'numbers' | 'waves'
export const OVERVIEW_VIEWS: OverviewView[] = ['board', 'position', 'numbers', 'waves']

/** 115000259 → 115259（一年不會超過一千期；同 /draws） */
export function shortIssue(issue: string): string {
  const m = /^(\d{2,3})000(\d{3})$/.exec(issue)
  return m ? `${m[1]}${m[2]}` : issue
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六']

/** 2026-10-26 → 10/26（一） */
export function mdw(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  return `${date.slice(5, 7)}/${date.slice(8, 10)}（${WEEK[day]}）`
}

export const pad2 = (n: number) => String(n).padStart(2, '0')

/** 狀態格的底色：偏一邊用琥珀、另一邊用天藍，越偏越深 */
export function toneStyle(t: StateTone): Record<string, string> {
  const pct = Math.round(16 + t.strength * 64)
  const color = t.side === 1 ? 'var(--ov-warm)' : t.side === -1 ? 'var(--ov-cool)' : 'var(--ov-mid)'
  return {
    'background': `color-mix(in oklab, ${color} ${pct}%, var(--ov-paper))`,
    'color': pct >= 56 ? 'var(--ov-ink-on)' : 'var(--ov-ink)',
    '--ov-edge': color
  }
}

/** 百分比整數 */
export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)
