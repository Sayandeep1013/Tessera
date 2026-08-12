'use client'

/**
 * Theme, as three states rather than two. See docs/specs/16-settings.md §1.
 *
 * The button used to flip a boolean, which meant a visitor whose system is in
 * light mode still landed in dark and had to fix it every time. Auto is the
 * honest default: follow the system until told otherwise, and remember being
 * told.
 *
 * The DOM contract is unchanged — a `dark` or `light` class on documentElement,
 * which is what globals.css keys off and what the canvas now watches with a
 * MutationObserver. Auto resolves to one of those two; it never appears in the
 * DOM itself, because a stylesheet cannot ask what the system prefers on
 * behalf of an element.
 */

import { useCallback, useEffect, useState } from 'react'

export type ThemeMode = 'dark' | 'light' | 'auto'

const KEY = 'tessera-theme'

export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true // spec 16 S-E4
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'auto') return systemPrefersDark() ? 'dark' : 'light'
  return mode
}

/** Read the stored preference. Anything unrecognised is treated as auto. */
export function readThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'auto'
  try {
    const v = localStorage.getItem(KEY)
    return v === 'dark' || v === 'light' || v === 'auto' ? v : 'auto'
  } catch {
    return 'auto' // private mode
  }
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  const resolved = resolveTheme(mode)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.documentElement.classList.toggle('light', resolved === 'light')
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    /* private mode — the class is still applied, it just will not survive */
  }
}

/**
 * The current mode, and a setter. Re-applies on system changes while in auto,
 * which is the whole point of the auto state — a laptop that switches to dark
 * at sunset should take the editor with it.
 */
export function useThemeMode(): [ThemeMode, (m: ThemeMode) => void] {
  // 'auto' on the server and the first client render, so the markup matches;
  // the real value is read after mount. Same reason app/page.tsx defers.
  const [mode, setMode] = useState<ThemeMode>('auto')

  useEffect(() => setMode(readThemeMode()), [])

  useEffect(() => {
    if (mode !== 'auto' || typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('auto')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  const set = useCallback((m: ThemeMode) => {
    setMode(m)
    applyTheme(m)
  }, [])

  return [mode, set]
}
