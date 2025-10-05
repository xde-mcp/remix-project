import { useState, useEffect, useCallback } from 'react'
import { api } from './api'
import { TestTable } from './components/TestTable'
import { ControlPanel } from './components/ControlPanel'
import { LogPanel } from './components/LogPanel'
import { CIPipelineDetails } from './components/CIPipelineDetails'
import { useSettings } from './hooks/useSettings'
import { useFavorites } from './hooks/useFavorites'
import { useCIStatus } from './hooks/useCIStatus'
import type { Test, StatusResponse, Browser } from './types'
import './App.css'

function App() {
  const { settings, updateSettings } = useSettings()
  const { favorites, toggleFavorite, clearFavorites } = useFavorites()
  
  const [tests, setTests] = useState<Test[]>([])
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [log, setLog] = useState<string>('Welcome to Remix E2E Test Runner!\n\nSelect a test and click "Run" to get started.\nYou can filter tests, mark favorites, and monitor CI pipelines.\n')
  const [currentPipelineId, setCurrentPipelineId] = useState<string | null>(null)

  const filter = settings.filter || ''
  const browser = (settings.browser || 'chrome') as Browser
  const darkMode = settings.darkMode ?? true

  const appendLog = useCallback((message: string) => {
    setLog(prev => prev + '\n' + message)
  }, [])

  const { ciStatus, startPolling, forceRefresh } = useCIStatus(currentPipelineId, appendLog)

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [statusRes, testsRes] = await Promise.all([
          api.getStatus(),
          api.getTests()
        ])
        setStatus(statusRes)
        setTests(testsRes.tests || [])

        // Check for running pipelines if token is available
        if (statusRes.hasToken) {
          appendLog('Checking for running pipelines...')
          const runningPipelineId = await api.findRunningPipeline()
          
          if (runningPipelineId) {
            appendLog(`✓ Found running pipeline: ${runningPipelineId}`)
            setCurrentPipelineId(runningPipelineId)
            startPolling()
          } else {
            appendLog('No running pipelines found.')
          }
        }
      } catch (error) {
        console.error('Failed to load initial data:', error)
        appendLog(`Error loading initial data: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
    loadInitialData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredTests = tests.filter(t => 
    t.base.toLowerCase().includes(filter.toLowerCase())
  )

  const favoriteTests = filteredTests.filter(t => favorites.has(t.base))
  const regularTests = filteredTests

  const handleRunTest = async (testName: string) => {
    appendLog(`\n> triggering ${testName} on CircleCI...`)
    
    try {
      const result = await api.trigger(testName, browser)
      appendLog(JSON.stringify(result, null, 2))
      
      if (result.url) {
        appendLog(`Open pipeline: ${result.url}`)
      }

      if (result.pipelineId) {
        setCurrentPipelineId(result.pipelineId)
        startPolling()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      appendLog(`Error: ${message}`)
    }
  }

  const handleSetToken = async () => {
    const token = prompt('CircleCI token')
    if (!token) return
    
    try {
      const result = await api.setToken(token)
      appendLog(`set-token: ${JSON.stringify(result)}`)
      const statusRes = await api.getStatus()
      setStatus(statusRes)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to set token'
      appendLog(`Error: ${message}`)
    }
  }

  const statusText = status
    ? `branch: ${status.branch} · circle token: ${status.hasToken ? '✅' : '⚠️ missing'}`
    : 'Loading…'

  return (
    <div className="app">
      <div className="header">
        <h4>Remix E2E Test Runner</h4>
        <span className={`badge ${status?.hasToken ? 'success' : 'warning'}`}>
          {statusText}
        </span>
      </div>

      <ControlPanel
        filter={filter}
        onFilterChange={(value) => updateSettings({ filter: value })}
        browser={browser}
        onBrowserChange={(b) => updateSettings({ browser: b })}
        darkMode={darkMode}
        onDarkModeChange={(d) => updateSettings({ darkMode: d })}
        onSetToken={handleSetToken}
      />

      <div className="panels-container">
        {/* Left Panel - Tests */}
        <div className="panel panel-tests">
          <div className="panel-header">
            <h5>Tests ({filteredTests.length})</h5>
          </div>
          <div className="panel-content">
            {favoriteTests.length > 0 && (
              <TestTable
                tests={favoriteTests}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                onRunTest={handleRunTest}
                title="Favorites"
                showClearFavorites
                onClearFavorites={clearFavorites}
              />
            )}

            <TestTable
              tests={regularTests}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              onRunTest={handleRunTest}
            />
          </div>
        </div>

        {/* Right Panel - CI Details */}
        {ciStatus && (
          <div className="panel panel-ci">
            <div className="panel-header">
              <h5>CI Pipeline</h5>
            </div>
            <div className="panel-content">
              <CIPipelineDetails
                ciStatus={ciStatus}
                onLog={appendLog}
                pinned={false}
                onRefresh={forceRefresh}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Panel - Logs */}
      <div className="panel panel-log">
        <LogPanel
          content={log}
          collapsed={false}
          onToggle={() => {}}
        />
      </div>
    </div>
  )
}

export default App


