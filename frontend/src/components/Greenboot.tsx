import { useEffect, useState } from 'react'
import type { WsMessage } from '../App'

interface Props { lastMsg: WsMessage | null; send: (path: string, method?: string) => void }

interface CheckResult { pass: boolean | null; value: string | null; threshold: string }
interface S6State {
  running: boolean; service_status: string
  checks: Record<string, CheckResult>
  consecutive_failures: number; total_polls: number
  rollback_count: number; fault_active: boolean; log: string[]
}

const CHECK_LABELS: Record<string, { label: string; icon: string; desc: string }> = {
  latency:    { label: 'Latency gate',    icon: '⏱', desc: 'Response time within safety deadline' },
  memory:     { label: 'Memory gate',     icon: '🧠', desc: 'RAM usage below warning threshold' },
  dependency: { label: 'Dependency gate', icon: '🔌', desc: 'Gateway service reachable' },
  error_rate: { label: 'Error rate gate', icon: '📊', desc: 'Fewer than 3 errors in last 10 polls' },
}

function CheckRow({ id, result }: { id: string; result: CheckResult }) {
  const meta = CHECK_LABELS[id]
  const { pass, value, threshold } = result
  const color = pass === null ? '#4b5563' : pass ? '#22c55e' : '#ef4444'
  const bg    = pass === null ? 'var(--surface2)' : pass ? '#052e16' : '#450a0a'
  const icon  = pass === null ? '○' : pass ? '✓' : '✗'

  return (
    <div style={{
      padding: '12px 16px', borderRadius: 8,
      background: bg, border: `1px solid ${color}`,
      display: 'flex', alignItems: 'center', gap: 12,
      transition: 'all 0.4s'
    }}>
      <span style={{ fontSize: 20 }}>{meta.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{meta.label}</div>
        <div style={{ fontSize: 11, color: 'var(--text2)' }}>{meta.desc}</div>
        <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>threshold: {threshold}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color }}>{value ?? '—'}</div>
        <div style={{ fontSize: 16, color }}>{icon}</div>
      </div>
    </div>
  )
}

function StatusBadge({ status, failures }: { status: string; failures: number }) {
  const configs: Record<string, { color: string; bg: string; label: string; icon: string }> = {
    unknown:  { color: '#9ca3af', bg: '#1f2937', label: 'Evaluating...', icon: '○' },
    healthy:  { color: '#22c55e', bg: '#052e16', label: 'HEALTHY',       icon: '✓' },
    degraded: { color: '#f59e0b', bg: '#422006', label: 'DEGRADED',      icon: '⚠' },
    rollback: { color: '#ef4444', bg: '#450a0a', label: 'ROLLBACK',      icon: '↩' },
  }
  const c = configs[status] ?? configs.unknown
  return (
    <div style={{
      padding: '20px 28px', borderRadius: 12,
      background: c.bg, border: `2px solid ${c.color}`,
      display: 'flex', alignItems: 'center', gap: 16,
      transition: 'all 0.4s'
    }}>
      <div style={{ fontSize: 40 }}>{c.icon}</div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.label}</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
          {status === 'degraded' && failures > 0
            ? `${failures} consecutive failure${failures > 1 ? 's' : ''} — rollback in ${3 - failures} more`
            : status === 'healthy' ? 'All 4 health gates passing'
            : status === 'rollback' ? 'Reverting to last known good state...'
            : 'Waiting for first evaluation cycle'}
        </div>
      </div>
    </div>
  )
}

