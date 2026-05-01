import { useEffect, useState, useRef } from 'react'
import type { WsMessage } from '../App'

interface Props { lastMsg: WsMessage | null; send: (path: string, method?: string) => void }

interface VehicleState {
  speed_kmh: number
  steering_deg: number
  brake_pct: number
  lane_deviation: number
  safe_state: boolean
}

interface BusMessage {
  id: number
  ts: string
  direction: string
  topic: string
  payload: string
  allowed: boolean
}

interface S10State {
  running: boolean
  asil_status: string
  vehicle_state: VehicleState
  messages: BusMessage[]
  write_attempt: 'rejected' | null
  read_count: number
  write_rejected_count: number
  log: string[]
  error: string | null
}

const INIT: S10State = {
  running: false, asil_status: 'stopped',
  vehicle_state: { speed_kmh: 0, steering_deg: 0, brake_pct: 0, lane_deviation: 0, safe_state: false },
  messages: [], write_attempt: null,
  read_count: 0, write_rejected_count: 0,
  log: [], error: null,
}

function statusColor(s: string) {
  return s === 'healthy' ? '#10b981' : s === 'stopped' ? '#444' : '#ef4444'
}

function Gauge({ value, max, unit, label, color }: { value: number; max: number; unit: string; label: string; color: string }) {
  const pct = Math.min(Math.abs(value) / max, 1)
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={80} height={80} viewBox="0 0 80 80">
        <circle cx={40} cy={40} r={32} fill="none" stroke="#1a1a1a" strokeWidth={7} />
        <circle cx={40} cy={40} r={32} fill="none" stroke={color} strokeWidth={7}
          strokeDasharray={`${pct * 201} 201`} strokeLinecap="round"
          transform="rotate(-90 40 40)"
          style={{ transition: 'stroke-dasharray 0.5s' }}
        />
        <text x={40} y={38} textAnchor="middle" fill="white" fontSize={14} fontWeight={700}>{Math.abs(value)}</text>
        <text x={40} y={50} textAnchor="middle" fill="#555" fontSize={8}>{unit}</text>
      </svg>
      <div style={{ fontSize: 10, color: '#666' }}>{label}</div>
    </div>
  )
}

