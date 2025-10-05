import { useState, useEffect } from 'react'

const FAVORITES_KEY = 'selectTestFavorites'

export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY)
      const arr = stored ? JSON.parse(stored) : []
      return new Set(Array.isArray(arr) ? arr : [])
    } catch {
      return new Set()
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites)))
    } catch {
      // Ignore storage errors
    }
  }, [favorites])

  const toggleFavorite = (testName: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(testName)) {
        next.delete(testName)
      } else {
        next.add(testName)
      }
      return next
    })
  }

  const clearFavorites = () => {
    setFavorites(new Set())
  }

  return { favorites, toggleFavorite, clearFavorites }
}
