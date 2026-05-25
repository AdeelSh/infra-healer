export default function ServiceTable({ healthy, healData, activeBug }) {
  const isEcsBug = activeBug === 'ecs_scale_zero'

  const services = [
    {
      name:   'React dashboard (frontend)',
      status: 'healthy',
      detail: 'Amplify always on'
    },
    {
      name:   'Node.js metrics API (backend)',
      status: healthy ? 'healthy' : isEcsBug ? 'stopped' : 'down',
      detail: healthy
        ? 'ECS Fargate running'
        : isEcsBug
        ? 'ECS desiredCount=0 all tasks stopped'
        : 'ECS task crashed'
    },
    {
      name:   'ECS service (infra)',
      status: healthy ? 'healthy' : isEcsBug ? 'misconfigured' : 'healthy',
      detail: healthy
        ? '2/2 tasks running'
        : isEcsBug
        ? '0/2 tasks running desiredCount=0'
        : '0/2 tasks running app error'
    },
    {
      name:   'CloudWatch log ingestion',
      status: healthy ? 'healthy' : 'streaming',
      detail: healthy ? 'No errors' : 'FATAL events detected'
    },
    {
      name:   'Lambda orchestrator',
      status: healData.healing ? 'active' : healData.healed ? 'idle' : 'idle',
      detail: healData.healing
        ? 'Gemini healing...'
        : healData.healed
        ? 'Last heal successful'
        : 'Awaiting trigger'
    }
  ]

  const dotColor = {
    healthy:       '#639922',
    down:          '#E24B4A',
    stopped:       '#E24B4A',
    misconfigured: '#EF9F27',
    active:        '#EF9F27',
    streaming:     '#EF9F27',
    idle:          '#639922'
  }

  return (
    <div style={{ background:'#fff', border:'0.5px solid #e0e0e0', borderRadius:8, padding:'12px 14px' }}>
      <div style={{ fontSize:12, color:'#888', marginBottom:10 }}>Service status</div>
      {services.map((s, i) => (
        <div key={i} style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'7px 0',
          borderBottom: i < services.length - 1 ? '0.5px solid #f0f0f0' : 'none',
          fontSize:13
        }}>
          <span style={{ display:'flex', alignItems:'center', color:'#1a1a1a' }}>
            <span style={{
              display:'inline-block', width:8, height:8, borderRadius:'50%',
              background: dotColor[s.status] || '#888',
              marginRight:8, flexShrink:0
            }} />
            {s.name}
          </span>
          <span style={{ fontSize:11, color:'#888' }}>{s.detail}</span>
        </div>
      ))}
    </div>
  )
}