export default function IPCDemo({ lastMsg, send }: Props) {
  const [st, setSt] = useState<S10State>(INIT)
  const msgBoxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!lastMsg) return
    if (lastMsg.type === 'init' && lastMsg.scenario10) setSt(lastMsg.scenario10 as S10State)
    if (lastMsg.type === 's10_state') setSt(lastMsg as unknown as S10State)
  }, [lastMsg])

  useEffect(() => {
    if (msgBoxRef.current) msgBoxRef.current.scrollTop = 0
  }, [st.messages])

  const v = st.vehicle_state

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#ee0000', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Scenario 10 — Controlled IPC
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Enforced read-only access for QM to safety bus</div>
          <div style={{ fontSize: 12, color: '#666' }}>
            QM can observe ASIL-B state — it cannot modify it. Policy enforced at the bus layer.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!st.running
            ? <button className="btn-primary" onClick={() => send('/scenario10/start')}>Start Scenario</button>
            : <button className="btn-ghost" onClick={() => send('/scenario10/stop')}>Stop</button>
          }
        </div>
      </div>

      {st.error && (
        <div style={{ background: '#1f0d0d', border: '1px solid #7f1d1d', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#fca5a5' }}>
          ⚠ {st.error}
        </div>
      )}

      {/* Write rejected banner */}
      {st.write_attempt === 'rejected' && (
        <div style={{
          background: '#1f0d0d', border: '1px solid #dc2626', borderRadius: 8,
          padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
          animation: 'pulse 0.5s',
        }}>
          <div style={{ fontSize: 24 }}>🚫</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>Write attempt REJECTED</div>
            <div style={{ fontSize: 11, color: '#fca5a5' }}>QM tried: override_steering=45° — denied by IPC policy layer</div>
          </div>
        </div>
      )}

      {/* Main 3-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'start' }}>

        {/* ASIL-B Publisher */}
        <div style={{ background: '#1a0505', border: '1px solid #7f1d1d', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #3f0000', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', fontWeight: 600 }}>ASIL-B Publisher</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ee0000' }}>ADAS Safety Controller</div>
            </div>
            <div style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: `${statusColor(st.asil_status)}22`, color: statusColor(st.asil_status), fontWeight: 700 }}>
              {st.asil_status.toUpperCase()}
            </div>
          </div>
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 10, color: '#666', marginBottom: 12 }}>Live vehicle state (publishing to bus)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <Gauge value={v.speed_kmh} max={120} unit="km/h" label="Speed" color="#ee0000" />
              <Gauge value={v.steering_deg} max={30} unit="deg" label="Steering" color="#f59e0b" />
              <Gauge value={v.brake_pct} max={100} unit="%" label="Brake" color="#dc2626" />
              <Gauge value={Math.abs(v.lane_deviation) * 100} max={100} unit="cm" label="Lane dev" color="#f97316" />
            </div>
            <div style={{ fontSize: 10, color: '#555', borderTop: '1px solid #2a0a0a', paddingTop: 10 }}>
              Publishes: <span style={{ color: '#888' }}>vehicle.state (1 Hz)</span>
            </div>
          </div>
        </div>

        {/* Message Bus */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 40 }}>
          <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', fontWeight: 700 }}>Safety Bus</div>
          <div style={{
            width: 80, background: '#0d1117', border: '1px solid #1a3a5c', borderRadius: 8,
            padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>
            <div style={{ fontSize: 18 }}>🔀</div>
            <div style={{ fontSize: 9, color: '#3b82f6', fontWeight: 700 }}>ACL POLICY</div>
            <div style={{ fontSize: 9, color: '#555', textAlign: 'center' }}>READ: QM ✓<br />WRITE: QM ✗</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, width: '100%' }}>
            {st.running && (
              <>
                <button
                  className="btn-primary"
                  style={{ fontSize: 11, padding: '6px 10px' }}
                  onClick={() => send('/scenario10/read')}
                >
                  QM reads →
                </button>
                <button
                  className="btn-danger"
                  style={{ fontSize: 11, padding: '6px 10px' }}
                  onClick={() => send('/scenario10/write_attempt')}
                >
                  QM writes ✗
                </button>
              </>
            )}
          </div>
        </div>

        {/* QM Subscriber */}
        <div style={{ background: '#0d0d1a', border: '1px solid #3730a3', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e1b4b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', fontWeight: 600 }}>QM Subscriber</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>IVI / HMI Consumer</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              <div style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#10b98122', color: '#10b981', fontWeight: 700 }}>READ ✓</div>
              <div style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#ef444422', color: '#ef4444', fontWeight: 700 }}>WRITE ✗</div>
            </div>
          </div>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div style={{ background: '#0d0d0d', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: '#555' }}>Reads total</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981' }}>{st.read_count}</div>
              </div>
              <div style={{ background: '#0d0d0d', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: '#555' }}>Writes rejected</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: st.write_rejected_count > 0 ? '#ef4444' : '#555' }}>
                  {st.write_rejected_count}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: '#444', borderTop: '1px solid #1a1a2e', paddingTop: 10 }}>
              Subscribes to: <span style={{ color: '#7c3aed' }}>vehicle.state (read-only)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Message bus feed */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">IPC message bus feed</span>
          <span style={{ fontSize: 10, color: '#555', marginLeft: 'auto' }}>
            green = allowed · red = rejected
          </span>
        </div>
        <div className="card-body" ref={msgBoxRef} style={{ maxHeight: 220, overflowY: 'auto' }}>
          {st.messages.length === 0
            ? <div style={{ fontSize: 11, color: '#444', fontFamily: 'monospace' }}>— no messages yet —</div>
            : st.messages.map(m => (
              <div key={m.id} style={{
                display: 'flex', gap: 10, padding: '5px 0',
                borderBottom: '1px solid #111', alignItems: 'baseline',
              }}>
                <span style={{ fontSize: 10, color: '#444', fontFamily: 'monospace', flex: '0 0 64px' }}>{m.ts}</span>
                <span style={{ fontSize: 10, fontWeight: 700, flex: '0 0 16px', color: m.allowed ? '#10b981' : '#ef4444' }}>
                  {m.allowed ? '✓' : '✗'}
                </span>
                <span style={{ fontSize: 11, color: '#888', flex: '0 0 180px', fontFamily: 'monospace' }}>{m.direction}</span>
                <span style={{ fontSize: 10, color: '#555', flex: '0 0 100px', fontFamily: 'monospace' }}>{m.topic}</span>
                <span style={{ fontSize: 10, color: m.allowed ? '#ccc' : '#ef4444', fontFamily: 'monospace', flex: 1 }}>{m.payload}</span>
              </div>
            ))
          }
        </div>
      </div>

      {/* Log */}
      {st.log.length > 0 && (
        <div className="card">
          <div className="card-header"><span className="card-title">Policy log</span></div>
          <div className="card-body">
            <div className="log-box">
              {st.log.map((l, i) => <p key={i}>{l}</p>)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
