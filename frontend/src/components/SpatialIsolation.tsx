import { useEffect, useState } from 'react'
import type { WsMessage } from '../App'

interface Props { lastMsg: WsMessage | null; send: (path: string, method?: string) => void }

interface S9State {
  running: boolean
  asil_status: string
  qm_status: string
  asil_pid: number | null
  qm_pid: number | null
  asil_net: string
  qm_net: string
  lateral_probe_result: 'blocked' | 'reachable' | 'running' | null
  lateral_probe_ip: string | null
  host_probe_result: 'reachable' | 'blocked' | null
  log: string[]
  error: string | null
}

const INIT: S9State = {
  running: false, asil_status: 'stopped', qm_status: 'stopped',
  asil_pid: null, qm_pid: null,
  asil_net: 'spatial-isolated', qm_net: 'podman (default)',
  lateral_probe_result: null, lateral_probe_ip: null,
  host_probe_result: null, log: [], error: null,
}

function statusColor(s: string) {
  if (s === 'healthy') return '#10b981'
  if (s === 'stopped') return '#444'
  return '#ef4444'
}

function ProbeArrow({
  from, to, result, label,
}: {
  from: string; to: string; result: 'blocked' | 'reachable' | 'running' | null; label: string
}) {
  const color = result === 'reachable' ? '#10b981' : result === 'blocked' ? '#ef4444' : '#555'
  const icon = result === 'reachable' ? '✓' : result === 'blocked' ? '✗' : result === 'running' ? '…' : '?'
  const badge = result === 'reachable' ? 'ALLOWED' : result === 'blocked' ? 'BLOCKED' : result === 'running' ? 'PROBING' : '—'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: `${color}0d`, border: `1px solid ${color}33`, borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: '#888', flex: '0 0 80px' }}>{from}</div>
      <div style={{ flex: 1, height: 1, background: color, position: 'relative' }}>
        <div style={{
          position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
          fontSize: 10, color, fontWeight: 700, whiteSpace: 'nowrap',
          background: '#111', padding: '0 4px',
        }}>
          {label}
        </div>
      </div>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        background: `${color}22`, border: `2px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 800, color,
        animation: result === 'running' ? 'pulse 0.8s infinite' : 'none',
      }}>
        {icon}
      </div>
      <div style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: `${color}22`, color, fontWeight: 700, flex: '0 0 70px', textAlign: 'center' }}>
        {badge}
      </div>
      <div style={{ fontSize: 11, color: '#888', flex: '0 0 80px', textAlign: 'right' }}>{to}</div>
    </div>
  )
}

export default function SpatialIsolation({ lastMsg, send }: Props) {
  const [st, setSt] = useState<S9State>(INIT)

  useEffect(() => {
    if (!lastMsg) return
    if (lastMsg.type === 'init' && lastMsg.scenario9) setSt(lastMsg.scenario9 as S9State)
    if (lastMsg.type === 's9_state') setSt(lastMsg as unknown as S9State)
  }, [lastMsg])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#ee0000', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Scenario 9 — Spatial Isolation
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Linux namespaces enforce hard network + process boundaries</div>
          <div style={{ fontSize: 12, color: '#666' }}>
            ASIL-B is invisible to QM at the network level — only the host can reach it via the approved channel
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!st.running
            ? <button className="btn-primary" onClick={() => send('/scenario9/start')}>Start Scenario</button>
            : <button className="btn-ghost" onClick={() => send('/scenario9/stop')}>Stop</button>
          }
        </div>
      </div>

      {st.error && (
        <div style={{ background: '#1f0d0d', border: '1px solid #7f1d1d', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#fca5a5' }}>
          ⚠ {st.error}
        </div>
      )}

      {/* Network topology diagram */}
      <div style={{ background: '#111', border: '1px solid #222', borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 20 }}>
          Network topology
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>

          {/* Host */}
          <div style={{ background: '#0d1117', border: '1px solid #2d4a2d', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 28 }}>💻</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>Host (macOS)</div>
            <div style={{ fontSize: 10, color: '#666', textAlign: 'center' }}>Orchestration layer<br />Port mappings: 8821, 8822</div>
          </div>

          {/* ASIL-B */}
          <div style={{
            background: '#1a0505', border: `1px solid ${statusColor(st.asil_status)}44`,
            borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>
            <div style={{ fontSize: 28 }}>🛡</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ee0000' }}>ASIL-B Container</div>
            <div style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 4,
              background: `${statusColor(st.asil_status)}22`, color: statusColor(st.asil_status), fontWeight: 700,
            }}>
              {st.asil_status.toUpperCase()}
            </div>
            <div style={{ fontSize: 10, color: '#666', textAlign: 'center' }}>
              Network: <span style={{ color: '#ee0000', fontWeight: 600 }}>{st.asil_net}</span>
              {st.asil_pid && <><br />PID: {st.asil_pid}</>}
              {st.lateral_probe_ip && <><br />Container IP: {st.lateral_probe_ip}</>}
            </div>
          </div>

          {/* QM */}
          <div style={{
            background: '#0d0d1a', border: `1px solid ${statusColor(st.qm_status)}44`,
            borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>
            <div style={{ fontSize: 28 }}>📱</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>QM Container</div>
            <div style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 4,
              background: `${statusColor(st.qm_status)}22`, color: statusColor(st.qm_status), fontWeight: 700,
            }}>
              {st.qm_status.toUpperCase()}
            </div>
            <div style={{ fontSize: 10, color: '#666', textAlign: 'center' }}>
              Network: <span style={{ color: '#7c3aed', fontWeight: 600 }}>{st.qm_net}</span>
              {st.qm_pid && <><br />PID: {st.qm_pid}</>}
            </div>
          </div>
        </div>

        {/* Probe result arrows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ProbeArrow
            from="Host" to="ASIL-B"
            result={st.host_probe_result}
            label="→ port 8821 (approved channel)"
          />
          <ProbeArrow
            from="QM container" to="ASIL-B"
            result={st.lateral_probe_result}
            label="→ container IP (lateral attack)"
          />
        </div>

        {/* Probe button */}
        {st.running && (
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
            <button
              className="btn-primary"
              disabled={st.lateral_probe_result === 'running'}
              onClick={() => send('/scenario9/probe')}
            >
              {st.lateral_probe_result === 'running' ? '🔍 Probing…' : '🔍 Run Isolation Probe'}
            </button>
          </div>
        )}
      </div>

      {/* Process isolation explainer */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header" style={{ background: '#1a0505' }}>
            <span className="card-title" style={{ color: '#ee0000' }}>🛡 ASIL-B process namespace</span>
          </div>
          <div className="card-body">
            <div style={{ fontSize: 11, color: '#888', lineHeight: 1.7 }}>
              PID 1: <span style={{ color: '#ccc' }}>service.py (FastAPI)</span><br />
              Visible processes: <span style={{ color: '#10b981', fontWeight: 700 }}>1</span><br />
              <span style={{ color: '#666' }}>Cannot see QM processes, host processes, or any other container</span>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header" style={{ background: '#0d0d1a' }}>
            <span className="card-title" style={{ color: '#7c3aed' }}>📱 QM process namespace</span>
          </div>
          <div className="card-body">
            <div style={{ fontSize: 11, color: '#888', lineHeight: 1.7 }}>
              PID 1: <span style={{ color: '#ccc' }}>service.py (FastAPI)</span><br />
              Visible processes: <span style={{ color: '#10b981', fontWeight: 700 }}>1</span><br />
              <span style={{ color: '#666' }}>Cannot see ASIL-B processes, host processes, or any other container</span>
            </div>
          </div>
        </div>
      </div>

      {/* Result summary */}
      {st.lateral_probe_result === 'blocked' && st.host_probe_result === 'reachable' && (
        <div style={{ background: '#052e16', border: '1px solid #166534', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80', marginBottom: 6 }}>
            ✅ Spatial isolation confirmed
          </div>
          <div style={{ fontSize: 12, color: '#86efac', lineHeight: 1.7 }}>
            • QM container cannot reach ASIL-B's container IP — different network namespace<br />
            • Host reaches ASIL-B via published port 8821 — the only approved channel<br />
            • This is the Linux network namespace guarantee: containers are sovereign islands
          </div>
        </div>
      )}

      {/* Log */}
      {st.log.length > 0 && (
        <div className="card">
          <div className="card-header"><span className="card-title">Probe log</span></div>
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
