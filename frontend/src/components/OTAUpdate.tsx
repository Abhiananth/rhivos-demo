import { useEffect, useState } from 'react'
import type { WsMessage } from '../App'

interface Props { lastMsg: WsMessage | null; send: (path: string, method?: string) => void }
interface OTAState {
  running: boolean; active_version: string | null; active_slot: string | null
  standby_version: string | null; status: string; progress: number
  boot_count: number; fault_staged: boolean; log: string[]; var_log_count: number
}

function SlotVisual({ slot, version, isActive, isReceiving, progress, color }: {
  slot: string; version: string | null; isActive: boolean
  isReceiving?: boolean; progress?: number; color?: string
}) {
  return (
    <div style={{
      flex: 1, borderRadius: 10, overflow: 'hidden',
      border: `2px solid ${isActive ? (color ?? '#22c55e') : isReceiving ? '#f59e0b' : '#2a2a2a'}`,
      transition: 'border-color 0.4s',
      background: isActive ? (color === '#3b82f6' ? '#0f1f3a' : '#052e16') : '#0d0d0d'
    }}>
      <div style={{
        padding: '10px 14px',
        background: isActive ? (color === '#3b82f6' ? '#1e3a5f' : '#14532d') : '#161616',
        borderBottom: `1px solid ${isActive ? (color === '#3b82f6' ? '#1e40af' : '#166534') : '#1e1e1e'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Slot {slot}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
          background: isActive ? (color === '#3b82f6' ? '#1e3a5f' : '#052e16') : isReceiving ? '#422006' : '#1f2937',
          color: isActive ? (color === '#3b82f6' ? '#93c5fd' : '#86efac') : isReceiving ? '#fde68a' : '#6b7280'
        }}>
          {isActive ? 'ACTIVE' : isReceiving ? 'RECEIVING' : version ? 'STANDBY' : 'EMPTY'}
        </span>
      </div>

      <div style={{ padding: 16 }}>
        {version ? (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{version}</div>
            {isActive && (
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
                <div>/ — read-only (ComposeFS)</div>
                <div>/var — read-write (persists)</div>
              </div>
            )}
            {isReceiving && typeof progress === 'number' && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 4 }}>Writing image... {progress}%</div>
                <div style={{ height: 6, borderRadius: 3, background: '#1e1e1e', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${progress}%`,
                    background: '#f59e0b', borderRadius: 3,
                    transition: 'width 0.3s'
                  }} />
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 13, color: '#4b5563', padding: '8px 0' }}>Empty</div>
        )}
      </div>
    </div>
  )
}

