import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import type { WsMessage } from '../App'

interface Props { lastMsg: WsMessage | null; send: (path: string, method?: string) => void }
interface Tick  { t: number; asil: number | null; qm: number | null }

export default function MixedCriticality({ lastMsg, send }: Props) {
  const [running, setRunning]       = useState(false)
  const [storm, setStorm]           = useState(false)
  const [ticks, setTicks]           = useState<Tick[]>([])
  const [asilMisses, setAsilMisses] = useState(0)
  const [qmMisses, setQmMisses]     = useState(0)
  const [cycles, setCycles]         = useState(0)

  useEffect(() => {
    if (!lastMsg) return
    if (lastMsg.type === 'scenario1_started') setRunning(true)
    if (lastMsg.type === 'scenario1_stopped') { setRunning(false); setStorm(false) }
    if (lastMsg.type === 'scenario1_storm_start') setStorm(true)
    if (lastMsg.type === 'scenario1_storm_stop')  setStorm(false)
    if (lastMsg.type === 'scenario1_tick') {
      const m = lastMsg as any
      setTicks(prev => [...prev.slice(-59), { t: Date.now(), asil: m.asil_latency_ms ?? null, qm: m.qm_latency_ms ?? null }])
      setStorm(m.storm_active)
      setAsilMisses(m.asil_deadline_misses)
      setQmMisses(m.qm_deadline_misses)
      setCycles(m.cycles)
    }
  }, [lastMsg])

  const latest = ticks[ticks.length - 1]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Mixed Criticality</h2>
        <p style={{ fontSize: 12, color: 'var(--text2)' }}>
          Two real Podman containers. ASIL-B on dedicated CPU core 0 (cpuset). QM with 60% CPU ceiling (--cpus 0.6).
          Trigger a CPU storm inside QM — watch ASIL-B latency stay flat. That's Freedom from Interference.
        </p>
      </div>

      {storm && <div className="alert alert-warning">QM CPU storm active — watch ASIL-B latency below. It should not move.</div>}

      <div className="stat-row">
        <div className="stat"><div className="stat-value">{cycles}</div><div className="stat-label">Cycles</div></div>
        <div className="stat">
          <div className="stat-value" style={{ color: asilMisses === 0 ? 'var(--green)' : 'var(--red)' }}>{asilMisses}</div>
          <div className="stat-label">ASIL-B deadline misses</div>
        </div>
        <div className="stat">
          <div className="stat-value" style={{ color: qmMisses > 0 ? 'var(--yellow)' : 'var(--green)' }}>{qmMisses}</div>
          <div className="stat-label">QM deadline misses</div>
        </div>
        <div className="stat"><div className="stat-value">{latest?.asil?.toFixed(2) ?? '—'} ms</div><div className="stat-label">ASIL-B latency</div></div>
        <div className="stat"><div className="stat-value">{latest?.qm?.toFixed(2) ?? '—'} ms</div><div className="stat-label">QM latency</div></div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Response latency — live (1 Hz polling)</span>
          <span className="pill pill-red" style={{ marginLeft: 'auto' }}>ASIL-B deadline: 10ms</span>
        </div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={ticks} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <XAxis dataKey="t" hide />
              <YAxis domain={[0, 'auto']} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#1e1e1e', border: '1px solid #2a2a2a', fontSize: 11 }}
                formatter={(v: number) => [`${v?.toFixed(2)} ms`]} labelFormatter={() => ''} />
              <ReferenceLine y={10} stroke="#ef4444" strokeDasharray="4 2"
                label={{ value: '10ms', fill: '#ef4444', fontSize: 10 }} />
              <Line type="monotone" dataKey="asil" stroke="#ef4444" dot={false} strokeWidth={2} name="ASIL-B" connectNulls />
              <Line type="monotone" dataKey="qm"   stroke="#3b82f6" dot={false} strokeWidth={2} name="QM"     connectNulls />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <span style={{ fontSize: 11, color: '#ef4444' }}>— ASIL-B (dedicated core 0)</span>
            <span style={{ fontSize: 11, color: '#3b82f6' }}>— QM (60% ceiling)</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="card">
          <div className="card-header"><span className="pill pill-red">ASIL-B</span><span className="card-title">lane-keep-assist</span></div>
          <div className="card-body">
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>Container: <code>demo-asil-b</code></p>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>CPU: <code>--cpuset-cpus 0</code> — dedicated core</p>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>Deadline: 10ms</p>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="pill pill-blue">QM</span><span className="card-title">media-player</span></div>
          <div className="card-body">
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>Container: <code>demo-qm</code></p>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>CPU: <code>--cpus 0.6</code> — 60% ceiling</p>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>Deadline: 33ms</p>
          </div>
        </div>
      </div>

      <div className="action-row">
        {!running
          ? <button className="btn-primary" onClick={() => send('/scenario1/start')}>Start scenario</button>
          : <button className="btn-ghost"   onClick={() => send('/scenario1/stop')}>Stop scenario</button>}
        {running && !storm && <button className="btn-danger" onClick={() => send('/scenario1/storm/start')}>Trigger QM CPU storm</button>}
        {running && storm  && <button className="btn-ghost"  onClick={() => send('/scenario1/storm/stop')}>Stop storm</button>}
      </div>
    </div>
  )
}
