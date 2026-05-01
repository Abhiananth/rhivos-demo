import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import type { WsMessage } from '../App'

interface Props { lastMsg: WsMessage | null; send: (path: string, method?: string) => void }

interface S7State {
  running: boolean
  stress_active: boolean
  safe_status: string
  normal_status: string
  safe_latencies: number[]
  normal_latencies: number[]
  safe_jitter: number
  normal_jitter: number
  safe_hist: number[]   // [<1ms, 1-2ms, 2-5ms, 5-10ms, >10ms] percentages
  normal_hist: number[]
  log: string[]
  error: string | null
}

const INIT: S7State = {
  running: false, stress_active: false,
  safe_status: 'stopped', normal_status: 'stopped',
  safe_latencies: [], normal_latencies: [],
  safe_jitter: 0, normal_jitter: 0,
  safe_hist: [0, 0, 0, 0, 0], normal_hist: [0, 0, 0, 0, 0],
  log: [], error: null,
}

const BUCKET_LABELS = ['<1ms', '1-2ms', '2-5ms', '5-10ms', '>10ms']

function statusColor(s: string) {
  if (s === 'healthy') return '#10b981'
  if (s === 'stopped') return '#444'
  return '#ef4444'
}

function JitterGauge({ value, max = 30, label, color }: { value: number; max?: number; label: string; color: string }) {
  const pct = Math.min(value / max, 1)
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={90} height={90} viewBox="0 0 90 90">
        <circle cx={45} cy={45} r={38} fill="none" stroke="#1a1a1a" strokeWidth={8} />
        <circle
          cx={45} cy={45} r={38} fill="none"
          stroke={pct > 0.7 ? '#ef4444' : pct > 0.4 ? '#f59e0b' : color}
          strokeWidth={8}
          strokeDasharray={`${pct * 239} 239`}
          strokeLinecap="round"
          transform="rotate(-90 45 45)"
          style={{ transition: 'stroke-dasharray 0.4s' }}
        />
        <text x={45} y={44} textAnchor="middle" fill="white" fontSize={16} fontWeight={700}>{value}</text>
        <text x={45} y={58} textAnchor="middle" fill="#666" fontSize={9}>ms jitter</text>
      </svg>
      <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{label}</div>
    </div>
  )
}

