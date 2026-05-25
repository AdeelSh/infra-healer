import { LineChart, Line, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts'

export default function SparklineChart({ title, data, color, threshold }) {
  const chartData = data.map((v, i) => ({ i, v: parseFloat((v ?? 0).toFixed(1)) }))
  return (
    <div style={{ background:'#fff', border:'0.5px solid #e0e0e0', borderRadius:8, padding:'12px 14px' }}>
      <div style={{ fontSize:12, color:'#888', marginBottom:8 }}>{title}</div>
      <ResponsiveContainer width="100%" height={60}>
        <LineChart data={chartData}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          {threshold !== undefined && (
            <ReferenceLine y={threshold} stroke="#E24B4A" strokeDasharray="3 3" strokeWidth={0.8} />
          )}
          <Tooltip
            contentStyle={{ fontSize:11, padding:'2px 8px' }}
            formatter={v => [v, '']}
            labelFormatter={() => ''}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
