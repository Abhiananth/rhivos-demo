import { useEffect, useState } from 'react'
import type { WsMessage } from '../App'

interface Props { lastMsg: WsMessage | null; send: (path: string, method?: string) => void }

interface ChipState {
  status: string; restarts: number; safe_state: boolean
  last_event: string; criticality: string; name: string
}
interface S2State {
  running: boolean; chips: Record<string, ChipState>
  controller_log: string[]; safe_state_active: boolean
}

const CHIP_DEFS = [
  { id: 'adas',    label: 'ADAS Chip',        service: 'lane-keep-assist', icon: '🚗', desc: 'Safety-critical compute' },
  { id: 'ivi',     label: 'Infotainment Chip', service: 'media-player',    icon: '🎵', desc: 'Driver experience' },
  { id: 'gateway', label: 'Gateway Chip',      service: 'can-router',      icon: '🔌', desc: 'Vehicle networking' },
]

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: '#22c55e', crashed: '#ef4444', restarting: '#f59e0b',
    safe_state: '#ef4444', starting: '#6b7280', error: '#ef4444'
  }
  const color = colors[status] ?? '#6b7280'
  const pulse = status === 'running' || status === 'restarting'
  return (
    <div style={{ position: 'relative', width: 12, height: 12 }}>
      {pulse && (
        <div style={{
          position: 'absolute', inset: -3, borderRadius: '50%',
          background: color, opacity: 0.2,
          animation: 'pulse 1.5s ease-in-out infinite'
        }} />
      )}
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: color }} />
    </div>
  )
}

function ChipCard({ chipDef, cs, onCrash, onRecover }: {
  chipDef: typeof CHIP_DEFS[0]
  cs: ChipState | undefined
  onCrash: () => void
  onRecover: () => void
}) {
  const status = cs?.status ?? 'not started'
  const isASIL = cs?.criticality === 'ASIL-B'
  const isSafe = status === 'safe_state'
  const isRunning = status === 'running'
  const isRestarting = status === 'restarting'

  const borderColor = isSafe ? '#ef4444' : isRunning ? '#2a2a2a' : '#2a2a2a'
  const bgColor = isSafe ? '#0a0000' : 'var(--surface)'

  return (
    <div style={{
      background: bgColor, border: `1px solid ${borderColor}`,
      borderRadius: 10, overflow: 'hidden',
      transition: 'border-color 0.3s, background 0.3s'
    }}>
      {/* chip header */}
      <div style={{
        padding: '14px 16px',
        background: isASIL ? '#1a0000' : 'var(--surface2)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10
      }}>
        <span style={{ fontSize: 22 }}>{chipDef.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{chipDef.label}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>{chipDef.desc}</div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
          background: isASIL ? '#7f1d1d' : '#1e3a5f',
          color: isASIL ? '#fca5a5' : '#93c5fd'
        }}>
          {cs?.criticality ?? '—'}
        </span>
      </div>

      {/* body */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* container status */}
        <div style={{
          background: 'var(--surface2)', borderRadius: 6, padding: 12,
          border: '1px solid var(--border)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {cs && <StatusDot status={status} />}
            <span style={{ fontSize: 12, fontWeight: 600 }}>{chipDef.service}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text2)' }}>
              {cs ? status : 'not started'}
            </span>
          </div>

          {isRestarting && (
            <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>
              ↻ BlueChi restarting container (QM policy)...
            </div>
          )}
          {isSafe && (
            <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 4, lineHeight: 1.4 }}>
              ⚠ Safe state active. ISO 26262 requires deliberate recovery — no auto-restart.
            </div>
          )}
          {isRunning && cs && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
              {cs.restarts > 0 ? `Restarted ${cs.restarts}× by controller` : 'Running since start'}
            </div>
          )}
        </div>

        {/* action */}
        {isRunning && (
          <button onClick={onCrash} style={{
            width: '100%', padding: '8px', borderRadius: 6, cursor: 'pointer',
            background: '#450a0a', border: '1px solid #7f1d1d', color: '#fca5a5',
            fontSize: 12, fontWeight: 600
          }}>
            💥 Crash this container
          </button>
        )}
        {isSafe && (
          <button onClick={onRecover} style={{
            width: '100%', padding: '8px', borderRadius: 6, cursor: 'pointer',
            background: '#052e16', border: '1px solid #22c55e', color: '#86efac',
            fontSize: 12, fontWeight: 600
          }}>
            ✓ Run self-check & recover
          </button>
        )}
      </div>
    </div>
  )
}

