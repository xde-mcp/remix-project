import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import type { CIStatusResponse } from '../types'

const POLL_INTERVAL = 5000

export function useCIStatus(pipelineId: string | null, onLog: (message: string) => void) {
  const [ciStatus, setCiStatus] = useState<CIStatusResponse | null>(null)
  const [isPolling, setIsPolling] = useState(false)

  const fetchStatus = useCallback(async () => {
    if (!pipelineId) return

    try {
      const status = await api.getCIStatus(pipelineId)
      setCiStatus(status)

      const wfLines = (status.workflows || [])
        .map(wf => `  - ${wf.name}  ${wf.status.padEnd(10, ' ')}  (id ${wf.id})`)
        .join('\n')
      const counts = status.summary?.counts ? JSON.stringify(status.summary.counts) : '{}'
      const ui = status.uiUrl ? `\n  ${status.uiUrl}\n` : '\n'
      
      onLog(`status: pipeline ${status.pipeline.number || ''} state=${status.pipeline.state} workflows=${counts}${ui}${wfLines}`)

      // Check if done
      const allDone = status.summary?.done || false
      if (allDone) {
        onLog('pipeline complete.')
        setIsPolling(false)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      onLog(`status error: ${message}`)
    }
  }, [pipelineId, onLog])

  useEffect(() => {
    if (!pipelineId || !isPolling) return

    fetchStatus()
    const interval = setInterval(fetchStatus, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [pipelineId, isPolling, fetchStatus])

  const startPolling = useCallback(() => {
    setIsPolling(true)
  }, [])

  const forceRefresh = useCallback(() => {
    fetchStatus()
  }, [fetchStatus])

  return { ciStatus, startPolling, isPolling, forceRefresh }
}
