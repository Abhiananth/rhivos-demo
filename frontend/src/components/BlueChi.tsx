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

const CHIPS = [
  { id: 'adas',    label: 'ADAS Chip',        service: 'lane-keep-assist' },
  { id: 'ivi',     label: 'Infotainment Chip', service: 'media-player'    },
  { id: 'gateway', label: 'Gateway Chip',      service: 'can-router'      },
]

function statusPill(s: string): string {
  return ({ running: 'pill-green', crashed: 'pill-red', restarting: 'pill-yellow',
            safe_state: 'pill-red', starting: 'pill-gray', error: 'pill-red' } as any)[s] ?? 'pill-gray'
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
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>BlueChi-style Orchestration</h2>
        <p style={{ fontSize: 12, color: 'var(--text2)' }}>
          A Python controller manages 3 real Podman containers — one per "chip".
          Crash QM → auto-restart. Crash ASIL-B → safe state, deliberate recovery required.
        </p>
      </div>

      {state.safe_state_active && (
        <div className="alert alert-danger">
          Safe state active — ASIL-B container offline. ISO 26262: no auto-restart. Use the recover button.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {CHIPS.map(chip => {
          const cs = state.chips[chip.id]
          if (!cs) return (
            <div key={chip.id} className="card">
              <div className="card-header"><span className="card-title">{chip.label}</span></div>
              <div className="card-body"><p style={{ fontSize: 12, color: 'var(--text2)' }}>Not started</p></div>
            </div>
          )
          return (
            <div key={chip.id} className="card" style={{ borderColor: cs.safe_state ? 'var(--red)' : undefined }}>
              <div className="card-header">
                <span className={`pill ${cs.criticality === 'ASIL-B' ? 'pill-red' : 'pill-blue'}`}>{cs.criticality}</span>
                <span className="card-title" style={{ marginLeft: 6 }}>{chip.label}</span>
                <span className={`pill ${statusPill(cs.status)}`} style={{ marginLeft: 'auto' }}>{cs.status}</span>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ fontSize: 12 }}><span style={{ color: 'var(--text2)' }}>service: </span>{chip.service}</p>
                <p style={{ fontSize: 12 }}><span style={{ color: 'var(--text2)' }}>restarts: </span>{cs.restarts}</p>
                <p style={{ fontSize: 11, color: 'var(--text2)', fontStyle: 'italic' }}>{cs.last_event}</p>
                <div className="action-row" style={{ marginTop: 4 }}>
                  {cs.status === 'running' && (
                    <button className="btn-danger" style={{ fontSize: 11, padding: '4px 10px' }}
                      onClick={() => send(`/scenario2/crash/${chip.id}`)}>crash</button>
                  )}
                  {cs.status === 'safe_state' && (
                    <button className="btn-success" style={{ fontSize: 11, padding: '4px 10px' }}
                      onClick={() => send(`/scenario2/recover/${chip.id}`)}>recover (deliberate)</button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Controller log</span></div>
        <div className="card-body">
          <div className="log-box">
            {state.controller_log.length === 0
              ? <p>Start the scenario to see controller events...</p>
              : state.controller_log.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        </div>
      </div>

      <div className="action-row">
        {!state.running
          ? <button className="btn-primary" onClick={() => send('/scenario2/start')}>Start scenario</button>
          : <button className="btn-ghost"   onClick={() => send('/scenario2/stop')}>Stop scenario</button>}
      </div>
    </div>
  )
}
