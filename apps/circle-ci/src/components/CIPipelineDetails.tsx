import { useState } from 'react'
import { api } from '../api'
import type { CIStatusResponse, Job } from '../types'
import './CIPipelineDetails.css'

interface CIPipelineDetailsProps {
  ciStatus: CIStatusResponse | null
  onLog: (message: string) => void
  pinned: boolean
  onRefresh?: () => void
}

export function CIPipelineDetails({ ciStatus, onLog, pinned, onRefresh }: CIPipelineDetailsProps) {
  const [expandedArtifacts, setExpandedArtifacts] = useState<Set<number>>(new Set())
  const [artifacts, setArtifacts] = useState<Record<number, { loading: boolean; items: any[] }>>({})

  if (!ciStatus) return null

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      onLog(`✓ Copied to clipboard: ${text}`)
    } catch {
      // Fallback
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      onLog(`✓ Copied to clipboard`)
    }
  }

  const fetchArtifacts = async (job: Job) => {
    if (!ciStatus.pipeline.project_slug) return
    
    const jobNumber = job.job_number
    setExpandedArtifacts(prev => new Set(prev).add(jobNumber))
    setArtifacts(prev => ({ ...prev, [jobNumber]: { loading: true, items: [] } }))

    try {
      const result = await api.getArtifacts(ciStatus.pipeline.project_slug, jobNumber)
      setArtifacts(prev => ({ ...prev, [jobNumber]: { loading: false, items: result.items } }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load artifacts'
      onLog(`Error loading artifacts: ${message}`)
      setArtifacts(prev => ({ ...prev, [jobNumber]: { loading: false, items: [] } }))
    }
  }

  const getStatusBadgeClass = (status: string) => {
    const s = status.toLowerCase()
    if (s === 'success') return 'badge success'
    if (s === 'failed' || s === 'error') return 'badge danger'
    if (s === 'running' || s === 'on_hold') return 'badge info'
    if (s === 'canceled') return 'badge secondary'
    return 'badge secondary'
  }

  const handleCancel = async (workflowId: string) => {
    try {
      await api.cancelWorkflow(workflowId)
      onLog(`✓ Canceled workflow ${workflowId}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel'
      onLog(`✗ Cancel failed: ${message}`)
    }
  }

  const handleRerun = async (workflowId: string, fromFailed: boolean) => {
    try {
      await api.rerunWorkflow(workflowId, fromFailed)
      onLog(`✓ Rerun workflow ${workflowId} (from_failed: ${fromFailed})`)
      
      // Wait a moment for CircleCI to process the rerun, then refresh
      setTimeout(() => {
        onLog('Refreshing status to show new workflow...')
        if (onRefresh) {
          onRefresh()
        }
      }, 2000)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to rerun'
      onLog(`✗ Rerun failed: ${message}`)
    }
  }

  const testParam = ciStatus.pipeline.parameters?.run_file_tests

  return (
    <div className={`ci-details ${pinned ? 'pinned' : ''}`}>
      <h4>CI Details</h4>
      
      {testParam && (
        <button
          className="btn btn-sm btn-secondary"
          style={{ marginBottom: '1rem' }}
          onClick={() => copyToClipboard(testParam)}
        >
          Copy test param
        </button>
      )}

      {ciStatus.workflows.map((workflow) => {
        const jobs = ciStatus.jobsByWf[workflow.id] || []
        const isRunning = workflow.status.toLowerCase() === 'running'
        const isFailed = workflow.status.toLowerCase() === 'failed'

        return (
          <div key={workflow.id} className="workflow-card">
            <div className="workflow-header">
              <div>
                <strong>{workflow.name}</strong>
              </div>
              <div className="workflow-actions">
                <span className={getStatusBadgeClass(workflow.status)}>{workflow.status}</span>
                {isRunning && (
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleCancel(workflow.id)}
                  >
                    Cancel
                  </button>
                )}
                {isFailed && (
                  <>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleRerun(workflow.id, true)}
                    >
                      Rerun failed
                    </button>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleRerun(workflow.id, false)}
                    >
                      Rerun all
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="workflow-body">
              {jobs.length === 0 ? (
                <div className="text-muted">No jobs</div>
              ) : (
                <table className="jobs-table">
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => {
                      const isFailed = job.status.toLowerCase() === 'failed' || job.status.toLowerCase() === 'error'
                      const artifactsData = artifacts[job.job_number]
                      const showingArtifacts = expandedArtifacts.has(job.job_number)

                      return (
                        <>
                          <tr key={job.id}>
                            <td>{job.name || job.job_number}</td>
                            <td>
                              <span className={getStatusBadgeClass(job.status)}>{job.status}</span>
                            </td>
                            <td>{job.durationSec != null ? `${job.durationSec}s` : ''}</td>
                            <td>
                              <div className="job-actions">
                                {job.ui && (
                                  <a href={job.ui} target="_blank" rel="noreferrer">
                                    Open
                                  </a>
                                )}
                                {ciStatus.pipeline.project_slug && (
                                  <button
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => fetchArtifacts(job)}
                                  >
                                    Artifacts
                                  </button>
                                )}
                                {isFailed && testParam && (
                                  <button
                                    className="btn btn-sm btn-danger"
                                    onClick={() => copyToClipboard(testParam)}
                                  >
                                    Copy test
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {showingArtifacts && (
                            <tr className="artifacts-row">
                              <td colSpan={4}>
                                {artifactsData?.loading ? (
                                  <div className="text-muted">Loading artifacts…</div>
                                ) : artifactsData?.items.length === 0 ? (
                                  <div className="text-muted">No artifacts</div>
                                ) : (
                                  <ul className="artifacts-list">
                                    {artifactsData?.items.map((artifact, idx) => {
                                      const path = artifact.path || ''
                                      const label = /\.png$/i.test(path)
                                        ? 'screenshot'
                                        : /(mp4|webm)$/i.test(path)
                                        ? 'video'
                                        : 'artifact'
                                      return (
                                        <li key={idx}>
                                          <a href={artifact.url} target="_blank" rel="noreferrer">
                                            {label}
                                          </a>{' '}
                                          <span className="text-muted">{path}</span>
                                        </li>
                                      )
                                    })}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
