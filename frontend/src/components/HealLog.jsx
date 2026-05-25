import { useEffect, useRef } from 'react'

const ICONS = {
  orchestrator:         '◎',
  reasoning:            '→',
  run_diagnosis:        '⌕',
  describe_ecs_service: '⊞',
  fix_ecs_service:      '⟳',
  apply_patch:          '✎',
  run_validation:       '✓',
  trigger_deploy:       '▶',
  escalate:             '⚠',
  complete:             '★',
}
const COLORS = { running:'#EF9F27', success:'#639922', error:'#E24B4A' }

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
      fontFamily:'monospace', fontSize:12, lineHeight:1.75,
      minHeight:180, maxHeight:260, overflowY:'auto'
    }}>
      {events.length === 0 && (
        <span style={{ color:'#555' }}>Waiting for heal events...</span>
      )}
      {events.map(e => (
        <div key={e.id}>
          <span style={{ color:'#444' }}>[{fmt(e.timestamp)}]</span>{' '}
          <span style={{ color: COLORS[e.status] || '#888' }}>{ICONS[e.step] ?? '.'} {e.step}</span>{' '}
          <span style={{ color:'#ccc' }}>{e.message}</span>
        </div>
      ))}
      {healing && <div style={{ color:'#EF9F27', marginTop:4 }}>● healing in progress...</div>}
      {healed  && <div style={{ color:'#639922', marginTop:4, fontWeight:600 }}>★ heal complete — no human intervention required</div>}
      <div ref={bottomRef} />
    </div>
  )
}
