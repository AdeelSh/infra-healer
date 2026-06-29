import { useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import MetricCard from './components/MetricCard'
import SparklineChart from './components/SparklineChart'
import ServiceTable from './components/ServiceTable'
import HealLog from './components/HealLog'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const POLL_MS = 3000
const HISTORY_MAX = 20

export default function App() {
  const [metrics, setMetrics]         = useState({ healthy: false, cpu: null, latency: null, errorRate: null, rpm: null })
  const [history, setHistory]         = useState({ cpu: [], latency: [], errorRate: [], rpm: [] })
  const [healData, setHealData]       = useState({ events: [], healing: false, healed: false })
  const [injecting, setInjecting]     = useState(false)
  const [selectedBug, setSelectedBug] = useState('null_ref')
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchMetrics = useCallback(async () => {
    try {
      const [health, cpu, latency, errors, rpm] = await Promise.allSettled([
        axios.get(`${API}/health`),
        axios.get(`${API}/metrics/cpu`),
        axios.get(`${API}/metrics/latency`),
        axios.get(`${API}/metrics/errors`),
        axios.get(`${API}/metrics/rpm`)
      ])
      const ok = health.status === 'fulfilled' && health.value.data.status === 'ok'
      const next = {
        healthy:   ok,
        cpu:       cpu.status     === 'fulfilled' ? cpu.value.data.value     : null,
        latency:   latency.status === 'fulfilled' ? latency.value.data.p99   : null,
        errorRate: errors.status  === 'fulfilled' ? errors.value.data.rate   : null,
        rpm:       rpm.status     === 'fulfilled' ? rpm.value.data.value     : null,
      }
      setMetrics(next)
      setLastUpdated(new Date())
      setHistory(prev => {
        const push = (arr, val) => val !== null ? [...arr.slice(-HISTORY_MAX + 1), val] : arr
        return {
          cpu:       push(prev.cpu,       next.cpu),
          latency:   push(prev.latency,   next.latency),
          errorRate: push(prev.errorRate, next.errorRate),
          rpm:       push(prev.rpm,       next.rpm),
        }
      })
    } catch (_) {
      setMetrics(prev => ({ ...prev, healthy: false }))
    }
  }, [])

  const fetchHealStatus = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/heal-status`)
      setHealData(data)
    } catch (_) {}
  }, [])

  useEffect(() => {
    fetchMetrics()
    fetchHealStatus()
    const m = setInterval(fetchMetrics, POLL_MS)
    const h = setInterval(fetchHealStatus, 2000)
    return () => { clearInterval(m); clearInterval(h) }
  }, [fetchMetrics, fetchHealStatus])

  const injectBug = async () => {
    if (injecting || !metrics.healthy) return
    setInjecting(true)
    try { await axios.post(`${API}/inject-bug`, { bugType: selectedBug }) }
    catch (e) { console.error('Inject app bug failed:', e) }
    finally { setInjecting(false) }
  }

  const injectInfraBug = async () => {
    if (injecting || !metrics.healthy) return
    setInjecting(true)
    try { await axios.post(`${API}/inject-infra-bug`) }
    catch (e) { console.error('Inject infra bug failed:', e) }
    finally { setInjecting(false) }
  }

  const trend = (arr) => {
    if (arr.length < 2) return null
    const d = arr[arr.length - 1] - arr[arr.length - 2]
    return d > 0 ? 'up' : d < 0 ? 'down' : 'flat'
  }
  const fmt = (v, s = '') => v === null ? '-' : `${v}${s}`

  return (
    <div style={{ minHeight:'100vh', background:'#f5f5f3', fontFamily:'system-ui,sans-serif', padding:24, boxSizing:'border-box' }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ margin:0, fontSize:18, fontWeight:600, color:'#1a1a1a' }}>Infra health command centre</h1>
          <p style={{ margin:'2px 0 0', fontSize:12, color:'#888' }}>
            {lastUpdated ? `Updated ${lastUpdated.toTimeString().slice(0,8)}` : 'Connecting...'}
          </p>
        </div>
        <div style={{
          fontSize:18, fontWeight:700, padding:'12px 28px', borderRadius:12,
          background: metrics.healthy ? '#D4EDC1' : '#FBD2D2',
          color:      metrics.healthy ? '#1F4D08' : '#7A1414',
          border: `2px solid ${metrics.healthy ? '#639922' : '#E24B4A'}`,
          boxShadow: metrics.healthy
            ? '0 0 0 4px rgba(99,153,34,0.15)'
            : '0 0 0 4px rgba(226,75,74,0.15)',
          display:'flex', alignItems:'center', gap:10,
          letterSpacing:'0.02em'
        }}>
          <span style={{
            display:'inline-block', width:12, height:12, borderRadius:'50%',
            background: metrics.healthy ? '#639922' : '#E24B4A',
            boxShadow: `0 0 8px ${metrics.healthy ? '#639922' : '#E24B4A'}`
          }} />
          {metrics.healthy ? 'ALL SYSTEMS OPERATIONAL' : 'SERVICE DEGRADED'}
        </div>
      </div>

      {/* Metric cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, marginBottom:16 }}>
        <MetricCard label="API latency (p99)" value={fmt(metrics.latency,'ms')} trend={trend(history.latency)} healthy={metrics.healthy} good={metrics.latency !== null && metrics.latency < 400} />
        <MetricCard label="Error rate"        value={fmt(metrics.errorRate,'%')} trend={trend(history.errorRate)} healthy={metrics.healthy} good={metrics.errorRate !== null && metrics.errorRate < 2} />
        <MetricCard label="ECS CPU"           value={fmt(metrics.cpu,'%')} trend={trend(history.cpu)} healthy={metrics.healthy} good={metrics.cpu !== null && metrics.cpu < 70} />
        <MetricCard label="Requests / min"    value={fmt(metrics.rpm)} trend={trend(history.rpm)} healthy={metrics.healthy} good={metrics.rpm !== null && metrics.rpm > 100} />
      </div>

      {/* Sparklines */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
        <SparklineChart title="Error rate last 60s" data={history.errorRate} color={metrics.healthy ? '#639922' : '#E24B4A'} threshold={2} />
        <SparklineChart title="API latency p99 last 60s" data={history.latency} color="#185FA5" />
      </div>

      {/* Service table + heal log */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
        <ServiceTable healthy={metrics.healthy} healData={healData} activeBug={healData.activeBug} />
        <HealLog healData={healData} />
      </div>

      {/* Controls */}
      <div style={{ background:'#fff', border:'0.5px solid #e0e0e0', borderRadius:10, padding:'14px 16px' }}>

        {/* Row 1: App bug injection */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10, flexWrap:'wrap' }}>
          <span style={{ fontSize:12, color:'#888', minWidth:100 }}>App bug</span>
          <select value={selectedBug} onChange={e => setSelectedBug(e.target.value)} disabled={!metrics.healthy}
            style={{ fontSize:13, padding:'6px 10px', borderRadius:6 }}>
            <option value="null_ref">Bug 1 — null reference</option>
            <option value="missing_env">Bug 2 — missing env var</option>
            <option value="divide_by_zero">Bug 3 — divide by zero</option>
          </select>
          <button onClick={injectBug} disabled={injecting || !metrics.healthy}
            style={{ fontSize:13, padding:'7px 16px', borderRadius:6, cursor:'pointer',
              background: metrics.healthy ? '#FCEBEB' : '#f0f0f0',
              color:      metrics.healthy ? '#791F1F' : '#999',
              border:'0.5px solid #f09595' }}>
            {injecting ? 'Injecting...' : 'Inject app bug'}
          </button>
        </div>

        {/* Divider */}
        <div style={{ borderTop:'0.5px solid #f0f0f0', margin:'4px 0 10px' }} />

        {/* Row 2: Infra bug injection */}
        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <span style={{ fontSize:12, color:'#888', minWidth:100 }}>Infra bug</span>
          <div style={{ fontSize:13, padding:'6px 12px', borderRadius:6, background:'#f5f5f3', color:'#555', border:'0.5px solid #e0e0e0' }}>
            ECS scale to zero — all tasks stopped
          </div>
          <button onClick={injectInfraBug} disabled={injecting || !metrics.healthy}
            style={{ fontSize:13, padding:'7px 16px', borderRadius:6, cursor:'pointer',
              background: metrics.healthy ? '#FAEEDA' : '#f0f0f0',
              color:      metrics.healthy ? '#633806' : '#999',
              border:'0.5px solid #EF9F27' }}>
            {injecting ? 'Injecting...' : 'Kill infrastructure'}
          </button>

          <span style={{ fontSize:12, color:'#888', marginLeft:'auto' }}>
            {!metrics.healthy && !healData.healing && '● Waiting for orchestrator...'}
            {healData.healing && '● Gemini healing in progress...'}
            {healData.healed && metrics.healthy && 'Heal successful'}
          </span>
        </div>

      </div>
    </div>
  )
}
