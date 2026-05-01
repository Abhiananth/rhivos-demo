import { useEffect, useState } from 'react'
import type { WsMessage } from '../App'

interface Props { lastMsg: WsMessage | null; send: (path: string, method?: string) => void }
interface OTAState {
  running: boolean; active_version: string | null; active_slot: string | null
  standby_version: string | null; status: string; progress: number
  boot_count: number; fault_staged: boolean; log: string[]; var_log_count: number
}

const STEPS = [
  { id: 'idle',      icon: '⏸', label: 'Idle',            desc: 'System healthy, no update pending' },
  { id: 'pulling',   icon: '⬇', label: 'Pull image',      desc: 'Downloading new OS image from registry' },
  { id: 'writing',   icon: '✍', label: 'Write to standby', desc: 'Writing to standby slot — live slot untouched' },
  { id: 'rebooting', icon: '⟳', label: 'Health gate',     desc: 'Greenboot runs health scripts before activating' },
  { id: 'active',    icon: '✅', label: 'Activated',       desc: 'Standby promoted to active — swap complete' },
  { id: 'rollback',  icon: '↩', label: 'Rollback',        desc: 'Health gate FAILED — reverting to previous slot' },
]

function PipelineStep({ step, current, fault }: {
  step: typeof STEPS[0]; current: string; fault: boolean
}) {
  const isActive = step.id === current ||
    (step.id === 'active' && current === 'idle' && false)
  const isDone = (() => {
    const order = ['idle', 'pulling', 'writing', 'rebooting', 'active']
    const ci = order.indexOf(current)
    const si = order.indexOf(step.id)
    return si < ci
  })()
  const isRollback = step.id === 'rollback' && current === 'rollback'
  const isFail = isRollback || (fault && step.id === 'rebooting' && current === 'rebooting')

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1,
      opacity: isRollback && current !== 'rollback' ? 0.3 : 1,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18,
        background: isRollback ? '#450a0a' : isActive ? '#1e3a5f' : isDone ? '#052e16' : '#111',
        border: `2px solid ${isRollback ? '#ef4444' : isActive ? '#3b82f6' : isDone ? '#10b981' : '#333'}`,
        boxShadow: isActive && !isFail ? '0 0 12px #3b82f666' : isActive && isFail ? '0 0 12px #ef444466' : 'none',
        animation: isActive ? 'pulse 1.2s infinite' : 'none',
        transition: 'all 0.3s',
      }}>
        {step.icon}
      </div>
      <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, textAlign: 'center',
        color: isActive ? '#93c5fd' : isDone ? '#4ade80' : isRollback ? '#f87171' : '#555' }}>
        {step.label}
      </div>
      <div style={{ fontSize: 9, color: '#444', textAlign: 'center', maxWidth: 80, lineHeight: 1.3, marginTop: 2 }}>
        {step.desc}
      </div>
    </div>
  )
}

