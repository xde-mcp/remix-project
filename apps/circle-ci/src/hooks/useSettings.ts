import { useState, useEffect } from 'react'

interface Settings {
  filter?: string
  mode?: string
  browser?: string
  layout?: string
  pinDetails?: boolean
  darkMode?: boolean
  logCollapsed?: boolean
  leftWidthPx?: number
}

const STORAGE_KEY = 'selectTestSettings'

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const parsed = stored ? JSON.parse(stored) : {}
      // Default to dark mode if not set
      if (parsed.darkMode === undefined) {
        parsed.darkMode = true
      }
      return parsed
    } catch {
      return { darkMode: true }
    }
  })

  const updateSettings = (updates: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...updates }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Ignore storage errors
      }
      return next
    })
  }

  // Apply dark mode on mount
  useEffect(() => {
    if (settings.darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [settings.darkMode])

  return { settings, updateSettings }
}
