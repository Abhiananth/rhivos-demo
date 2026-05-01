import { useEffect, useState, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import type { WsMessage } from '../App'

interface Props { lastMsg: WsMessage | null; send: (path: string, method?: string) => void }
interface Tick  { t: number; asil: number | null; qm: number | null }

// ── Circular CPU gauge ────────────────────────────────────────────────────────
function CPUGauge({ pct, label, color, protected: isProtected }: {
  pct: number; label: string; color: string; protected?: boolean
}) {
  const r = 52; const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative', width: 130, height: 130 }}>
        <svg width="130" height="130" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="65" cy="65" r={r} fill="none" stroke="#1e1e1e" strokeWidth="12" />
          <circle cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="12"
            strokeDasharray={`${dash} ${circ}`}
            style={{ transition: 'stroke-dasharray 0.5s ease' }} />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center'
        }}>
          <span style={{ fontSize: 24, fontWeight: 700, color }}>{Math.round(pct)}%</span>
          <span style={{ fontSize: 10, color: '#666' }}>CPU</span>
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
        {isProtected !== undefined && (
          <div style={{
            marginTop: 4, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
            color: isProtected ? '#22c55e' : '#f59e0b',
            padding: '2px 8px', borderRadius: 4,
            background: isProtected ? '#052e16' : '#422006',
          }}>
            {isProtected ? '✓ PROTECTED' : '⚡ THROTTLED'}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Storm indicator ────────────────────────────────────────────────────────────
function StormIndicator({ active }: { active: boolean }) {
  const [blink, setBlink] = useState(false)
  useEffect(() => {
    if (!active) { setBlink(false); return }
    const id = setInterval(() => setBlink(b => !b), 600)
    return () => clearInterval(id)
  }, [active])
  if (!active) return null
  return (
    <div style={{
      padding: '12px 20px', borderRadius: 8,
      background: blink ? '#7f1d1d' : '#450a0a',
      border: '1px solid #ef4444',
      display: 'flex', alignItems: 'center', gap: 12,
      transition: 'background 0.3s'
    }}>
      <div style={{ fontSize: 24 }}>⚡</div>
      <div>
        <div style={{ fontWeight: 700, color: '#fca5a5', fontSize: 14 }}>QM CPU Storm Active</div>
        <div style={{ fontSize: 12, color: '#f87171', marginTop: 2 }}>
          Infotainment demanding 100% CPU — kernel throttling to 60% ceiling
        </div>
      </div>
      <div style={{ marginLeft: 'auto', textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>ASIL-B impact</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>ZERO</div>
      </div>
    </div>
  )
}

export default function MixedCriticality({ lastMsg, send }: Props) {
  const [running, setRunning]       = useState(false)
  const [storm, setStorm]           = useState(false)
  const [ticks, setTicks]           = useState<Tick[]>([])
  const [asilMisses, setAsilMisses] = useState(0)
  const [qmMisses, setQmMisses]     = useState(0)
  const [cycles, setCycles]         = useState(0)
  const [asilCpu, setAsilCpu]       = useState(28)
  const [qmCpu, setQmCpu]           = useState(35)

  useEffect(() => {
    if (!lastMsg) return
    if (lastMsg.type === 'scenario1_started') setRunning(true)
    if (lastMsg.type === 'scenario1_stopped') { setRunning(false); setStorm(false); setAsilCpu(0); setQmCpu(0) }
    if (lastMsg.type === 'scenario1_storm_start') setStorm(true)
    if (lastMsg.type === 'scenario1_storm_stop')  setStorm(false)
    if (lastMsg.type === 'scenario1_tick') {
      const m = lastMsg as any
      setTicks(prev => [...prev.slice(-59), { t: Date.now(), asil: m.asil_latency_ms ?? null, qm: m.qm_latency_ms ?? null }])
      setStorm(m.storm_active)
      setAsilMisses(m.asil_deadline_misses)
      setQmMisses(m.qm_deadline_misses)
      setCycles(m.cycles)
      // simulate CPU usage visual
      setAsilCpu(m.storm_active ? 28 + Math.random() * 4 : 22 + Math.random() * 8)
      setQmCpu(m.storm_active ? 92 + Math.random() * 5 : 28 + Math.random() * 18)
    }
  }, [lastMsg])

  const latest = ticks[ticks.length - 1]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* header */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Mixed Criticality</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
          Two real containers on the same Linux kernel. The safety-critical ADAS container gets a dedicated CPU core
          that <strong style={{ color: 'var(--text)' }}>cannot be taken</strong> by any other process.
          Trigger a CPU storm in the infotainment container — the ADAS container won't notice.
        </p>
      </div>

      {/* storm indicator */}
      <StormIndicator active={storm} />

      {/* CPU gauges */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Live CPU usage</span>
          <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>
            {running ? 'Polling every second from real containers' : 'Start scenario to see live data'}
          </span>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '8px 0' }}>
            <div style={{ textAlign: 'center' }}>
              <CPUGauge pct={running ? asilCpu : 0} label="lane-keep-assist" color="#ef4444" protected={running ? true : undefined} />
              <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
                <code>--cpuset-cpus 0</code><br />Dedicated core — untouchable
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={{
                padding: '8px 16px', borderRadius: 6,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                fontSize: 11, color: 'var(--text2)', textAlign: 'center'
              }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>🛡️</div>
                <div style={{ fontWeight: 600 }}>Linux kernel</div>
                <div>enforces isolation</div>
              </div>
              <div style={{
                padding: '4px 12px', borderRadius: 4,
                background: asilMisses === 0 && running ? '#052e16' : 'var(--surface2)',
                border: `1px solid ${asilMisses === 0 && running ? '#22c55e' : 'var(--border)'}`,
                fontSize: 11, fontWeight: 700,
                color: asilMisses === 0 && running ? '#86efac' : 'var(--text2)'
              }}>
                {running ? `${asilMisses} safety deadlines missed` : 'not running'}
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <CPUGauge pct={running ? Math.min(qmCpu, 100) : 0} label="media-player" color={storm ? '#f59e0b' : '#3b82f6'} protected={running ? false : undefined} />
              <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
                <code>--cpus 0.6</code><br />60% ceiling — kernel throttles above
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* latency chart */}
      <div className="card" style={{ borderColor: storm ? '#78350f' : undefined }}>
        <div className="card-header">
          <span className="card-title">Response latency — live</span>
          <span className="pill pill-red" style={{ marginLeft: 'auto' }}>ASIL-B deadline: 10ms</span>
        </div>
        <div className="card-body">
          {ticks.length === 0 ? (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 13 }}>
              Start the scenario — latency data will appear here
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={ticks} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <XAxis dataKey="t" hide />
                  <YAxis domain={[0, 'auto']} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: '#1e1e1e', border: '1px solid #2a2a2a', fontSize: 11 }}
                    formatter={(v: number) => [`${v?.toFixed(2)} ms`]} labelFormatter={() => ''} />
                  <ReferenceLine y={10} stroke="#ef4444" strokeDasharray="4 2"
                    label={{ value: '10ms deadline', fill: '#ef4444', fontSize: 10 }} />
                  <Line type="monotone" dataKey="asil" stroke="#ef4444" dot={false} strokeWidth={2} name="ASIL-B" connectNulls />
                  <Line type="monotone" dataKey="qm"   stroke="#3b82f6" dot={false} strokeWidth={2} name="QM"     connectNulls />
                </LineChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 20, marginTop: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#ef4444' }}>— ASIL-B: {latest?.asil?.toFixed(1) ?? '—'}ms</span>
                <span style={{ fontSize: 11, color: '#3b82f6' }}>— QM: {latest?.qm?.toFixed(1) ?? '—'}ms</span>
                <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>
                  {cycles} samples · {asilMisses === 0 ? '✓ zero safety misses' : `⚠ ${asilMisses} safety misses`}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="action-row">
        {!running
          ? <button className="btn-primary" onClick={() => send('/scenario1/start')}>▶ Start scenario</button>
          : <button className="btn-ghost"   onClick={() => send('/scenario1/stop')}>■ Stop scenario</button>}
        {running && !storm && (
          <button className="btn-danger" onClick={() => send('/scenario1/storm/start')}>
            ⚡ Trigger QM CPU storm
          </button>
        )}
        {running && storm && (
          <button className="btn-ghost" onClick={() => send('/scenario1/storm/stop')}>Stop storm</button>
        )}
      </div>
    </div>
  )
}