// Controller node visual
function ControllerNode({ running, logCount }: { running: boolean; logCount: number }) {
  return (
    <div style={{
      background: '#0f172a', border: '1px solid #1e40af', borderRadius: 8,
      padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8, background: '#1e3a5f',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18
      }}>🎛</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>BlueChi Controller</div>
        <div style={{ fontSize: 11, color: '#93c5fd' }}>
          {running ? `systemd across 3 chips · monitoring ${logCount} events` : 'Start scenario to activate'}
        </div>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, fontSize: 11, color: '#6b7280' }}>
        <span>QM policy: auto-restart</span>
        <span>·</span>
        <span>ASIL-B policy: safe state</span>
      </div>
    </div>
  )
}

export default function BlueChi({ lastMsg, send }: Props) {
  const [state, setState] = useState<S2State>({ running: false, chips: {}, controller_log: [], safe_state_active: false })

  useEffect(() => {
    if (!lastMsg) return
    const t = lastMsg.type
    if (t === 'scenario2_started' || t === 'scenario2_tick') setState(lastMsg.state as S2State)
    if (t === 'scenario2_stopped') setState(s => ({ ...s, running: false }))
    if (t === 'init' && lastMsg.scenario2) setState(lastMsg.scenario2 as S2State)
  }, [lastMsg])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.2; }
          50% { transform: scale(1.8); opacity: 0.1; }
        }
      `}</style>

      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>BlueChi Orchestration</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
          A controller manages containers across multiple chips — like Kubernetes, but built for cars.
          Crash a <strong style={{ color: '#93c5fd' }}>QM</strong> container and it restarts automatically.
          Crash an <strong style={{ color: '#fca5a5' }}>ASIL-B</strong> container and the system enters safe state — no auto-restart, deliberate recovery only.
        </p>
      </div>

      {state.safe_state_active && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, background: '#450a0a',
          border: '1px solid #ef4444', display: 'flex', gap: 12, alignItems: 'flex-start'
        }}>
          <span style={{ fontSize: 20 }}>🚨</span>
          <div>
            <div style={{ fontWeight: 700, color: '#fca5a5', fontSize: 14 }}>Safe State Active</div>
            <div style={{ fontSize: 12, color: '#f87171', marginTop: 2 }}>
              An ASIL-B container has crashed. ISO 26262 requires the cause to be understood before restarting.
              Use the recover button on the affected chip.
            </div>
          </div>
        </div>
      )}

      <ControllerNode running={state.running} logCount={state.controller_log.length} />

      {/* connector lines visual */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0 40px', marginBottom: -8 }}>
        {CHIP_DEFS.map((_, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            <div style={{ width: 1, height: 20, background: state.running ? '#1e40af' : '#2a2a2a' }} />
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: state.running ? '#3b82f6' : '#2a2a2a' }} />
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {CHIP_DEFS.map(chip => (
          <ChipCard
            key={chip.id}
            chipDef={chip}
            cs={state.chips[chip.id]}
            onCrash={() => send(`/scenario2/crash/${chip.id}`)}
            onRecover={() => send(`/scenario2/recover/${chip.id}`)}
          />
        ))}
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Controller log</span></div>
        <div className="card-body">
          <div className="log-box">
            {state.controller_log.length === 0
              ? <p>Start the scenario to see controller events...</p>
              : state.controller_log.map((e, i) => (
                <p key={i} style={{
                  color: e.includes('CRASHED') ? '#fca5a5' : e.includes('safe') || e.includes('SAFE') ? '#fde68a' : e.includes('Restarted') ? '#86efac' : undefined
                }}>{e}</p>
              ))}
          </div>
        </div>
      </div>

      <div className="action-row">
        {!state.running
          ? <button className="btn-primary" onClick={() => send('/scenario2/start')}>▶ Start scenario</button>
          : <button className="btn-ghost"   onClick={() => send('/scenario2/stop')}>■ Stop scenario</button>}
      </div>
    </div>
  )
}