function SlotCard({ slot, version, isActive, isReceiving, progress, color }: {
  slot: string; version: string | null; isActive: boolean
  isReceiving?: boolean; progress?: number; color?: string
}) {
  const borderCol = isActive ? (color ?? '#22c55e') : isReceiving ? '#f59e0b' : '#333'
  const bgTop = isActive ? (color === '#3b82f6' ? '#1e3a5f' : '#14532d') : '#161616'
  const badge = isActive ? 'ACTIVE ▶' : isReceiving ? '⬇ RECEIVING' : version ? 'STANDBY' : 'EMPTY'
  const badgeCol = isActive ? (color === '#3b82f6' ? '#93c5fd' : '#86efac') : isReceiving ? '#fde68a' : '#6b7280'

  return (
    <div style={{
      flex: 1, borderRadius: 10, overflow: 'hidden',
      border: `2px solid ${borderCol}`, transition: 'all 0.4s',
      background: isActive ? (color === '#3b82f6' ? '#0f1f3a' : '#052e16') : '#0d0d0d',
      boxShadow: isActive ? `0 0 20px ${borderCol}33` : 'none',
    }}>
      <div style={{ padding: '10px 14px', background: bgTop, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>Slot {slot}</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
          background: '#00000033', color: badgeCol }}>
          {badge}
        </span>
      </div>
      <div style={{ padding: '16px' }}>
        {version ? (
          <>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 6, letterSpacing: '-0.02em' }}>
              v{version}
            </div>
            {isActive && (
              <div style={{ fontSize: 11, lineHeight: 1.8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: '#4ade80' }}>📂</span>
                  <span style={{ color: '#888' }}><code style={{ color: '#aaa' }}>/</code> — read-only (ComposeFS)</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: '#3b82f6' }}>💾</span>
                  <span style={{ color: '#888' }}><code style={{ color: '#aaa' }}>/var</code> — read-write (persists across updates)</span>
                </div>
              </div>
            )}
            {isReceiving && typeof progress === 'number' && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#f59e0b', marginBottom: 4 }}>
                  <span>Writing image…</span>
                  <span style={{ fontWeight: 700 }}>{progress}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: '#1e1e1e', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${progress}%`,
                    background: 'linear-gradient(to right, #f59e0b, #fbbf24)',
                    borderRadius: 4, transition: 'width 0.3s',
                    boxShadow: '0 0 8px #f59e0b66',
                  }} />
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 13, color: '#333', padding: '8px 0' }}>Empty</div>
        )}
      </div>
    </div>
  )
}

export default function OTAUpdate({ lastMsg, send }: Props) {
  const [state, setState] = useState<OTAState>({
    running: false, active_version: null, active_slot: null,
    standby_version: null, status: 'idle', progress: 0,
    boot_count: 0, fault_staged: false, log: [], var_log_count: 0,
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
  const slotBActive = state.active_slot === 'B'
  const slotAVersion = slotAActive ? state.active_version : state.standby_version
  const slotBVersion = slotBActive ? state.active_version : state.standby_version
  const slotAReceiving = !slotAActive && busy && state.active_slot === 'B'
  const slotBReceiving = !slotBActive && busy && state.active_slot === 'A'
  const activeColor = state.active_version === '2.0.0' ? '#3b82f6' : '#22c55e'
  const currentStep = state.status === 'idle' ? 'idle'
    : state.status === 'pulling' ? 'pulling'
    : state.status === 'writing' ? 'writing'
    : state.status === 'rebooting' ? 'rebooting'
    : state.status === 'rollback' ? 'rollback'
    : 'active'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div style={{ background: '#0d0d0d', border: '1px solid #1e1e1e', borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              RHIVOS OTA Updates
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              Update a fleet of cars. Zero downtime. Instant rollback.
            </div>
            <div style={{ fontSize: 12, color: '#666', lineHeight: 1.6 }}>
              rpm-ostree writes a new OS image to the standby A/B slot while the car keeps running.
              Greenboot health scripts gate activation — if they fail, the system rolls back automatically.
              Your <code style={{ color: '#aaa' }}>/var</code> data (logs, configs, trips) survives everything.
            </div>
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!state.running
              ? <button className="btn-primary" style={{ padding: '12px 24px', fontWeight: 800 }}
                  onClick={() => send('/scenario3/start')}>▶ Start Scenario</button>
              : <button className="btn-ghost" onClick={() => send('/scenario3/stop')}>■ Stop</button>}
          </div>
        </div>
      </div>

      {/* ── Stats bar ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10 }}>
        {[
          { label: 'Boot count', value: `#${state.boot_count}`, color: '#f59e0b' },
          { label: 'Active slot', value: `Slot ${state.active_slot ?? '—'}`, color: '#10b981' },
          { label: 'Running version', value: state.active_version ? `v${state.active_version}` : '—', color: activeColor },
          { label: '/var entries', value: String(state.var_log_count), color: '#3b82f6' },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1, background: '#0d0d0d', border: '1px solid #1e1e1e',
            borderRadius: 8, padding: '12px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Update pipeline ───────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Update pipeline — current status</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#555' }}>
            rpm-ostree + Greenboot health gate
          </span>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, padding: '8px 0' }}>
            {STEPS.map((step, i) => (
              <div key={step.id} style={{ display: 'flex', alignItems: 'flex-start', flex: 1 }}>
                <PipelineStep step={step} current={currentStep} fault={state.fault_staged} />
                {i < STEPS.length - 1 && (
                  <div style={{ marginTop: 20, color: '#333', fontSize: 14, flexShrink: 0 }}>›</div>
                )}
              </div>
            ))}
          </div>

          {/* Progress bar for writing step */}
          {state.status === 'writing' && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#1a1000', borderRadius: 6, border: '1px solid #78350f' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#fde68a', marginBottom: 6 }}>
                <span>Writing image to standby slot…</span>
                <span style={{ fontWeight: 700 }}>{state.progress}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: '#2a1500', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${state.progress}%`,
                  background: 'linear-gradient(to right, #f59e0b, #fbbf24)',
                  boxShadow: '0 0 10px #f59e0b88', borderRadius: 4, transition: 'width 0.3s',
                }} />
              </div>
            </div>
          )}

          {/* Health gate running */}
          {state.status === 'rebooting' && (
            <div style={{ marginTop: 12, padding: '12px 16px', background: '#0f172a', borderRadius: 6, border: '1px solid #1e40af', display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 22, animation: 'spin 1s linear infinite' }}>⟳</div>
              <div>
                <div style={{ fontWeight: 700, color: '#93c5fd', fontSize: 13 }}>
                  {state.fault_staged ? 'Health gate FAILING — rollback will trigger' : 'Health gate running…'}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {state.fault_staged
                    ? 'Greenboot detected fault — reverting to previous slot automatically'
                    : 'Greenboot validates new image before committing it active'}
                </div>
              </div>
              <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
            </div>
          )}

          {/* Rollback */}
          {state.status === 'rollback' && (
            <div style={{ marginTop: 12, padding: '12px 16px', background: '#450a0a', borderRadius: 6, border: '1px solid #ef4444', display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 22 }}>↩</span>
              <div>
                <div style={{ fontWeight: 700, color: '#fca5a5', fontSize: 13 }}>Auto-rolling back — health gate failed</div>
                <div style={{ fontSize: 11, color: '#f87171' }}>Previous slot will be restored. No manual intervention needed.</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Slot diagram ──────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">A / B image slots — atomic swap</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#555' }}>
            write to standby → swap pointer → rollback in ms if needed
          </span>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
            <SlotCard slot="A" version={slotAVersion ?? null}
              isActive={slotAActive} isReceiving={slotAReceiving}
              progress={state.progress} color={activeColor} />

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <div style={{
                fontSize: 28, color: busy ? '#f59e0b' : '#333',
                animation: busy ? 'pulse 1s infinite' : 'none',
              }}>⇄</div>
              <div style={{ fontSize: 9, color: '#444', textAlign: 'center', width: 50 }}>
                {busy ? 'swap in\nprogress' : 'atomic\nswap'}
              </div>
            </div>

            <SlotCard slot="B" version={slotBVersion ?? null}
              isActive={slotBActive} isReceiving={slotBReceiving}
              progress={state.progress} color={activeColor} />
          </div>

          {/* /var persistence bar */}
          <div style={{ marginTop: 14, padding: '12px 16px', borderRadius: 8, background: '#0f1f3a', border: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 22 }}>💾</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#93c5fd' }}>/var — read-write partition</div>
              <div style={{ fontSize: 11, color: '#475569' }}>Survives every OS update and every rollback. Trip logs, configs, telemetry — never lost.</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#93c5fd' }}>{state.var_log_count}</div>
              <div style={{ fontSize: 10, color: '#475569' }}>log entries</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Action row ────────────────────────────────────────────────── */}
      {state.running && !busy && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-primary" onClick={() => send('/scenario3/update')}>
            🚀 Push OTA update → v{state.active_version === '1.0.0' ? '2.0.0' : '1.0.0'}
          </button>
          <button
            className={state.fault_staged ? 'btn-ghost' : 'btn-danger'}
            disabled={state.fault_staged}
            onClick={() => send('/scenario3/fault')}
          >
            {state.fault_staged ? '💣 Fault staged — push update to trigger rollback' : '💣 Inject fault → force rollback demo'}
          </button>
        </div>
      )}

      {state.fault_staged && !busy && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: '#450a0a', border: '1px solid #ef4444', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 20 }}>💣</span>
          <div>
            <div style={{ fontWeight: 700, color: '#fca5a5', fontSize: 13 }}>Fault staged in next image</div>
            <div style={{ fontSize: 11, color: '#f87171' }}>Now push the OTA update — Greenboot will detect it and roll back automatically.</div>
          </div>
        </div>
      )}

      {/* ── Log ───────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header"><span className="card-title">System log (/var/log)</span></div>
        <div className="card-body">
          <div className="log-box">
            {state.log.length === 0
              ? <p style={{ color: '#444' }}>Start the scenario to see log entries…</p>
              : state.log.map((e, i) => (
                <p key={i} style={{
                  color: e.includes('FAILED') || e.includes('rollback') || e.includes('Rollback') ? '#fca5a5'
                    : e.includes('PASSED') || e.includes('active') ? '#86efac'
                    : e.includes('REBOOT') ? '#93c5fd'
                    : undefined,
                }}>{e}</p>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}