export default function Greenboot({ lastMsg, send }: Props) {
  const [state, setState] = useState<S6State>({
    running: false, service_status: 'unknown',
    checks: {
      latency:    { pass: null, value: null, threshold: '≤ 10ms' },
      memory:     { pass: null, value: null, threshold: '≤ 80%' },
      dependency: { pass: null, value: null, threshold: 'gateway reachable' },
      error_rate: { pass: null, value: null, threshold: '< 3 errors/10 polls' },
    },
    consecutive_failures: 0, total_polls: 0, rollback_count: 0,
    fault_active: false, log: [],
  })

  useEffect(() => {
    if (!lastMsg) return
    const t = lastMsg.type
    if (['scenario6_started','scenario6_tick','scenario6_rollback',
         'scenario6_fault','scenario6_fault_cleared'].includes(t))
      setState(lastMsg.state as S6State)
    if (t === 'scenario6_stopped') setState(s => ({ ...s, running: false }))
    if (t === 'init' && lastMsg.scenario6) setState(lastMsg.scenario6 as S6State)
  }, [lastMsg])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Greenboot Health Gate</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text)' }}>greenboot</strong> is RHIVOS's multi-condition health checking framework.
          Every 3 seconds, four independent gates are evaluated. All four must pass for the service to be <em>healthy</em>.
          Three consecutive failures triggers an <strong style={{ color: 'var(--text)' }}>automatic rollback</strong> — the same
          mechanism that gates OTA updates in production.
        </p>
      </div>

      {state.running && <StatusBadge status={state.service_status} failures={state.consecutive_failures} />}

      {state.fault_active && (
        <div style={{ padding: '10px 16px', borderRadius: 8, background: '#450a0a', border: '1px solid #ef4444', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 18 }}>⚡</span>
          <div>
            <div style={{ fontWeight: 700, color: '#fca5a5', fontSize: 13 }}>Fault active — latency spike injected</div>
            <div style={{ fontSize: 12, color: '#f87171' }}>Latency gate will fail · error rate increasing · rollback in ~3 cycles</div>
          </div>
        </div>
      )}

      {state.rollback_count > 0 && (
        <div style={{ padding: '10px 16px', borderRadius: 8, background: '#0f172a', border: '1px solid #3b82f6', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 18 }}>↩</span>
          <div>
            <div style={{ fontWeight: 700, color: '#93c5fd', fontSize: 13 }}>Rollback triggered {state.rollback_count}×</div>
            <div style={{ fontSize: 12, color: '#60a5fa' }}>System reverted to last known good state automatically</div>
          </div>
        </div>
      )}

      {/* stats */}
      <div style={{ display: 'flex', gap: 10 }}>
        {[
          { label: 'Health polls', value: String(state.total_polls) },
          { label: 'Rollbacks',    value: String(state.rollback_count), color: state.rollback_count > 0 ? '#93c5fd' : undefined },
          { label: 'Failures (streak)', value: `${state.consecutive_failures}/3` },
        ].map(s => (
          <div key={s.label} className="stat" style={{ flex: 1 }}>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* check gates */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Object.entries(state.checks).map(([id, result]) => (
          <CheckRow key={id} id={id} result={result} />
        ))}
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">greenboot journal</span></div>
        <div className="card-body">
          <div className="log-box">
            {state.log.length === 0
              ? <p>Start the scenario to see health evaluation log...</p>
              : state.log.map((e, i) => (
                <p key={i} style={{
                  color: e.includes('ROLLBACK') ? '#93c5fd'
                    : e.includes('DEGRADED') || e.includes('✗') ? '#fca5a5'
                    : e.includes('HEALTHY') || e.includes('✓') ? '#86efac'
                    : e.includes('fault') ? '#fde68a'
                    : undefined
                }}>{e}</p>
              ))}
          </div>
        </div>
      </div>

      <div className="action-row">
        {!state.running
          ? <button className="btn-primary" onClick={() => send('/scenario6/start')}>▶ Start scenario</button>
          : <button className="btn-ghost"   onClick={() => send('/scenario6/stop')}>■ Stop scenario</button>}
        {state.running && !state.fault_active && (
          <button className="btn-danger" onClick={() => send('/scenario6/fault')}>
            ⚡ Inject fault (trigger rollback)
          </button>
        )}
        {state.running && state.fault_active && (
          <button className="btn-ghost" onClick={() => send('/scenario6/clear_fault')}>Clear fault</button>
        )}
      </div>
    </div>
  )
}
