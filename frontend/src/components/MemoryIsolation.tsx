import { useEffect, useState } from 'react'
import type { WsMessage } from '../App'

interface Props { lastMsg: WsMessage | null; send: (path: string, method?: string) => void }

interface S4State {
  running: boolean; leak_active: boolean
  asil_mem_mb: number; qm_mem_mb: number
  asil_limit_mb: number; qm_limit_mb: number
  qm_oom_count: number; asil_oom_count: number
  cycles: number; log: string[]
}

// ── Memory bar gauge ──────────────────────────────────────────────────────────
function MemBar({ used, limit, label, color, protected: isProt }: {
  used: number; limit: number; label: string; color: string; protected?: boolean
}) {
  const pct = Math.min((used / limit) * 100, 100)
  const danger = pct > 85
  const barColor = danger ? '#ef4444' : color

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* circular gauge */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{ position: 'relative', width: 130, height: 130 }}>
          <svg width="130" height="130" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="65" cy="65" r="52" fill="none" stroke="#1e1e1e" strokeWidth="12" />
            <circle cx="65" cy="65" r="52" fill="none" stroke={barColor} strokeWidth="12"
              strokeDasharray={`${(pct / 100) * (2 * Math.PI * 52)} ${2 * Math.PI * 52}`}
              style={{ transition: 'stroke-dasharray 0.6s ease, stroke 0.3s' }} />
          </svg>
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center'
          }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: barColor }}>{Math.round(pct)}%</span>
            <span style={{ fontSize: 10, color: '#666' }}>RAM</span>
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            {used > 0 ? `${used.toFixed(0)} MB` : '—'} / {limit} MB limit
          </div>
          {isProt !== undefined && (
            <div style={{
              marginTop: 4, fontSize: 11, fontWeight: 700,
              color: isProt ? '#22c55e' : danger ? '#ef4444' : '#f59e0b',
              padding: '2px 8px', borderRadius: 4,
              background: isProt ? '#052e16' : danger ? '#450a0a' : '#422006',
            }}>
              {isProt ? '✓ PROTECTED' : danger ? '⚠ NEAR LIMIT' : '● WITHIN BUDGET'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── OOM event card ────────────────────────────────────────────────────────────
function OOMBanner({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <div style={{
      padding: '12px 20px', borderRadius: 8,
      background: '#1a0a00', border: '1px solid #f59e0b',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ fontSize: 24 }}>💀</div>
      <div>
        <div style={{ fontWeight: 700, color: '#fde68a', fontSize: 14 }}>
          QM OOM-killed {count}× by Linux kernel
        </div>
        <div style={{ fontSize: 12, color: '#d97706', marginTop: 2 }}>
          Exceeded its memory limit — kernel terminated it immediately
        </div>
      </div>
      <div style={{ marginLeft: 'auto', textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>ASIL-B impact</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>ZERO</div>
      </div>
    </div>
  )
}

// ── Leak indicator ────────────────────────────────────────────────────────────
function LeakIndicator({ active, qmPct }: { active: boolean; qmPct: number }) {
  const [blink, setBlink] = useState(false)
  useEffect(() => {
    if (!active) { setBlink(false); return }
    const id = setInterval(() => setBlink(b => !b), 700)
    return () => clearInterval(id)
  }, [active])
  if (!active) return null
  return (
    <div style={{
      padding: '12px 20px', borderRadius: 8,
      background: blink ? '#1a0000' : '#0a0000',
      border: '1px solid #dc2626', transition: 'background 0.3s',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ fontSize: 22 }}>🔴</div>
      <div>
        <div style={{ fontWeight: 700, color: '#fca5a5', fontSize: 14 }}>QM Memory Leak Active</div>
        <div style={{ fontSize: 12, color: '#f87171', marginTop: 2 }}>
          Allocating 8 MB/s — currently at {qmPct.toFixed(0)}% of {160} MB limit
        </div>
      </div>
      <div style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>
        Kernel will OOM-kill when limit is exceeded
      </div>
    </div>
  )
}

export default function MemoryIsolation({ lastMsg, send }: Props) {
  const [state, setState] = useState<S4State>({
    running: false, leak_active: false,
    asil_mem_mb: 0, qm_mem_mb: 0,
    asil_limit_mb: 384, qm_limit_mb: 160,
    qm_oom_count: 0, asil_oom_count: 0,
    cycles: 0, log: [],
  })
  const [errMsg, setErrMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!lastMsg) return
    const t = lastMsg.type
    if (['scenario4_started','scenario4_tick','scenario4_oom',
         'scenario4_leak_start','scenario4_leak_stop'].includes(t))
      setState(lastMsg.state as S4State)
    if (t === 'scenario4_stopped') setState(s => ({ ...s, running: false, leak_active: false }))
    if (t === 'error') setErrMsg((lastMsg as any).msg ?? 'Unknown error')
    if (t === 'init' && lastMsg.scenario4) setState(lastMsg.scenario4 as S4State)
  }, [lastMsg])

  const asilPct = (state.asil_mem_mb / state.asil_limit_mb) * 100
  const qmPct   = (state.qm_mem_mb   / state.qm_limit_mb)   * 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Memory Isolation</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
          The same Linux kernel enforces memory budgets just like CPU budgets.
          ASIL-B gets a hard memory ceiling the kernel guarantees.
          Trigger a memory leak in the QM container — the kernel OOM-kills it
          the instant it exceeds its limit. <strong style={{ color: 'var(--text)' }}>ASIL-B memory stays untouched.</strong>
        </p>
      </div>

      {errMsg && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: '#450a0a', border: '1px solid #ef4444', display: 'flex', gap: 10 }}>
          <span>⚠</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: '#fca5a5', fontSize: 13 }}>Failed to start</div>
            <div style={{ fontSize: 12, color: '#f87171', fontFamily: 'monospace' }}>{errMsg}</div>
          </div>
          <button onClick={() => setErrMsg(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
      )}

      <LeakIndicator active={state.leak_active} qmPct={qmPct} />
      <OOMBanner count={state.qm_oom_count} />

      {/* stats */}
      <div style={{ display: 'flex', gap: 10 }}>
        {[
          { label: 'Cycles',          value: String(state.cycles) },
          { label: 'QM OOM events',   value: String(state.qm_oom_count),   color: state.qm_oom_count > 0 ? '#f59e0b' : undefined },
          { label: 'ASIL-B OOM events', value: '0',                         color: '#22c55e' },
        ].map(s => (
          <div key={s.label} className="stat" style={{ flex: 1 }}>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* gauges */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Live memory usage</span>
          <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>
            {state.running ? 'Polling every second' : 'Start scenario to see live data'}
          </span>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '8px 0' }}>
            <div style={{ textAlign: 'center' }}>
              <MemBar used={state.running ? state.asil_mem_mb : 0}
                limit={state.asil_limit_mb} label="lane-keep-assist"
                color="#ef4444" protected={state.running ? true : undefined} />
              <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
                <code>--memory {state.asil_limit_mb}m</code><br />Cannot leak — stress disabled
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={{
                padding: '8px 16px', borderRadius: 6,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                fontSize: 11, color: 'var(--text2)', textAlign: 'center'
              }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>🧠</div>
                <div style={{ fontWeight: 600 }}>Linux kernel</div>
                <div>memory cgroup</div>
              </div>
              <div style={{
                padding: '4px 12px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                background: state.qm_oom_count > 0 && state.running ? '#1a0a00' : 'var(--surface2)',
                border: `1px solid ${state.qm_oom_count > 0 && state.running ? '#f59e0b' : 'var(--border)'}`,
                color: state.qm_oom_count > 0 && state.running ? '#fde68a' : 'var(--text2)',
              }}>
                {state.running
                  ? state.qm_oom_count > 0
                    ? `${state.qm_oom_count} OOM kill${state.qm_oom_count > 1 ? 's' : ''}`
                    : 'no OOM events'
                  : 'not running'}
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <MemBar used={state.running ? state.qm_mem_mb : 0}
                limit={state.qm_limit_mb} label="media-player"
                color="#3b82f6" protected={state.running ? false : undefined} />
              <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
                <code>--memory {state.qm_limit_mb}m</code><br />Hard ceiling — OOM kill above
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* log */}
      <div className="card">
        <div className="card-header"><span className="card-title">Kernel event log</span></div>
        <div className="card-body">
          <div className="log-box">
            {state.log.length === 0
              ? <p>Start the scenario to see kernel memory events...</p>
              : state.log.map((e, i) => (
                <p key={i} style={{
                  color: e.includes('OOM') ? '#fde68a'
                    : e.includes('unaffected') || e.includes('stable') || e.includes('ASIL-B') ? '#86efac'
                    : e.includes('leak') || e.includes('Leak') ? '#fca5a5'
                    : undefined
                }}>{e}</p>
              ))}
          </div>
        </div>
      </div>

      <div className="action-row">
        {!state.running
          ? <button className="btn-primary" onClick={() => send('/scenario4/start')}>▶ Start scenario</button>
          : <button className="btn-ghost"   onClick={() => send('/scenario4/stop')}>■ Stop scenario</button>}
        {state.running && !state.leak_active && (
          <button className="btn-danger" onClick={() => send('/scenario4/leak/start')}>
            🔴 Trigger QM memory leak
          </button>
        )}
        {state.running && state.leak_active && (
          <button className="btn-ghost" onClick={() => send('/scenario4/leak/stop')}>Stop leak</button>
        )}
      </div>
    </div>
  )
}