export default function TemporalIsolation({ lastMsg, send }: Props) {
  const [st, setSt] = useState<S7State>(INIT)

  useEffect(() => {
    if (!lastMsg) return
    if (lastMsg.type === 'init' && lastMsg.scenario7) setSt(lastMsg.scenario7 as S7State)
    if (lastMsg.type === 's7_state') setSt(lastMsg as unknown as S7State)
  }, [lastMsg])

  const histData = BUCKET_LABELS.map((label, i) => ({
    label,
    protected: st.safe_hist[i] ?? 0,
    unprotected: st.normal_hist[i] ?? 0,
  }))

  const timeData = st.safe_latencies.map((v, i) => ({
    i,
    protected: v,
    unprotected: st.normal_latencies[i] ?? null,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#ee0000', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Scenario 7 — Temporal Isolation / PREEMPT_RT
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>CPU bandwidth reservation eliminates latency jitter</div>
          <div style={{ fontSize: 12, color: '#666' }}>
            Protected task (--cpus 0.4) maintains consistent sub-2ms response even under CPU storm
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!st.running
            ? <button className="btn-primary" onClick={() => send('/scenario7/start')}>Start Scenario</button>
            : <button className="btn-ghost" onClick={() => send('/scenario7/stop')}>Stop</button>
          }
        </div>
      </div>

      {st.error && (
        <div style={{ background: '#1f0d0d', border: '1px solid #7f1d1d', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#fca5a5' }}>
          ⚠ {st.error}
        </div>
      )}

      {/* Storm toggle + jitter gauges */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 16, alignItems: 'center' }}>
        <div style={{
          background: '#111', border: '1px solid #222', borderRadius: 10, padding: '20px 24px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 11, color: '#888', textAlign: 'center' }}>CPU Storm</div>
          {st.stress_active
            ? <div style={{ fontSize: 28, animation: 'pulse 0.6s infinite' }}>⚡</div>
            : <div style={{ fontSize: 28, opacity: 0.3 }}>⚡</div>
          }
          <div style={{ fontSize: 11, fontWeight: 700, color: st.stress_active ? '#ef4444' : '#555' }}>
            {st.stress_active ? 'ACTIVE' : 'IDLE'}
          </div>
          {st.running && (
            st.stress_active
              ? <button className="btn-ghost" onClick={() => send('/scenario7/storm/stop')}>Stop storm</button>
              : <button className="btn-danger" onClick={() => send('/scenario7/storm/start')}>Start storm</button>
          )}
        </div>

        <div style={{ background: '#111', border: '1px solid #1a3a1a', borderRadius: 10, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <JitterGauge value={st.safe_jitter} label="Protected task" color="#10b981" />
          <div style={{ fontSize: 11, fontWeight: 600, color: '#10b981' }}>--cpus 0.4 reserved</div>
          <div style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${statusColor(st.safe_status)}22`, color: statusColor(st.safe_status), fontWeight: 700 }}>
            {st.safe_status.toUpperCase()}
          </div>
        </div>

        <div style={{ background: '#111', border: `1px solid ${st.stress_active ? '#5c1a1a' : '#1a1a1a'}`, borderRadius: 10, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, transition: 'border-color 0.3s' }}>
          <JitterGauge value={st.normal_jitter} max={30} label="Unprotected task" color={st.stress_active ? '#ef4444' : '#f59e0b'} />
          <div style={{ fontSize: 11, fontWeight: 600, color: st.stress_active ? '#ef4444' : '#f59e0b' }}>no CPU limit</div>
          <div style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${statusColor(st.normal_status)}22`, color: statusColor(st.normal_status), fontWeight: 700 }}>
            {st.normal_status.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Histogram */}
        <div className="card">
          <div className="card-header"><span className="card-title">Latency distribution (last 50 samples)</span></div>
          <div className="card-body">
            <div style={{ fontSize: 10, color: '#555', marginBottom: 8 }}>
              Tight = deterministic. Wide = unpredictable.
            </div>
            <div style={{ height: 180 }}>
              <ResponsiveContainer>
                <BarChart data={histData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#666' }} />
                  <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 10, fill: '#555' }} />
                  <Tooltip
                    formatter={(v: number, name: string) => [`${v}%`, name]}
                    contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 11 }}
                  />
                  <Bar dataKey="protected" name="Protected" fill="#10b981" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="unprotected" name="Unprotected" fill={st.stress_active ? '#ef4444' : '#f59e0b'} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Time series */}
        <div className="card">
          <div className="card-header"><span className="card-title">Latency over time (ms)</span></div>
          <div className="card-body">
            <div style={{ fontSize: 10, color: '#555', marginBottom: 8 }}>
              Green line should stay flat. Orange widens under load.
            </div>
            <div style={{ height: 180 }}>
              <ResponsiveContainer>
                <LineChart data={timeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                  <XAxis dataKey="i" hide />
                  <YAxis domain={[0, 80]} tick={{ fontSize: 10, fill: '#555' }} />
                  <Tooltip
                    formatter={(v: number, name: string) => [`${v} ms`, name]}
                    contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 11 }}
                  />
                  <Line type="monotone" dataKey="protected" name="Protected" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                  <Line type="monotone" dataKey="unprotected" name="Unprotected" stroke={st.stress_active ? '#ef4444' : '#f59e0b'} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Key insight */}
      {st.stress_active && st.safe_jitter < st.normal_jitter * 0.6 && (
        <div style={{
          background: '#052e16', border: '1px solid #166534', borderRadius: 8,
          padding: '12px 16px', fontSize: 12, color: '#4ade80', fontWeight: 600,
        }}>
          ✅ Protected jitter ({st.safe_jitter}ms) vs unprotected ({st.normal_jitter}ms) under CPU storm —
          this is the Linux PREEMPT_RT + cgroups guarantee in action
        </div>
      )}

      {/* Log */}
      {st.log.length > 0 && (
        <div className="card">
          <div className="card-header"><span className="card-title">System log</span></div>
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