function HealthCheck({ status }: { status: string }) {
  if (!['rebooting'].includes(status)) return null
  return (
    <div style={{
      padding: '12px 16px', borderRadius: 8,
      background: '#0f172a', border: '1px solid #1e40af',
      display: 'flex', alignItems: 'center', gap: 12
    }}>
      <div style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}>⟳</div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>Health check running...</div>
        <div style={{ fontSize: 11, color: '#93c5fd' }}>New image must pass before becoming active. Fail → automatic rollback.</div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function VarPartition({ count }: { count: number }) {
  return (
    <div style={{
      padding: '10px 16px', borderRadius: 8,
      background: '#0f1f3a', border: '1px solid #1e3a5f',
      display: 'flex', alignItems: 'center', gap: 12
    }}>
      <span style={{ fontSize: 18 }}>💾</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 12 }}>/var  —  read-write partition</div>
        <div style={{ fontSize: 11, color: '#93c5fd' }}>Survives every OS update and every rollback</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#93c5fd' }}>{count}</div>
        <div style={{ fontSize: 10, color: '#6b7280' }}>log entries</div>
      </div>
    </div>
  )
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

  const slotAActive = state.active_slot === 'A'
  const slotAVersion = slotAActive ? state.active_version : state.standby_version
  const slotBActive = state.active_slot === 'B'
  const slotBVersion = slotBActive ? state.active_version : state.standby_version
  const slotAReceiving = !slotAActive && busy && state.active_slot === 'B'
  const slotBReceiving = !slotBActive && busy && state.active_slot === 'A'
  const activeColor = state.active_version === '2.0.0' ? '#3b82f6' : '#22c55e'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>OTA Update</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
          Two OS image slots on disk. Updates write to the standby slot while the car keeps running.
          A health check gates activation — if it fails, the system <strong style={{ color: 'var(--text)' }}>automatically rolls back</strong> to the previous slot.
          Runtime data in <code>/var</code> survives everything.
        </p>
      </div>

      {state.fault_staged && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: '#450a0a', border: '1px solid #ef4444', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 18 }}>💣</span>
          <div>
            <div style={{ fontWeight: 700, color: '#fca5a5', fontSize: 13 }}>Fault staged in next image</div>
            <div style={{ fontSize: 11, color: '#f87171' }}>Push the update now to see automatic rollback.</div>
          </div>
        </div>
      )}

      {state.status === 'rollback' && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: '#422006', border: '1px solid #78350f', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 18 }}>↩</span>
          <div style={{ fontWeight: 700, color: '#fde68a', fontSize: 13 }}>Rolling back to previous slot...</div>
        </div>
      )}

      {/* stats bar */}
      <div style={{ display: 'flex', gap: 10 }}>
        {[
          { label: 'Boot count',   value: `#${state.boot_count}` },
          { label: 'Active slot',  value: `Slot ${state.active_slot ?? '—'}` },
          { label: 'Running',      value: state.active_version ?? '—' },
          { label: '/var entries', value: String(state.var_log_count) },
        ].map(s => (
          <div key={s.label} className="stat" style={{ flex: 1 }}>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <HealthCheck status={state.status} />

      {/* dual slot visual */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        <SlotVisual slot="A" version={slotAVersion ?? null}
          isActive={slotAActive} isReceiving={slotAReceiving}
          progress={state.progress} color={activeColor} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 4px' }}>
          <div style={{ fontSize: 20, color: busy ? '#f59e0b' : '#4b5563' }}>⇄</div>
          <div style={{ fontSize: 9, color: '#4b5563', textAlign: 'center', width: 50 }}>
            {busy ? 'swap\nin progress' : 'atomic\nswap'}
          </div>
        </div>

        <SlotVisual slot="B" version={slotBVersion ?? null}
          isActive={slotBActive} isReceiving={slotBReceiving}
          progress={state.progress} color={activeColor} />
      </div>

      <VarPartition count={state.var_log_count} />

      {/* log */}
      <div className="card">
        <div className="card-header"><span className="card-title">System log  (/var/log)</span></div>
        <div className="card-body">
          <div className="log-box">
            {state.log.length === 0
              ? <p>Start the scenario to see log entries...</p>
              : state.log.map((e, i) => (
                <p key={i} style={{
                  color: e.includes('FAILED') || e.includes('rollback') || e.includes('Rollback') ? '#fca5a5'
                    : e.includes('PASSED') || e.includes('active') ? '#86efac'
                    : e.includes('REBOOT') ? '#93c5fd'
                    : undefined
                }}>{e}</p>
              ))}
          </div>
        </div>
      </div>

      <div className="action-row">
        {!state.running
          ? <button className="btn-primary" onClick={() => send('/scenario3/start')}>▶ Start scenario</button>
          : <button className="btn-ghost"   onClick={() => send('/scenario3/stop')}>■ Stop scenario</button>}
        {state.running && !busy && (
          <button className="btn-primary" onClick={() => send('/scenario3/update')}>
            🚀 Push OTA update (→ v{state.active_version === '1.0.0' ? '2.0.0' : '1.0.0'})
          </button>
        )}
        {state.running && !busy && (
          <button className={state.fault_staged ? 'btn-ghost' : 'btn-danger'}
            disabled={state.fault_staged} onClick={() => send('/scenario3/fault')}>
            {state.fault_staged ? '💣 Fault staged' : '💣 Inject fault (demo rollback)'}
          </button>
        )}
      </div>
    </div>
  )
}
