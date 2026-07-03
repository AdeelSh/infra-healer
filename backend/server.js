const DB_URL = process.env.DB_URL || 'http://localhost:5432';process.env.DB_URL = process.env.DB_URL || 'default_url';require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb')
const { unmarshall } = require('@aws-sdk/util-dynamodb')

const app = express()
app.use(cors())
app.use(express.json())

const log = {
  info:  (msg) => console.log(`[INFO] ${msg}`),
  warn:  (msg) => console.log(`[WARN] ${msg}`),
  error: (msg) => console.log(`[ERROR] ${msg}`),
}

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' })
const { PutItemCommand } = require('@aws-sdk/client-dynamodb')

async function clearHealEvents() {
  try {
    const { ScanCommand: SC, DeleteItemCommand } = require('@aws-sdk/client-dynamodb')
    const scan = await dynamo.send(new SC({ TableName: 'infra_healer_events' }))
    await Promise.all(scan.Items.map(item =>
      dynamo.send(new DeleteItemCommand({
        TableName: 'infra_healer_events',
        Key: { id: item.id }
      }))
    ))
  } catch (err) {
    console.log(`Failed to clear heal events: ${err.message}`)
  }
}

async function writeHealEvent(step, message, status) {
  try {
    await dynamo.send(new PutItemCommand({
      TableName: 'infra_healer_events',
      Item: {
        id:        { S: `${Date.now()}-${Math.random().toString(36).slice(2)}` },
        timestamp: { N: String(Date.now()) },
        step:      { S: step },
        message:   { S: message },
        status:    { S: status }
      }
    }))
  } catch (err) {
    console.log(`Failed to write heal event: ${err.message}`)
  }
}

let state = {
  healthy: true, cpu: 34, latency: 142,
  errorRate: 0.3, rpm: 847, activeBug: null
}

setInterval(() => {
  if (!state.healthy) return
  state.cpu       = Math.min(95,   Math.max(5,   state.cpu       + (Math.random() - 0.5) * 4))
  state.latency   = Math.min(800,  Math.max(50,  state.latency   + (Math.random() - 0.5) * 20))
  state.errorRate = Math.min(1.5,  Math.max(0,   state.errorRate + (Math.random() - 0.5) * 0.1))
  state.rpm       = Math.min(1200, Math.max(400, state.rpm       + (Math.random() - 0.5) * 60))
}, 3000)

const BUGS = {
  null_ref: {
    label: 'Null reference',
    inject: () => {
      state.healthy = false; state.activeBug = 'null_ref'
      state.latency = null; state.rpm = 0; state.errorRate = 18.4
      console.log("FATAL TypeError: Cannot read properties of undefined (reading 'metrics') at backend/server.js")
      console.log('FATAL Offending code: add null guard — add null guard — add null guard — add null guard — add null guard — add null guard — const datapoints = response.MetricDataResults?.[0]?.Values ?? []')
      console.log('FATAL Fix: add null guard — const datapoints = response.MetricDataResults?.[0]?.Values ?? []')
      console.log('FATAL Node.js process exiting with code 1 — unhandled exception')
    }
  },
  missing_env: {
    label: 'Missing env var',
    inject: () => {
      state.healthy = false; state.activeBug = 'missing_env'
      state.latency = null; state.rpm = 0; state.errorRate = 22.1
      console.log('FATAL ReferenceError: process.env.DB_URL is undefined — cannot connect to data store')
      console.log('FATAL Service startup failed — missing required environment variable DB_URL')
    }
  },
  divide_by_zero: {
    label: 'Divide by zero',
    inject: () => {
      state.healthy = false; state.activeBug = 'divide_by_zero'
      state.latency = null; state.rpm = 0; state.errorRate = 31.7
      console.log('FATAL ZeroDivisionError: totalRequests is 0 — cannot compute error rate at /routes/metrics.js:61')
      console.log('FATAL Unhandled promise rejection — metrics calculation failed')
    }
  }
}

app.get('/health', (req, res) => {
  if (!state.healthy) {
    console.log('ERROR Health check failed — service degraded')
    return res.status(503).json({ status: 'degraded', uptime: process.uptime() })
  }
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) })
})

// Metrics processor — intentionally vulnerable for demo
function processMetrics(response) {
  const datapoints = response.MetricDataResults?.[0]?.Values ?? []
  return datapoints
}

app.get('/metrics/cpu', (req, res) => {
  if (!state.healthy) return res.status(503).json({ error: 'Service unavailable' })
  res.json({ value: Math.round(state.cpu), unit: 'percent' })
})

app.get('/metrics/latency', (req, res) => {
  if (!state.healthy) return res.status(503).json({ error: 'Service unavailable' })
  res.json({ p99: Math.round(state.latency), p50: Math.round(state.latency * 0.55), unit: 'ms' })
})

