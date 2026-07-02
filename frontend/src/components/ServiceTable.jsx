import { T } from '../App'

// Service registry: each row is a lamp + name + state note, like an ops checklist.
export default function ServiceTable({ healthy, healData, activeBug }) {
  const healing = healData?.healing
  const healed  = healData?.healed

  const backendDown = !healthy && activeBug && activeBug !== 'ecs_scale_zero'
  const ecsDown     = !healthy && activeBug === 'ecs_scale_zero'

  const orchestrator = healing
    ? { state:'busy', note:'AI healing…' }
    : healed
      ? { state:'ok', note:'Last heal successful' }
      : (!healthy ? { state:'warn', note:'Awaiting alarm…' } : { state:'ok', note:'Standing by' })

  const services = [
    { name:'React dashboard',        sub:'frontend', state:'ok', note:'Amplify always on' },
    { name:'Node.js metrics API',    sub:'backend',  state: backendDown ? 'down' : 'ok', note: backendDown ? 'FATAL errors' : 'ECS Fargate running' },
    { name:'ECS service',            sub:'infra',    state: ecsDown ? 'down' : 'ok',     note: ecsDown ? '0/2 tasks — scaled to zero' : '2/2 tasks running' },
    { name:'CloudWatch log ingestion', sub:'observability', state:'ok', note:'No errors' },
    { name:'Lambda orchestrator',    sub:'AI agent', state: orchestrator.state, note: orchestrator.note },
  ]

  const lamp = {
    ok:   T.green,
    busy: T.amber,
    warn: T.amber,
    down: T.red,
  }

  return (
    <div style={{ background:T.panel, border:`1px solid ${T.line}`, borderRadius:12, padding:'12px 16px' }}>
      <div style={{ fontFamily:T.mono, fontSize:10.5, letterSpacing:'0.16em', textTransform:'uppercase', color:T.muted, marginBottom:8 }}>
        Service status
      </div>

      {services.map((s, i) => (
        <div key={s.name} style={{
          display:'flex', alignItems:'center', gap:10, padding:'9px 2px',
          borderTop: i === 0 ? 'none' : `1px solid ${T.line}`,
        }}>
          <span style={{
            width:8, height:8, borderRadius:'50%', flexShrink:0,
            background: lamp[s.state],
            boxShadow: s.state !== 'ok' ? `0 0 8px ${lamp[s.state]}` : 'none',
          }} />
          <span style={{ fontSize:13.5, color:T.text }}>{s.name}</span>
          <span style={{ fontFamily:T.mono, fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase',
            color:T.faint, border:`1px solid ${T.line}`, borderRadius:5, padding:'1px 6px' }}>
            {s.sub}
          </span>
          <span style={{ marginLeft:'auto', fontFamily:T.mono, fontSize:11.5,
            color: s.state === 'ok' ? T.muted : lamp[s.state] }}>
            {s.note}
          </span>
        </div>
      ))}
    </div>
  )
}
