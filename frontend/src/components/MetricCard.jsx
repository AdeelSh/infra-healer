export default function MetricCard({ label, value, trend, good, healthy }) {
  const color = !healthy && value === '—' ? '#A32D2D' : good ? '#3B6D11' : '#854F0B'
  return (
    <div style={{ background:'#fff', border:'0.5px solid #e0e0e0', borderRadius:8, padding:'12px 14px' }}>
      <div style={{ fontSize:11, color:'#888', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:500, color }}>
        {value}
        {trend && <span style={{ fontSize:13, marginLeft:6, fontWeight:400 }}>{trend}</span>}
      </div>
    </div>
  )
}
