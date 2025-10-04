#!/usr/bin/env node
const express = require('express')
const path = require('path')
const fs = require('fs')
const { execSync, spawn } = require('child_process')

const app = express()
app.use(express.json())

// Serve static assets (single-page app)
const staticDir = path.resolve(__dirname, './web')
app.use('/', express.static(staticDir))

app.get('/api/status', (req, res) => {
  const hasToken = Boolean(process.env.CIRCLECI_TOKEN || process.env.CIRCLE_TOKEN)
  let branch = 'unknown'
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch (_) {}
  res.json({ hasToken, branch })
})

app.get('/api/tests', (req, res) => {
  try {
    const list = execSync("grep -IRiL \'@disabled\': \\?true apps/remix-ide-e2e/src/tests | sort", { stdio: ['ignore', 'pipe', 'ignore'], shell: '/bin/bash' }).toString()
    const files = list.split(/\r?\n/).filter(Boolean)
    const tests = files.map((src) => {
      const base = path.basename(src).replace(/\.(js|ts)$/i, '')
      const dist = path.resolve(process.cwd(), 'dist', src).replace(/\.(ts)$/i, '.js')
      const distRel = path.relative(process.cwd(), dist)
      const hasDist = fs.existsSync(dist)
      return { base, src, dist: distRel, hasDist }
    })
    res.json({ tests })
  } catch (e) {
    res.status(500).json({ error: 'Failed to enumerate tests', details: e.message })
  }
})

app.post('/api/trigger', async (req, res) => {
  const { mode, test, browser = 'chrome' } = req.body || {}
  if (!test) return res.status(400).json({ error: 'Missing test (base name) in body' })
  if (mode === 'remote') {
    if (!process.env.CIRCLECI_TOKEN && !process.env.CIRCLE_TOKEN) {
      return res.status(401).json({ error: 'Missing CIRCLECI_TOKEN in env' })
    }
    // Call existing trigger script and capture CircleCI URL
    const triggerPath = path.resolve(__dirname, './trigger-circleci.js')
    const child = spawn('node', [triggerPath, '--pattern', test])
    let out = ''
    child.stdout.on('data', (d) => (out += d.toString()))
    child.stderr.on('data', (d) => (out += d.toString()))
    child.on('close', (code) => {
      const m = out.match(/https:\/\/app\.circleci\.com\/[\w\/-]+/)
      const url = m ? m[0] : undefined
      if (code === 0) return res.json({ ok: true, url, output: out })
      return res.status(500).json({ ok: false, url, output: out })
    })
    return
  }

  if (mode === 'local') {
    // Ensure dist exists for local run
    try {
      execSync('yarn run build:e2e', { stdio: ['ignore', 'inherit', 'inherit'] })
    } catch (e) {
      return res.status(500).json({ error: 'build:e2e failed' })
    }
    // Reuse singletest.sh to set up services and run one test
    const script = path.resolve(process.cwd(), 'apps/remix-ide/ci/singletest.sh')
    const args = [script, browser, 'nogroup', '1', test]
    const proc = spawn('bash', args, { stdio: 'inherit' })
    return res.json({ ok: true, pid: proc.pid })
  }

  return res.status(400).json({ error: 'Invalid mode. Use local or remote.' })
})

const PORT = Number(process.env.SELECT_TEST_PORT || 5178)
const server = app.listen(PORT, () => {
  const url = `http://127.0.0.1:${PORT}`
  console.log(`[select-test web] Listening at ${url}`)
})
