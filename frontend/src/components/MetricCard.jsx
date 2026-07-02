import { T } from '../App'

// Telemetry tile: small uppercase label, large monospace numeral, trend tick.
export default function MetricCard({ label, value, trend, healthy, good }) {
  const state = !healthy ? 'offline' : good ? 'good' : 'warn'
  const valueColor = state === 'offline' ? T.faint : state === 'good' ? T.text : T.amber
  const edge       = state === 'good' ? T.green : state === 'warn' ? T.amber : T.red

  const tick = trend === 'up' ? '▲' : trend === 'down' ? '▼' : trend === 'flat' ? '▬' : ''
  const tickColor = T.muted

  return (
    <div style={{
      position:'relative', overflow:'hidden',
      background:T.panel, border:`1px solid ${T.line}`, borderRadius:12,
      padding:'14px 16px 12px',
    }}>
      {/* status edge — a thin calibrated strip, not a glow */}
      <span style={{ position:'absolute', left:0, top:10, bottom:10, width:3, borderRadius:2, background:edge, opacity:0.9 }} />

      <div style={{ fontFamily:T.mono, fontSize:10.5, letterSpacing:'0.16em', textTransform:'uppercase', color:T.muted, marginBottom:6, paddingLeft:6 }}>
        {label}
      </div>
      <div style={{ display:'flex', alignItems:'baseline', gap:8, paddingLeft:6 }}>
        <span style={{ fontFamily:T.mono, fontSize:30, fontWeight:600, letterSpacing:'-0.02em', color:valueColor, lineHeight:1 }}>
          {value}
        </span>
        {tick && (
          <span style={{ fontFamily:T.mono, fontSize:11, color:tickColor }}>{tick}</span>
        )}
      </div>
    </div>
  )
}
