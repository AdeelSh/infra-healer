import { useEffect, useRef } from 'react'

const STEP_LABELS = {
  detected:             '🔴 Bug detected',
  orchestrator:         '🧠 Orchestrator',
  reasoning:            '💭 Reasoning',
  run_diagnosis:        '🔍 Diagnosis',
  describe_ecs_service: '⊞ ECS check',
  fix_ecs_service:      '⟳ ECS fix',
  apply_patch:          '✎ Patch',
  run_validation:       '✓ Validation',
  trigger_deploy:       '▶ Deploy',
  escalate:             '⚠ Escalate',
  complete:             '★ Complete',
}

const COLORS = { running: '#EF9F27', success: '#639922', error: '#E24B4A' }

export default function HealLog({ healData }) {
  const { events = [], healing, healed } = healData
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  const fmt = ms => new Date(ms).toTimeString().slice(0, 8)

  return (
    <div style={{
      background:'#111', borderRadius:8, padding:'12px 14px',
      fontFamily:'monospace', fontSize:12, lineHeight:1.8,
      minHeight:180, maxHeight:280, overflowY:'auto'
    }}>
      {events.length === 0 && (
        <span style={{ color:'#555' }}>Waiting for heal events...</span>
      )}
      {events.map(e => (
        <div key={e.id} style={{ marginBottom: 6 }}>
          <div>
            <span style={{ color:'#444' }}>[{fmt(e.timestamp)}]</span>{' '}
            <span style={{ color: COLORS[e.status] || '#888', fontWeight: 600 }}>
              {STEP_LABELS[e.step] ?? e.step}
            </span>
          </div>
          <div style={{ color:'#ccc', paddingLeft: 4 }}>{e.message}</div>
        </div>
      ))}
      {healing && (
        <div style={{ color:'#EF9F27', marginTop:4 }}>
          ● healing in progress...
        </div>
      )}
      {healed && (
        <div style={{ color:'#639922', marginTop:4, fontWeight:600 }}>
          ★ heal complete — no human intervention required
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
