import { useEffect, useRef } from 'react'
import { T } from '../App'

// The flight recorder: every orchestrator decision, streamed as it happens.
const STEP_META = {
  detected:       { tag:'DETECT',   color:'#E5484D' },
  orchestrator:   { tag:'ORCH',     color:'#5B8DEF' },
  run_diagnosis:  { tag:'DIAG',     color:'#E8A33D' },
  apply_patch:    { tag:'PATCH',    color:'#B08AF5' },
  run_validation: { tag:'VALID',    color:'#3FBF7F' },
  trigger_deploy: { tag:'DEPLOY',   color:'#5B8DEF' },
  complete:       { tag:'COMPLETE', color:'#3FBF7F' },
}
const fallbackMeta = (step) => ({ tag: String(step || 'EVENT').slice(0, 8).toUpperCase(), color: T.muted })

// Turn bare commit URLs in messages into links, keep everything else text.
function renderMessage(msg) {
  const parts = String(msg).split(/(https:\/\/github\.com\/\S+)/g)
  return parts.map((p, i) =>
    p.startsWith('https://github.com/')
      ? <a key={i} href={p} target="_blank" rel="noopener noreferrer"
          style={{ color:'#B08AF5', textDecoration:'underline', textUnderlineOffset:2 }}>
          {p.includes('/commit/') ? `commit ${p.split('/commit/')[1].slice(0,7)}` : p}
        </a>
      : <span key={i}>{p}</span>
  )
}

export default function HealLog({ healData }) {
  const events  = healData?.events || []
  const healing = healData?.healing
  const healed  = healData?.healed
  const endRef  = useRef(null)

  // Follow the feed as new lines arrive.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [events.length, healed])

  return (
    <div style={{
      background:'#080D16', border:`1px solid ${T.line}`, borderRadius:12,
      padding:'12px 0 10px', display:'flex', flexDirection:'column', minHeight:220,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 16px 8px',
        borderBottom:`1px solid ${T.line}` }}>
        <span style={{ fontFamily:T.mono, fontSize:10.5, letterSpacing:'0.16em', textTransform:'uppercase', color:T.muted }}>
          Heal feed
        </span>
        {healing && (
          <span style={{ fontFamily:T.mono, fontSize:10, color:T.amber, marginLeft:'auto' }}>● LIVE</span>
        )}
      </div>

      <div style={{ overflowY:'auto', maxHeight:260, padding:'8px 16px 0' }}>
        {events.length === 0 ? (
          <div style={{ fontFamily:T.mono, fontSize:12, color:T.faint, padding:'22px 0', textAlign:'center' }}>
            No active heal cycle. Inject a fault to watch the agent work.
          </div>
        ) : events.map((e, i) => {
          const meta = STEP_META[e.step] || fallbackMeta(e.step)
          const time = e.timestamp ? new Date(Number(e.timestamp)).toTimeString().slice(0, 8) : ''
          return (
            <div key={e.id || i} style={{
              display:'flex', gap:10, alignItems:'baseline',
              padding:'5px 0', animation:'lineIn 0.35s ease both',
            }}>
              <span style={{ fontFamily:T.mono, fontSize:10.5, color:T.faint, flexShrink:0 }}>{time}</span>
              <span style={{
                fontFamily:T.mono, fontSize:9.5, fontWeight:600, letterSpacing:'0.08em',
                color:meta.color, border:`1px solid ${meta.color}55`, borderRadius:4,
                padding:'1px 6px', flexShrink:0, minWidth:58, textAlign:'center',
              }}>
                {meta.tag}
              </span>
              <span style={{ fontFamily:T.mono, fontSize:12, lineHeight:1.6, color:'#C4CDDB', wordBreak:'break-word' }}>
                {renderMessage(e.message)}
              </span>
            </div>
          )
        })}

        {healed && events.length > 0 && (
          <div style={{ fontFamily:T.mono, fontSize:11.5, fontWeight:600, color:T.green,
            padding:'8px 0 4px', letterSpacing:'0.04em' }}>
            ★ HEAL COMPLETE — NO HUMAN INTERVENTION REQUIRED
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}
