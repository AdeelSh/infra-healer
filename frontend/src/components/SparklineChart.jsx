import { AreaChart, Area, YAxis, ReferenceLine, ResponsiveContainer } from 'recharts'
import { T } from '../App'

// Telemetry strip chart: quiet gradient area, optional threshold rule.
export default function SparklineChart({ title, data = [], color = '#5B8DEF', threshold }) {
  const points = data.map((v, i) => ({ i, v }))
  const gradId = `grad-${title.replace(/[^a-z0-9]/gi, '')}`

  const latest = data.length ? data[data.length - 1] : null

  return (
    <div style={{ background:T.panel, border:`1px solid ${T.line}`, borderRadius:12, padding:'12px 16px 8px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
        <span style={{ fontFamily:T.mono, fontSize:10.5, letterSpacing:'0.16em', textTransform:'uppercase', color:T.muted }}>
          {title}
        </span>
        {latest !== null && (
          <span style={{ fontFamily:T.mono, fontSize:12, color }}>{Math.round(latest * 10) / 10}</span>
        )}
      </div>

      <div style={{ height:72 }}>
        {points.length < 2 ? (
          <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center',
            fontFamily:T.mono, fontSize:11, color:T.faint }}>
            Awaiting telemetry…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={color} stopOpacity={0}    />
                </linearGradient>
              </defs>
              <YAxis hide domain={['auto', 'auto']} />
              {threshold !== undefined && (
                <ReferenceLine y={threshold} stroke={T.red} strokeDasharray="4 4" strokeOpacity={0.5} />
              )}
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.8}
                fill={`url(#${gradId})`} isAnimationActive={false} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