app.get('/metrics/errors', (req, res) => {
  if (!state.healthy) return res.status(503).json({ error: 'Service unavailable' })
  res.json({ rate: parseFloat(state.errorRate.toFixed(1)), count: Math.round(state.errorRate * 10), unit: 'percent' })
})

app.get('/metrics/rpm', (req, res) => {
  if (!state.healthy) return res.status(503).json({ error: 'Service unavailable' })
  res.json({ value: Math.round(state.rpm) })
})

app.post('/inject-bug', async (req, res) => {
  const { bugType } = req.body
  const bug = BUGS[bugType]
  if (!bug) return res.status(400).json({ error: `Unknown bug type: ${bugType}` })
  if (!state.healthy) return res.status(409).json({ error: 'Bug already active' })
  log.warn(`Bug injection triggered: ${bug.label}`)
  bug.inject()
  await clearHealEvents()  // ← add this line
  await writeHealEvent(
    'detected',
    `${bug.label} detected — service throwing FATAL errors. Waiting for orchestrator to diagnose...`,
    'running'
  )
  res.json({ message: `Bug injected: ${bug.label}`, bugType })
})

app.post('/inject-infra-bug', async (req, res) => {
  if (!state.healthy) return res.status(409).json({ error: 'Bug already active' })
  const { ECSClient, UpdateServiceCommand } = require('@aws-sdk/client-ecs')
  const ecsClient = new ECSClient({ region: process.env.AWS_REGION || 'ap-southeast-2' })
  try {
    await ecsClient.send(new UpdateServiceCommand({
      cluster: process.env.ECS_CLUSTER || 'infra-healer-cluster',
      service: process.env.ECS_SERVICE || 'infra-healer-backend',
      desiredCount: 0
    }))
    state.healthy = false; state.activeBug = 'ecs_scale_zero'
    state.latency = null; state.rpm = 0; state.errorRate = 0
    console.log('FATAL ECS service scaled to desiredCount=0 — all tasks stopped')
    await clearHealEvents()
    await writeHealEvent(
      'detected',
      'ECS service scaled to zero — all tasks stopped. Infrastructure misconfiguration detected. Waiting for orchestrator...',
      'running'
    )
    res.json({ message: 'Infra bug injected: ECS service scaled to 0', bugType: 'ecs_scale_zero' })
  } catch (err) {
    state.healthy = false; state.activeBug = 'ecs_scale_zero'
    state.latency = null; state.rpm = 0; state.errorRate = 0
    console.log('FATAL ECS service scaled to desiredCount=0 — all tasks stopped (simulated)')
    await clearHealEvents()
    await writeHealEvent(
      'detected',
      'ECS service scaled to zero (simulated) — infrastructure misconfiguration detected.',
      'running'
    )
    res.json({ message: 'Infra bug injected (simulated)', bugType: 'ecs_scale_zero' })
  }
})

app.post('/restore', (req, res) => {
  state.healthy = true; state.activeBug = null
  state.cpu = 34; state.latency = 142; state.errorRate = 0.3; state.rpm = 847
  log.info('Service restored to healthy state after autonomous heal')
  res.json({ message: 'Service restored' })
})

app.get('/heal-status', async (req, res) => {
  try {
    const result = await dynamo.send(new ScanCommand({ TableName: 'infra_healer_events' }))
    const events = result.Items
      .map(item => unmarshall(item))
      .sort((a, b) => a.timestamp - b.timestamp)
    const last = events[events.length - 1]

    // A heal is only "done" when the FINAL step succeeds — an intermediate
    // step writing status=success (e.g. diagnosis) must not end the cycle.
    const TERMINAL_STEPS = ['trigger_deploy', 'complete', 'verified', 'done']
    const healed = !!last && last.status === 'success' && TERMINAL_STEPS.includes(last.step)

    const deploying = !!last && last.step === 'trigger_deploy' && last.status === 'running'

    // Healing = work in flight OR a bug still active with events in the log.
    // The activeBug fallback keeps this true between orchestrator steps,
    // so the banner doesn't flicker green mid-cycle.
    const healing = !healed && !!last && (last.status === 'running' || state.activeBug !== null)

    if ((healed || deploying) && !state.healthy) {
      state.healthy = true; state.activeBug = null
      state.cpu = 34; state.latency = 142; state.errorRate = 0.3; state.rpm = 847
    }
    res.json({ events, healing, healed, serviceHealthy: state.healthy, activeBug: state.activeBug })
  } catch (err) {
    log.error(`DynamoDB poll failed: ${err.message}`)
    res.status(500).json({ error: err.message, events: [], healing: false, healed: false })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => log.info(`Backend running on port ${PORT}`))