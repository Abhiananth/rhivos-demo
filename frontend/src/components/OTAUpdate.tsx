import { useEffect, useState } from 'react'
import type { WsMessage } from '../App'

interface Props { lastMsg: WsMessage | null; send: (path: string, method?: string) => void }

interface OTAState {
  running: boolean; active_version: string | null; active_slot: string | null
  standby_version: string | null; status: string; progress: number
  boot_count: number; fault_staged: boolean; log: string[]; var_log_count: number
}

export default function OTAUpdate({ lastMsg, send }: Props) {
  const [state, setState] = useState<OTAState>({
    running: false, active_version: null, active_slot: null,
    standby_version: null, status: 'idle', progress: 0,
    boot_count: 0, fault_staged: false, log: [], var_log_count: 0
  })

  useEffect(() => {
    if (!lastMsg) return
    const t = lastMsg.type
    if (['scenario3_started','scenario3_tick','scenario3_updated','scenario3_rollback','scenario3_fault_staged'].includes(t))
      setState(lastMsg.state as OTAState)
    if (t === 'scenario3_stopped') setState(s => ({ ...s, running: false }))
    if (t === 'init' && lastMsg.scenario3) setState(lastMsg.scenario3 as OTAState)
  }, [lastMsg])

  const busy = ['pulling','writing','rebooting','rollback'].includes(state.status)
  const statusLabel: Record<string, string> = {
    active: 'active', pulling: 'pulling image', writing: 'writing to slot',
    rebooting: 'rebooting', rollback: 'rolling back', idle: 'idle'
  }
  const statusPill: Record<string, string> = {
    active: 'pill-green', pulling: 'pill-yellow', writing: 'pill-yellow',
    rebooting: 'pill-blue', rollback: 'pill-red', idle: 'pill-gray'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>OTA Update</h2>
        <p style={{ fontSize: 12, color: 'var(--text2)' }}>
          Real Podman image swap — dual slot, health-check gating, automatic rollback.
          Inject fault → push update → rollback fires automatically. /var persists through everything.
        </p>
      </div>

      {state.fault_staged && (
        <div className="alert alert-danger">Fault staged — next update will fail self-check and trigger automatic rollback.</div>
      )}
      {state.status === 'rollback' && (
        <div className="alert alert-warning">Rollback in progress — reverting to previous slot...</div>
      )}

      <div className="stat-row">
        <div className="stat"><div className="stat-value">Boot #{state.boot_count}</div><div className="stat-label">Current boot</div></div>
        <div className="stat"><div className="stat-value">Slot {state.active_slot ?? '—'}</div><div className="stat-label">Active slot</div></div>
        <div className="stat"><div className="stat-value">{state.active_version ?? '—'}</div><div className="stat-label">Running version</div></div>
        <div className="stat">
          <div className="stat-value">
            <span className={`pill ${statusPill[state.status] ?? 'pill-gray'}`}>{statusLabel[state.status] ?? state.status}</span>
          </div>
          <div className="stat-label">Status</div>
        </div>
        <div className="stat"><div className="stat-value">{state.var_log_count}</div><div className="stat-label">/var log entries</div></div>
      </div>

      {busy && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>
            <span>{statusLabel[state.status]}...</span><span>{state.progress}%</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${state.progress}%`, background: 'var(--accent)' }} />
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {(['A','B'] as const).map(slot => {
          const isActive  = state.active_slot === slot
          const version   = isActive ? state.active_version : state.standby_version
          return (
            <div key={slot} className="card" style={{ background: isActive ? '#052e16' : 'var(--surface)' }}>
              <div className="card-header">
                <span className="card-title">Slot {slot}</span>
                <span className={`pill ${isActive ? 'pill-green' : 'pill-gray'}`} style={{ marginLeft: 'auto' }}>
                  {isActive ? 'active' : (version ? 'standby' : 'empty')}
                </span>
              </div>
              <div className="card-body">
                <p style={{ fontSize: 14, fontWeight: 600 }}>{version ?? 'empty'}</p>
                {isActive && <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>/ mounted read-only (ComposeFS)</p>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Filesystem</span></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <code>/</code>
            <span className="pill pill-green">read-only · ComposeFS · {state.active_version ?? '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <code>/var</code>
            <span className="pill pill-blue">read-write · ext4 · {state.var_log_count} entries · survives updates + rollbacks</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">System log  (/var/log — persists across all updates)</span></div>
        <div className="card-body">
          <div className="log-box">
            {state.log.length === 0
              ? <p>Start the scenario to see log entries...</p>
              : state.log.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        </div>
      </div>

      <div className="action-row">
        {!state.running
          ? <button className="btn-primary" onClick={() => send('/scenario3/start')}>Start scenario</button>
          : <button className="btn-ghost"   onClick={() => send('/scenario3/stop')}>Stop scenario</button>}
        {state.running && !busy && (
          <button className="btn-primary" onClick={() => send('/scenario3/update')}>
            Push OTA update (→ v{state.active_version === '1.0.0' ? '2.0.0' : '1.0.0'})
          </button>
        )}
        {state.running && !busy && (
          <button className={state.fault_staged ? 'btn-ghost' : 'btn-danger'}
            disabled={state.fault_staged} onClick={() => send('/scenario3/fault')}>
            {state.fault_staged ? 'Fault staged' : 'Inject fault (demo rollback)'}
          </button>
        )}
      </div>
    </div>
  )
}
