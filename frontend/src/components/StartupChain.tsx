import { useEffect, useState } from 'react'
import type { WsMessage } from '../App'

interface Props { lastMsg: WsMessage | null; send: (path: string, method?: string) => void }

interface SvcState { status: string; started_at: string | null; blocked_by: string | null; warning: string | null }
interface SvcDef { id: string; label: string; desc: string; criticality: string; deps: string[]; dep_type: Record<string,string>; icon: string }
interface S5State {
  running: boolean; services: Record<string, SvcState>
  log: string[]; gateway_killed: boolean; service_defs: SvcDef[]
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#4b5563', starting: '#f59e0b', running: '#22c55e',
  failed: '#ef4444', blocked: '#7c3aed', degraded: '#f59e0b', unknown: '#4b5563'
}
const STATUS_ICON: Record<string, string> = {
  pending: '○', starting: '↻', running: '●', failed: '✗', blocked: '⊘', degraded: '⚠', unknown: '?'
}

function ServiceNode({ def: d, state: s }: { def: SvcDef; state: SvcState | undefined }) {
  const status = s?.status ?? 'unknown'
  const color = STATUS_COLOR[status] ?? '#4b5563'
  const isASIL = d.criticality === 'ASIL-B'
  const spinning = status === 'starting'

  return (
    <div style={{
      background: status === 'blocked' ? '#1a0a2e' : status === 'failed' ? '#1a0000' : 'var(--surface)',
      border: `1px solid ${color}`,
      borderRadius: 10, padding: 14, minWidth: 180,
      transition: 'border-color 0.3s, background 0.3s'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>{d.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{d.label}</div>
          <div style={{ fontSize: 10, color: 'var(--text2)' }}>{d.desc}</div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
          background: isASIL ? '#7f1d1d' : '#1e3a5f',
          color: isASIL ? '#fca5a5' : '#93c5fd'
        }}>{d.criticality}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          color, fontSize: 14,
          display: 'inline-block',
          animation: spinning ? 'spin 1s linear infinite' : 'none'
        }}>{STATUS_ICON[status]}</span>
        <span style={{ fontSize: 11, color }}>{status}</span>
        {s?.started_at && <span style={{ fontSize: 10, color: '#555', marginLeft: 'auto' }}>{s.started_at}</span>}
      </div>
      {status === 'blocked' && s?.blocked_by && (
        <div style={{ marginTop: 6, fontSize: 10, color: '#c4b5fd', background: '#2e1065', padding: '3px 6px', borderRadius: 4 }}>
          ⊘ blocked — waiting for dependency
        </div>
      )}
      {s?.warning && (
        <div style={{ marginTop: 6, fontSize: 10, color: '#fde68a', background: '#422006', padding: '3px 6px', borderRadius: 4 }}>
          ⚠ {s.warning}
        </div>
      )}
    </div>
  )
}

function DependencyArrow({ type }: { type: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '0 4px' }}>
      <div style={{ width: 1, height: 16, background: type === 'hard' ? '#7c3aed' : '#374151' }} />
      <div style={{ fontSize: 9, color: type === 'hard' ? '#c4b5fd' : '#6b7280' }}>{type}</div>
      <div style={{ width: 1, height: 16, background: type === 'hard' ? '#7c3aed' : '#374151' }} />
      <div style={{ fontSize: 14, color: type === 'hard' ? '#7c3aed' : '#374151' }}>↓</div>
    </div>
  )
}

