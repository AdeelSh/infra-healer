import { useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import MetricCard from './components/MetricCard'
import SparklineChart from './components/SparklineChart'
import ServiceTable from './components/ServiceTable'
import HealLog from './components/HealLog'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const POLL_MS = 3000
const HISTORY_MAX = 20

// ── Design tokens ─────────────────────────────────────────────────────────
export const T = {
  bg:       '#0C111B',
  panel:    '#121A29',
  panelSoft:'#0F1522',
  line:     '#1E2A3E',
  text:     '#E7ECF4',
  muted:    '#8B97AB',
  faint:    '#5A6578',
  blue:     '#5B8DEF',
  green:    '#3FBF7F',
  amber:    '#E8A33D',
  red:      '#E5484D',
  mono:     "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  display:  "'Space Grotesk', -apple-system, 'Segoe UI', sans-serif",
  body:     "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
}

export default function App() {
  const [metrics, setMetrics]         = useState({ healthy: false, cpu: null, latency: null, errorRate: null, rpm: null })
  const [history, setHistory]         = useState({ cpu: [], latency: [], errorRate: [], rpm: [] })
  const [healData, setHealData]       = useState({ events: [], healing: false, healed: false })
  const [injecting, setInjecting]     = useState(false)
  const [selectedBug, setSelectedBug] = useState('null_ref')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [shownCount, setShownCount]   = useState(0)   // drip-feed: how many events are revealed

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
    const h = setInterval(fetchHealStatus, 1000)
    return () => { clearInterval(m); clearInterval(h) }
  }, [fetchMetrics, fetchHealStatus])

  // Drip-feed: when a poll delivers several events at once (the Lambda can
  // complete a whole heal between polls), reveal them one at a time so the
  // log reads like a live stream instead of a single paste.
  const totalEvents = healData.events?.length ?? 0
  useEffect(() => {
    if (totalEvents < shownCount) { setShownCount(totalEvents); return }  // new cycle cleared the log
    if (totalEvents > shownCount) {
      const t = setTimeout(() => setShownCount(c => c + 1), 600)
      return () => clearTimeout(t)
    }
  }, [totalEvents, shownCount])
  const visibleHealData = { ...healData, events: (healData.events || []).slice(0, shownCount) }

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
  const fmt = (v, s = '') => v === null ? '—' : `${v}${s}`

  const status = healData.healing ? 'healing'
    : (!metrics.healthy || healData.activeBug || (healData.events?.length && !healData.healed)) ? 'degraded'
    : 'operational'
  const isHealthy = status === 'operational'

  const S = {
    operational: { color: T.green, label: 'ALL SYSTEMS OPERATIONAL' },
    healing:     { color: T.amber, label: 'AI HEALING IN PROGRESS'  },
    degraded:    { color: T.red,   label: 'SERVICE DEGRADED'        },
  }[status]

  const panel = {
    background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12,
  }

  return (
    <div style={{ minHeight:'100vh', background:T.bg, fontFamily:T.body, color:T.text, padding:'20px 24px 32px', boxSizing:'border-box' }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: ${T.bg}; }
        @keyframes beacon {
          0%, 100% { box-shadow: 0 0 0 0 ${S.color}66; }
          50%      { box-shadow: 0 0 0 7px ${S.color}00; }
        }
        @keyframes lineIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: none; }
        }
        select:focus-visible, button:focus-visible { outline: 2px solid ${T.blue}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: ${T.line}; border-radius: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      {/* ── Header / status board ─────────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:16, flexWrap:'wrap', marginBottom:20 }}>
        <div>
          <div style={{ fontFamily:T.mono, fontSize:11, letterSpacing:'0.22em', color:T.muted, textTransform:'uppercase', marginBottom:4 }}>
            Infra Healer · Autonomous remediation
          </div>
          <h1 style={{ margin:0, fontFamily:T.display, fontSize:22, fontWeight:600, letterSpacing:'-0.01em' }}>
            Infra health command centre
          </h1>
          <p style={{ margin:'4px 0 0', fontFamily:T.mono, fontSize:11.5, color:T.muted }}>
            {lastUpdated ? `LAST TELEMETRY ${lastUpdated.toTimeString().slice(0,8)}` : 'CONNECTING…'}
          </p>
        </div>

        {/* Signature: the status board */}
        <div style={{
          display:'flex', alignItems:'center', gap:14,
          padding:'14px 22px', borderRadius:12,
          background:T.panelSoft, border:`1px solid ${S.color}55`,
          boxShadow:`inset 0 0 24px ${S.color}0F`,
        }}>
          <span style={{
            width:11, height:11, borderRadius:'50%',
            background:S.color, animation:'beacon 2s ease-in-out infinite',
          }} />
          <span style={{
            fontFamily:T.mono, fontSize:14, fontWeight:600,
            letterSpacing:'0.14em', color:S.color,
          }}>
            {S.label}
          </span>
        </div>
      </div>

      {/* ── Metric cards ──────────────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:12, marginBottom:12 }}>
        <MetricCard label="API latency · p99" value={fmt(metrics.latency,'ms')} trend={trend(history.latency)}   healthy={metrics.healthy} good={metrics.latency   !== null && metrics.latency < 400} />
        <MetricCard label="Error rate"        value={fmt(metrics.errorRate,'%')} trend={trend(history.errorRate)} healthy={metrics.healthy} good={metrics.errorRate !== null && metrics.errorRate < 2} />
        <MetricCard label="ECS CPU"           value={fmt(metrics.cpu,'%')}       trend={trend(history.cpu)}       healthy={metrics.healthy} good={metrics.cpu       !== null && metrics.cpu < 70} />
        <MetricCard label="Requests / min"    value={fmt(metrics.rpm)}           trend={trend(history.rpm)}       healthy={metrics.healthy} good={metrics.rpm       !== null && metrics.rpm > 100} />
      </div>

      {/* ── Sparklines ────────────────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))', gap:12, marginBottom:12 }}>
        <SparklineChart title="Error rate · last 60s"      data={history.errorRate} color={isHealthy ? T.green : T.red} threshold={2} />
        <SparklineChart title="API latency p99 · last 60s" data={history.latency}   color={T.blue} />
      </div>

      {/* ── Services + heal feed ──────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(380px,1fr))', gap:12, marginBottom:12 }}>
        <ServiceTable healthy={metrics.healthy} healData={healData} activeBug={healData.activeBug} />
        <HealLog healData={visibleHealData} />
      </div>

      {/* ── Fault injection controls ──────────────────────────────────── */}
      <div style={{ ...panel, padding:'14px 18px' }}>
        <div style={{ fontFamily:T.mono, fontSize:10.5, letterSpacing:'0.18em', color:T.muted, textTransform:'uppercase', marginBottom:12 }}>
          Fault injection — demo controls
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12, flexWrap:'wrap' }}>
          <span style={{ fontSize:12.5, color:T.muted, minWidth:92 }}>App bug</span>
          <select value={selectedBug} onChange={e => setSelectedBug(e.target.value)} disabled={!metrics.healthy}
            style={{ fontFamily:T.mono, fontSize:12.5, padding:'7px 10px', borderRadius:8,
              background:T.panelSoft, color:T.text, border:`1px solid ${T.line}` }}>
            <option value="null_ref">Bug 1 — null reference</option>
            <option value="missing_env">Bug 2 — missing env var</option>
            <option value="divide_by_zero">Bug 3 — divide by zero</option>
          </select>
          <button onClick={injectBug} disabled={injecting || !metrics.healthy}
            style={{ fontFamily:T.mono, fontSize:12.5, fontWeight:600, padding:'8px 18px', borderRadius:8,
              cursor: metrics.healthy ? 'pointer' : 'not-allowed',
              background: metrics.healthy ? `${T.red}1A` : T.panelSoft,
              color:      metrics.healthy ? T.red : T.faint,
              border:`1px solid ${metrics.healthy ? T.red + '55' : T.line}` }}>
            {injecting ? 'Injecting…' : 'Inject app bug'}
          </button>
        </div>

        <div style={{ borderTop:`1px solid ${T.line}`, margin:'2px 0 12px' }} />

        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <span style={{ fontSize:12.5, color:T.muted, minWidth:92 }}>Infra bug</span>
          <div style={{ fontFamily:T.mono, fontSize:12.5, padding:'7px 12px', borderRadius:8,
            background:T.panelSoft, color:T.muted, border:`1px solid ${T.line}` }}>
            ECS scale to zero — all tasks stopped
          </div>
          <button onClick={injectInfraBug} disabled={injecting || !metrics.healthy}
            style={{ fontFamily:T.mono, fontSize:12.5, fontWeight:600, padding:'8px 18px', borderRadius:8,
              cursor: metrics.healthy ? 'pointer' : 'not-allowed',
              background: metrics.healthy ? `${T.amber}1A` : T.panelSoft,
              color:      metrics.healthy ? T.amber : T.faint,
              border:`1px solid ${metrics.healthy ? T.amber + '55' : T.line}` }}>
            {injecting ? 'Injecting…' : 'Kill infrastructure'}
          </button>

          <span style={{ fontFamily:T.mono, fontSize:11.5, color:T.muted, marginLeft:'auto' }}>
            {!metrics.healthy && !healData.healing && !healData.healed && '● WAITING FOR ORCHESTRATOR…'}
            {healData.healing && !healData.healed && '● AI HEALING IN PROGRESS…'}
            {healData.healed && '✓ LAST HEAL SUCCESSFUL'}
          </span>
        </div>
      </div>
    </div>
  )
}
