require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb')
const { unmarshall } = require('@aws-sdk/util-dynamodb')
const winston = require('winston')
const WinstonCloudWatch = require('winston-cloudwatch')

const app = express()
app.use(cors())
app.use(express.json())

// ── Logger ────────────────────────────────────────────────────────────────────
const logger = winston.createLogger({
  transports: [
    new winston.transports.Console(),
    new WinstonCloudWatch({
      logGroupName: process.env.CW_LOG_GROUP || '/infra-healer/backend',
      logStreamName: `backend-${new Date().toISOString().slice(0, 10)}`,
      awsRegion: process.env.AWS_REGION || 'ap-southeast-2',
      messageFormatter: ({ level, message }) => `[${level.toUpperCase()}] ${message}`
    })
  ]
})

// ── DynamoDB ──────────────────────────────────────────────────────────────────
const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' })

// ── Simulated metrics state ───────────────────────────────────────────────────
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

// ── Bug bank ──────────────────────────────────────────────────────────────────
const BUGS = {
  null_ref: {
    label: 'Null reference',
    inject: () => {
      state.healthy = false; state.activeBug = 'null_ref'
      state.latency = null; state.rpm = 0; state.errorRate = 18.4
      logger.error("FATAL TypeError: Cannot read properties of undefined (reading 'metrics') at /routes/metrics.js:34")
      logger.error('FATAL Node.js process exiting with code 1 — unhandled exception')
    }
  },
  missing_env: {
    label: 'Missing env var',
    inject: () => {
      state.healthy = false; state.activeBug = 'missing_env'
      state.latency = null; state.rpm = 0; state.errorRate = 22.1
      logger.error('FATAL ReferenceError: process.env.DB_URL is undefined — cannot connect to data store')
      logger.error('FATAL Service startup failed — missing required environment variable DB_URL')
    }
  },
  divide_by_zero: {
    label: 'Divide by zero',
    inject: () => {
      state.healthy = false; state.activeBug = 'divide_by_zero'
      state.latency = null; state.rpm = 0; state.errorRate = 31.7
      logger.error('FATAL ZeroDivisionError: totalRequests is 0 — cannot compute error rate at /routes/metrics.js:61')
      logger.error('FATAL Unhandled promise rejection — metrics calculation failed')
    }
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  if (!state.healthy) {
    logger.error('ERROR Health check failed — service degraded')
    return res.status(503).json({ status: 'degraded', uptime: process.uptime() })
  }
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) })
})

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

app.post('/inject-bug', (req, res) => {
  const { bugType } = req.body
  const bug = BUGS[bugType]
  if (!bug) return res.status(400).json({ error: `Unknown bug type: ${bugType}` })
  if (!state.healthy) return res.status(409).json({ error: 'Bug already active' })
  logger.warn(`Bug injection triggered: ${bug.label}`)
  bug.inject()
  res.json({ message: `Bug injected: ${bug.label}`, bugType })
})

// Inject an infrastructure bug — scales ECS service to zero via AWS API
app.post('/inject-infra-bug', async (req, res) => {
  if (!state.healthy) return res.status(409).json({ error: 'Bug already active' })

  const { ECSClient, UpdateServiceCommand, DescribeServicesCommand } = require('@aws-sdk/client-ecs')
  const ecsClient = new ECSClient({ region: process.env.AWS_REGION || 'ap-southeast-2' })

  try {
    // Scale ECS service to 0
    await ecsClient.send(new UpdateServiceCommand({
      cluster: process.env.ECS_CLUSTER || 'infra-healer-cluster',
      service: process.env.ECS_SERVICE || 'infra-healer-backend',
      desiredCount: 0
    }))

    // Mark state as unhealthy immediately for dashboard effect
    state.healthy = false
    state.activeBug = 'ecs_scale_zero'
    state.latency = null
    state.rpm = 0
    state.errorRate = 0

    logger.error('FATAL ECS service scaled to desiredCount=0 — all tasks stopped')
    logger.error('FATAL No running tasks in cluster infra-healer-cluster / service infra-healer-backend')

    res.json({ message: 'Infra bug injected: ECS service scaled to 0', bugType: 'ecs_scale_zero' })
  } catch (err) {
    // If not on real AWS (local dev), just simulate the state change
    logger.warn(`ECS API not available (local dev) — simulating scale-to-zero: ${err.message}`)
    state.healthy = false
    state.activeBug = 'ecs_scale_zero'
    state.latency = null
    state.rpm = 0
    state.errorRate = 0
    logger.error('FATAL ECS service scaled to desiredCount=0 — all tasks stopped (simulated)')
    res.json({ message: 'Infra bug injected (simulated): ECS service scaled to 0', bugType: 'ecs_scale_zero' })
  }
})

app.post('/restore', (req, res) => {
  state.healthy = true; state.activeBug = null
  state.cpu = 34; state.latency = 142; state.errorRate = 0.3; state.rpm = 847
  logger.info('Service restored to healthy state after autonomous heal')
  res.json({ message: 'Service restored' })
})

app.get('/heal-status', async (req, res) => {
  try {
    const result = await dynamo.send(new ScanCommand({ TableName: 'infra_healer_events' }))
    const events = result.Items
      .map(item => unmarshall(item))
      .sort((a, b) => a.timestamp - b.timestamp)
    const last = events[events.length - 1]
    const healing = !!last && last.status === 'running'
    const healed  = !!last && last.status === 'success'
    if (healed && !state.healthy) {
      state.healthy = true; state.activeBug = null
      state.cpu = 34; state.latency = 142; state.errorRate = 0.3; state.rpm = 847
    }
    res.json({ events, healing, healed, serviceHealthy: state.healthy, activeBug: state.activeBug })
  } catch (err) {
    logger.error(`ERROR DynamoDB poll failed: ${err.message}`)
    res.status(500).json({ error: err.message, events: [], healing: false, healed: false })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => logger.info(`Backend running on port ${PORT}`))