export default function StartupChain({ lastMsg, send }: Props) {
  const [state, setState] = useState<S5State>({
    running: false, services: {}, log: [], gateway_killed: false, service_defs: []
  })

  useEffect(() => {
    if (!lastMsg) return
    const t = lastMsg.type
    if (['scenario5_started','scenario5_tick','scenario5_complete'].includes(t))
      setState(lastMsg.state as S5State)
    if (t === 'scenario5_stopped') setState(s => ({ ...s, running: false }))
    if (t === 'init' && lastMsg.scenario5) setState(lastMsg.scenario5 as S5State)
  }, [lastMsg])

  const defs = state.service_defs
  const allRunning = defs.length > 0 && defs.every(d => state.services[d.id]?.status === 'running')
  const hasFailure = defs.some(d => ['failed','blocked'].includes(state.services[d.id]?.status ?? ''))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>

      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Startup Dependency Chain</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
          RHIVOS uses <strong style={{ color: 'var(--text)' }}>systemd ordering</strong> to enforce vehicle boot sequence.
          Safety-critical services only start when their dependencies are ready.
          Trigger a gateway failure — watch how ASIL-B lane-keep is <em>blocked</em> while
          infotainment starts in degraded mode (soft dependency).
        </p>
      </div>

      {/* dependency graph */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Boot dependency graph</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text2)' }}>
            purple = hard dependency · grey = soft dependency
          </span>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            {defs.length === 0 ? (
              <div style={{ height: 120, display: 'flex', alignItems: 'center', color: 'var(--text2)', fontSize: 13 }}>
                Start the scenario to see the boot sequence
              </div>
            ) : (
              <>
                {/* Layer 1: hw-init */}
                <ServiceNode def={defs[0]} state={state.services[defs[0].id]} />

                {/* Arrow row */}
                <div style={{ display: 'flex', gap: 100 }}>
                  <DependencyArrow type="hard" />
                  <DependencyArrow type="hard" />
                </div>

                {/* Layer 2: gateway */}
                <ServiceNode def={defs[1]} state={state.services[defs[1].id]} />

                {/* Arrow row */}
                <div style={{ display: 'flex', gap: 100 }}>
                  <DependencyArrow type="hard" />
                  <DependencyArrow type="soft" />
                </div>

                {/* Layer 3: adas + ivi side by side */}
                <div style={{ display: 'flex', gap: 20 }}>
                  <ServiceNode def={defs[2]} state={state.services[defs[2].id]} />
                  <ServiceNode def={defs[3]} state={state.services[defs[3].id]} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* outcome banner */}
      {allRunning && !state.gateway_killed && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: '#052e16', border: '1px solid #22c55e', display: 'flex', gap: 10 }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <div><div style={{ fontWeight: 700, color: '#86efac' }}>All services running</div>
            <div style={{ fontSize: 12, color: '#4ade80' }}>Boot sequence completed — vehicle ready</div></div>
        </div>
      )}
      {hasFailure && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: '#1a0000', border: '1px solid #7c3aed', display: 'flex', gap: 10 }}>
          <span style={{ fontSize: 18 }}>⊘</span>
          <div>
            <div style={{ fontWeight: 700, color: '#c4b5fd' }}>Dependency failure — lane-keep-assist BLOCKED</div>
            <div style={{ fontSize: 12, color: '#a78bfa', marginTop: 2 }}>
              ASIL-B service refused to start because its hard dependency (can-gateway) failed.
              Infotainment started in degraded mode (soft dependency).
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><span className="card-title">systemd journal</span></div>
        <div className="card-body">
          <div className="log-box">
            {state.log.length === 0
              ? <p>Start the scenario to see boot log...</p>
              : state.log.map((e, i) => (
                <p key={i} style={{
                  color: e.includes('BLOCKED') ? '#c4b5fd'
                    : e.includes('FAILED') ? '#fca5a5'
                    : e.includes('active') || e.includes('complete') ? '#86efac'
                    : e.includes('⚠') ? '#fde68a'
                    : undefined
                }}>{e}</p>
              ))}
          </div>
        </div>
      </div>

      <div className="action-row">
        {!state.running ? (
          <>
            <button className="btn-primary" onClick={() => send('/scenario5/start')}>
              ▶ Normal boot
            </button>
            <button className="btn-danger" onClick={() => send('/scenario5/start_fault')}>
              💥 Boot with gateway failure
            </button>
          </>
        ) : (
          <button className="btn-ghost" onClick={() => send('/scenario5/stop')}>■ Reset</button>
        )}
      </div>
    </div>
  )
}
